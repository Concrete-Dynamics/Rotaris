import type { StreamPart } from './ports.js';

/**
 * REQ-CHAT-163 — the three rules every model stream must satisfy before its text is displayed, in one pure,
 * incremental normaliser so they are testable without a provider.
 *
 * 1. **A chunk carrying a tool call MUST NOT appear anywhere in the visible message text.** Tool calls travel as
 *    their own parts and are passed through untouched; nothing this function emits as `text` was ever a tool call.
 * 2. **Content the provider marks as internal deliberation MUST appear only in the reasoning channel.** Providers
 *    carry deliberation in three shapes and this build must recognise all three:
 *      a. a **dedicated reasoning field on the delta** — the SDK's `reasoning-delta`, mapped straight through;
 *      b. a **thinking block inside the content** — `<think>…</think>` (also `<thinking>`, `<reasoning>`) arriving
 *         inside ordinary text deltas, which no SDK maps for us: the extractor below routes the enclosed text to
 *         the reasoning channel and never to the answer body, and it does so ACROSS delta boundaries, because the
 *         opening tag routinely arrives split down the middle;
 *      c. a **list of reasoning items** — several reasoning parts with distinct ids in one call (the responses
 *         dialect's summary items). Concatenating them yields one run-on blob, so an item boundary emits a blank
 *         line between the two items and nothing else.
 * 3. **A delta consisting only of whitespace MUST be kept exactly as received.** It is never dropped and never
 *    collapsed: dropping one joins Markdown blocks that must stay apart, and REQ-CHAT-157's character-for-character
 *    equality of the finished message with the concatenation of the deltas received is measured on the text that
 *    survives this function. Only the marker tags themselves are removed, and only from the text channel.
 *
 * A partially received opening tag is HELD rather than emitted, so `<th` never reaches the answer body; if the
 * stream ends mid-tag, `flush()` returns the held characters so nothing is lost. An unterminated thinking block
 * stays reasoning to the end of the call, which is the safe direction: deliberation withheld from the answer body
 * is a display question, deliberation leaked into it is the failure this requirement exists to prevent.
 */
const OPENERS = ['<think>', '<thinking>', '<reasoning>'] as const;
const CLOSERS = ['</think>', '</thinking>', '</reasoning>'] as const;

/** Longest suffix of `text` that is a proper prefix of one of `tags` — the part that must be held back. */
function heldSuffix(text: string, tags: readonly string[]): number {
  const max = Math.max(...tags.map((t) => t.length)) - 1;
  for (let n = Math.min(max, text.length); n > 0; n -= 1) {
    const tail = text.slice(text.length - n);
    if (tags.some((t) => t.length > n && t.startsWith(tail))) return n;
  }
  return 0;
}

export interface StreamNormaliser {
  /** One incoming part becomes zero or more outgoing parts. Order is preserved. */
  accept(part: StreamPart): StreamPart[];
  /** End of stream: anything held back because it might have been the start of a tag. */
  flush(): StreamPart[];
}

export function createStreamNormaliser(): StreamNormaliser {
  let buffer = '';
  let inThinking = false;

  const drain = (): StreamPart[] => {
    const out: StreamPart[] = [];
    for (;;) {
      const tags = inThinking ? CLOSERS : OPENERS;
      let at = -1;
      let tag = '';
      for (const t of tags) {
        const i = buffer.indexOf(t);
        if (i !== -1 && (at === -1 || i < at)) { at = i; tag = t; }
      }
      if (at === -1) break;
      const before = buffer.slice(0, at);
      if (before !== '') out.push(inThinking ? { kind: 'reasoning', delta: before } : { kind: 'text', delta: before });
      buffer = buffer.slice(at + tag.length);
      inThinking = !inThinking;
    }
    // Hold back only what could still turn out to be a tag; everything else is emitted verbatim, whitespace included.
    const hold = heldSuffix(buffer, inThinking ? CLOSERS : OPENERS);
    const ready = buffer.slice(0, buffer.length - hold);
    buffer = buffer.slice(buffer.length - hold);
    if (ready !== '') out.push(inThinking ? { kind: 'reasoning', delta: ready } : { kind: 'text', delta: ready });
    return out;
  };

  return {
    accept(part) {
      if (part.kind === 'text') {
        buffer += part.delta;
        return drain();
      }
      return [part];
    },
    flush() {
      if (buffer === '') return [];
      const rest = buffer;
      buffer = '';
      return [inThinking ? { kind: 'reasoning', delta: rest } : { kind: 'text', delta: rest }];
    },
  };
}

/**
 * Shape (c): the separator emitted between two reasoning ITEMS of one call, so a list of items reads as a list
 * rather than as one run-on paragraph. Empty for the first item.
 */
export function reasoningItemSeparator(previousId: string | null, id: string | null): string {
  return previousId !== null && id !== null && previousId !== id ? '\n\n' : '';
}
