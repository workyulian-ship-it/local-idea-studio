import assert from "node:assert/strict";
import { buildModeSystemInstruction, resolveThinkingPlan } from "../dist-electron/llama.js";

const minimal = resolveThinkingPlan("minimal", 384);
const standard = resolveThinkingPlan("standard", 384);
const max = resolveThinkingPlan("max", 384);

assert.equal(minimal.thoughtTokens, 0);
assert.equal(minimal.finalAnswerTokens, 384);
assert.ok(standard.thoughtTokens > 0);
assert.ok(max.thoughtTokens > standard.thoughtTokens);
assert.equal(standard.thoughtTokens + standard.finalAnswerTokens, 384);
assert.equal(max.thoughtTokens + max.finalAnswerTokens, 384);
assert.ok(max.finalAnswerTokens >= 32);

const normalInstruction = buildModeSystemInstruction("standard", false);
assert.doesNotMatch(normalInstruction, /agent_action/);
const agentInstruction = buildModeSystemInstruction("max", true);
assert.match(agentInstruction, /<agent_action>/);
assert.match(agentInstruction, /relative paths/i);
assert.match(agentInstruction, /list_directory/);
assert.match(agentInstruction, /read_file/);
assert.match(agentInstruction, /replace_in_file/);
assert.match(agentInstruction, /Shell commands.*unavailable/i);
const workspaceInstruction = buildModeSystemInstruction("standard", true, "D:\\ai test");
assert.match(workspaceInstruction, /D:\\\\ai test/);
assert.match(workspaceInstruction, /absolute path under this exact root/i);
assert.match(workspaceInstruction, /corresponding relative action path/i);

console.log("Thinking plans and Agent Mode system protocol passed.");
