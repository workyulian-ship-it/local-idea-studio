import fs from "fs";
import path from "path";
import { validateAgentFileAction, type AgentFileAction } from "./agentValidation.js";

export interface AgentFileResult {
  ok: boolean;
  approved: boolean;
  message: string;
  path?: string;
  backupPath?: string;
  /** Bounded tool output returned to the model but not expanded in the visible result card. */
  output?: string;
}

export function operationLabel(type: AgentFileAction["type"]) {
  if (type === "list_directory") return "Inspect folder";
  if (type === "read_file") return "Read file";
  if (type === "create_file") return "Create file";
  if (type === "write_file") return "Create or replace file";
  if (type === "append_file") return "Append to file";
  if (type === "replace_in_file") return "Edit exact text in file";
  return "Create folder";
}

const MAX_READ_BYTES = 48 * 1024;
const MAX_DIRECTORY_ENTRIES = 500;

function readTextLines(target: string, startLine: number, endLine: number) {
  const file = fs.readFileSync(target);
  if (file.includes(0)) throw new Error("Agent Mode cannot inspect binary files.");
  const text = file.toString("utf8");
  const lines = text.split(/\r?\n/);
  const selected = lines.slice(startLine - 1, endLine);
  let output = selected.map((line, index) => `${startLine + index}: ${line}`).join("\n");
  let truncated = false;
  if (Buffer.byteLength(output, "utf8") > MAX_READ_BYTES) {
    output = Buffer.from(output, "utf8").subarray(0, MAX_READ_BYTES).toString("utf8");
    truncated = true;
  }
  return { output, totalLines: lines.length, truncated };
}

function listDirectory(target: string) {
  const allEntries = fs.readdirSync(target, { withFileTypes: true });
  const entries = allEntries
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_DIRECTORY_ENTRIES)
    .map((entry) => {
      const kind = entry.isDirectory() ? "directory" : entry.isFile() ? "file" : entry.isSymbolicLink() ? "link" : "other";
      let size = "";
      if (entry.isFile()) {
        try { size = ` (${fs.statSync(path.join(target, entry.name)).size} bytes)`; } catch { /* best effort */ }
      }
      return `[${kind}] ${entry.name}${size}`;
    });
  return { output: entries.join("\n") || "(empty directory)", total: allEntries.length, truncated: allEntries.length > entries.length };
}

/** Execute an already approved operation. The IPC path always shows a native
 * confirmation first, then calls this function, which revalidates everything. */
export function executeApprovedAgentFileAction(workspace: string, raw: unknown): AgentFileResult {
  try {
    // Revalidate after approval to close path/symlink changes made while the
    // native dialog was open.
    const { action, target, relativePath } = validateAgentFileAction(workspace, raw);
    let backupPath: string | undefined;
    if (action.type === "list_directory") {
      const listed = listDirectory(target);
      return {
        ok: true,
        approved: true,
        message: `Folder inspection completed: ${relativePath || "."} (${listed.total} entries${listed.truncated ? ", output truncated" : ""})`,
        path: target,
        output: listed.output,
      };
    }
    if (action.type === "read_file") {
      const read = readTextLines(target, action.startLine ?? 1, action.endLine ?? 400);
      return {
        ok: true,
        approved: true,
        message: `File inspection completed: ${relativePath} (lines ${action.startLine}-${Math.min(action.endLine ?? read.totalLines, read.totalLines)} of ${read.totalLines}${read.truncated ? ", output truncated" : ""})`,
        path: target,
        output: read.output,
      };
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (action.type === "create_directory") {
      fs.mkdirSync(target, { recursive: true });
    } else if (action.type === "create_file") {
      fs.writeFileSync(target, action.content ?? "", { encoding: "utf8", flag: "wx" });
    } else if (action.type === "append_file") {
      fs.appendFileSync(target, action.content ?? "", "utf8");
    } else if (action.type === "replace_in_file") {
      const existing = fs.readFileSync(target);
      if (existing.includes(0)) throw new Error("Agent Mode cannot edit binary files.");
      const current = existing.toString("utf8");
      const oldText = action.oldText ?? "";
      const matches = current.split(oldText).length - 1;
      if (matches !== 1) {
        throw new Error(matches === 0
          ? "The exact text to replace was not found. No files were changed."
          : `The exact text appears ${matches} times. Use a larger unique code block. No files were changed.`);
      }
      backupPath = `${target}.local-idea-backup`;
      fs.copyFileSync(target, backupPath);
      fs.writeFileSync(target, current.replace(oldText, action.newText ?? ""), "utf8");
    } else {
      if (fs.existsSync(target) && fs.statSync(target).isFile()) {
        backupPath = `${target}.local-idea-backup`;
        fs.copyFileSync(target, backupPath);
      }
      fs.writeFileSync(target, action.content ?? "", "utf8");
    }
    return {
      ok: true,
      approved: true,
      message: `${operationLabel(action.type)} completed: ${relativePath}`,
      path: target,
      backupPath,
    };
  } catch (error: any) {
    return { ok: false, approved: true, message: error?.message ?? String(error) };
  }
}
