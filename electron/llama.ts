import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import {
  getLlama,
  LlamaLogLevel,
  LlamaChatSession,
  LlamaModel,
  LlamaContext,
  type LlamaGpuType,
  type ChatHistoryItem,
  type LlamaChatSessionRepeatPenalty,
} from "node-llama-cpp";
import type { BrowserWindow } from "electron";
import type { AppSettings } from "./settings.js";

interface LoadedState {
  modelId: string;
  modelPath: string;
  contextSize: number;
  trainContextSize: number;
  maxOutputTokens: number;
  gpuLayers: number | "auto" | "max";
  backend: string;
  gpu: string | null;
  vram: number | null;
  loadedAt: number;
}

let llamaInstance: Awaited<ReturnType<typeof getLlama>> | null = null;
let loadedModel: LlamaModel | null = null;
let context: LlamaContext | null = null;
let activeSession: LlamaChatSession | null = null;
let loadedInfo: LoadedState | null = null;
let activeAbort: { aborted: boolean } | null = null;
let activeGeneration: Promise<void> | null = null;
let runtimePreference: AppSettings["gpuBackend"] | null = null;
let runtimeBackend = "uninitialized";
// Used to send load progress to the renderer
let getCurrentWindow: () => BrowserWindow | null = () => null;
export function bindWindowGetter(fn: () => BrowserWindow | null) {
  getCurrentWindow = fn;
}

const emitter = new EventEmitter();
emitter.setMaxListeners(20);

export function onLlamaEvent(cb: (evt: unknown) => void) {
  emitter.on("event", cb);
}

export function getLoadedModelInfo(): LoadedState | null {
  return loadedInfo;
}

export async function initLlama(_modelsDir: string, _logsDir: string, preference: AppSettings["gpuBackend"] = "auto") {
  await ensureLlamaBackend(preference);
}

export function getLlamaRuntimeInfo() {
  return { backend: runtimeBackend, preference: runtimePreference };
}

async function ensureLlamaBackend(preference: AppSettings["gpuBackend"]) {
  if (llamaInstance && runtimePreference === preference) return;
  await disposeLlama();
  if (llamaInstance) await llamaInstance.dispose();
  llamaInstance = null;
  try {
    llamaInstance = await getLlama({
      gpu: preference === "cpu" ? false : preference,
      logLevel: LlamaLogLevel.warn,
    });
    const gpu = llamaInstance.gpu as LlamaGpuType | false;
    runtimePreference = preference;
    runtimeBackend = gpu ? String(gpu) : "cpu";
    console.log(`[llama] initialized. requested=${preference} backend=${runtimeBackend}`);
  } catch (e) {
    runtimePreference = null;
    runtimeBackend = "error";
    console.error("[llama] init failed", e);
    throw e;
  }
}

export async function shutdownLlama() {
  await disposeLlama();
  if (llamaInstance) await llamaInstance.dispose();
  llamaInstance = null;
  runtimePreference = null;
  runtimeBackend = "uninitialized";
}

export async function disposeLlama() {
  if (activeAbort) activeAbort.aborted = true;
  if (activeGeneration) {
    try {
      await activeGeneration;
    } catch {
      // The generation path reports its own error or abort event.
    }
  }
  try {
    if (activeSession) activeSession = null;
    if (context) {
      await context.dispose();
    }
    if (loadedModel) {
      await loadedModel.dispose();
    }
  } catch (e) {
    console.error("[llama] dispose error", e);
  }
  loadedModel = null;
  context = null;
  activeSession = null;
  loadedInfo = null;
}

export async function loadModel(modelId: string, opts: { settings: AppSettings; [k: string]: any }) {
  await ensureLlamaBackend(opts.settings.gpuBackend ?? "auto");
  if (!llamaInstance) throw new Error("Llama not initialized");
  const { settings, ...rest } = opts;
  const modelPath = modelId; // we treat modelId as absolute path passed from renderer
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  await disposeLlama();

  const gpu = (llamaInstance.gpu as LlamaGpuType | false) ?? false;
  const profile = settings.modelProfiles?.[modelPath] ?? {};
  const useGpu = settings.gpuBackend !== "cpu" && !!gpu;
  // -1 in user settings means "all layers" → use "max" to force full GPU offload
  const requestedLayers = (rest as any).gpuLayers ?? settings.gpuLayers ?? -1;
  const gpuLayers: "auto" | "max" | number =
    requestedLayers === -1 ? "max" : requestedLayers;
  const requestedContextSize = (rest as any).contextSize ?? profile.contextSize ?? settings.contextSize ?? 4096;
  const batchSize = (rest as any).batchSize ?? 1024;
  const configuredThreads = (rest as any).threads ?? settings.threads ?? 0;
  const threads = configuredThreads;

  // Performance flags — opt-out via settings, default ALL ON
  const useFlashAttention = settings.flashAttention ?? true;
  const useMlock = settings.mlock ?? true;
  const useMmap = settings.mmap ?? true; // (F16 KV is the library default; no opt needed)

  const model = await llamaInstance.loadModel({
    modelPath,
    gpuLayers: useGpu ? gpuLayers : 0,
    defaultContextFlashAttention: useFlashAttention ? "auto" : false,
    useMmap,
    useMlock,
    onLoadProgress: (p: number) => {
      const win = getCurrentWindow();
      win?.webContents.send("llm:stats", { type: "load-progress", progress: p });
    },
  });

  loadedModel = model;
  const trainContextSize = Math.max(512, model.trainContextSize || 4096);
  const contextSizeLimit = Math.min(trainContextSize, Math.max(512, Math.round(requestedContextSize)));
  const ctx = await model.createContext({
    contextSize: { min: Math.min(512, contextSizeLimit), max: contextSizeLimit },
    batchSize,
    threads,
  });
  context = ctx;
  const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
  activeSession = session;

  loadedInfo = {
    modelId: path.basename(modelPath),
    modelPath,
    contextSize: ctx.contextSize,
    trainContextSize,
    maxOutputTokens: getMaxOutputTokens(ctx.contextSize, profile.maxTokens ?? settings.maxTokens),
    gpuLayers: useGpu ? gpuLayers : 0,
    backend: useGpu && gpu ? String(gpu) : "cpu",
    gpu: useGpu && gpu ? String(gpu) : null,
    vram: null,
    loadedAt: Date.now(),
  };
  // If we requested "max", reflect that as the number of layers actually on GPU
  if (loadedModel) {
    loadedInfo.gpuLayers = loadedModel.gpuLayers;
  }

  return loadedInfo;
}

export async function unloadModel() {
  await disposeLlama();
  return { ok: true };
}

interface ChatPayload {
  conversationId: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  opts: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    repeatPenalty?: number;
    seed?: number;
    systemPrompt?: string;
  };
}

function clamp(value: number | undefined, fallback: number, min: number, max: number) {
  const resolved = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, resolved));
}

export function getMaxOutputTokens(contextSize: number, requested?: number) {
  const contextLimit = Math.max(32, Math.floor(contextSize) - 256);
  return Math.round(clamp(requested, 1024, 1, contextLimit));
}

export function normalizeGenerationOptions(opts: ChatPayload["opts"], contextSize: number) {
  return {
    temperature: clamp(opts?.temperature, 0.7, 0, 2),
    topP: clamp(opts?.topP, 0.95, 0, 1),
    topK: Math.round(clamp(opts?.topK, 40, 1, 100)),
    maxTokens: getMaxOutputTokens(contextSize, opts?.maxTokens),
    repeatPenalty: clamp(opts?.repeatPenalty, 1.1, 1, 2),
    seed: typeof opts?.seed === "number" && Number.isFinite(opts.seed) ? Math.round(opts.seed) : undefined,
  };
}

export async function streamChat(payload: ChatPayload, getWin: () => BrowserWindow | null) {
  if (!activeSession) {
    emitter.emit("event", { type: "error", error: "No model loaded", conversationId: payload.conversationId });
    return;
  }
  if (activeAbort) activeAbort.aborted = true;
  const abortFlag = { aborted: false };
  activeAbort = abortFlag;

  const session = activeSession;
  const { messages, opts } = payload;
  const generation = normalizeGenerationOptions(opts, context?.contextSize ?? 4096);

  // Build chat history items: system + all user/assistant up to last user
  const lastUserIdx = [...messages].map((m) => m.role).lastIndexOf("user");
  if (lastUserIdx === -1) {
    emitter.emit("event", { type: "error", error: "No user message", conversationId: payload.conversationId });
    return;
  }

  const history: ChatHistoryItem[] = [];
  for (let i = 0; i < lastUserIdx; i++) {
    const m = messages[i];
    if (m.role === "system") {
      history.push({ type: "system", text: m.content });
    } else if (m.role === "user") {
      history.push({ type: "user", text: m.content });
    } else if (m.role === "assistant") {
      history.push({ type: "model", response: [m.content] });
    }
  }

  try {
    session.setChatHistory(history);
  } catch (e) {
    console.warn("setChatHistory failed:", e);
  }

  const userPrompt = messages[lastUserIdx].content;
  const start = Date.now();
  let tokens = 0;

  const send = (data: unknown) => {
    emitter.emit("event", data);
  };

  const repeatPenalty: false | LlamaChatSessionRepeatPenalty =
    generation.repeatPenalty !== 1
      ? {
          lastTokens: 64,
          penalizeNewLine: false,
          penalty: generation.repeatPenalty,
        }
      : false;
  const abortWatcher = abortSignalFrom(abortFlag);

  try {
    const promptPromise = session.prompt(userPrompt, {
      temperature: generation.temperature,
      topK: generation.topK,
      topP: generation.topP,
      maxTokens: generation.maxTokens,
      repeatPenalty,
      seed: generation.seed,
      signal: abortWatcher.signal,
      stopOnAbortSignal: true,
      onTextChunk: (chunk: string) => {
        if (abortFlag.aborted) return;
        tokens += Math.max(1, Math.round(chunk.length / 4));
        send({ type: "token", text: chunk, conversationId: payload.conversationId });
      },
    });
    const generationDone = promptPromise.then(() => undefined, () => undefined);
    activeGeneration = generationDone;
    const reply = await promptPromise;

    const elapsed = (Date.now() - start) / 1000;
    const tps = tokens / Math.max(0.1, elapsed);
    send({ type: "stats", tokens, elapsed, tps, conversationId: payload.conversationId });
    send({ type: "done", text: reply, conversationId: payload.conversationId });
  } catch (err: any) {
    if (abortFlag.aborted) {
      send({ type: "done", aborted: true, conversationId: payload.conversationId });
    } else {
      send({ type: "error", error: err?.message ?? String(err), conversationId: payload.conversationId });
    }
  } finally {
    abortWatcher.dispose();
    if (activeAbort === abortFlag) activeAbort = null;
    activeGeneration = null;
  }
}

function abortSignalFrom(flag: { aborted: boolean }) {
  const ctrl = new AbortController();
  const interval = setInterval(() => {
    if (flag.aborted) {
      ctrl.abort();
      clearInterval(interval);
    }
  }, 50);
  interval.unref?.();
  return {
    signal: ctrl.signal,
    dispose: () => clearInterval(interval),
  };
}

export async function abortChat(conversationId: string) {
  if (activeAbort) activeAbort.aborted = true;
  return { ok: true, conversationId };
}
