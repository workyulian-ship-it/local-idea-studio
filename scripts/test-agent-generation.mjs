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

let resolveResult;
let rejectResult;
const result = new Promise((resolve, reject) => {
  resolveResult = resolve;
  rejectResult = reject;
});
onLlamaEvent((event) => {
  if (!event || event.conversationId !== "agent-generation") return;
  if (event.type === "done") resolveResult(event.text ?? "");
  if (event.type === "error") rejectResult(new Error(event.error));
});

try {
  const info = await loadModel(modelPath, { settings });
  console.log(`Loaded Agent Mode test on ${info.backend}.`);
  await streamChat({
    conversationId: "agent-generation",
    messages: [{ role: "user", content: "Create hello.py that prints Hello World five times." }],
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
  const answer = await result;
  const match = answer.match(/<agent_action>\s*([\s\S]*?\})\s*(?:<\/agent_action>)?\s*$/i);
  assert.ok(match, `Model did not propose a permission-gated action:\n${answer}`);
  const action = JSON.parse(match[1]);
  assert.equal(action.type, "create_file");
  assert.equal(action.path, "hello.py");
  assert.match(action.reason, /hello|python|script/i);
  assert.match(action.content, /Hello World/);
  console.log("Real GGUF Agent Mode proposal test passed. No file operation was executed.");
} finally {
  await shutdownLlama();
}
