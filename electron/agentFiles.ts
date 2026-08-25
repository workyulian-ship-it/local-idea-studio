import { BrowserWindow, dialog } from "electron";
import { validateAgentFileAction } from "./agentValidation.js";
import { executeApprovedAgentFileAction, operationLabel, type AgentFileResult } from "./agentOperations.js";
export { validateAgentFileAction } from "./agentValidation.js";
export type { AgentFileResult } from "./agentOperations.js";

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
    const editPreview = action.type === "replace_in_file"
      ? `\nFind exactly:\n${(action.oldText ?? "").slice(0, 500)}\n\nReplace with:\n${(action.newText ?? "").slice(0, 500)}`
      : "";
    const rangePreview = action.type === "read_file"
      ? `Lines: ${action.startLine}-${action.endLine}`
      : "";
    const detail = [
      `Operation: ${operationLabel(action.type)}`,
      `Workspace path: ${relativePath}`,
      `Reason: ${action.reason.trim()}`,
      rangePreview,
      contentPreview ? `\nText preview:\n${contentPreview}` : "",
      editPreview,
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

    return executeApprovedAgentFileAction(workspace, action);
  } catch (error: any) {
    return { ok: false, approved: false, message: error?.message ?? String(error) };
  }
}
