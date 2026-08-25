import path from "path";
import fs from "fs";

export interface AppSettings {
  // Generation
  temperature: number;
  topP: number;
  topK: number;
  maxTokens: number;
  repeatPenalty: number;
  seed: number | null;
  modelProfiles: Record<string, ModelProfile>;
  modelsDirectory: string | null;
  // Model
  contextSize: number;
  gpuLayers: number; // -1 = all
  gpuBackend: "auto" | "cuda" | "vulkan" | "cpu";
  threads: number;
  // Performance (default ON for max speed)
  flashAttention: boolean;
  mlock: boolean;
  mmap: boolean;
  // Behavior
  systemPrompt: string;
  hfToken: string;
  theme: "dark";
  defaultModelPath: string | null;
  showTokensPerSecond: boolean;
  thinkingMode: "minimal" | "standard" | "max";
  agentMode: boolean;
  agentWorkspace: string | null;
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

export const defaultSettings: AppSettings = {
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
  // Max performance defaults — fully offload to your GPU
  flashAttention: true,
  mlock: false,
  mmap: true,
  systemPrompt:
    "You are a helpful, harmless, and honest AI assistant. Provide clear, accurate, and thoughtful responses.",
  hfToken: "",
  theme: "dark",
  defaultModelPath: null,
  showTokensPerSecond: true,
  thinkingMode: "standard",
  agentMode: false,
  agentWorkspace: null,
};

export async function getSettings(settingsFile: string): Promise<AppSettings> {
  if (!fs.existsSync(settingsFile)) return { ...defaultSettings };
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile, "utf-8"));
    return normalizeSettings({ ...defaultSettings, ...raw });
  } catch {
    return { ...defaultSettings };
  }
}

export async function saveSettings(settingsFile: string, s: AppSettings): Promise<AppSettings> {
  const merged = normalizeSettings({ ...defaultSettings, ...s });
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2));
  return merged;
}

function numberInRange(value: unknown, fallback: number, min: number, max: number, integer = false) {
  const parsed = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return integer ? Math.round(clamped) : clamped;
}

function normalizeProfile(value: unknown): ModelProfile {
  const profile = value && typeof value === "object" ? value as ModelProfile : {};
  const normalized: ModelProfile = {};
  if (profile.temperature !== undefined) normalized.temperature = numberInRange(profile.temperature, defaultSettings.temperature, 0, 2);
  if (profile.topP !== undefined) normalized.topP = numberInRange(profile.topP, defaultSettings.topP, 0, 1);
  if (profile.topK !== undefined) normalized.topK = numberInRange(profile.topK, defaultSettings.topK, 1, 100, true);
  if (profile.maxTokens !== undefined) normalized.maxTokens = numberInRange(profile.maxTokens, defaultSettings.maxTokens, 32, 32768, true);
  if (profile.repeatPenalty !== undefined) normalized.repeatPenalty = numberInRange(profile.repeatPenalty, defaultSettings.repeatPenalty, 1, 2);
  if (profile.seed !== undefined) normalized.seed = profile.seed == null ? null : numberInRange(profile.seed, 0, -2147483648, 2147483647, true);
  if (profile.contextSize !== undefined) normalized.contextSize = numberInRange(profile.contextSize, defaultSettings.contextSize, 512, 1048576, true);
  return normalized;
}

function normalizeSettings(settings: AppSettings): AppSettings {
  const profiles: Record<string, ModelProfile> = {};
  if (settings.modelProfiles && typeof settings.modelProfiles === "object") {
    for (const [modelPath, profile] of Object.entries(settings.modelProfiles)) {
      if (modelPath) profiles[modelPath] = normalizeProfile(profile);
    }
  }
  return {
    ...defaultSettings,
    ...settings,
    temperature: numberInRange(settings.temperature, defaultSettings.temperature, 0, 2),
    topP: numberInRange(settings.topP, defaultSettings.topP, 0, 1),
    topK: numberInRange(settings.topK, defaultSettings.topK, 1, 100, true),
    maxTokens: numberInRange(settings.maxTokens, defaultSettings.maxTokens, 32, 32768, true),
    repeatPenalty: numberInRange(settings.repeatPenalty, defaultSettings.repeatPenalty, 1, 2),
    seed: settings.seed == null ? null : numberInRange(settings.seed, 0, -2147483648, 2147483647, true),
    contextSize: numberInRange(settings.contextSize, defaultSettings.contextSize, 512, 1048576, true),
    gpuLayers: numberInRange(settings.gpuLayers, defaultSettings.gpuLayers, -1, 999, true),
    gpuBackend: (["auto", "cuda", "vulkan", "cpu"] as const).includes(settings.gpuBackend)
      ? settings.gpuBackend
      : defaultSettings.gpuBackend,
    threads: numberInRange(settings.threads, defaultSettings.threads, 0, 256, true),
    thinkingMode: (["minimal", "standard", "max"] as const).includes(settings.thinkingMode)
      ? settings.thinkingMode
      : defaultSettings.thinkingMode,
    agentMode: settings.agentMode === true,
    agentWorkspace: typeof settings.agentWorkspace === "string" && settings.agentWorkspace.trim()
      ? path.resolve(settings.agentWorkspace.trim())
      : null,
    modelProfiles: profiles,
    modelsDirectory: typeof settings.modelsDirectory === "string" && settings.modelsDirectory.trim()
      ? path.resolve(settings.modelsDirectory.trim())
      : null,
  };
}
