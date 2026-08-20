import { create } from "zustand";
import type { AppSettings } from "../types";

interface SettingsState {
  settings: AppSettings | null;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
}

let saveRevision = 0;

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,
  load: async () => {
    const s = await window.lumen.getSettings();
    set({ settings: s, loaded: true });
  },
  update: async (patch) => {
    const cur = get().settings;
    const optimistic = { ...(cur ?? {}), ...patch } as AppSettings;
    const revision = ++saveRevision;
    set({ settings: optimistic });
    const saved = await window.lumen.saveSettings(optimistic);
    if (revision === saveRevision) set({ settings: saved });
  },
  reset: async () => {
    saveRevision += 1;
    const next = await window.lumen.saveSettings({});
    set({ settings: next });
  },
}));
