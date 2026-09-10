/**
 * Part AO — ADR-0060 decision 1's second reader: the registry of LIVE conversations, addressed from the
 * `forceCompression` control arm (ADR-0060 consequence 4 named it as what makes §10's manual compression buildable).
 *
 * A conversation is live while its turn is inside `runTurn` — from the moment the turn has a `Conversation` to the
 * moment it returns — and a turn registers a handle here for exactly that span. The handle carries the agent's name
 * for the report REQ-CHAT-080 / REQ-MONITOR-094 put in front of the user, and ONE operation: compress this
 * conversation now, through the agent's own `CompressionRunner`, so the manual pass and the automatic trigger share
 * one mechanism, one single-flight guard and one record (the `context_compressed` timeline entry, the transcript's
 * reason row, the count of REQ-MONITOR-086).
 *
 * The registry holds no `Conversation` of its own and never replaces one: `Conversation.replace` is the runner's,
 * and ADR-0060's swap-never-splice rule is what makes compressing under a model call in flight safe — the call keeps
 * the array it was given and the turn's next step reads the new one.
 */
export interface ManualCompressionOutcome {
  /** The conversation was replaced by its compressed form. */
  readonly kind: 'compressed';
  readonly beforeMessages: number;
  readonly afterMessages: number;
}
export interface ManualCompressionNoop {
  /** Nothing lies between the original request and the preserved turns — REQ-MONITOR-092 compresses "however empty a context is", and this is the one context with nothing to remove. Not a failure. */
  readonly kind: 'unchanged';
  readonly reason: string;
}
export interface ManualCompressionFailure {
  readonly kind: 'failed';
  readonly reason: string;
}
export type ManualCompressionResult = ManualCompressionOutcome | ManualCompressionNoop | ManualCompressionFailure;

export interface LiveConversation {
  /** The agent whose conversation this is — what the completion toast counts and the incomplete notice lists (REQ-MONITOR-094). */
  readonly agent: string;
  compress(signal: AbortSignal): Promise<ManualCompressionResult>;
}

/** REQ-CHAT-080 / REQ-MONITOR-094: what one settled pass reports — the count, the no-ops, and every failure with its agent and reason. */
export interface ManualCompressionReport {
  readonly compressed: number;
  readonly unchanged: number;
  readonly failed: readonly { readonly agent: string; readonly reason: string }[];
}

export class ConversationRegistry {
  private readonly live = new Set<LiveConversation>();

  /** A turn registers its conversation on entry and calls the returned function on exit — every exit, so a handle never outlives its turn. */
  register(handle: LiveConversation): () => void {
    this.live.add(handle);
    return () => { this.live.delete(handle); };
  }

  list(): readonly LiveConversation[] {
    return [...this.live];
  }

  get size(): number {
    return this.live.size;
  }

  /**
   * REQ-MONITOR-092 / REQ-CHAT-080: every live conversation compressed CONCURRENTLY, the report settled once ALL of
   * them have. A handle that throws is a failure of that agent, never of the pass; the others still settle.
   * REQ-CHAT-081 / REQ-MONITOR-096: no threshold is consulted here or below — a manual request compresses however
   * small the context is, and the runner's automatic latch is not read.
   */
  async compressAll(signal: AbortSignal): Promise<ManualCompressionReport> {
    const handles = this.list();
    const settled = await Promise.all(handles.map(async (h): Promise<ManualCompressionResult> => {
      try { return await h.compress(signal); }
      catch (cause) { return { kind: 'failed', reason: cause instanceof Error ? cause.message : String(cause) }; }
    }));
    let compressed = 0;
    let unchanged = 0;
    const failed: { agent: string; reason: string }[] = [];
    settled.forEach((r, i) => {
      if (r.kind === 'compressed') compressed += 1;
      else if (r.kind === 'unchanged') unchanged += 1;
      else failed.push({ agent: handles[i]!.agent, reason: r.reason });
    });
    return { compressed, unchanged, failed };
  }
}
