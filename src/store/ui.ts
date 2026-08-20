import { create } from "zustand";

export type View = "chat" | "library" | "downloads" | "settings";

interface UiState {
  view: View;
  sidebarOpen: boolean;
  setView: (v: View) => void;
  toggleSidebar: () => void;
  toast: { id: number; kind: "info" | "success" | "error"; text: string } | null;
  pushToast: (t: { kind: "info" | "success" | "error"; text: string }) => void;
}

export const useUi = create<UiState>((set) => ({
  view: "chat",
  sidebarOpen: true,
  setView: (v) => set({ view: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toast: null,
  pushToast: (t) => {
    const id = Date.now();
    set({ toast: { id, ...t } });
    setTimeout(() => {
      set((s) => (s.toast?.id === id ? { toast: null } : s));
    }, 4000);
  },
}));
