import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStoragePaths, resolveAiRoot } from "../dist-electron/paths.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-paths-"));

try {
  const documentsDir = path.join(tempRoot, "Users", "Test", "Documents");
  fs.mkdirSync(documentsDir, { recursive: true });

  const defaultRoot = resolveAiRoot({ documentsDir });
  assert.equal(defaultRoot, path.join(documentsDir, "Lumen Studio"));

  const storage = createStoragePaths(defaultRoot);
  for (const directory of [storage.aiRoot, storage.modelsDir, storage.chatsDir, storage.cacheDir, storage.logsDir]) {
    assert.equal(fs.statSync(directory).isDirectory(), true);
  }
  assert.equal(fs.existsSync(path.join(defaultRoot, ".lumen-root.json")), true);

  const customRoot = path.join(tempRoot, "Custom Models Root");
  assert.equal(resolveAiRoot({ documentsDir, configuredRoot: customRoot }), customRoot);

  const legacyRoot = path.join(tempRoot, "Legacy");
  fs.mkdirSync(legacyRoot, { recursive: true });
  fs.writeFileSync(path.join(legacyRoot, "settings.json"), "{}");
  assert.equal(resolveAiRoot({ documentsDir, legacyRoot }), legacyRoot);

  console.log("Portable storage path tests passed.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
