export interface ReasoningParts {
  answer: string;
  reasoning: string;
}

const OPEN_TAGS = ["<think>", "<analysis>", "<reasoning>"] as const;
const CLOSE_TAGS = ["</think>", "</analysis>", "</reasoning>"] as const;

function findFirstTag(value: string, tags: readonly string[]) {
  const lower = value.toLowerCase();
  let best: { index: number; tag: string } | null = null;
  for (const tag of tags) {
    const index = lower.indexOf(tag);
    if (index >= 0 && (!best || index < best.index)) best = { index, tag };
  }
  return best;
}

function partialTagSuffixLength(value: string, tags: readonly string[]) {
  const lower = value.toLowerCase();
  const maximum = Math.min(value.length, Math.max(...tags.map((tag) => tag.length)) - 1);
  for (let length = maximum; length > 0; length -= 1) {
    const suffix = lower.slice(-length);
    if (tags.some((tag) => tag.startsWith(suffix))) return length;
  }
  return 0;
}

/**
 * Separates model-provided <think>/<analysis> text from the final answer while
 * preserving token streaming even when an XML-like tag is split across chunks.
 */
export class ReasoningStreamParser {
  private buffer = "";
  private inReasoning = false;
  private detected = false;

  get sawReasoning() {
    return this.detected;
  }

  push(chunk: string): ReasoningParts {
    this.buffer += chunk;
    return this.drain(false);
  }

  flush(): ReasoningParts {
    return this.drain(true);
  }

  private drain(flush: boolean): ReasoningParts {
    let answer = "";
    let reasoning = "";

    while (this.buffer) {
      const tags = this.inReasoning ? CLOSE_TAGS : [...OPEN_TAGS, ...CLOSE_TAGS];
      const match = findFirstTag(this.buffer, tags);
      if (match) {
        const text = this.buffer.slice(0, match.index);
        const isCloseTag = (CLOSE_TAGS as readonly string[]).includes(match.tag);
        if (this.inReasoning || (!this.inReasoning && isCloseTag)) {
          reasoning += text;
          if (text) this.detected = true;
        } else {
          answer += text;
        }
        this.buffer = this.buffer.slice(match.index + match.tag.length);
        this.inReasoning = !isCloseTag;
        if (this.inReasoning) this.detected = true;
        continue;
      }

      if (flush) {
        if (this.inReasoning) reasoning += this.buffer;
        else answer += this.buffer;
        this.buffer = "";
        break;
      }

      const keep = partialTagSuffixLength(this.buffer, tags);
      const readyLength = this.buffer.length - keep;
      if (readyLength <= 0) break;
      const text = this.buffer.slice(0, readyLength);
      if (this.inReasoning) reasoning += text;
      else answer += text;
      this.buffer = this.buffer.slice(readyLength);
    }

    return { answer, reasoning };
  }
}

export function chatWrapperSupportsReasoning(chatWrapper: {
  settings?: { segments?: { thought?: unknown } };
} | null | undefined) {
  return chatWrapper?.settings?.segments?.thought != null;
}

export function splitReasoningFromResponse(response: string): ReasoningParts {
  const parser = new ReasoningStreamParser();
  const first = parser.push(response);
  const last = parser.flush();
  return {
    answer: first.answer + last.answer,
    reasoning: first.reasoning + last.reasoning,
  };
}
