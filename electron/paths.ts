import fs from "fs";
import path from "path";

export interface StoragePaths {
  aiRoot: string;
  modelsDir: string;
  chatsDir: string;
  cacheDir: string;
  settingsFile: string;
  logsDir: string;
}

export interface ResolveAiRootOptions {
  documentsDir: string;
  configuredRoot?: string;
  legacyRoot?: string;
}

/**
 * New installations use the current user's Documents folder. This follows the
 * Windows system drive and also works when Documents has been moved by the user.
 * Existing v0.1.0 installations keep their legacy location to avoid losing
 * access to settings and downloaded models after an update.
 */
export function resolveAiRoot(options: ResolveAiRootOptions): string {
  const configured = options.configuredRoot?.trim();
  if (configured) return path.resolve(configured);

  const legacy = options.legacyRoot?.trim();
  if (legacy) {
    const hasLegacyData = fs.existsSync(path.join(legacy, ".lumen-root.json"))
      || fs.existsSync(path.join(legacy, "settings.json"));
    if (hasLegacyData) return path.resolve(legacy);
  }

  return path.join(path.resolve(options.documentsDir), "Lumen Studio");
}

export function createStoragePaths(aiRoot: string): StoragePaths {
  const root = path.resolve(aiRoot);
  const paths: StoragePaths = {
    aiRoot: root,
    modelsDir: path.join(root, "models"),
    chatsDir: path.join(root, "chats"),
    cacheDir: path.join(root, "cache"),
    settingsFile: path.join(root, "settings.json"),
    logsDir: path.join(root, "logs"),
  };

  for (const dir of [paths.aiRoot, paths.modelsDir, paths.chatsDir, paths.cacheDir, paths.logsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(paths.aiRoot, ".lumen-root.json"),
    JSON.stringify({ root: paths.aiRoot, models: paths.modelsDir, chats: paths.chatsDir }, null, 2)
  );

  return paths;
}
