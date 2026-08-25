import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { User, Bot, Copy, Check, Brain, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { ChatMessage } from "../types";
import { cn } from "../lib/utils";

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
