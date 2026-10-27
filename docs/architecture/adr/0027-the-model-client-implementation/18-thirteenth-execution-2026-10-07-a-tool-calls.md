# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Thirteenth execution — 2026-10-07, a tool call's streamed arguments reach the run (REQ-ORCH-089, REQ-ORCH-090, REQ-CHAT-164)

Part 18 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Thirteenth execution — 2026-10-07, a tool call's streamed arguments reach the run (REQ-ORCH-089, REQ-ORCH-090, REQ-CHAT-164)

*The repair of [`a-child-streaming-a-long-tool-call-is-reported-stalled.md`](../../../defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md)
(finacc3, task F02). Found by the duress live runs at `c2fdd6a` and `c2a9444`, not by a test.*

**Found — the third execution's reason for "a tool-call-only step" was true of the call and silent about its arguments.**
That execution said `TurnSink.started()` reports the first part of any kind, "so REQ-ORCH-090's 'any model event' counts a
tool-call-only step". It counted the step once the call was **complete**: the adapter yielded `tool-call` only from the SDK's
finished part, and the fourth execution's idle bound re-armed on the `tool-input-start` and `tool-input-delta` parts without
forwarding them. Kept beside its replacement: the adapter now yields a `tool-input` part (`callId` only, activity) for each,
and the call still arrives once, whole, as `tool-call`. Above the port the default backend sends it to `TurnSink.started` (the
first) and `TurnSink.event` (each); the stall watch counts it as output, and `step`'s sink clears REQ-CHAT-164's row mark on it.
Measured: at `c2a9444`, child `f` streamed 3,011 argument pieces of a `write_file` for about 97 s and was warned stalled at
94 s. `ai-sdk-client.test.ts`'s two cases over an OpenAI-shaped stream of six argument pieces read the step's first part as
`tool-call` before the change and `tool-input` after; `children.test.ts`'s 95 s case marked the child's row `stalledSince`
at 10 s before it. In the built app, `live-run.mjs`'s `faults-args`
launch (the recording proxy pacing every argument piece under a 10 s stall threshold) was red on the product before the
change, three `stall` issues written while agents streamed paced arguments, and green after it, none, over 220 pieces and
26.4 s (`docs/architecture/first-executions.md`, 2026-10-07).
