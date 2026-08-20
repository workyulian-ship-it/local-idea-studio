import { create } from "zustand";
import type { Chat, ChatMessage } from "../types";
import { uid } from "../lib/utils";

interface ChatsState {
  chats: Chat[];
  currentId: string | null;
  current: Chat | null;
  streaming: boolean;
  streamText: string;
  streamStats: { tps: number; tokens: number; elapsed: number } | null;
  refresh: () => Promise<void>;
  create: (title?: string) => Promise<Chat>;
  select: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  update: (patch: Partial<Chat>) => Promise<void>;
  append: (msg: ChatMessage) => Promise<void>;
  setStreamText: (t: string) => void;
  setStreamStats: (s: { tps: number; tokens: number; elapsed: number } | null) => void;
  setStreaming: (b: boolean) => void;
  resetStream: () => void;
}

export const useChats = create<ChatsState>((set, get) => ({
  chats: [],
  currentId: null,
  current: null,
  streaming: false,
  streamText: "",
  streamStats: null,
  refresh: async () => {
    const list = await window.lumen.listChats();
    set({ chats: list });
  },
  create: async (title) => {
    const id = uid();
    const now = Date.now();
    const chat: Chat = {
      id,
      title: title ?? "New chat",
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    await window.lumen.saveChat(chat);
    await get().refresh();
    set({ currentId: id, current: chat });
    return chat;
  },
  select: async (id) => {
    const c = await window.lumen.getChat(id);
    set({ currentId: id, current: c });
  },
  remove: async (id) => {
    await window.lumen.deleteChat(id);
    if (get().currentId === id) {
      set({ currentId: null, current: null });
    }
    await get().refresh();
  },
  update: async (patch) => {
    const cur = get().current;
    if (!cur) return;
    const next: Chat = { ...cur, ...patch, updatedAt: Date.now() };
    await window.lumen.saveChat(next);
    set({ current: next });
    await get().refresh();
  },
  append: async (msg) => {
    const cur = get().current;
    if (!cur) return;
    const next: Chat = { ...cur, messages: [...cur.messages, msg], updatedAt: Date.now() };
    await window.lumen.saveChat(next);
    set({ current: next });
  },
  setStreamText: (t) => set({ streamText: t }),
  setStreamStats: (s) => set({ streamStats: s }),
  setStreaming: (b) => set({ streaming: b }),
  resetStream: () => set({ streamText: "", streamStats: null }),
}));
