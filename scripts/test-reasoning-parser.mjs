import assert from "node:assert/strict";
import {
  ReasoningStreamParser,
  chatWrapperSupportsReasoning,
  splitReasoningFromResponse,
} from "../dist-electron/reasoning.js";

const parser = new ReasoningStreamParser();
const parts = [
  parser.push("<thi"),
  parser.push("nk>check the inputs"),
  parser.push(" carefully</th"),
  parser.push("ink>Here is the answer."),
  parser.flush(),
];
assert.equal(parts.map((part) => part.reasoning).join(""), "check the inputs carefully");
assert.equal(parts.map((part) => part.answer).join(""), "Here is the answer.");

assert.deepEqual(splitReasoningFromResponse("Plain answer"), { answer: "Plain answer", reasoning: "" });
assert.deepEqual(splitReasoningFromResponse("<analysis>work</analysis>result"), { answer: "result", reasoning: "work" });
assert.deepEqual(splitReasoningFromResponse("<THINK>work</THINK>result"), { answer: "result", reasoning: "work" });
assert.deepEqual(splitReasoningFromResponse("<reasoning>work</reasoning>result"), { answer: "result", reasoning: "work" });
assert.deepEqual(splitReasoningFromResponse("</think>result"), { answer: "result", reasoning: "" });
assert.deepEqual(splitReasoningFromResponse("implicit work</think>result"), { answer: "result", reasoning: "implicit work" });

assert.equal(chatWrapperSupportsReasoning({ settings: { segments: { thought: { prefix: "<think>" } } } }), true);
assert.equal(chatWrapperSupportsReasoning({ settings: { segments: {} } }), false);
assert.equal(chatWrapperSupportsReasoning(null), false);

console.log("Reasoning stream parser tests passed.");
