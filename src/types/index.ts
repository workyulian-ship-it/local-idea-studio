declare global {
  interface Window {
    lumen: {
      getPaths: () => Promise<any>;
      openExternal: (url: string) => Promise<boolean>;
      openFolder: (folder: string) => Promise<boolean>;
      showItemInFolder: (p: string) => Promise<boolean>;
      getGpuInfo: () => Promise<any>;
      selectModelsDirectory: (current?: string) => Promise<string | null>;
      getSettings: () => Promise<any>;
      saveSettings: (s: any) => Promise<any>;
      hfSearch: (q: any) => Promise<any>;
      hfModel: (id: string) => Promise<any>;
      hfFiles: (id: string) => Promise<any>;
      listModels: () => Promise<any[]>;
      deleteModel: (id: string) => Promise<boolean>;
      downloadModel: (p: any) => Promise<any>;
      cancelDownload: (id: string) => Promise<boolean>;
      listDownloads: () => Promise<any[]>;
      onDownloadProgress: (cb: any) => () => void;
      onDownloadComplete: (cb: any) => () => void;
      loadModel: (id: string, opts: any) => Promise<any>;
      unloadModel: () => Promise<any>;
      getLoadedModel: () => Promise<any>;
      chat: (p: any) => Promise<any>;
      abortChat: (id: string) => Promise<any>;
      onChatToken: (cb: any) => () => void;
      onChatStats: (cb: any) => () => void;
      listChats: () => Promise<any[]>;
      getChat: (id: string) => Promise<any>;
      saveChat: (c: any) => Promise<any>;
      deleteChat: (id: string) => Promise<boolean>;
    };
  }
}

export interface SystemPaths {
  aiRoot: string;
  modelsDir: string;
  chatsDir: string;
  cacheDir: string;
  logsDir: string;
  platform: string;
  appVersion: string;
  userData: string;
}

export interface HfSearchResult {
  id: string;
  author?: string;
  downloads: number;
  likes: number;
  ggufFileCount?: number;
  tags?: string[];
  lastModified?: string;
  pipeline_tag?: string;
}

export interface HfFile {
  rfilename: string;
  size?: number;
  quantization?: string;
}

export interface HfModelDetail extends HfSearchResult {
  siblings?: HfFile[];
  description?: string;
}

export interface LocalModel {
  id: string;
  repoId: string;
  filename: string;
  path: string;
  sizeBytes: number;
  quantization?: string;
  format: string;
  modifiedAt: number;
}

export interface DownloadJob {
  id: string;
  repoId: string;
  filename: string;
  quantization?: string;
  sizeBytes: number;
  downloaded: number;
  speed: number;
  eta: number;
  status: "queued" | "downloading" | "completed" | "error" | "cancelled";
  error?: string;
  startedAt: number;
  finishedAt?: number;
  destination: string;
}

export interface LoadedModelInfo {
  modelId: string;
  modelPath: string;
  contextSize: number;
  trainContextSize: number;
  maxOutputTokens: number;
  gpuLayers: number;
  backend: string;
  gpu: string | null;
  vram: number | null;
  loadedAt: number;
}

export interface ChatMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId?: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppSettings {
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  repeatPenalty: number;
  seed: number | null;
  modelProfiles: Record<string, ModelProfile>;
  modelsDirectory: string | null;
  contextSize: number;
  gpuLayers: number;
  gpuBackend: "auto" | "cuda" | "vulkan" | "cpu";
  threads: number;
  flashAttention: boolean;
  mlock: boolean;
  mmap: boolean;
  systemPrompt: string;
  hfToken: string;
  theme: "dark";
  defaultModelPath: string | null;
  showTokensPerSecond: boolean;
}

export interface ModelProfile {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  repeatPenalty?: number;
  seed?: number | null;
  contextSize?: number;
}
