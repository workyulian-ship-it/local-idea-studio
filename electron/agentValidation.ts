import fs from "fs";
import path from "path";

export interface AgentFileAction {
  id?: string;
  type: "create_file" | "write_file" | "append_file" | "create_directory";
  path: string;
  reason: string;
  content?: string;
}

const MAX_TEXT_BYTES = 1024 * 1024;
const ACTIONS = new Set<AgentFileAction["type"]>([
  "create_file",
  "write_file",
  "append_file",
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

export function validateAgentFileAction(workspace: string, raw: unknown) {
  if (!workspace || !fs.existsSync(workspace)) throw new Error("Choose an Agent Mode workspace first.");
  const action = raw as Partial<AgentFileAction> | null;
  if (!action || typeof action !== "object" || !ACTIONS.has(action.type as AgentFileAction["type"])) {
    throw new Error("Unsupported agent action.");
  }
  if (typeof action.path !== "string" || !action.path.trim() || path.isAbsolute(action.path)) {
    throw new Error("Agent file paths must be relative to the selected workspace.");
  }
  if (typeof action.reason !== "string" || action.reason.trim().length < 3) {
    throw new Error("The model must explain why this file operation is needed.");
  }
  if (action.type !== "create_directory") {
    if (typeof action.content !== "string") throw new Error("This file action is missing text content.");
    if (Buffer.byteLength(action.content, "utf8") > MAX_TEXT_BYTES) {
      throw new Error("Agent Mode currently limits each text-file operation to 1 MB.");
    }
  }

  const workspaceReal = fs.realpathSync(workspace);
  const target = path.resolve(workspaceReal, action.path);
  if (!isInside(workspaceReal, target) || target === workspaceReal) {
    throw new Error("The requested path is outside the selected Agent Mode workspace.");
  }

  const existingParent = fs.realpathSync(nearestExistingParent(path.dirname(target)));
  if (!isInside(workspaceReal, existingParent)) {
    throw new Error("The requested path escapes the workspace through a linked folder.");
  }
  if (fs.existsSync(target)) {
    const targetReal = fs.realpathSync(target);
    if (!isInside(workspaceReal, targetReal)) {
      throw new Error("The requested path escapes the workspace through a linked file.");
    }
  }

  return {
    action: action as AgentFileAction,
    workspaceReal,
    target,
    relativePath: path.relative(workspaceReal, target),
  };
}
