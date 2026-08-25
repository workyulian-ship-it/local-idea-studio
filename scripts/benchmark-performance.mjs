import os from "node:os";
import {
  loadModel,
  onLlamaEvent,
  shutdownLlama,
  streamChat,
} from "../dist-electron/llama.js";

const modelPath = process.argv[2];
const backend = process.argv[3] ?? "cpu";
if (!modelPath) throw new Error("Pass a GGUF model path");
if (!["cpu", "vulkan"].includes(backend)) throw new Error("Backend must be cpu or vulkan");

const logicalThreads = os.availableParallelism();
const configurations = backend === "cpu"
  ? [
      { name: "auto-math-cores", threads: 0, batchSize: 512 },
      { name: "all-logical", threads: logicalThreads, batchSize: 512 },
      { name: "all-logical-large-batch", threads: logicalThreads, batchSize: 1024 },
    ]
  : [
      { name: "auto-1024", threads: 0, batchSize: 1024 },
      { name: "all-logical-1024", threads: logicalThreads, batchSize: 1024 },
      { name: "all-logical-2048", threads: logicalThreads, batchSize: 2048 },
    ];

const baseSettings = {
  temperature: 0,
  topP: 1,
  topK: 40,
  maxTokens: 96,
  repeatPenalty: 1.1,
  seed: 42,
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
  if (event.type === "stats") target.stats = event;
  if (event.type === "error") {
    waiting.delete(event.conversationId);
    target.reject(new Error(event.error));
  }
  if (event.type === "done") {
    waiting.delete(event.conversationId);
    target.resolve(target.stats);
  }
});

async function generate(conversationId, maxTokens) {
  const result = new Promise((resolve, reject) => waiting.set(conversationId, { resolve, reject, stats: null }));
  await streamChat({
    conversationId,
    messages: [{ role: "user", content: "Write a detailed numbered list of practical benefits of running AI locally." }],
    opts: { temperature: 0, topP: 1, topK: 40, maxTokens, repeatPenalty: 1.1, seed: 42 },
  }, () => null);
  return await result;
}

try {
  for (const config of configurations) {
    const info = await loadModel(modelPath, {
      settings: baseSettings,
      threads: config.threads,
      batchSize: config.batchSize,
    });
    await generate(`${config.name}-warmup`, 24);
    const stats = await generate(`${config.name}-measure`, 96);
    console.log(JSON.stringify({
      name: config.name,
      requestedThreads: config.threads,
      actualThreads: info.cpuThreads,
      batchSize: info.batchSize,
      gpuLayers: info.gpuLayers,
      tps: Number(stats?.tps?.toFixed(2) ?? 0),
      tokens: stats?.tokens ?? 0,
      elapsed: Number(stats?.elapsed?.toFixed(2) ?? 0),
    }));
  }
} finally {
  await shutdownLlama();
}
