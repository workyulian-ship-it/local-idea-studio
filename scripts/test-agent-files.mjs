import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateAgentFileAction } from "../dist-electron/agentValidation.js";
import { executeApprovedAgentFileAction } from "../dist-electron/agentOperations.js";

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

  const leadingSlash = validateAgentFileAction(workspace, {
    type: "create_file",
    path: "/hello.txt",
    reason: "Create the requested greeting in the workspace root.",
    content: "Hello world\n",
  });
  assert.equal(leadingSlash.relativePath, "hello.txt");
  assert.equal(leadingSlash.action.path, "hello.txt");

  fs.mkdirSync(path.join(workspace, "src"));
  fs.writeFileSync(path.join(workspace, "src", "hello.ts"), "export const greeting = 'hello';\nconsole.log(greeting);\n", "utf8");

  const rootList = executeApprovedAgentFileAction(workspace, {
    type: "list_directory",
    path: ".",
    reason: "Inspect the project files before editing code.",
  });
  assert.equal(rootList.ok, true);
  assert.match(rootList.output ?? "", /\[directory\] src/);

  const read = executeApprovedAgentFileAction(workspace, {
    type: "read_file",
    path: "src/hello.ts",
    reason: "Read the requested source file before editing it.",
    startLine: 1,
    endLine: 2,
  });
  assert.equal(read.ok, true);
  assert.match(read.output ?? "", /1: export const greeting/);

  const edit = executeApprovedAgentFileAction(workspace, {
    type: "replace_in_file",
    path: "src/hello.ts",
    reason: "Update the greeting exactly as requested.",
    oldText: "export const greeting = 'hello';",
    newText: "export const greeting = 'hello world';",
  });
  assert.equal(edit.ok, true);
  assert.equal(fs.readFileSync(path.join(workspace, "src", "hello.ts"), "utf8"), "export const greeting = 'hello world';\nconsole.log(greeting);\n");
  assert.equal(fs.readFileSync(path.join(workspace, "src", "hello.ts.local-idea-backup"), "utf8"), "export const greeting = 'hello';\nconsole.log(greeting);\n");

  const ambiguousEdit = executeApprovedAgentFileAction(workspace, {
    type: "replace_in_file",
    path: "src/hello.ts",
    reason: "Attempt an ambiguous edit that must be blocked.",
    oldText: "greeting",
    newText: "message",
  });
  assert.equal(ambiguousEdit.ok, false);
  assert.match(ambiguousEdit.message, /appears 2 times/i);

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "write_file",
    path: "../escape.txt",
    reason: "Try to escape the workspace.",
    content: "blocked",
  }), /outside/i);

  const absoluteInside = validateAgentFileAction(workspace, {
    type: "read_file",
    path: path.resolve(workspace, "src", "hello.ts"),
    reason: "Read the exact absolute path supplied by the user.",
  });
  assert.equal(absoluteInside.relativePath, path.join("src", "hello.ts"));
  assert.equal(absoluteInside.action.path, path.join("src", "hello.ts"));

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "write_file",
    path: "C:\\Windows\\system.ini",
    reason: "Try a drive-qualified path.",
    content: "blocked",
  }), /outside/i);

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "delete_file",
    path: "important.txt",
    reason: "Unsupported destructive operation.",
  }), /unsupported/i);

  assert.throws(() => validateAgentFileAction(workspace, {
    type: "read_file",
    path: "src/hello.ts",
    reason: "Try to read too much in one operation.",
    startLine: 1,
    endLine: 401,
  }), /at most 400 lines/i);
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log("Agent workspace validation passed.");
