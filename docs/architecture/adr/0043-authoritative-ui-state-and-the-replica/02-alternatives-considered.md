# ADR-0043 — Where authoritative interface state lives, and how a renderer stays in step — Alternatives considered

Part 2 of 8 of [ADR-0043](../0043-authoritative-ui-state-and-the-replica.md), which indexes every part.

## Alternatives considered

**A — Renderer-authoritative store.** Each renderer owns the source of truth for what it draws; the
process behind it forwards raw events and the renderer folds them in.

*For:* the simplest data flow; no serialisation on the read path; cheap selectors.
*Against:* it breaks `REQ-NOTIFY-025` outright — the notice store must survive window re-creation within
one process, and a renderer-owned store dies with its window. It breaks the workspace switch, where two
renderers would independently fold the same events. It makes persist-before-publish unenforceable from
the renderer's side, and turns decline-and-re-render into a renderer-initiated store read, which
conflicts with paging having to happen off the interface thread. Every auxiliary window would fold
events independently, so "identical visible cells at the same time" (`REQ-SHELL-102`) becomes a race
rather than a guarantee — and under `REQ-MONITOR-243`'s several-windows-one-session it would become a
race the product now encounters routinely.

**B — An authoritative projection outside the renderers; renderers hold a derived replica.** One
*session view model* per live session, fed by the session writer and gated on the commit that made each
change durable, published on the two channels with a per-session sequence number. Each renderer holds a
replica whose only writers are the two channel handlers and purely local interface state — scroll
anchor, expansion map, composer text, search query, drawer state.

*For:* the notice store and the queue live beside the projection and every window observes them;
persist-before-publish is discharged at **one point** — the writer's commit — instead of at every
producer; the stale-read rule is a single-writer concern rather than a distributed one; the workspace
switch works because two renderers subscribe to two view models from the same owner; several windows on
one session receive identical numbered publications and cannot diverge; and "no view may slow the run"
is enforceable because the publisher never awaits a renderer. **Chosen.**
*Against:* every update crosses a process boundary and is serialised; duplicated state in N renderers
costs memory; the replica can drift if a channel handler has a bug — which is exactly why the
decline-and-re-read path is mandatory rather than optional, and why the sequence number exists.

**C — Renderers read the persisted session record directly.** No push; each renderer polls and reads the
store itself.

*For:* one source of truth, no replica drift, paging is a local read.
*Against:* fails `REQ-MONITOR-218` — "published immediately, no delay floor of any size" cannot be met by
polling. Under SR-3 there is no cadence left to poll on: `REQ-MONITOR-287` fixes none and
`REQ-MONITOR-288` is withdrawn. Fails `REQ-MONITOR-223`'s "a session with nothing happening does no work
at all, and no timer anywhere runs to discover whether it has changed". Puts I/O on the interface thread
or forces a worker per window. Multiplies read amplification by the number of open windows — now by the
number of windows *and* the number showing the same session. And under ADR-0002 the renderer is
sandboxed and has neither filesystem nor store access.

**D — A per-publication acknowledgement from each surface, with the publisher retransmitting.**
Considered because it detects loss at the publisher rather than at the surface, and rejected on
`REQ-MONITOR-232` and `REQ-MONITOR-226`: no view may hold a run open, slow it down or change its
outcome, and a consumer that hangs or vanishes must leave the run untouched. A publisher that waits for
or retains state per acknowledgement is a publisher a broken view can stall. The sequence number gets
loss detection with none of that: it is one integer in a payload the publisher was sending anyway, it
costs nothing while nothing is lost, and the recovery obligation sits entirely on the surface.
