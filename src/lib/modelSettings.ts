import type { AppSettings, LoadedModelInfo, ModelProfile } from "../types";

export const PROFILE_FIELDS = [
  "temperature",
  "topP",
  "topK",
  "maxTokens",
  "repeatPenalty",
  "seed",
  "contextSize",
] as const;

export function getModelProfile(settings: AppSettings, loaded: LoadedModelInfo | null): ModelProfile {
  if (!loaded) return {};
  return settings.modelProfiles?.[loaded.modelPath] ?? {};
}

export function getEffectiveModelSettings(settings: AppSettings, loaded: LoadedModelInfo | null) {
  const profile = getModelProfile(settings, loaded);
  const preferredContext = profile.contextSize ?? settings.contextSize;
  const contextSize = loaded
    ? Math.min(loaded.trainContextSize || preferredContext, preferredContext)
    : preferredContext;
  const outputContext = loaded?.contextSize ?? contextSize;
  const maxOutputLimit = Math.max(32, outputContext - 256);
  return {
    ...settings,
    ...profile,
    contextSize,
    maxTokens: Math.min(profile.maxTokens ?? settings.maxTokens, maxOutputLimit),
  };
}
