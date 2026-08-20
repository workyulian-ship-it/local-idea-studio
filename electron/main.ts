import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc.js";
import { initLlama, shutdownLlama } from "./llama.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default AI storage root: D:\LLM AI (user's dedicated AI drive)
const DEFAULT_AI_ROOT = "D:\\LLM AI";

function getAiRoot(): string {
  const configured = process.env.LUMEN_AI_ROOT;
  if (configured && fs.existsSync(path.dirname(configured))) return configured;
  if (fs.existsSync("D:\\")) return DEFAULT_AI_ROOT;
  return path.join(os.homedir(), "LumenStudio");
}

const AI_ROOT = getAiRoot();
const MODELS_DIR = path.join(AI_ROOT, "models");
const CHATS_DIR = path.join(AI_ROOT, "chats");
const CACHE_DIR = path.join(AI_ROOT, "cache");
const SETTINGS_FILE = path.join(AI_ROOT, "settings.json");
const LOGS_DIR = path.join(AI_ROOT, "logs");

for (const dir of [AI_ROOT, MODELS_DIR, CHATS_DIR, CACHE_DIR, LOGS_DIR]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error("Failed to create dir:", dir, e);
  }
}

// Persist the chosen root so the renderer can read it on first launch
try {
  fs.writeFileSync(
    path.join(AI_ROOT, ".lumen-root.json"),
    JSON.stringify({ root: AI_ROOT, models: MODELS_DIR, chats: CHATS_DIR }, null, 2)
  );
} catch (e) {
  console.error("Failed to write root marker:", e);
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, "../dist/icon.png"),
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0b",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0a0a0b",
      symbolColor: "#e8e8ea",
      height: 36,
    },
    show: false,
    webPreferences: {
      // CommonJS preload: ESM preload.js fails to load from app.asar, which
      // leaves window.lumen undefined (hfSearch / listModels crash).
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || (process.env.LUMEN_DEV ? "http://localhost:5173" : null);
  if (devUrl) {
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers({
    aiRoot: AI_ROOT,
    modelsDir: MODELS_DIR,
    chatsDir: CHATS_DIR,
    cacheDir: CACHE_DIR,
    settingsFile: SETTINGS_FILE,
    logsDir: LOGS_DIR,
    getMainWindow: () => mainWindow,
  });

  await initLlama(MODELS_DIR, LOGS_DIR);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  await shutdownLlama();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await shutdownLlama();
});
