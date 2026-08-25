import fs from "fs";
import path from "path";
import { BrowserWindow, dialog } from "electron";
import { validateAgentFileAction, type AgentFileAction } from "./agentValidation.js";
export { validateAgentFileAction } from "./agentValidation.js";

export interface AgentFileResult {
  ok: boolean;
  approved: boolean;
  message: string;
  path?: string;
  backupPath?: string;
}

function operationLabel(type: AgentFileAction["type"]) {
  if (type === "create_file") return "Create file";
  if (type === "write_file") return "Create or replace file";
  if (type === "append_file") return "Append to file";
  return "Create folder";
}

export async function executeAgentFileAction(
  parent: BrowserWindow | null,
  workspace: string,
  raw: unknown,
): Promise<AgentFileResult> {
  try {
    const { action, target, relativePath } = validateAgentFileAction(workspace, raw);
    const contentPreview = action.content
      ? action.content.slice(0, 700) + (action.content.length > 700 ? "\n…" : "")
      : "";
    const detail = [
      `Operation: ${operationLabel(action.type)}`,
      `Workspace path: ${relativePath}`,
      `Reason: ${action.reason.trim()}`,
      contentPreview ? `\nText preview:\n${contentPreview}` : "",
    ].filter(Boolean).join("\n");
    const options = {
      type: "warning" as const,
      title: "Local Idea Studio — Agent permission",
      message: "Allow this file operation once?",
      detail,
      buttons: ["Allow once", "Decline"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const response = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response.response !== 0) {
      return { ok: false, approved: false, message: "Permission declined. No files were changed." };
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    let backupPath: string | undefined;
    if (action.type === "create_directory") {
      fs.mkdirSync(target, { recursive: true });
    } else if (action.type === "create_file") {
      fs.writeFileSync(target, action.content ?? "", { encoding: "utf8", flag: "wx" });
    } else if (action.type === "append_file") {
      fs.appendFileSync(target, action.content ?? "", "utf8");
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
    return { ok: false, approved: false, message: error?.message ?? String(error) };
  }
}
