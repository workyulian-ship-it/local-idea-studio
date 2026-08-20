const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getPaths: () => ipcRenderer.invoke("system:paths"),
  openExternal: (url) => ipcRenderer.invoke("system:open-external", url),
  openFolder: (folder) => ipcRenderer.invoke("system:open-folder", folder),
  showItemInFolder: (p) => ipcRenderer.invoke("system:show-item", p),
  getGpuInfo: () => ipcRenderer.invoke("system:gpu"),
  selectModelsDirectory: (current) => ipcRenderer.invoke("system:select-models-directory", current),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),

  hfSearch: (q) => ipcRenderer.invoke("hf:search", q),
  hfModel: (id) => ipcRenderer.invoke("hf:model", id),
  hfFiles: (id) => ipcRenderer.invoke("hf:files", id),

  listModels: () => ipcRenderer.invoke("models:list"),
  deleteModel: (id) => ipcRenderer.invoke("models:delete", id),

  downloadModel: (payload) => ipcRenderer.invoke("download:start", payload),
  cancelDownload: (id) => ipcRenderer.invoke("download:cancel", id),
  listDownloads: () => ipcRenderer.invoke("download:list"),
  onDownloadProgress: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("download:progress", handler);
    return () => ipcRenderer.removeListener("download:progress", handler);
  },
  onDownloadComplete: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("download:complete", handler);
    return () => ipcRenderer.removeListener("download:complete", handler);
  },

  loadModel: (id, opts) => ipcRenderer.invoke("llm:load", id, opts),
  unloadModel: () => ipcRenderer.invoke("llm:unload"),
  getLoadedModel: () => ipcRenderer.invoke("llm:loaded"),
  chat: (payload) => ipcRenderer.invoke("llm:chat", payload),
  abortChat: (conversationId) => ipcRenderer.invoke("llm:abort", conversationId),
  onChatToken: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("llm:token", handler);
    return () => ipcRenderer.removeListener("llm:token", handler);
  },
  onChatStats: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("llm:stats", handler);
    return () => ipcRenderer.removeListener("llm:stats", handler);
  },

  listChats: () => ipcRenderer.invoke("chats:list"),
  getChat: (id) => ipcRenderer.invoke("chats:get", id),
  saveChat: (chat) => ipcRenderer.invoke("chats:save", chat),
  deleteChat: (id) => ipcRenderer.invoke("chats:delete", id),
};

contextBridge.exposeInMainWorld("lumen", api);
