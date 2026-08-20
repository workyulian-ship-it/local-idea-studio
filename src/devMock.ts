import type { AppSettings, Chat, DownloadJob, HfFile, HfSearchResult, LoadedModelInfo, LocalModel } from "./types";

const settings: AppSettings = {
  temperature: 0.7,
  topP: 0.95,
  topK: 40,
  maxTokens: 1024,
  repeatPenalty: 1.1,
  seed: null,
  modelProfiles: {},
  modelsDirectory: null,
  contextSize: 4096,
  gpuLayers: -1,
  gpuBackend: "auto",
  threads: 0,
  flashAttention: true,
  mlock: false,
  mmap: true,
  systemPrompt: "You are a helpful assistant.",
  hfToken: "",
  theme: "dark",
  defaultModelPath: null,
  showTokensPerSecond: true,
};

const repos: HfSearchResult[] = [
  {
    id: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    downloads: 301463,
    likes: 393,
    tags: ["gguf", "text-generation", "llama", "conversational", "very-long-tag-for-responsive-testing"],
    pipeline_tag: "text-generation",
    ggufFileCount: 24,
  },
  {
    id: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
    downloads: 122400,
    likes: 812,
    tags: ["gguf", "code", "agentic", "qwen3"],
    pipeline_tag: "text-generation",
    ggufFileCount: 16,
  },
  {
    id: "a-very-long-organization-name/a-very-long-model-name-that-must-never-overflow-the-window-GGUF",
    downloads: 54321,
    likes: 77,
    tags: ["gguf", "test"],
    pipeline_tag: "text-generation",
    ggufFileCount: 3,
  },
];

const files: HfFile[] = [
  { rfilename: "Meta-Llama-3.1-8B-Instruct-IQ3_M.gguf", size: 3784828320, quantization: "IQ3_M" },
  { rfilename: "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf", size: 4920739232, quantization: "Q4_K_M" },
  { rfilename: "a/deeply/nested/path/with-a-very-long-model-filename-Q5_K_M.gguf", size: 5732992416, quantization: "Q5_K_M" },
  { rfilename: "Meta-Llama-3.1-8B-Instruct-Q8_0.gguf", size: 8540775840, quantization: "Q8_0" },
];

const mockLocalModel: LocalModel = {
  id: "bartowski__Meta-Llama-3.1-8B-Instruct-GGUF/Meta-Llama-3.1-8B-Instruct-IQ3_M.gguf",
  repoId: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
  filename: "Meta-Llama-3.1-8B-Instruct-IQ3_M.gguf",
  path: "D:\\LLM AI\\models\\bartowski__Meta-Llama-3.1-8B-Instruct-GGUF\\Meta-Llama-3.1-8B-Instruct-IQ3_M.gguf",
  sizeBytes: 3784828320,
  quantization: "IQ3_M",
  format: "GGUF",
  modifiedAt: Date.now(),
};

export function installDevMock() {
  let savedSettings = { ...settings };
  let mockJobs: DownloadJob[] = [];
  const progressListeners = new Set<(job: DownloadJob) => void>();
  const completeListeners = new Set<(job: DownloadJob) => void>();
  const downloadTimers = new Map<string, ReturnType<typeof setInterval>>();
  const tokenListeners = new Set<(event: any) => void>();
  const statsListeners = new Set<(event: any) => void>();
  let mockChats: Chat[] = [];
  let loadedModel: LoadedModelInfo | null = null;
  window.lumen = {
    getPaths: async () => ({
      aiRoot: "D:\\LLM AI",
      modelsDir: savedSettings.modelsDirectory ?? "D:\\LLM AI\\models",
      chatsDir: "D:\\LLM AI\\chats",
      cacheDir: "D:\\LLM AI\\cache",
      logsDir: "D:\\LLM AI\\logs",
      platform: "win32",
      appVersion: "dev",
      userData: "dev",
    }),
    openExternal: async () => true,
    openFolder: async () => true,
    showItemInFolder: async () => true,
    getGpuInfo: async () => ({ backend: loadedModel?.backend ?? "vulkan", gpu: loadedModel?.gpu ?? "AMD Radeon", modelLoaded: !!loadedModel }),
    selectModelsDirectory: async () => "D:\\Custom Lumen Models",
    getSettings: async () => savedSettings,
    saveSettings: async (next: Partial<AppSettings>) => (savedSettings = { ...savedSettings, ...next }),
    hfSearch: async ({ cursor }: any) => ({
      items: cursor ? repos.map((repo, index) => ({ ...repo, id: `${repo.id}-page-2-${index + 1}` })) : repos,
      nextCursor: cursor ? undefined : "mock-next-page",
    }),
    hfModel: async (id: string) => ({ ...repos[0], id, siblings: files }),
    hfFiles: async () => files,
    listModels: async () => [mockLocalModel],
    deleteModel: async () => true,
    downloadModel: async (payload: any) => {
      const job: DownloadJob = {
        id: `${payload.repoId}__${payload.filename}`,
        ...payload,
        sizeBytes: payload.sizeBytes ?? 0,
        downloaded: 0,
        speed: 0,
        eta: 0,
        status: "queued",
        startedAt: Date.now(),
        destination: `${savedSettings.modelsDirectory ?? "D:\\LLM AI\\models"}\\${payload.filename}`,
      };
      mockJobs = [job, ...mockJobs.filter((item) => item.id !== job.id)];
      const timer = setInterval(() => {
        if (job.status === "cancelled") return;
        job.status = "downloading";
        job.downloaded = Math.min(job.sizeBytes, job.downloaded + Math.max(1, Math.round(job.sizeBytes / 10)));
        job.speed = Math.max(1, Math.round(job.sizeBytes / 20));
        job.eta = Math.max(0, (job.sizeBytes - job.downloaded) / job.speed);
        progressListeners.forEach((listener) => listener({ ...job }));
        if (job.downloaded >= job.sizeBytes) {
          clearInterval(timer);
          downloadTimers.delete(job.id);
          job.status = "completed";
          job.finishedAt = Date.now();
          completeListeners.forEach((listener) => listener({ ...job }));
        }
      }, 150);
      downloadTimers.set(job.id, timer);
      return job;
    },
    cancelDownload: async (id: string) => {
      const timer = downloadTimers.get(id);
      if (timer) clearInterval(timer);
      downloadTimers.delete(id);
      const job = mockJobs.find((item) => item.id === id);
      if (job) job.status = "cancelled";
      return true;
    },
    listDownloads: async () => mockJobs,
    onDownloadProgress: (listener: (job: DownloadJob) => void) => {
      progressListeners.add(listener);
      return () => progressListeners.delete(listener);
    },
    onDownloadComplete: (listener: (job: DownloadJob) => void) => {
      completeListeners.add(listener);
      return () => completeListeners.delete(listener);
    },
    loadModel: async () => {
      loadedModel = {
        modelId: mockLocalModel.filename,
        modelPath: mockLocalModel.path,
        contextSize: 4096,
        trainContextSize: 32768,
        maxOutputTokens: 1024,
        gpuLayers: 32,
        backend: savedSettings.gpuBackend === "cpu" ? "cpu" : "vulkan",
        gpu: savedSettings.gpuBackend === "cpu" ? null : "vulkan",
        vram: null,
        loadedAt: Date.now(),
      };
      return loadedModel;
    },
    unloadModel: async () => {
      loadedModel = null;
      return { ok: true };
    },
    getLoadedModel: async () => loadedModel,
    chat: async (payload: any) => {
      setTimeout(() => {
        tokenListeners.forEach((listener) => listener({ type: "token", text: "Local", conversationId: payload.conversationId }));
        tokenListeners.forEach((listener) => listener({ type: "token", text: " response", conversationId: payload.conversationId }));
        statsListeners.forEach((listener) => listener({ type: "stats", tps: 24.5, tokens: 2, elapsed: 0.08, conversationId: payload.conversationId }));
        tokenListeners.forEach((listener) => listener({ type: "done", text: "Local response", conversationId: payload.conversationId }));
      }, 80);
      return { ok: true };
    },
    abortChat: async () => ({ ok: true }),
    onChatToken: (listener: (event: any) => void) => {
      tokenListeners.add(listener);
      return () => tokenListeners.delete(listener);
    },
    onChatStats: (listener: (event: any) => void) => {
      statsListeners.add(listener);
      return () => statsListeners.delete(listener);
    },
    listChats: async () => [...mockChats].sort((a, b) => b.updatedAt - a.updatedAt),
    getChat: async (id: string) => mockChats.find((chat) => chat.id === id) ?? null,
    saveChat: async (chat: Chat) => {
      mockChats = [chat, ...mockChats.filter((item) => item.id !== chat.id)];
      return chat;
    },
    deleteChat: async (id: string) => {
      mockChats = mockChats.filter((chat) => chat.id !== id);
      return true;
    },
  };
}
