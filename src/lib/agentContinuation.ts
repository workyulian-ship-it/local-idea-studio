import type { AgentActionRequest, AgentActionResult, ChatMessage } from "../types";
import { useChats } from "../store/chats";
import { useModels } from "../store/models";
import { useSettings } from "../store/settings";
import { useUi } from "../store/ui";
import { getEffectiveModelSettings } from "./modelSettings";
import { buildAgentActionFeedback } from "./agentActions";

export async function continueAfterAgentAction(
  conversationId: string,
  action: AgentActionRequest,
  result: AgentActionResult,
) {
  const chatState = useChats.getState();
  const chat = chatState.current;
  if (!chat || chat.id !== conversationId) return;

  const feedback: ChatMessage = {
    id: `agent-result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content: buildAgentActionFeedback(action, result),
    createdAt: Date.now(),
    agentActionFeedback: true,
  };
  await chatState.append(feedback);

  const loaded = useModels.getState().loaded;
  const settings = useSettings.getState().settings;
  const updatedChat = useChats.getState().current;
  if (!loaded || !settings || !updatedChat || updatedChat.id !== conversationId) {
    useUi.getState().pushToast({
      kind: "info",
      text: "The action result was saved. Load the model to continue the response.",
    });
    return;
  }
  if (useChats.getState().streaming) return;

  const effective = getEffectiveModelSettings(settings, loaded);
  useChats.getState().setStreaming(true);
  useChats.getState().resetStream();
  try {
    await window.lumen.chat({
      conversationId,
      messages: [
        ...(effective.systemPrompt
          ? [{ role: "system" as const, content: effective.systemPrompt, id: "sys", createdAt: Date.now() }]
          : []),
        ...updatedChat.messages,
      ],
      opts: {
        temperature: effective.temperature,
        topP: effective.topP,
        topK: effective.topK,
        maxTokens: effective.maxTokens,
        repeatPenalty: effective.repeatPenalty,
        seed: effective.seed ?? undefined,
        systemPrompt: effective.systemPrompt,
        thinkingMode: settings.thinkingMode,
        agentMode: settings.agentMode,
        agentWorkspace: settings.agentWorkspace,
      },
    });
  } catch (error: any) {
    useChats.getState().setStreaming(false);
    useChats.getState().resetStream();
    useUi.getState().pushToast({ kind: "error", text: error?.message ?? String(error) });
  }
}
