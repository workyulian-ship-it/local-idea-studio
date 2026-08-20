import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSettings, getSettings, defaultSettings } from "../dist-electron/settings.js";
import { saveChat, getChat, listChats, deleteChat } from "../dist-electron/storage.js";
import { listLocalModels, deleteLocalModel } from "../dist-electron/models.js";
import { downloadManager } from "../dist-electron/downloads.js";

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-storage-test-"));
if (!tempRoot.startsWith(path.resolve(os.tmpdir()))) throw new Error("Unsafe test directory");

const settingsFile = path.join(tempRoot, "settings.json");
const modelsDir = path.join(tempRoot, "custom-models");
const chatsDir = path.join(tempRoot, "chats");
const logsDir = path.join(tempRoot, "logs");

try {
  const saved = await saveSettings(settingsFile, {
    ...defaultSettings,
    temperature: 1.15,
    gpuBackend: "cpu",
    modelsDirectory: modelsDir,
  });
  const loaded = await getSettings(settingsFile);
  assert.equal(saved.modelsDirectory, path.resolve(modelsDir));
  assert.equal(loaded.modelsDirectory, path.resolve(modelsDir));
  assert.equal(loaded.temperature, 1.15);
  assert.equal(loaded.gpuBackend, "cpu");

  fs.mkdirSync(path.join(modelsDir, "org__repo", "nested"), { recursive: true });
  fs.writeFileSync(path.join(modelsDir, "org__repo", "nested", "tiny-Q4_K_M.gguf"), "GGUF-test");
  const models = await listLocalModels(modelsDir);
  assert.equal(models.length, 1);
  assert.equal(models[0].quantization, "Q4_K_M");
  assert.equal(await deleteLocalModel(modelsDir, models[0].id), true);
  assert.equal((await listLocalModels(modelsDir)).length, 0);

  fs.mkdirSync(chatsDir, { recursive: true });
  const chat = {
    id: "persistence-test",
    title: "Saved chat",
    messages: [{ id: "m1", role: "user", content: "hello", createdAt: Date.now() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveChat(chatsDir, chat);
  assert.equal((await getChat(chatsDir, chat.id))?.messages[0].content, "hello");
  assert.equal((await listChats(chatsDir)).length, 1);
  assert.equal(await deleteChat(chatsDir, chat.id), true);

  const complete = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Download test timed out")), 30000);
    downloadManager.once("complete", (job) => {
      clearTimeout(timeout);
      job.status === "completed" ? resolve(job) : reject(new Error(job.error || job.status));
    });
  });
  await downloadManager.start({
    repoId: "openai-community/gpt2",
    filename: "config.json",
  }, modelsDir, logsDir);
  const job = await complete;
  assert.equal(job.status, "completed");
  assert.ok(job.downloaded > 0);
  assert.ok(fs.existsSync(job.destination));

  console.log("Storage test passed: settings, custom model folder, model scan/delete, chats, and a real Hugging Face download all persist.");
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
