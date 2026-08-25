import type { AgentActionRequest, AgentActionResult } from "../types";

const ACTION_TYPES = new Set<AgentActionRequest["type"]>([
  "create_file",
  "write_file",
  "append_file",
  "create_directory",
]);

function extractAgentPayload(text: string) {
  const openMatch = /<agent_action>/i.exec(text);
  if (!openMatch) return null;
  const jsonStart = text.indexOf("{", openMatch.index + openMatch[0].length);
  if (jsonStart === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        const closeMatch = /^\s*<\/agent_action>/i.exec(text.slice(index + 1));
        return {
          json: text.slice(jsonStart, index + 1),
          start: openMatch.index,
          end: index + 1 + (closeMatch?.[0].length ?? 0),
        };
      }
    }
  }
  return null;
}

export function parseAgentAction(text: string): {
  visibleText: string;
  action?: AgentActionRequest;
  error?: string;
} {
  const match = extractAgentPayload(text);
  if (!match) return { visibleText: text };

  const visibleText = `${text.slice(0, match.start)}${text.slice(match.end)}`.trim();
  try {
    const raw = JSON.parse(match.json) as Partial<AgentActionRequest>;
    if (!ACTION_TYPES.has(raw.type as AgentActionRequest["type"])) {
      throw new Error("unsupported operation");
    }
    if (typeof raw.path !== "string" || !raw.path.trim()) {
      throw new Error("missing relative path");
    }
    const proposedPath = raw.path.trim();
    const displayPath = /^[a-zA-Z]:[\\/]/.test(proposedPath) || /^\\\\/.test(proposedPath)
      ? proposedPath
      : proposedPath.replace(/^[\\/]+/, "");
    if (!displayPath) throw new Error("missing relative path");
    if (typeof raw.reason !== "string" || raw.reason.trim().length < 3) {
      throw new Error("missing permission reason");
    }
    if (raw.type !== "create_directory" && typeof raw.content !== "string") {
      throw new Error("missing file content");
    }

    return {
      visibleText,
      action: {
        id: typeof raw.id === "string" && raw.id.trim()
          ? raw.id.trim()
          : `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: raw.type as AgentActionRequest["type"],
        path: displayPath,
        reason: raw.reason.trim(),
        ...(raw.type === "create_directory" ? {} : { content: raw.content }),
      },
    };
  } catch (error: any) {
    return {
      visibleText: visibleText || "The model returned an invalid Agent Mode request. No files were changed.",
      error: error?.message ?? String(error),
    };
  }
}

export function agentOperationLabel(type: AgentActionRequest["type"]) {
  if (type === "create_file") return "Create file";
  if (type === "write_file") return "Create or replace file";
  if (type === "append_file") return "Append to file";
  return "Create folder";
}

function normalizedActionPath(value: string) {
  return value.trim().replace(/^[\\/]+/, "").replace(/\\/g, "/").toLowerCase();
}

export function isSameAgentAction(left: AgentActionRequest, right: AgentActionRequest) {
  return left.type === right.type
    && normalizedActionPath(left.path) === normalizedActionPath(right.path)
    && (left.type === "create_directory" || (left.content ?? "") === (right.content ?? ""));
}

export function buildAgentActionFeedback(
  action: AgentActionRequest,
  result: AgentActionResult,
) {
  const outcome = result.ok
    ? "SUCCESS"
    : !result.approved && result.message.toLowerCase().includes("declined")
      ? "DECLINED"
      : "FAILED";
  return [
    "[LOCAL IDEA AGENT RESULT]",
    `Outcome: ${outcome}`,
    `Operation: ${agentOperationLabel(action.type)}`,
    `Workspace-relative path: ${action.path.replace(/^[\\/]+/, "")}`,
    `Result: ${result.message}`,
    result.backupPath ? "A backup was created by the application." : "",
    result.ok
      ? "The application already completed this exact operation after user approval. Continue the original request, briefly confirm the completed result, and do not propose or repeat this same action. You may propose a different next action only if the original request truly requires another operation."
      : "The application did not complete this operation. Explain the result briefly and do not retry or repeat the action unless the user explicitly asks you to try again.",
  ].filter(Boolean).join("\n");
}
