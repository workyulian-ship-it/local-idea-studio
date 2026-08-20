import { useEffect, useRef } from "react";
import { Plus, Trash2, MessageSquare, Sparkles, Settings2, Download, Cpu } from "lucide-react";
import { useChats } from "../store/chats";
import { useModels } from "../store/models";
import { useUi } from "../store/ui";
import { Message } from "./Message";
import { ChatInput } from "./ChatInput";
import { cn, timeAgo, formatBytes } from "../lib/utils";

export function ChatView() {
  const { chats, current, currentId, create, select, remove, streaming, streamText } = useChats();
  const { loaded, local } = useModels();
  const { setView, pushToast } = useUi();
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalSizeBytes = local.reduce((sum, m) => sum + (m.sizeBytes || 0), 0);

  useEffect(() => {
    // Auto-scroll on new content
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [current?.messages?.length, streamText]);

  const startNew = async () => {
    await create("New chat");
  };

  if (!current || !currentId) {
    return (
      <div className="flex-1 flex flex-col bg-bg min-h-0 overflow-y-auto">
        <div className="flex-1 flex items-center justify-center px-6 py-8">
          <div className="max-w-2xl w-full text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-accent/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-3xl font-semibold mb-2">Welcome to Lumen Studio</h1>
            <p className="text-text-muted text-sm mb-6">
              Run large language models locally on your AMD Radeon GPU. Everything stays on your machine.
            </p>

            {local.length === 0 ? (
              <div className="panel p-5 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <Download className="w-4 h-4 text-accent" />
                  <h2 className="font-semibold">Get your first model</h2>
                </div>
                <p className="text-xs text-text-muted mb-3">
                  Browse and download GGUF models directly from Hugging Face — they save to your local Lumen Studio models folder.
                </p>
                <button onClick={() => setView("library")} className="btn-primary">
                  Open Model Library
                </button>
              </div>
            ) : !loaded ? (
              <div className="panel p-5 text-left">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-accent" />
                    <h2 className="font-semibold">Load a model to start</h2>
                  </div>
                  <span className="text-xs text-text-dim font-mono">
                    {local.length} model{local.length === 1 ? "" : "s"} · {formatBytes(totalSizeBytes)}
                  </span>
                </div>
                <p className="text-xs text-text-muted mb-3">
                  You have {local.length} model{local.length === 1 ? "" : "s"} ({formatBytes(totalSizeBytes)}) downloaded. Pick one to load into memory.
                </p>
                <select
                  className="input truncate max-w-full"
                  onChange={async (e) => {
                    if (!e.target.value) return;
                    try {
                      await useModels.getState().load(e.target.value);
                      pushToast({ kind: "success", text: "Model loaded" });
                    } catch (err: any) {
                      pushToast({ kind: "error", text: err?.message ?? String(err) });
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select a model…</option>
                  {local.map((m) => (
                    <option key={m.id} value={m.path}>
                      {m.filename} ({m.quantization ?? m.format}) · {formatBytes(m.sizeBytes)}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="panel p-5 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-accent" />
                  <h2 className="font-semibold">Start a conversation</h2>
                </div>
                <p className="text-xs text-text-muted mb-3">
                  <b className="text-text">{loaded.modelId}</b> is loaded · {loaded.backend} · context {loaded.contextSize}
                </p>
                <button onClick={startNew} className="btn-primary">
                  <Plus className="w-3.5 h-3.5" />
                  New chat
                </button>
              </div>
            )}

            <div className="mt-6 grid grid-cols-3 gap-2 text-xs">
              {[
                { label: "Private", desc: "100% on-device" },
                { label: "GPU accelerated", desc: "CUDA + Vulkan" },
                { label: "Hugging Face", desc: "GGUF downloads" },
              ].map((c) => (
                <div key={c.label} className="panel p-3">
                  <div className="font-semibold text-text">{c.label}</div>
                  <div className="text-text-dim">{c.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-bg min-w-0 min-h-0 overflow-hidden">
      <div className="h-12 border-b border-border flex items-center px-4 gap-3 bg-bg-panel/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MessageSquare className="w-4 h-4 text-text-muted shrink-0" />
          <div className="text-sm font-medium truncate">{current.title || "New chat"}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {loaded ? (
            <span className="chip bg-accent-muted text-accent max-w-[220px] truncate" title={loaded.modelId}>
              <Cpu className="w-3 h-3 shrink-0 inline" /> <span className="truncate">{loaded.modelId}</span>
            </span>
          ) : (
            <span className="chip bg-warning/20 text-warning shrink-0">no model</span>
          )}
          <button onClick={() => setView("settings")} className="btn-icon shrink-0" title="Settings">
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Chat history sidebar */}
        <div className="hidden md:flex w-56 shrink-0 border-r border-border bg-bg-panel/30 flex-col min-h-0">
          <div className="p-2 border-b border-border shrink-0">
            <button onClick={startNew} className="btn-secondary w-full text-xs">
              <Plus className="w-3.5 h-3.5" /> New chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 min-h-0">
            {chats.length === 0 ? (
              <div className="text-xs text-text-dim px-2 py-3 text-center">No conversations yet</div>
            ) : (
              chats.map((c) => (
                <div
                  key={c.id}
                  onClick={() => select(c.id)}
                  className={cn(
                    "group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors overflow-hidden",
                    c.id === currentId ? "bg-accent-muted text-accent" : "hover:bg-bg-hover text-text-muted"
                  )}
                >
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="truncate font-medium">{c.title || "Untitled"}</div>
                    <div className="text-[10px] text-text-dim">{timeAgo(c.updatedAt)}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Delete this chat?")) remove(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 btn-icon p-1 shrink-0"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main chat */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
            {current.messages.length === 0 && !streaming ? (
              <div className="h-full flex items-center justify-center px-6 py-12">
                <div className="text-center max-w-md">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-accent/15 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-accent" />
                  </div>
                  <h2 className="text-lg font-semibold mb-1">Start the conversation</h2>
                  <p className="text-sm text-text-muted">Type a message below to begin.</p>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto py-2">
                {current.messages.map((m) => (
                  <Message key={m.id} message={m} />
                ))}
                {streaming && streamText && (
                  <Message
                    message={{
                      id: "streaming",
                      role: "assistant",
                      content: streamText,
                      createdAt: Date.now(),
                    }}
                    isStreaming
                  />
                )}
              </div>
            )}
          </div>
          <ChatInput />
        </div>
      </div>
    </div>
  );
}
