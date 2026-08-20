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
};

const waiting = new Map();
onLlamaEvent((event) => {
  if (!event || typeof event !== "object" || !("conversationId" in event)) return;
  const target = waiting.get(event.conversationId);
  if (!target) return;
  if (event.type === "token") target.text += event.text;
  if (event.type === "error") {
    waiting.delete(event.conversationId);
    target.reject(new Error(event.error));
  }
  if (event.type === "done") {
    waiting.delete(event.conversationId);
    target.resolve(target.text || event.text || "");
  }
});

async function generate(conversationId, opts) {
  const result = new Promise((resolve, reject) => waiting.set(conversationId, { resolve, reject, text: "" }));
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
    maxTokens: 48,
    repeatPenalty: 1.1,
    seed: 42,
  });
  const creative = await generate("temperature-high", {
    temperature: 1.4,
    topP: 0.95,
    topK: 40,
    maxTokens: 48,
    repeatPenalty: 1.1,
    seed: 99,
  });

  if (!deterministic.trim() || !creative.trim()) throw new Error("Generation returned an empty response");
  console.log(`Temperature 0.00: ${deterministic.trim()}`);
  console.log(`Temperature 1.40: ${creative.trim()}`);
  console.log("Real GGUF generation test passed.");
} finally {
  await shutdownLlama();
}
