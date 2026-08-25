import { useEffect, useRef, useState } from "react";
import { Send, Square, Settings2, ShieldCheck } from "lucide-react";
import { useSettings } from "../store/settings";
import { useModels } from "../store/models";
import { useChats } from "../store/chats";
import { useUi } from "../store/ui";
import { cn } from "../lib/utils";
import { getEffectiveModelSettings } from "../lib/modelSettings";
import { isSameAgentAction, parseAgentAction } from "../lib/agentActions";

interface Props {
  disabled?: boolean;
}

export function ChatInput({ disabled }: Props) {
  const { settings, update: updateSettings } = useSettings();
  const { loaded } = useModels();
  const { current, streaming, streamStats, append, setStreaming, resetStream, update: updateChat } = useChats();
  const { pushToast } = useUi();
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const effectiveSettings = settings ? getEffectiveModelSettings(settings, loaded) : null;

  useEffect(() => {
    const onToken = (e: any) => {
      if (!e) return;
      const chatState = useChats.getState();
      if (e.conversationId && e.conversationId !== chatState.current?.id) return;
      if (e.type === "token") {
        chatState.setStreamText((currentText) => currentText + e.text);
      } else if (e.type === "reasoning") {
        chatState.setStreamReasoning((currentText) => currentText + e.text);
        const modelState = useModels.getState();
        if (modelState.loaded && (!modelState.loaded.reasoningSupported || modelState.loaded.reasoningSource === "none")) {
          modelState.setLoaded({
            ...modelState.loaded,
            reasoningSupported: true,
            reasoningSource: e.source === "chat-template" ? "chat-template" : "runtime-output",
          });
        }
      } else if (e.type === "reasoning-capability") {
        const modelState = useModels.getState();
        if (modelState.loaded) {
          modelState.setLoaded({
            ...modelState.loaded,
            reasoningSupported: Boolean(e.supported),
            reasoningSource: e.source ?? "runtime-output",
          });
        }
      } else if (e.type === "done") {
        void finalize(e.text || chatState.streamText, e.reasoning || chatState.streamReasoning, e.aborted);
      } else if (e.type === "error") {
        pushToast({ kind: "error", text: e.error ?? "Inference error" });
        chatState.setStreaming(false);
        chatState.resetStream();
      }
    };
    const onStats = (e: any) => {
      const chatState = useChats.getState();
      if (e.conversationId && e.conversationId !== chatState.current?.id) return;
      chatState.setStreamStats({ tps: e.tps, tokens: e.tokens, elapsed: e.elapsed });
    };
    const offTok = window.lumen.onChatToken(onToken);
    const offStat = window.lumen.onChatStats(onStats);
    return () => {
      offTok();
      offStat();
    };
  }, [pushToast]);

  // Finalize is called when stream done
  const finalize = async (text: string, reasoning?: string, aborted?: boolean) => {
    const chatState = useChats.getState();
    if (!chatState.current) return;
    const currentSettings = useSettings.getState().settings;
    const parsedAction = currentSettings?.agentMode ? parseAgentAction(text) : { visibleText: text };
    let action = parsedAction.action;
    const isAgentContinuation = chatState.current.messages.at(-1)?.agentActionFeedback === true;
    const repeatedTerminalAction = Boolean(isAgentContinuation && action && chatState.current.messages.some((message) =>
      ["completed", "declined", "failed"].includes(message.agentActionStatus ?? "")
      && message.agentAction
      && isSameAgentAction(message.agentAction, action!),
    ));
    if (repeatedTerminalAction) action = undefined;
    const cleanText = parsedAction.visibleText;
    const visibleText = cleanText.trim()
      ? cleanText
      : repeatedTerminalAction
        ? "The previous file operation already reached a final result. No duplicate operation was run."
      : action
        ? `Agent Mode proposes: **${action.reason}**`
      : reasoning?.trim()
        ? "_(The model did not produce a final answer after automatic recovery. Try Standard or Minimal thinking, or increase Max response tokens.)_"
        : "_(The model returned an empty response.)_";
    const assistantMsg = {
      id: Math.random().toString(36).slice(2),
      role: "assistant" as const,
      content: aborted ? visibleText + "\n\n_(stopped)_" : visibleText,
      reasoning: reasoning?.trim() || undefined,
      stats: chatState.streamStats ?? undefined,
      createdAt: Date.now(),
      agentAction: action,
      agentActionStatus: action ? "pending" as const : undefined,
      agentActionResult: parsedAction.error
        ? `Invalid Agent Mode request: ${parsedAction.error}. No files were changed.`
        : undefined,
    };
    await chatState.append(assistantMsg);
    chatState.setStreaming(false);
    chatState.resetStream();
    setText("");
  };

  const submit = async () => {
    if (!text.trim()) return;
    if (!loaded) {
      pushToast({ kind: "error", text: "Load a model first (Models tab)" });
      return;
    }
    let chat = current;
    if (!chat) {
      chat = await useChats.getState().create(text.slice(0, 60));
    }
    const userMsg = {
      id: Math.random().toString(36).slice(2),
      role: "user" as const,
      content: text.trim(),
      createdAt: Date.now(),
    };
    await append(userMsg);
    // Auto title
    if (chat.messages.length === 0) {
      await updateChat({ title: text.slice(0, 60) });
    }
    setText("");
    setStreaming(true);
    resetStream();

    const messages = [
      ...(effectiveSettings?.systemPrompt
        ? [{ role: "system" as const, content: effectiveSettings.systemPrompt, id: "sys", createdAt: Date.now() }]
        : []),
      ...chat.messages,
      userMsg,
    ];

    try {
      await window.lumen.chat({
        conversationId: chat.id,
        messages,
        opts: {
          temperature: effectiveSettings?.temperature,
          topP: effectiveSettings?.topP,
          topK: effectiveSettings?.topK,
          maxTokens: effectiveSettings?.maxTokens,
          repeatPenalty: effectiveSettings?.repeatPenalty,
          seed: effectiveSettings?.seed ?? undefined,
          systemPrompt: effectiveSettings?.systemPrompt,
          thinkingMode: settings?.thinkingMode,
          agentMode: settings?.agentMode,
        },
      });
    } catch (e: any) {
      pushToast({ kind: "error", text: e?.message ?? String(e) });
      setStreaming(false);
      resetStream();
    }
  };

  const stop = async () => {
    if (!current) return;
    await window.lumen.abortChat(current.id);
  };

  const adjustHeight = () => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(200, taRef.current.scrollHeight) + "px";
  };

  return (
    <div className="border-t border-border bg-bg-panel/60 backdrop-blur p-4">
      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            "flex items-end gap-2 bg-bg-elev border rounded-xl p-2 transition-shadow",
            "border-border focus-within:border-accent/60 focus-within:shadow-glow"
          )}
        >
          <button
            className="btn-icon mb-0.5"
            title="Settings"
            onClick={() => useUi.getState().setView("settings")}
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!streaming) submit();
              }
            }}
            disabled={disabled}
            rows={1}
            placeholder={
              !loaded
                ? "Load a model from the Models tab to start chatting…"
                : streaming
                ? "Generating…"
                : "Send a message…  (Enter to send, Shift+Enter for newline)"
            }
            className="flex-1 resize-none bg-transparent outline-none text-sm px-2 py-2 max-h-[200px] text-text placeholder-text-dim"
          />
          {streaming ? (
            <button onClick={stop} className="btn-primary bg-danger hover:bg-danger/80">
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim() || disabled}
              className="btn-primary"
            >
              <Send className="w-3.5 h-3.5" />
              Send
            </button>
          )}
        </div>
        <div className="mt-1.5 px-1 text-[10px] text-text-dim flex items-center gap-3 flex-wrap">
          {!loaded ? (
            <span>No model loaded</span>
          ) : (
            <>
              <span>temp {effectiveSettings?.temperature?.toFixed(2)}</span>
              <span>top-p {effectiveSettings?.topP?.toFixed(2)}</span>
              <span>top-k {effectiveSettings?.topK}</span>
              <span>max {effectiveSettings?.maxTokens}</span>
              <label className="inline-flex items-center gap-1">
                <span>think</span>
                <select
                  aria-label="Thinking mode"
                  value={settings?.thinkingMode ?? "standard"}
                  onChange={(event) => void updateSettings({
                    thinkingMode: event.target.value as "minimal" | "standard" | "max",
                  })}
                  disabled={streaming}
                  className="bg-bg-elev border border-border rounded px-1 py-0.5 text-text outline-none"
                >
                  <option value="minimal">minimal</option>
                  <option value="standard">standard</option>
                  <option value="max">max</option>
                </select>
              </label>
              {settings?.agentMode && (
                <span className="inline-flex items-center gap-1 text-success">
                  <ShieldCheck className="w-3 h-3" /> agent · permission required
                </span>
              )}
              {settings?.showTokensPerSecond && streaming && streamStats && (
                <span className="text-accent">
                  {streamStats.tps.toFixed(1)} tok/s · {streamStats.tokens} tokens · {streamStats.elapsed.toFixed(1)}s
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
