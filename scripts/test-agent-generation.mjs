import assert from "node:assert/strict";
import { loadModel, onLlamaEvent, shutdownLlama, streamChat } from "../dist-electron/llama.js";

const modelPath = process.argv[2];
const backend = process.argv[3] ?? "auto";
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
    },
  }, () => null);
  return result;
}

try {
  const info = await loadModel(modelPath, { settings });
  console.log(`Loaded Agent Mode test on ${info.backend}.`);
  const originalPrompt = "Create hello.py that prints Hello World five times.";
  const answer = await runChat("agent-generation", [{ role: "user", content: originalPrompt }]);
  const match = answer.match(/<agent_action>\s*([\s\S]*?\})\s*(?:<\/agent_action>)?\s*$/i);
  assert.ok(match, `Model did not propose a permission-gated action:\n${answer}`);
  const action = JSON.parse(match[1]);
  assert.equal(action.type, "create_file");
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
  assert.doesNotMatch(continuation, /<agent_action>/i, `Model repeated the completed action:\n${continuation}`);
  assert.match(continuation, /created|complete|done|hello\.py/i, `Model did not finish after the action result:\n${continuation}`);
  console.log("Real GGUF Agent Mode proposal + post-approval continuation test passed. No file operation was executed.");
} finally {
  await shutdownLlama();
}
