import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { User, Bot, Copy, Check, Brain, ChevronDown, FileCode2, ShieldCheck, X, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ChatMessage } from "../types";
import { cn } from "../lib/utils";
import { useChats } from "../store/chats";
import { useUi } from "../store/ui";
import { agentOperationLabel } from "../lib/agentActions";
import { continueAfterAgentAction } from "../lib/agentContinuation";

export function Message({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(Boolean(isStreaming));
  useEffect(() => {
    if (isStreaming) setReasoningOpen(true);
  }, [isStreaming]);
  return (
    <div className={cn("flex gap-3 px-4 py-4 animate-fade-in", isUser ? "bg-transparent" : "bg-bg-elev/30")}>
      <div
        className={cn(
          "shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-white",
          isUser ? "bg-bg-active" : "bg-accent/30"
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4 text-accent" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-text">
            {isUser ? "You" : "Local Idea"}
          </span>
          <span className="text-[10px] text-text-dim">
            {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {!isUser && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(message.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="ml-auto btn-ghost text-text-dim"
              title="Copy"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <div className="prose-md break-words">
          {isUser ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : (
            <>
              {message.reasoning && (
                <div className="mb-3 rounded-lg border border-accent/20 bg-accent/5 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setReasoningOpen((value) => !value)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-text-muted hover:bg-accent/10"
                  >
                    <Brain className="w-3.5 h-3.5 text-accent" />
                    <span className="font-medium text-text">
                      {isStreaming ? "Model reasoning — live" : "Model reasoning (model output)"}
                    </span>
                    {isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                    {message.reasoning && (
                      <ChevronDown className={cn("ml-auto w-3.5 h-3.5 transition-transform", reasoningOpen && "rotate-180")} />
                    )}
                  </button>
                  {reasoningOpen && message.reasoning && (
                    <div className="reasoning-content border-t border-accent/15 px-3 py-2 text-sm text-text-muted max-h-72 overflow-y-auto">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {message.reasoning}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {message.content || (isStreaming ? "…" : "")}
              </ReactMarkdown>
              {message.agentAction && <AgentActionCard message={message} />}
              {!message.agentAction && message.agentActionResult && (
                <div className="mt-3 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                  {message.agentActionResult}
                </div>
              )}
              {isStreaming && <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse" />}
              {!isStreaming && message.stats && (
                <div className="mt-3 text-[10px] text-text-dim font-mono">
                  {message.stats.tps.toFixed(1)} tok/s · {message.stats.tokens} tokens · {message.stats.elapsed.toFixed(1)}s
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentActionCard({ message }: { message: ChatMessage }) {
  const action = message.agentAction!;
  const status = message.agentActionStatus ?? "pending";
  const updateMessage = useChats((state) => state.updateMessage);
  const pushToast = useUi((state) => state.pushToast);

  const allow = async () => {
    const conversationId = useChats.getState().current?.id;
    await updateMessage(message.id, { agentActionStatus: "running", agentActionResult: undefined });
    try {
      // The main process performs validation again and shows the real native
      // Allow-once dialog. No renderer decision can bypass that confirmation.
      const result = await window.lumen.executeAgentAction(action);
      const nextStatus = result.ok
        ? "completed" as const
        : result.approved
          ? "failed" as const
          : result.message.toLowerCase().includes("declined")
            ? "declined" as const
            : "failed" as const;
      await updateMessage(message.id, {
        agentActionStatus: nextStatus,
        agentActionResult: [result.message, result.backupPath ? `Backup: ${result.backupPath}` : ""]
          .filter(Boolean)
          .join("\n"),
      });
      pushToast({ kind: result.ok ? "success" : "info", text: result.message });
      if (conversationId) {
        await continueAfterAgentAction(conversationId, action, result);
      }
    } catch (error: any) {
      const result = error?.message ?? String(error);
      await updateMessage(message.id, { agentActionStatus: "failed", agentActionResult: result });
      pushToast({ kind: "error", text: result });
      if (conversationId) {
        await continueAfterAgentAction(conversationId, action, {
          ok: false,
          approved: false,
          message: result,
        });
      }
    }
  };

  const decline = async () => {
    const conversationId = useChats.getState().current?.id;
    const result = { ok: false, approved: false, message: "Permission declined. No files were changed." };
    await updateMessage(message.id, {
      agentActionStatus: "declined",
      agentActionResult: result.message,
    });
    if (conversationId) {
      await continueAfterAgentAction(conversationId, action, result);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accent/20">
        <ShieldCheck className="w-4 h-4 text-accent" />
        <span className="text-xs font-semibold">Agent Mode permission</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-text-dim">{status}</span>
      </div>
      <div className="p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <FileCode2 className="w-4 h-4 text-text-muted mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium">{agentOperationLabel(action.type)}</div>
            <code className="text-[11px] text-accent break-all">{action.path}</code>
          </div>
        </div>
        <div className="text-text-muted"><span className="text-text">Reason:</span> {action.reason}</div>
        {status === "pending" && (
          <div className="flex items-center gap-2 pt-1">
            <button onClick={() => void allow()} className="btn-primary text-xs">
              <ShieldCheck className="w-3.5 h-3.5" /> Review & allow once
            </button>
            <button onClick={() => void decline()} className="btn-secondary text-xs">
              <X className="w-3.5 h-3.5" /> Decline
            </button>
          </div>
        )}
        {status === "running" && (
          <div className="inline-flex items-center gap-2 text-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for native permission…
          </div>
        )}
        {message.agentActionResult && (
          <div className={cn(
            "whitespace-pre-wrap rounded border px-2 py-1.5",
            status === "completed" ? "border-success/30 bg-success/5 text-success" : "border-border bg-bg-elev text-text-muted",
          )}>
            {message.agentActionResult}
          </div>
        )}
      </div>
    </div>
  );
}
