# ADR-0060 — Context compression replaces a conversation; the conversation is the addressable thing — Decision

Part 3 of 11 of [ADR-0060](../0060-context-compression-over-a-replaceable-conversation.md), which indexes every part.

## Decision

**Alternative C**, with the four rules below.

1. **`Conversation` owns the history** (`packages/engine/src/run/conversation.ts`). `snapshot()` returns the
   current array (frozen by type, `readonly ChatMessage[]`); `push` appends; `replace` installs a **new**
   array and never mutates the old one; `originalRequest` is the first `user` message, captured at
   construction. `runTurn` constructs one per turn from `history` plus the incoming user message;
   `TurnOutcome.messages` is `snapshot()`, so `runWithChildren`'s chaining and `report.ts`'s readers are
   unchanged. `step()` is given the snapshot, which is what makes the swap safe.

2. **A conversation turn boundary is any message that is not a `tool` message.** `preserve_recent_turns`
   (default 4, `REQ-CONFIG-132`) counts those boundaries. The specification does not define the unit, and two
   properties decide it. It must never **orphan a `tool` message from the `assistant` message that named its
   `callId`** — the shape providers reject with a 400, which would make compression produce the very failure it
   recovers from; a `tool` message always directly follows its assistant message, so cutting anywhere else is
   safe. And it must have granularity **inside** one exchange. *This decision first read "a user-rooted group,
   from one `user` message to just before the next". That was falsified by the first execution below and the
   reason is kept in `conversation.ts` beside its replacement.*

3. **The reconstruction is `REQ-MONITOR-084`'s five parts and nothing else**:
   `[original request, compression summary, todo items, ...preserved turns]`. Parts (1) — the system prompt
   and the tool definitions — **are not in the conversation at all**: they travel as `systemPrompt` and
   `tools` on every request (`turn.ts`'s `step`), so they survive character for character by construction
   rather than by being copied. `REQ-MONITOR-083`'s 300-line bound clamps **the summary alone**; the todo
   items go across one for one and the preserved turns verbatim, neither counted against it.

4. **The compressing pass is a bounded second call over the same port**
   (`packages/engine/src/run/compression.ts`), modelled on `children/report.ts`'s `produceReport`: the
   `compressor.model` when configured, else the agent's own model (`REQ-MONITOR-080`), the section's
   `timeout_seconds`, and a prompt asking for the work performed, the findings reached and the questions left
   open (`REQ-MONITOR-082`). It is given **only the compressible slice** — what lies between the original
   request and the preserved turns — because `REQ-MONITOR-082` forbids sending any of the three survivors.
   A failed or empty pass is a failed compression; nothing is discarded.
   *Modelling the pass on `produceReport` went further than this decision said: it read the report's own
   `transcriptText`, REQ-ORCH-110's 12,000 characters from the head at 2,000 per event, so the summary could not
   state what the model was never shown (acceptance finding A12, 2026-09-30). That reason is kept here; the pass
   now reads the slice through a reader of its own, whole up to the compressing model's own threshold (OQ-156, the
   section "The compressor's reading, repaired" below).*

5. **Two call sites, one mechanism.**
   - *Automatic* (`REQ-MONITOR-076`): at the top of the step loop, in the position ADR-0059's `check()`
     already occupies. The count prefers the provider's real last-prompt reading, which `AgentActivity`
     already holds from the previous step, and falls back to a character estimate at `chars_per_token`;
     which source was used is recorded (`REQ-MONITOR-081`).
   - *Recovery* (`REQ-ORCH-093`, `REQ-MONITOR-077`): a `context_window` branch in `resilientStep`, at most
     **twice for one call**. Where the condensation itself fails the report is returned unchanged, so the
     original rejection is what surfaces. The ladder learns nothing about conversations: it calls an optional
     `condense()` on `TurnResilience` that `runTurn` supplies, closing over its `Conversation`.
   - The parent-resume limb of `REQ-ORCH-093` needs no third site: a resumed parent is a turn like any other
     and reaches both sites. It is distinguished only in the issue kind — `parent_resume_bad_request` when the
     failing call is the first of a resumed turn, `llm_bad_request` otherwise — and is bounded by the child
     timeout that already wraps it (`REQ-ORCH-088`).

6. **The count is the timeline's** (`REQ-MONITOR-086`). One `context_compressed` entry per completed
   compression is the durable record; `AgentActivity` holds the live figure and a session opened again
   rehydrates it by counting those entries, the shape `ResilienceMemory.rehydrate` established. Counting a
   completion twice is impossible because an entry is written once. The per-agent figure joins `AgentRecord`
   as `compressions`, which is what `REQ-MONITOR-281` asked for and Part R recorded as owed.

7. **Reporting is the timeline entry, the transcript row and the log — and an open question.**
   `REQ-CONFIG-135` requires the four inputs on the session's event stream as separate machine-readable
   fields, but `REQ-EVENTS-041` closes the wire catalogue at 23 kinds and none of them reports a compression.
   **OQ-53 is raised against `REQ-CONFIG-135`.** The interim is the one Part Q used for `model_exhausted` and
   `model_override`: the `context_compressed` timeline entry carries `threshold_percentage`, `capacity`,
   `advertised_input_limit`, `default_threshold` and `trigger_tokens` as separate metadata fields, one
   `system` transcript row is rendered from those fields, and the same figures go to the log at
   informational level. What the requirement asks for is delivered; where it is delivered is what OQ-53 asks. *(2026-10-06,
   [R-071](../../../product/requests.md#r-071): OQ-53 ruled as recommended — the session's event stream is read as its
   timeline, so the `context_compressed` entry is the event and the interim above stands as the decision; its name is a
   word of [`PD-ORCH-014`](../../../product/directives/pd-orch-014.md#pd-orch-014).)*

8. **The capacity is the model's, not a constant.** `REQ-MONITOR-078` resolves capacity from the model's
   `context_compression_threshold`, else the smaller of its `max_input_tokens` and `default_threshold`.
   Both fields have loaded since ADR-0036 and neither has ever reached a run: `sessions.ts` records
   `contextLimitFor` as unfilled, so every agent meter has read 265,000 whatever the model. This part carries
   them from the configured run, which is also `REQ-MONITOR-049`'s limb that Part R left owed.

9. **A compression in flight is published like a wait.** `SessionRecord` gains
   `compression: { agent, startedAt } | null`, derived from the live run at each snapshot exactly as `wait`
   is (`REQ-MONITOR-085`). The run host is a separate process and keeps publishing while the pass runs, so
   no surface blocks; the added latency is recorded in the timeline entry.
