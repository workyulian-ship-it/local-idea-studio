import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { User, Bot, Copy, Check } from "lucide-react";
import { useState } from "react";
import type { ChatMessage } from "../types";
import { cn } from "../lib/utils";

export function Message({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
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
            {isUser ? "You" : "Lumen"}
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
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
              >
                {message.content || (isStreaming ? "…" : "")}
              </ReactMarkdown>
              {isStreaming && <span className="inline-block w-1.5 h-3.5 bg-accent ml-0.5 animate-pulse" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
