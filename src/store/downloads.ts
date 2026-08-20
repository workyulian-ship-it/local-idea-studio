import { create } from "zustand";
import type { DownloadJob } from "../types";

interface DownloadsState {
  jobs: DownloadJob[];
  refresh: () => Promise<void>;
  start: (repoId: string, filename: string, quantization?: string, sizeBytes?: number) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  apply: (job: DownloadJob) => void;
}

export const useDownloads = create<DownloadsState>((set, get) => ({
  jobs: [],
  refresh: async () => {
    const list = await window.lumen.listDownloads();
    set({ jobs: list });
  },
  start: async (repoId, filename, quantization, sizeBytes) => {
    const job = await window.lumen.downloadModel({ repoId, filename, quantization, sizeBytes });
    const list = get().jobs;
    set({ jobs: [job, ...list.filter((j) => j.id !== job.id)] });
  },
  cancel: async (id) => {
    await window.lumen.cancelDownload(id);
    const list = get().jobs.map((j) =>
      j.id === id ? { ...j, status: "cancelled" as const } : j
    );
    set({ jobs: list });
  },
  apply: (job) => {
    const list = get().jobs;
    const idx = list.findIndex((j) => j.id === job.id);
    if (idx >= 0) {
      const next = [...list];
      next[idx] = job;
      set({ jobs: next });
    } else {
      set({ jobs: [job, ...list] });
    }
  },
}));
