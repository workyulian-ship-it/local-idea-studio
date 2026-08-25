import assert from "node:assert/strict";
import {
  loadModel,
  onLlamaEvent,
  shutdownLlama,
  streamChat,
} from "../dist-electron/llama.js";

const modelPath = process.argv[2] || process.env.LOCAL_IDEA_TEST_MODEL || process.env.LUMEN_TEST_MODEL;
if (!modelPath) throw new Error("Pass a GGUF model path or set LOCAL_IDEA_TEST_MODEL");

const baseSettings = {
  temperature: 0,
  topP: 1,
  topK: 40,
  maxTokens: 128,
  repeatPenalty: 1.1,
  seed: 42,
  modelProfiles: {},
  modelsDirectory: null,
  contextSize: 2048,
  gpuLayers: -1,
  gpuBackend: "cpu",
  threads: 0,
  flashAttention: true,
  mlock: false,
  mmap: true,
  systemPrompt: "You are concise.",
  hfToken: "",
  theme: "dark",
  defaultModelPath: null,
  showTokensPerSecond: true,
  thinkingMode: "standard",
  agentMode: false,
  agentWorkspace: null,
};

const waiting = new Map();
onLlamaEvent((event) => {
  if (!event || typeof event !== "object" || !("conversationId" in event)) return;
  const target = waiting.get(event.conversationId);
  if (!target) return;
  if (event.type === "token") {
    target.chunks += 1;
    target.text += event.text;
  } else if (event.type === "reasoning") {
    target.chunks += 1;
    target.reasoning += event.text;
  } else if (event.type === "error") {
    waiting.delete(event.conversationId);
    target.reject(new Error(event.error));
  } else if (event.type === "done") {
    waiting.delete(event.conversationId);
    target.resolve({ text: event.text || target.text, reasoning: event.reasoning || target.reasoning, chunks: target.chunks });
  }
});

async function generate(conversationId) {
  const result = new Promise((resolve, reject) => {
    waiting.set(conversationId, { resolve, reject, text: "", reasoning: "", chunks: 0 });
  });
  await streamChat({
    conversationId,
    messages: [{ role: "user", content: "Reply with one short sentence about local AI." }],
    opts: { temperature: 0, topP: 1, topK: 40, maxTokens: 128, repeatPenalty: 1.1, seed: 42, thinkingMode: "standard", agentMode: false },
  }, () => null);
  return await result;
}

async function verifyBackend(backend, iteration) {
  const settings = { ...baseSettings, gpuBackend: backend };
  const info = await loadModel(modelPath, { settings });
  assert.equal(info.backend, backend, `requested ${backend}, loaded ${info.backend}`);
  if (backend === "cpu") assert.equal(info.gpuLayers, 0, "CPU must not offload model layers");
  if (backend === "vulkan") assert.ok(info.gpuLayers > 0, "Vulkan must offload model layers");
  const response = await generate(`${backend}-${iteration}`);
  assert.ok((response.text + response.reasoning).trim(), `${backend} returned an empty response`);
  assert.ok(response.chunks > 0, `${backend} emitted no streaming chunks`);
  console.log(`${backend}: ${info.gpuLayers} GPU layers, ${response.chunks} streamed chunks`);
}

try {
  await verifyBackend("cpu", 1);
  await verifyBackend("vulkan", 1);
  await verifyBackend("cpu", 2);
  console.log("CPU -> Vulkan -> CPU backend switching test passed.");
} finally {
  await shutdownLlama();
}
