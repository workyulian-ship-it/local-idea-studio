import { contextBridge, ipcRenderer } from "electron";

const api = {
  // system
  getPaths: () => ipcRenderer.invoke("system:paths"),
  openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),
  openFolder: (folder: string) => ipcRenderer.invoke("system:open-folder", folder),
  showItemInFolder: (p: string) => ipcRenderer.invoke("system:show-item", p),
  getGpuInfo: () => ipcRenderer.invoke("system:gpu"),
  selectModelsDirectory: (current?: string) => ipcRenderer.invoke("system:select-models-directory", current),
  selectAgentWorkspace: (current?: string) => ipcRenderer.invoke("agent:select-workspace", current),
  executeAgentAction: (action: unknown) => ipcRenderer.invoke("agent:execute-file-action", action),

  // settings
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s: unknown) => ipcRenderer.invoke("settings:save", s),

  // huggingface
  hfSearch: (q: { query?: string; author?: string; limit?: number; cursor?: string }) =>
    ipcRenderer.invoke("hf:search", q),
  hfModel: (id: string) => ipcRenderer.invoke("hf:model", id),
  hfFiles: (id: string) => ipcRenderer.invoke("hf:files", id),

  // models on disk
  listModels: () => ipcRenderer.invoke("models:list"),
  deleteModel: (id: string) => ipcRenderer.invoke("models:delete", id),

  // downloads
  downloadModel: (payload: { repoId: string; filename: string; quantization?: string; sizeBytes?: number }) =>
    ipcRenderer.invoke("download:start", payload),
  cancelDownload: (id: string) => ipcRenderer.invoke("download:cancel", id),
  listDownloads: () => ipcRenderer.invoke("download:list"),
  onDownloadProgress: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on("download:progress", handler);
    return () => ipcRenderer.removeListener("download:progress", handler);
  },
  onDownloadComplete: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on("download:complete", handler);
    return () => ipcRenderer.removeListener("download:complete", handler);
  },

  // inference
  loadModel: (id: string, opts: unknown) => ipcRenderer.invoke("llm:load", id, opts),
  unloadModel: () => ipcRenderer.invoke("llm:unload"),
  getLoadedModel: () => ipcRenderer.invoke("llm:loaded"),
  chat: (payload: { messages: unknown[]; opts: unknown; conversationId: string }) =>
    ipcRenderer.invoke("llm:chat", payload),
  abortChat: (conversationId: string) => ipcRenderer.invoke("llm:abort", conversationId),
  onChatToken: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on("llm:token", handler);
    return () => ipcRenderer.removeListener("llm:token", handler);
  },
  onChatStats: (cb: (e: unknown) => void) => {
    const handler = (_: unknown, data: unknown) => cb(data);
    ipcRenderer.on("llm:stats", handler);
    return () => ipcRenderer.removeListener("llm:stats", handler);
  },

  // chats
  listChats: () => ipcRenderer.invoke("chats:list"),
  getChat: (id: string) => ipcRenderer.invoke("chats:get", id),
  saveChat: (chat: unknown) => ipcRenderer.invoke("chats:save", chat),
  deleteChat: (id: string) => ipcRenderer.invoke("chats:delete", id),
};

contextBridge.exposeInMainWorld("lumen", api);

export type LumenApi = typeof api;
