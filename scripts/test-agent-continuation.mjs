import assert from "node:assert/strict";
import {
  buildAgentActionFeedback,
  isSameAgentAction,
  parseAgentAction,
} from "../src/lib/agentActions.ts";

const create = {
  id: "first",
  type: "create_file",
  path: "hello.txt",
  reason: "Create the requested greeting file.",
  content: "hello world",
};

const repeated = parseAgentAction(`<agent_action>{"type":"create_file","path":"/hello.txt","reason":"Create it again","content":"hello world"}</agent_action>`).action;
assert.ok(repeated);
assert.equal(isSameAgentAction(create, repeated), true, "leading-slash duplicate must be recognized");
assert.equal(isSameAgentAction(create, { ...repeated, content: "different" }), false, "different content remains a distinct operation");

const success = buildAgentActionFeedback(create, {
  ok: true,
  approved: true,
  message: "Create file completed: hello.txt",
  path: "C:\\workspace\\hello.txt",
});
assert.match(success, /\[LOCAL IDEA AGENT RESULT\]/);
assert.match(success, /Outcome: SUCCESS/);
assert.match(success, /already completed/i);
assert.match(success, /do not propose or repeat/i);
assert.doesNotMatch(success, /C:\\workspace/i, "absolute workspace path must not be sent to the model");

const declined = buildAgentActionFeedback(create, {
  ok: false,
  approved: false,
  message: "Permission declined. No files were changed.",
});
assert.match(declined, /Outcome: DECLINED/);
assert.match(declined, /do not retry or repeat/i);

const failed = buildAgentActionFeedback(create, {
  ok: false,
  approved: false,
  message: "The workspace became unavailable.",
});
assert.match(failed, /Outcome: FAILED/);

console.log("Agent Mode continuation and duplicate-action tests passed.");
