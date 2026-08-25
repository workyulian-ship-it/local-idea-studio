import fs from "fs";
import path from "path";

export interface AgentFileAction {
  id?: string;
  type: "list_directory" | "read_file" | "create_file" | "write_file" | "append_file" | "replace_in_file" | "create_directory";
  path: string;
  reason: string;
  content?: string;
  oldText?: string;
  newText?: string;
  startLine?: number;
  endLine?: number;
}

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_READ_LINES = 400;
const ACTIONS = new Set<AgentFileAction["type"]>([
  "list_directory",
  "read_file",
  "create_file",
  "write_file",
  "append_file",
  "replace_in_file",
  "create_directory",
]);

function isInside(root: string, target: string) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function nearestExistingParent(target: string) {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function normalizeModelProposedPath(value: string, allowWorkspaceRoot = false) {
  const proposed = value.trim();
  // Models commonly describe a workspace-root file as `/hello.txt`. Treat a
  // leading slash as workspace-relative, but never reinterpret drive-qualified
  // paths or UNC/device paths, which must remain blocked.
  if (/^[a-zA-Z]:[\\/]/.test(proposed) || /^\\\\/.test(proposed)) {
    throw new Error("Agent file paths must be relative to the selected workspace.");
  }
  const relative = proposed.replace(/^[\\/]+/, "");
  if ((!relative || relative === ".") && allowWorkspaceRoot) return ".";
  if (!relative) throw new Error("Agent file paths must name a file or folder inside the workspace.");
  return relative;
}

export function validateAgentFileAction(workspace: string, raw: unknown) {
  if (!workspace || !fs.existsSync(workspace)) throw new Error("Choose an Agent Mode workspace first.");
  const action = raw as Partial<AgentFileAction> | null;
  if (!action || typeof action !== "object" || !ACTIONS.has(action.type as AgentFileAction["type"])) {
    throw new Error("Unsupported agent action.");
  }
  if (typeof action.path !== "string" || !action.path.trim()) {
    throw new Error("Agent file paths must be relative to the selected workspace.");
  }
  const normalizedPath = normalizeModelProposedPath(action.path, action.type === "list_directory");
  if (typeof action.reason !== "string" || action.reason.trim().length < 3) {
    throw new Error("The model must explain why this file operation is needed.");
  }
  if (["create_file", "write_file", "append_file"].includes(action.type as string)) {
    if (typeof action.content !== "string") throw new Error("This file action is missing text content.");
    if (Buffer.byteLength(action.content, "utf8") > MAX_TEXT_BYTES) {
      throw new Error("Agent Mode currently limits each text-file operation to 1 MB.");
    }
  }
  if (action.type === "replace_in_file") {
    if (typeof action.oldText !== "string" || !action.oldText.length) {
      throw new Error("Replace in file requires the exact existing text to find.");
    }
    if (typeof action.newText !== "string") {
      throw new Error("Replace in file requires replacement text.");
    }
    if (Buffer.byteLength(action.oldText, "utf8") + Buffer.byteLength(action.newText, "utf8") > MAX_TEXT_BYTES) {
      throw new Error("Agent Mode currently limits each text-file edit to 1 MB.");
    }
  }
  if (action.type === "read_file") {
    const startLine = action.startLine == null ? 1 : Math.floor(Number(action.startLine));
    const endLine = action.endLine == null ? startLine + MAX_READ_LINES - 1 : Math.floor(Number(action.endLine));
    if (!Number.isFinite(startLine) || !Number.isFinite(endLine) || startLine < 1 || endLine < startLine) {
      throw new Error("Read-file line numbers must be a valid positive range.");
    }
    if (endLine - startLine + 1 > MAX_READ_LINES) {
      throw new Error(`Agent Mode can read at most ${MAX_READ_LINES} lines per operation.`);
    }
    action.startLine = startLine;
    action.endLine = endLine;
  }

  const workspaceReal = fs.realpathSync(workspace);
  const target = path.resolve(workspaceReal, normalizedPath);
  if (!isInside(workspaceReal, target) || (target === workspaceReal && action.type !== "list_directory")) {
    throw new Error("The requested path is outside the selected Agent Mode workspace.");
  }

  const existingParent = target === workspaceReal
    ? workspaceReal
    : fs.realpathSync(nearestExistingParent(path.dirname(target)));
  if (!isInside(workspaceReal, existingParent)) {
    throw new Error("The requested path escapes the workspace through a linked folder.");
  }
  if (fs.existsSync(target)) {
    const targetReal = fs.realpathSync(target);
    if (!isInside(workspaceReal, targetReal)) {
      throw new Error("The requested path escapes the workspace through a linked file.");
    }
  }

  if (["read_file", "replace_in_file"].includes(action.type as string)) {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error("The requested workspace file does not exist or is not a regular file.");
    }
  }
  if (action.type === "list_directory" && (!fs.existsSync(target) || !fs.statSync(target).isDirectory())) {
    throw new Error("The requested workspace directory does not exist.");
  }

  return {
    action: { ...action, path: normalizedPath } as AgentFileAction,
    workspaceReal,
    target,
    relativePath: path.relative(workspaceReal, target),
  };
}
