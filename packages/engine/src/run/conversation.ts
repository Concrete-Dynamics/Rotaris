import type { ChatMessage } from '@rotaris/model';

/**
 * ADR-0060 — the conversation as the addressable, REPLACEABLE thing.
 *
 * The history used to be a bare array local to `runTurn`, handed straight to `backend.runTurn`. Compression
 * has to put a different history in its place, so the array became an object whose contents are SWAPPED
 * rather than spliced: `replace` installs a new array and never touches the one a call in flight was given
 * (`snapshot()` hands out the live array without copying, so the identity is what carries the guarantee).
 * A push mutates; pushes only ever happen between steps, and the invariant that makes the swap safe is that
 * no push and no replace occurs while a request holds the array it was given.
 *
 * `originalRequest` is the first `user` message and is captured once: `REQ-MONITOR-082` requires it to
 * survive compression character for character, and after one compression it is no longer derivable from
 * position alone in any way this class would rather rely on.
 */
export class Conversation {
  private entries: ChatMessage[];
  private readonly original: ChatMessage | null;

  constructor(initial: readonly ChatMessage[]) {
    this.entries = [...initial];
    this.original = this.entries.find((m) => m.role === 'user') ?? null;
  }

  /** The live array. Never mutated by `replace`; a caller holding it keeps the history it was given. */
  snapshot(): readonly ChatMessage[] {
    return this.entries;
  }
  push(message: ChatMessage): void {
    this.entries.push(message);
  }
  /** ADR-0060 decision 1: a NEW array, so an in-flight request keeps the old one. */
  replace(messages: readonly ChatMessage[]): void {
    this.entries = [...messages];
  }
  get length(): number {
    return this.entries.length;
  }
  /** `REQ-MONITOR-084` (2): the user's original request, which survives every compression. */
  get originalRequest(): ChatMessage | null {
    return this.original;
  }
}

/**
 * ADR-0060 decision 2 — a conversation TURN boundary is any message that is NOT a `tool` message.
 *
 * The specification fixes `preserve_recent_turns` (`REQ-CONFIG-132`) without defining the unit. Two properties
 * decide it. First, a cut must never separate a `tool` message from the `assistant` message that named its
 * `callId` — the shape a provider rejects with a 400, which would make compression produce the very failure it
 * recovers from. A `tool` message always follows its assistant message directly, so cutting anywhere else is
 * safe. Second, the unit must have granularity INSIDE one exchange: the first form of this rule counted
 * user-rooted groups, and an agent that never sees a second user message — one long tool loop, which is exactly
 * the shape that outgrows a context window — then held one turn, so the four most recent turns were the whole
 * conversation and compression could never remove anything. That reason is kept here beside its replacement.
 *
 * Returns the index of each turn boundary, ascending.
 */
export function turnStarts(messages: readonly ChatMessage[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i < messages.length; i++) if (messages[i]!.role !== 'tool') starts.push(i);
  return starts;
}

export function preservedFrom(messages: readonly ChatMessage[], keep: number): number {
  if (keep <= 0) return messages.length;
  const starts = turnStarts(messages);
  if (starts.length === 0) return messages.length;
  const first = starts[0]!;
  const at = starts.length <= keep ? first : starts[starts.length - keep]!;
  return Math.max(at, first + 1);
}

/**
 * `REQ-MONITOR-081` / `REQ-CONFIG-132`: the estimate used when no real prompt-token count is available —
 * character length over `chars_per_token`. Every textual part counts: text, tool-call arguments and tool
 * results. An image part contributes its encoded length, which is what the request will carry.
 */
export function estimateTokens(messages: readonly ChatMessage[], charsPerToken: number): number {
  const per = charsPerToken > 0 ? charsPerToken : 4;
  let chars = 0;
  for (const m of messages) {
    for (const p of m.content) {
      chars += p.kind === 'text' ? p.text.length
        : p.kind === 'image' ? p.base64.length
          : p.kind === 'tool-call' ? p.name.length + p.args.length
            : p.result.length + p.name.length;
    }
  }
  return Math.ceil(chars / per);
}
