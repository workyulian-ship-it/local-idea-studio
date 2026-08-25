import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAgentFileAction } from "../dist-electron/agentValidation.js";

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "local-idea-agent-test-"));
try {
  const valid = validateAgentFileAction(workspace, {
    type: "create_file",
    path: "hello.py",
    reason: "Create the requested five-line Hello World script.",
    content: "for _ in range(5):\n    print('Hello World')\n",
  });
  assert.equal(valid.relativePath, "hello.py");
  assert.ok(valid.target.startsWith(fs.realpathSync(workspace)));

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "write_file",
    path: "../escape.txt",
    reason: "Try to escape the workspace.",
    content: "blocked",
  }), /outside/i);

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "write_file",
    path: path.resolve(workspace, "absolute.txt"),
    reason: "Try an absolute path.",
    content: "blocked",
  }), /relative/i);

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "delete_file",
    path: "important.txt",
    reason: "Unsupported destructive operation.",
  }), /unsupported/i);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log("Agent workspace validation passed.");
