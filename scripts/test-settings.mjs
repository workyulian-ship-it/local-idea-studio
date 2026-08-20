import assert from "node:assert/strict";
import { getMaxOutputTokens, normalizeGenerationOptions } from "../dist-electron/llama.js";

const configured = normalizeGenerationOptions({
  temperature: 1.25,
  topP: 0.83,
  topK: 27,
  maxTokens: 1536,
  repeatPenalty: 1.2,
  seed: 42,
}, 4096);

assert.deepEqual(configured, {
  temperature: 1.25,
  topP: 0.83,
  topK: 27,
  maxTokens: 1536,
  repeatPenalty: 1.2,
  seed: 42,
});

const bounded = normalizeGenerationOptions({
  temperature: 9,
  topP: -1,
  topK: 500,
  maxTokens: 100000,
  repeatPenalty: 5,
}, 2048);

assert.equal(bounded.temperature, 2);
assert.equal(bounded.topP, 0);
assert.equal(bounded.topK, 100);
assert.equal(bounded.maxTokens, 1792);
assert.equal(bounded.repeatPenalty, 2);
assert.equal(getMaxOutputTokens(1024, 4096), 768);

console.log("Settings engine test passed: sampling values are preserved and token output is model-context bounded.");
