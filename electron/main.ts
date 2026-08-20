import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { registerIpcHandlers } from "./ipc.js";
import { initLlama, shutdownLlama } from "./llama.js";
import { createStoragePaths, resolveAiRoot, StoragePaths } from "./paths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Migration only: never selected on a new installation. It keeps v0.1.0 users
// connected to models/settings that the earlier release already created here.
const LEGACY_WINDOWS_AI_ROOT = "D:\\LLM AI";

function initializeStorage(): StoragePaths {
  const preferredRoot = resolveAiRoot({
    configuredRoot: process.env.LOCAL_IDEA_AI_ROOT || process.env.LUMEN_AI_ROOT,
    documentsDir: app.getPath("documents"),
    legacyRoot: process.platform === "win32" ? LEGACY_WINDOWS_AI_ROOT : undefined,
  });

  try {
    return createStoragePaths(preferredRoot);
  } catch (error) {
    // Documents may be redirected to an unavailable network/OneDrive folder.
    // Electron's per-user data directory is always the safe final fallback.
    const fallbackRoot = path.join(app.getPath("userData"), "data");
    console.error(`Failed to initialize storage at ${preferredRoot}; using ${fallbackRoot}`, error);
    return createStoragePaths(fallbackRoot);
  }
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

  const devUrl = process.env.VITE_DEV_SERVER_URL || (process.env.LOCAL_IDEA_DEV ? "http://localhost:5173" : null);
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
  const storage = initializeStorage();
  registerIpcHandlers({
    aiRoot: storage.aiRoot,
    modelsDir: storage.modelsDir,
    chatsDir: storage.chatsDir,
    cacheDir: storage.cacheDir,
    settingsFile: storage.settingsFile,
    logsDir: storage.logsDir,
    getMainWindow: () => mainWindow,
  });

  await initLlama(storage.modelsDir, storage.logsDir);
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
