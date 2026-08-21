# The terminal `result` event bypasses the event bus

> Found: 2026-08-09, while building the event store (wave 1 of the Phase 2 work).
> **FIXED 2026-08-09** in wave 2, specified as the terminal clause of SWR-1832.
> Severity was: medium — any bus subscriber silently missed the one event that said how the
> run ended.
>
> **How it was fixed:** `result` is now published through the bus before the sink is
> discarded. Double delivery is prevented *by construction* rather than by a flag — the
> direct sink write now survives only on the paths that never registered anything on the
> bus (a rejected flag combination, an unavailable lock, a failed worktree bind), all of
> which return before any registration exists and have no real session for the bus to
> address. The two are mutually exclusive, so there is no "publish and also write" window.
> Three assertions guard it, one of which fails against the pre-fix ordering: the bus
> registration must still be live at delivery.

## What happens

Every other event reaches consumers through `rotaris_core.events.bus.publish`, which resolves
the sink registered for the session and calls it. The terminal `result` event does not:
`run_host._emit_result_event` (`src/rotaris_core/run_host.py`, around lines 213 and 742)
writes it **directly to the `event_sink` object**, and does so *after* `discard_event_sink`
has already removed that sink from the registry.

So a consumer attached at the bus — the natural place, and the one the SWR-1828/1829 docs
point at — receives session start, iterations, children, tools, permissions, verifier
results and usage, and then nothing. The run's exit result, the single event a CI job or an
SDK consumer gates on, never arrives.

The stdout stream is unaffected, because the CLI holds the sink object itself and the direct
write lands in the same JSONL. This is why the gap is easy to miss: the documented
user-facing surface looks complete while the programmatic one is truncated.

## Consequence for the event store

The store's integration coverage attaches at the **sink** seam rather than the registry,
because that is the only seam that sees a whole run including its ending. The wiring unit in
the next wave must do the same, or persist runs that never appear to finish — and a stored
session with no terminal event is indistinguishable from a session whose process was killed.

## Fix sketch

Publish `result` through the bus before the sink is discarded, and keep the direct write only
if the CLI needs the ordering guarantee that the terminal line is genuinely last. Ordering is
the likely reason it was written this way, so the fix is probably "publish, then discard",
not "delete the direct write".

Worth deciding together with SWR-1831's new event types, since both concern what a
programmatic consumer can actually observe.
