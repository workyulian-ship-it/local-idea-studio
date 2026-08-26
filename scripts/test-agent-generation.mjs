import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadModel, onLlamaEvent, shutdownLlama, streamChat } from "../dist-electron/llama.js";
import { isSameAgentActionTarget, parseAgentAction } from "../src/lib/agentActions.ts";

const modelPath = process.argv[2];
const backend = process.argv[3] ?? "auto";
const workspaceRoot = process.argv[4] ?? null;
if (!modelPath) throw new Error("Pass a GGUF model path");

const settings = {
  temperature: 0,
  topP: 1,
  topK: 40,
  maxTokens: 512,
  repeatPenalty: 1.1,
  seed: 42,
  modelProfiles: {},
  modelsDirectory: null,
  contextSize: 2048,
  gpuLayers: -1,
  gpuBackend: backend,
  threads: 0,
  flashAttention: true,
  mlock: false,
  mmap: true,
  systemPrompt: "You are a careful coding assistant.",
  hfToken: "",
  theme: "dark",
  defaultModelPath: null,
  showTokensPerSecond: true,
  thinkingMode: "standard",
  agentMode: true,
  agentWorkspace: null,
};

const pending = new Map();
onLlamaEvent((event) => {
  const waiter = event?.conversationId ? pending.get(event.conversationId) : null;
  if (!waiter) return;
  if (event.type === "done") {
    pending.delete(event.conversationId);
    waiter.resolve(event.text ?? "");
  }
  if (event.type === "error") {
    pending.delete(event.conversationId);
    waiter.reject(new Error(event.error));
  }
});

async function runChat(conversationId, messages) {
  const result = new Promise((resolve, reject) => pending.set(conversationId, { resolve, reject }));
  await streamChat({
    conversationId,
    messages,
    opts: {
      temperature: 0,
      topP: 1,
      topK: 40,
      maxTokens: 512,
      repeatPenalty: 1.1,
      seed: 42,
      thinkingMode: "standard",
      agentMode: true,
      agentWorkspace: workspaceRoot,
    },
  }, () => null);
  return result;
}

try {
  const info = await loadModel(modelPath, { settings });
  console.log(`Loaded Agent Mode test on ${info.backend}.`);
  const originalPrompt = "Create hello.py that prints Hello World five times.";
  const answer = await runChat("agent-generation", [{ role: "user", content: originalPrompt }]);
  const action = parseAgentAction(answer).action;
  assert.ok(action, `Model did not propose a permission-gated action:\n${answer}`);
  assert.ok(["create_file", "write_file"].includes(action.type));
  assert.equal(action.path, "hello.py");
  assert.match(action.reason, /hello|python|script/i);
  assert.match(action.content, /Hello World/);
  const continuation = await runChat("agent-continuation", [
    { role: "user", content: originalPrompt },
    { role: "assistant", content: `Agent Mode proposes: ${action.reason}` },
    {
      role: "user",
      content: `[LOCAL IDEA AGENT RESULT]\nOutcome: SUCCESS\nOperation: Create file\nWorkspace-relative path: hello.py\nResult: Create file completed: hello.py\nThe application already completed this exact operation after user approval. Continue the original request, briefly confirm the completed result, and do not propose or repeat this same action.`,
    },
  ]);
  const continuationAction = parseAgentAction(continuation).action;
  if (continuationAction) {
    assert.equal(isSameAgentActionTarget(action, continuationAction), true, `Model proposed an unrelated action after completion:\n${continuation}`);
    console.log("Model repeated the completed target, and the application duplicate-target guard will suppress it.");
  } else {
    assert.match(continuation, /created|complete|done|hello\.py/i, `Model did not finish after the action result:\n${continuation}`);
  }
  if (workspaceRoot) {
    const absoluteTarget = path.join(workspaceRoot, "number_guessing_game.py");
    if (fs.existsSync(absoluteTarget)) {
      const readAnswer = await runChat("agent-absolute-read", [{
        role: "user",
        content: `Read this file: ${JSON.stringify(absoluteTarget)}`,
      }]);
      const parsedRead = parseAgentAction(readAnswer);
      assert.ok(parsedRead.action, `Model did not propose a valid read action:\n${readAnswer}`);
      assert.equal(parsedRead.action.type, "read_file");
      assert.equal(path.basename(parsedRead.action.path), "number_guessing_game.py");
      console.log("Real GGUF absolute workspace-path read proposal passed.");
    }
  }
  console.log("Real GGUF Agent Mode proposal + post-approval continuation test passed. No file operation was executed.");
} finally {
  await shutdownLlama();
}
