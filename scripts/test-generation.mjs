import {
  initLlama,
  loadModel,
  onLlamaEvent,
  shutdownLlama,
  streamChat,
} from "../dist-electron/llama.js";

const modelPath = process.argv[2];
if (!modelPath) throw new Error("Pass a GGUF model path");
const backend = process.argv[3] ?? "auto";
if (!["auto", "cuda", "vulkan", "cpu"].includes(backend)) throw new Error(`Unsupported backend: ${backend}`);

const baseSettings = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxTokens: 64,
  repeatPenalty: 1.1,
  seed: null,
  modelProfiles: {},
  modelsDirectory: null,
  contextSize: 2048,
  gpuLayers: -1,
  gpuBackend: backend,
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
  if (event.type === "token") target.text += event.text;
  if (event.type === "reasoning") target.reasoning += event.text;
  if (event.type === "error") {
    waiting.delete(event.conversationId);
    target.reject(new Error(event.error));
  }
  if (event.type === "done") {
    console.log(`Done ${event.conversationId}: answer=${(event.text || "").length} reasoning=${(event.reasoning || "").length} chunks=${target.text.length + target.reasoning.length}`);
    waiting.delete(event.conversationId);
    target.resolve({ text: target.text || event.text || "", reasoning: target.reasoning || event.reasoning || "" });
  }
});

async function generate(conversationId, opts) {
  const result = new Promise((resolve, reject) => waiting.set(conversationId, { resolve, reject, text: "", reasoning: "" }));
  await streamChat({
    conversationId,
    messages: [{ role: "user", content: "Name one useful feature of local AI in one short sentence." }],
    opts,
  }, () => null);
  return await result;
}

try {
  console.log(`Loading ${modelPath}...`);
  await initLlama("", "", backend);
  const info = await loadModel(modelPath, { settings: baseSettings });
  if (backend === "cpu" && info.backend !== "cpu") throw new Error(`CPU requested but ${info.backend} was used`);
  if (backend === "cuda" && info.backend !== "cuda") throw new Error(`CUDA requested but ${info.backend} was used`);
  if (backend === "vulkan" && info.backend !== "vulkan") throw new Error(`Vulkan requested but ${info.backend} was used`);
  console.log(`Loaded on ${info.backend}: trained context ${info.trainContextSize}, active context ${info.contextSize}, output cap ${info.maxOutputTokens}`);

  const deterministic = await generate("temperature-low", {
    temperature: 0,
    topP: 1,
    topK: 40,
    maxTokens: 384,
    repeatPenalty: 1.1,
    seed: 42,
    thinkingMode: "standard",
    agentMode: false,
  });
  const creative = await generate("temperature-high", {
    temperature: 1.4,
    topP: 0.95,
    topK: 40,
    maxTokens: 192,
    repeatPenalty: 1.1,
    seed: 99,
    thinkingMode: "minimal",
    agentMode: false,
  });

  if (!deterministic.text.trim()) throw new Error("Standard thinking did not reserve a final answer");
  console.log(`Temperature 0.00 answer: ${deterministic.text.trim() || "(reasoning-only)"}`);
  console.log(`Temperature 0.00 reasoning chars: ${deterministic.reasoning.length}`);
  console.log(`Temperature 1.40 answer: ${creative.text.trim() || "(reasoning-only)"}`);
  console.log(`Temperature 1.40 reasoning chars: ${creative.reasoning.length}`);
  if (!(creative.text + creative.reasoning).trim()) {
    console.warn("Creative sampling reached EOS before visible output; deterministic generation still verified the runtime.");
  }
  console.log("Real GGUF generation test passed.");
} finally {
  await shutdownLlama();
}
