import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import os from "os";
import {
  getLlama,
  LlamaLogLevel,
  LlamaChatSession,
  LlamaModel,
  LlamaContext,
  type LlamaGpuType,
  type ChatHistoryItem,
  type LlamaChatResponseChunk,
  type LlamaChatSessionRepeatPenalty,
} from "node-llama-cpp";
import type { BrowserWindow } from "electron";
import type { AppSettings } from "./settings.js";
import {
  ReasoningStreamParser,
  chatWrapperSupportsReasoning,
  splitReasoningFromResponse,
} from "./reasoning.js";

type ReasoningSource = "chat-template" | "runtime-output" | "none";
type GpuLayerSelection = "auto" | "max" | number | {
  min?: number;
  max?: number;
  fitContext?: { contextSize?: number };
};

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
  cpuThreads: number;
  cpuMathCores: number;
  logicalCpuThreads: number;
  batchSize: number;
  flashAttention: boolean;
  totalLayers: number;
  gpuOffloadPercent: number;
  reasoningSupported: boolean;
  reasoningSource: ReasoningSource;
  chatWrapper: string;
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
      // 0 removes the library-level cap. Context thread selection still uses
      // llama.cpp's hardware-aware maximum when Settings is left on Auto.
      maxThreads: 0,
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
  // -1 means "as many layers as fit". Supplying the intended context lets
  // node-llama-cpp reserve KV-cache memory instead of filling VRAM with model
  // weights and then failing while the context is created.
  const requestedLayers = (rest as any).gpuLayers ?? settings.gpuLayers ?? -1;
  const requestedContextSize = (rest as any).contextSize ?? profile.contextSize ?? settings.contextSize ?? 4096;
  const normalizedContextSize = Math.max(512, Math.round(requestedContextSize));
  const normalizedLayerLimit = Math.max(-1, Math.round(requestedLayers));
  const primaryGpuLayers: GpuLayerSelection = !useGpu
    ? 0
    : normalizedLayerLimit === 0
      ? 0
      : {
          ...(normalizedLayerLimit > 0 ? { max: normalizedLayerLimit } : {}),
          fitContext: { contextSize: normalizedContextSize },
        };
  // Use the largest practical prompt batch on accelerated backends. This
  // improves prompt ingestion throughput; token generation itself remains
  // sequential and may still be memory-bandwidth bound on smaller models.
  const batchSize = Math.max(32, Math.min(2048, Math.round((rest as any).batchSize ?? (useGpu ? 2048 : 1024))));
  const configuredThreads = (rest as any).threads ?? settings.threads ?? 0;
  const logicalCpuThreads = os.availableParallelism();
  // "Auto / maximum" means every logical processor, including when a GPU is
  // active. llama.cpp will still schedule only the CPU-side work required by
  // the selected backend, but it is no longer capped at physical math cores.
  const autoThreads = logicalCpuThreads;
  const threads = configuredThreads === 0
    ? autoThreads
    : Math.max(1, Math.min(logicalCpuThreads, Math.round(configuredThreads)));

  // Performance flags — opt-out via settings, default ALL ON
  const useFlashAttention = settings.flashAttention ?? true;
  const useMlock = settings.mlock ?? true;
  const useMmap = settings.mmap ?? true; // (F16 KV is the library default; no opt needed)

  const loadResources = async (
    gpuLayerSelection: GpuLayerSelection,
    contextCap: number,
    lockMemory: boolean,
    mmapMode: "auto" | boolean,
  ) => {
    let model: LlamaModel | null = null;
    try {
      model = await llamaInstance!.loadModel({
        modelPath,
        gpuLayers: gpuLayerSelection,
        defaultContextFlashAttention: useFlashAttention ? "auto" : false,
        useMmap: mmapMode,
        useMlock: lockMemory,
        onLoadProgress: (p: number) => {
          const win = getCurrentWindow();
          win?.webContents.send("llm:stats", { type: "load-progress", progress: p });
        },
      });

      const trainContextSize = Math.max(512, model.trainContextSize || 4096);
      const contextSizeLimit = Math.min(trainContextSize, contextCap);
      const ctx = await model.createContext({
        contextSize: { min: Math.min(512, contextSizeLimit), max: contextSizeLimit },
        batchSize,
        threads,
        batching: { itemPrioritizationStrategy: "firstInFirstOut" },
      });
      return { model, ctx, trainContextSize };
    } catch (error) {
      if (model) {
        try {
          await model.dispose();
        } catch {
          // Keep the original load/context error.
        }
      }
      throw error;
    }
  };

  let resources: Awaited<ReturnType<typeof loadResources>>;
  try {
    resources = await loadResources(primaryGpuLayers, normalizedContextSize, useMlock, useMmap);
  } catch (firstError) {
    // Old installations may contain an over-large layer count/context or mlock
    // enabled on a shared-memory GPU. Retry once with memory-safe automatic
    // fitting so both CPU and GPU modes can still load and generate.
    const safeContextSize = Math.min(normalizedContextSize, 4096);
    const safeGpuLayers: GpuLayerSelection = useGpu
      ? { fitContext: { contextSize: safeContextSize } }
      : 0;
    console.warn("[llama] requested model configuration failed; retrying safely", firstError);
    resources = await loadResources(safeGpuLayers, safeContextSize, false, "auto");
  }

  const { model, ctx, trainContextSize } = resources;
  loadedModel = model;
  context = ctx;
  const session = new LlamaChatSession({ contextSequence: ctx.getSequence() });
  activeSession = session;
  const reasoningSupported = chatWrapperSupportsReasoning(session.chatWrapper);
  const totalLayers = model.fileInsights.totalLayers;
  const actualGpuLayers = useGpu ? model.gpuLayers : 0;

  loadedInfo = {
    modelId: path.basename(modelPath),
    modelPath,
    contextSize: ctx.contextSize,
    trainContextSize,
    maxOutputTokens: getMaxOutputTokens(ctx.contextSize, profile.maxTokens ?? settings.maxTokens),
    gpuLayers: actualGpuLayers,
    backend: useGpu && gpu ? String(gpu) : "cpu",
    gpu: useGpu && gpu ? String(gpu) : null,
    vram: null,
    cpuThreads: ctx.idealThreads,
    cpuMathCores: llamaInstance.cpuMathCores,
    logicalCpuThreads,
    batchSize: ctx.batchSize,
    flashAttention: ctx.flashAttention !== false,
    totalLayers,
    gpuOffloadPercent: totalLayers > 0 ? Math.round((actualGpuLayers / totalLayers) * 100) : 0,
    reasoningSupported,
    reasoningSource: reasoningSupported ? "chat-template" : "none",
    chatWrapper: session.chatWrapper.wrapperName,
    loadedAt: Date.now(),
  };

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
    thinkingMode?: AppSettings["thinkingMode"];
    agentMode?: boolean;
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
    thinkingMode: (["minimal", "standard", "max"] as const).includes(opts?.thinkingMode as AppSettings["thinkingMode"])
      ? opts.thinkingMode as AppSettings["thinkingMode"]
      : "standard",
  };
}

export function resolveThinkingPlan(mode: AppSettings["thinkingMode"], maxTokens: number) {
  const totalTokens = Math.max(1, Math.round(maxTokens));
  if (mode === "minimal") {
    return { thoughtTokens: 0, finalAnswerTokens: totalTokens };
  }
  const thoughtRatio = mode === "max" ? 0.65 : 0.35;
  const minimumFinal = Math.min(totalTokens, Math.max(32, Math.floor(totalTokens * (1 - thoughtRatio))));
  return {
    thoughtTokens: Math.max(0, totalTokens - minimumFinal),
    finalAnswerTokens: minimumFinal,
  };
}

export function buildModeSystemInstruction(
  mode: AppSettings["thinkingMode"],
  agentMode = false,
) {
  const thinkingInstruction = mode === "minimal"
    ? "Thinking mode is Minimal. Answer directly and concisely. Do not emit a chain-of-thought or spend tokens on hidden reasoning."
    : mode === "max"
      ? "Thinking mode is Max. Reason carefully when useful, but always stop reasoning early enough to provide a complete final answer within the response limit."
      : "Thinking mode is Standard. Use compact reasoning when useful and always reserve enough response space for a complete final answer.";
  if (!agentMode) return thinkingInstruction;
  return `${thinkingInstruction}\n\nAgent Mode is enabled. You may propose exactly one workspace file action when it is necessary. Never claim that an action has already happened. The app, not you, asks the user for real permission. Emit the proposal as one exact JSON block at the end of your response:\n<agent_action>{"type":"create_file|write_file|append_file|create_directory","path":"relative/path","reason":"plain explanation shown in the permission dialog","content":"text content, omitted only for create_directory"}</agent_action>\nOnly use relative paths inside the selected workspace, with no drive letter and no leading slash (use "hello.txt", not "/hello.txt"). Available actions are text-file creation, replacement, append, and folder creation. Shell commands, program execution, file deletion, moving files, network actions, and paths outside the workspace are unavailable. If no file action is needed, do not emit an agent_action block. A user message beginning with [LOCAL IDEA AGENT RESULT] is an authoritative result from the application after a permission decision. Continue the original task from that result. Never repeat an operation reported as SUCCESS, and do not retry a DECLINED or FAILED operation unless the user explicitly asks.`;
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
  const systemParts: string[] = [];
  for (let i = 0; i < lastUserIdx; i++) {
    const m = messages[i];
    if (m.role === "system") {
      systemParts.push(m.content);
    } else if (m.role === "user") {
      history.push({ type: "user", text: m.content });
    } else if (m.role === "assistant") {
      history.push({ type: "model", response: [m.content] });
    }
  }
  systemParts.push(buildModeSystemInstruction(generation.thinkingMode, opts.agentMode === true));
  history.unshift({ type: "system", text: systemParts.filter(Boolean).join("\n\n") });

  try {
    session.setChatHistory(history);
  } catch (e) {
    console.warn("setChatHistory failed:", e);
  }

  const userPrompt = messages[lastUserIdx].content;
  const start = Date.now();
  let tokens = 0;
  let answer = "";
  let reasoning = "";
  let lastStatsAt = 0;
  let generationStartedAt = 0;
  let reasoningParser = new ReasoningStreamParser();

  const send = (data: unknown) => {
    emitter.emit("event", data);
  };

  const markReasoningDetected = (source: Exclude<ReasoningSource, "none">) => {
    if (!loadedInfo) return;
    if (!loadedInfo.reasoningSupported || loadedInfo.reasoningSource === "none") {
      loadedInfo.reasoningSupported = true;
      loadedInfo.reasoningSource = source;
      send({
        type: "reasoning-capability",
        supported: true,
        source,
        conversationId: payload.conversationId,
      });
    }
  };

  const emitParsedText = (text: string) => {
    if (!text) return;
    const parsed = reasoningParser.push(text);
    if (reasoningParser.sawReasoning) markReasoningDetected("runtime-output");
    if (parsed.reasoning) {
      reasoning += parsed.reasoning;
      send({
        type: "reasoning",
        text: parsed.reasoning,
        source: "runtime-output",
        conversationId: payload.conversationId,
      });
    }
    if (parsed.answer) {
      answer += parsed.answer;
      send({ type: "token", text: parsed.answer, conversationId: payload.conversationId });
    }
  };

  const onResponseChunk = (chunk: LlamaChatResponseChunk) => {
    if (abortFlag.aborted) return;
    const now = Date.now();
    if (!generationStartedAt) generationStartedAt = now;
    tokens += chunk.tokens.length;

    if (chunk.type === "segment" && chunk.segmentType === "thought") {
      markReasoningDetected("chat-template");
      if (chunk.text) {
        reasoning += chunk.text;
        send({
          type: "reasoning",
          text: chunk.text,
          source: "chat-template",
          conversationId: payload.conversationId,
        });
      }
    } else {
      // Main response and non-thought segments remain visible as the answer.
      // The fallback parser handles GGUF templates that emit literal tags but
      // do not advertise structured thought segments.
      emitParsedText(chunk.text);
    }

    if (now - lastStatsAt >= 250) {
      const elapsed = Math.max(0.001, (now - generationStartedAt) / 1000);
      send({ type: "stats", tokens, elapsed, tps: tokens / elapsed, conversationId: payload.conversationId });
      lastStatsAt = now;
    }
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
  const thinkingPlan = resolveThinkingPlan(generation.thinkingMode, generation.maxTokens);

  const flushReasoningParser = () => {
    const remaining = reasoningParser.flush();
    if (reasoningParser.sawReasoning) markReasoningDetected("runtime-output");
    if (remaining.reasoning) {
      reasoning += remaining.reasoning;
      send({ type: "reasoning", text: remaining.reasoning, source: "runtime-output", conversationId: payload.conversationId });
    }
    if (remaining.answer) {
      answer += remaining.answer;
      send({ type: "token", text: remaining.answer, conversationId: payload.conversationId });
    }
  };

  const promptWithTracking = async (prompt: string, maxTokens: number, thoughtTokens: number) => {
    const promptPromise = session.prompt(prompt, {
      temperature: generation.temperature,
      topK: generation.topK,
      topP: generation.topP,
      maxTokens,
      budgets: { thoughtTokens },
      repeatPenalty,
      seed: generation.seed,
      signal: abortWatcher.signal,
      stopOnAbortSignal: true,
      onResponseChunk,
    });
    activeGeneration = promptPromise.then(() => undefined, () => undefined);
    return promptPromise;
  };

  try {
    let reply = await promptWithTracking(userPrompt, generation.maxTokens, thinkingPlan.thoughtTokens);
    flushReasoningParser();
    if (!answer && !reasoning && reply) {
      const parsedReply = splitReasoningFromResponse(reply);
      answer = parsedReply.answer;
      reasoning = parsedReply.reasoning;
      if (reasoning) {
        markReasoningDetected("runtime-output");
        send({ type: "reasoning", text: reasoning, source: "runtime-output", conversationId: payload.conversationId });
      }
      if (answer) send({ type: "token", text: answer, conversationId: payload.conversationId });
    }

    // Some reasoning GGUF templates can still consume their whole response in
    // literal <think> text. Recover automatically with a second pass that has
    // no thought budget, instead of leaving the user with no final answer.
    if (!abortFlag.aborted && !answer.trim() && reasoning.trim()) {
      reasoningParser = new ReasoningStreamParser();
      const recoveryPrompt = "Provide the complete final answer to my previous request now. Output only the answer, with no analysis, reasoning, or thought tags.";
      reply = await promptWithTracking(recoveryPrompt, thinkingPlan.finalAnswerTokens, 0);
      flushReasoningParser();
      if (!answer.trim() && reply) {
        const parsedReply = splitReasoningFromResponse(reply);
        if (parsedReply.answer) {
          answer += parsedReply.answer;
          send({ type: "token", text: parsedReply.answer, conversationId: payload.conversationId });
        }
      }
    }

    const elapsed = generationStartedAt
      ? Math.max(0.001, (Date.now() - generationStartedAt) / 1000)
      : Math.max(0.001, (Date.now() - start) / 1000);
    if (tokens === 0) tokens = loadedModel?.tokenize(reply || `${reasoning}${answer}`).length ?? 0;
    const tps = tokens / Math.max(0.1, elapsed);
    send({ type: "stats", tokens, elapsed, tps, conversationId: payload.conversationId });
    send({ type: "done", text: answer, reasoning, conversationId: payload.conversationId });
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
