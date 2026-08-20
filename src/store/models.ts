import { create } from "zustand";
import type { LocalModel, HfSearchResult, HfFile, LoadedModelInfo } from "../types";

function lumenApi() {
  const api = window.lumen;
  if (!api) {
    throw new Error("Lumen desktop bridge is not loaded. Close Lumen Studio fully and open it again.");
  }
  return api;
}

interface ModelsState {
  local: LocalModel[];
  loaded: LoadedModelInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  load: (id: string) => Promise<void>;
  unload: () => Promise<void>;
  setLoaded: (info: LoadedModelInfo | null) => void;
  remove: (id: string) => Promise<void>;
}

export const useModels = create<ModelsState>((set) => ({
  local: [],
  loaded: null,
  loading: false,
  error: null,
  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const list = await lumenApi().listModels();
      set({ local: list, loading: false });
    } catch (e: any) {
      set({ error: e?.message ?? String(e), loading: false });
    }
  },
  load: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const info = await lumenApi().loadModel(id, {}) as LoadedModelInfo;
      set({ loaded: info, loading: false });
    } catch (e: any) {
      const active = await lumenApi().getLoadedModel().catch(() => null) as LoadedModelInfo | null;
      set({ loaded: active, error: e?.message ?? String(e), loading: false });
      throw e;
    }
  },
  unload: async () => {
    await lumenApi().unloadModel();
    set({ loaded: null });
  },
  setLoaded: (info) => set({ loaded: info }),
  remove: async (id: string) => {
    await lumenApi().deleteModel(id);
    const list = await lumenApi().listModels();
    set({ local: list });
  },
}));

interface HfState {
  query: string;
  results: HfSearchResult[];
  loading: boolean;
  loadingMore: boolean;
  nextCursor: string | null;
  error: string | null;
  setQuery: (q: string) => void;
  search: (q?: string) => Promise<void>;
  loadMore: () => Promise<void>;
  files: (repoId: string) => Promise<HfFile[]>;
}

let hfSearchRequest = 0;

export const useHf = create<HfState>((set, get) => ({
  query: "",
  results: [],
  loading: false,
  loadingMore: false,
  nextCursor: null,
  error: null,
  setQuery: (q) => set({ query: q }),
  search: async (q) => {
    const query = q ?? get().query;
    const requestId = ++hfSearchRequest;
    set({ query, loading: true, loadingMore: false, nextCursor: null, error: null });
    try {
      const r = await lumenApi().hfSearch({ query, limit: 24, ggufOnly: true });
      if (requestId !== hfSearchRequest) return;
      set({ results: r.items ?? [], nextCursor: r.nextCursor ?? null, loading: false });
    } catch (e: any) {
      if (requestId !== hfSearchRequest) return;
      set({ error: e?.message ?? String(e), loading: false, results: [] });
    }
  },
  loadMore: async () => {
    const { query, nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true, error: null });
    try {
      const r = await lumenApi().hfSearch({
        query,
        limit: 24,
        ggufOnly: true,
        cursor: nextCursor,
      });
      const existing = get().results;
      const seen = new Set(existing.map((item) => item.id));
      const additions = (r.items ?? []).filter((item: HfSearchResult) => !seen.has(item.id));
      set({
        results: [...existing, ...additions],
        nextCursor: r.nextCursor ?? null,
        loadingMore: false,
      });
    } catch (e: any) {
      set({ error: e?.message ?? String(e), loadingMore: false });
    }
  },
  files: async (repoId) => {
    return await lumenApi().hfFiles(repoId);
  },
}));
