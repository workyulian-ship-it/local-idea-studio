import type { AgentActionRequest } from "../types";

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
        path: raw.path.trim(),
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
