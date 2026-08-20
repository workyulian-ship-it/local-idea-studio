import { ipcMain, BrowserWindow, shell, dialog, app } from "electron";
import path from "path";
import fs from "fs";
import { hfSearch, hfGetModel, hfGetFiles, HfFile } from "./huggingface.js";
import { listLocalModels, deleteLocalModel, LocalModel } from "./models.js";
import { downloadManager, DownloadJob } from "./downloads.js";
import {
  loadModel,
  unloadModel,
  getLoadedModelInfo,
  streamChat,
  abortChat,
  onLlamaEvent,
  bindWindowGetter,
  getLlamaRuntimeInfo,
} from "./llama.js";
import { listChats, getChat, saveChat, deleteChat } from "./storage.js";
import { getSettings, saveSettings, defaultSettings, AppSettings } from "./settings.js";

export interface IpcContext {
  aiRoot: string;
  modelsDir: string;
  chatsDir: string;
  cacheDir: string;
  settingsFile: string;
  logsDir: string;
  getMainWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(ctx: IpcContext) {
  const win = () => ctx.getMainWindow();
  bindWindowGetter(win);
  const getActiveModelsDir = async () => {
    const settings = await getSettings(ctx.settingsFile);
    if (settings.modelsDirectory) {
      try {
        fs.mkdirSync(settings.modelsDirectory, { recursive: true });
        return settings.modelsDirectory;
      } catch (error) {
        console.error(`Configured model directory is unavailable: ${settings.modelsDirectory}`, error);
      }
    }
    fs.mkdirSync(ctx.modelsDir, { recursive: true });
    return ctx.modelsDir;
  };

  // ---------------- System ----------------
  ipcMain.handle("system:paths", async () => ({
    aiRoot: ctx.aiRoot,
    modelsDir: await getActiveModelsDir(),
    chatsDir: ctx.chatsDir,
    cacheDir: ctx.cacheDir,
    logsDir: ctx.logsDir,
    platform: process.platform,
    appVersion: app.getVersion(),
    userData: app.getPath("userData"),
  }));

  ipcMain.handle("system:select-models-directory", async (_e, current?: string) => {
    const parent = win();
    const options = {
      title: "Choose where Lumen Studio stores GGUF models",
      defaultPath: current || await getActiveModelsDir(),
      buttonLabel: "Use this folder",
      properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    const selected = path.resolve(result.filePaths[0]);
    fs.mkdirSync(selected, { recursive: true });
    return selected;
  });

  ipcMain.handle("system:open-external", async (_e, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("system:open-folder", async (_e, folder: string) => {
    if (!folder) return false;
    if (!fs.existsSync(folder)) {
      await shell.openPath(ctx.aiRoot);
    } else {
      await shell.openPath(folder);
    }
    return true;
  });

  ipcMain.handle("system:show-item", async (_e, p: string) => {
    if (p && fs.existsSync(p)) shell.showItemInFolder(p);
    return true;
  });

  ipcMain.handle("system:gpu", async () => {
    const info = await getLoadedModelInfo();
    const runtime = getLlamaRuntimeInfo();
    return {
      backend: info?.backend ?? runtime.backend,
      gpu: info?.gpu ?? null,
      vram: info?.vram ?? null,
      modelLoaded: !!info,
    };
  });

  // ---------------- Settings ----------------
  ipcMain.handle("settings:get", async () => {
    return await getSettings(ctx.settingsFile);
  });
  ipcMain.handle("settings:save", async (_e, s: AppSettings) => {
    return await saveSettings(ctx.settingsFile, s);
  });

  // ---------------- Hugging Face ----------------
  ipcMain.handle("hf:search", async (_e, q: { query?: string; author?: string; limit?: number; cursor?: string; ggufOnly?: boolean }) => {
    try {
      const settings = await getSettings(ctx.settingsFile);
      return await hfSearch(q, ctx.cacheDir, settings.hfToken);
    } catch (e: any) {
      throw new Error(e?.message ?? String(e));
    }
  });
  ipcMain.handle("hf:model", async (_e, id: string) => {
    try {
      const settings = await getSettings(ctx.settingsFile);
      return await hfGetModel(id, ctx.cacheDir, settings.hfToken);
    } catch (e: any) {
      throw new Error(e?.message ?? String(e));
    }
  });
  ipcMain.handle("hf:files", async (_e, id: string) => {
    try {
      const settings = await getSettings(ctx.settingsFile);
      return await hfGetFiles(id, ctx.cacheDir, settings.hfToken);
    } catch (e: any) {
      throw new Error(e?.message ?? String(e));
    }
  });

  // ---------------- Local Models ----------------
  ipcMain.handle("models:list", async (): Promise<LocalModel[]> => {
    return await listLocalModels(await getActiveModelsDir());
  });
  ipcMain.handle("models:delete", async (_e, id: string) => {
    return await deleteLocalModel(await getActiveModelsDir(), id);
  });

  // ---------------- Downloads ----------------
  ipcMain.handle(
    "download:start",
    async (_e, payload: { repoId: string; filename: string; quantization?: string; sizeBytes?: number }) => {
      const settings = await getSettings(ctx.settingsFile);
      const job = await downloadManager.start(payload, await getActiveModelsDir(), ctx.logsDir, settings.hfToken);
      const w = win();
      if (w) {
        w.webContents.send("download:progress", job);
      }
      return job;
    }
  );
  ipcMain.handle("download:cancel", async (_e, id: string) => {
    return downloadManager.cancel(id);
  });
  ipcMain.handle("download:list", async (): Promise<DownloadJob[]> => {
    return downloadManager.list();
  });

  // Forward download progress events to renderer
  downloadManager.on("progress", (job: DownloadJob) => {
    const w = win();
    if (w) w.webContents.send("download:progress", job);
  });
  downloadManager.on("complete", (job: DownloadJob) => {
    const w = win();
    if (w) w.webContents.send("download:complete", job);
  });

  // ---------------- Inference ----------------
  ipcMain.handle("llm:load", async (_e, id: string, opts: unknown) => {
    const settings = await getSettings(ctx.settingsFile);
    const result = await loadModel(id, { ...(opts as object), settings });
    return result;
  });
  ipcMain.handle("llm:unload", async () => {
    return await unloadModel();
  });
  ipcMain.handle("llm:loaded", async () => {
    return await getLoadedModelInfo();
  });
  ipcMain.handle(
    "llm:chat",
    async (_e, payload: { messages: unknown[]; opts: unknown; conversationId: string }) => {
      const chatPayload = payload as any;
      await streamChat(chatPayload, win);
      return { ok: true };
    }
  );
  ipcMain.handle("llm:abort", async (_e, conversationId: string) => {
    return await abortChat(conversationId);
  });
  ipcMain.handle("llm:token", async () => null); // placeholder

  // Forward token / stats from llama wrapper
  onLlamaEvent((evt: any) => {
    const w = win();
    if (!w) return;
    if (evt.type === "token") w.webContents.send("llm:token", evt);
    else if (evt.type === "stats") w.webContents.send("llm:stats", evt);
    else if (evt.type === "error") w.webContents.send("llm:token", { type: "error", error: evt.error });
    else if (evt.type === "done") w.webContents.send("llm:token", { type: "done", text: evt.text, aborted: evt.aborted });
  });

  // ---------------- Chats ----------------
  ipcMain.handle("chats:list", async () => listChats(ctx.chatsDir));
  ipcMain.handle("chats:get", async (_e, id: string) => getChat(ctx.chatsDir, id));
  ipcMain.handle("chats:save", async (_e, chat: unknown) => saveChat(ctx.chatsDir, chat));
  ipcMain.handle("chats:delete", async (_e, id: string) => deleteChat(ctx.chatsDir, id));
}
