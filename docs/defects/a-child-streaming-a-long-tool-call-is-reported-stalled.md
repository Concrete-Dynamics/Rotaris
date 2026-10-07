## A child streaming a long tool call is reported stalled

The model adapter (`AiSdkModelClient.stream`) yields a tool call only once the call is complete. It drops the SDK's
`tool-input-start`, `tool-input-delta` and `tool-input-end` parts: it re-arms its own idle bound on each of them (ADR-0027's
fourth execution), and forwards none. `DefaultAgentBackend.runTurn` sends one `TurnSink.event` per part it is given and calls
`TurnSink.started` on the first, so a model step that streams a tool call's arguments for a long time is, to everything
above the adapter, silent until the last argument chunk arrives.

Three consumers read that silence as no output:
- **the stall watch** (`StallWatch`, REQ-ORCH-089, REQ-MONITOR-117..119): a child, or the entry agent, streaming a long
  `write_file` for longer than the threshold (90 s by default) after its last text token is warned `… appears stalled: no
  model event or token for N seconds` and gets a `stall` issue, while the provider streams at full speed. Its
  `OUTPUT_EVENTS` (`text`, `reasoning`, `tool-call`), which REQ-NOTIFY-112's `quietFor` reads, would not count the
  argument chunks as output even if they arrived;
- **REQ-ORCH-090's first-part watchdog** (`step` in `run/turn.ts`): it disarms on `TurnSink.started`, the first part
  yielded. A step whose first output is a streamed tool call longer than `llm_response_timeout` (120 s by default) would be
  given up as unresponsive and re-run on the fallback, its arguments discarded;
- **REQ-CHAT-164's stalled indicator** on the step's live row (`armStall` / `outputArrived` in `run/turn.ts`): a step that
  wrote some text and then streams a tool call marks its row stalled ten seconds into the arguments, "the model is not
  producing output", while it is producing it.

Found by the duress live run at `c2fdd6a` (its autopsy's L2) and again at `c2a9444` (its autopsy's N1, pack
`2026-10-06T17-59-41-271Z`): child `f` streamed a 502-line `write_file` of `docs/verification.md` (request #194, 3,011
argument chunks, 29,382 characters, about 97 s after its last text token). At 94 s of that stream the session log and
the application log read `child appears stalled: no model event or token for 94 seconds (f--verify-the-whole-result-and-write-docs-verification.md, bg_88e7c452)`
at `WARNING`, and issue 8 (`stall`) carries `last_model_event: "text"` and `active_tools: []`. It was the run's only
`WARNING` and only `stall` issue, and both were false. Confirmed in the code at `760394c` and recorded by finacc3's
repair round (task F02). No open or fixed note covers this cause: the fixed stall notes cover the provider waits and a
wait on the agent's own children.

## Specs

- `REQ-ORCH-089` and `REQ-MONITOR-118`/`REQ-MONITOR-119` define a stall as "no model event or token" for the threshold;
  a streamed argument chunk is both, and the warning it produces is false.
- `REQ-ORCH-090` applies the unresponsive-model fallback "only before ANY model event has been received"; a streamed
  argument chunk is one.
- `REQ-NOTIFY-112`'s stuck condition is a child that "produced no output" for the window; arguments streamed are output.
- `REQ-CHAT-164`'s indicator states "the model is not producing output" after ten seconds with "no output of any kind".
- `ADR-0027` (fourth execution) already counts a tool-call argument as stream activity for the adapter's own idle bound;
  the parts above the adapter did not.

## Relevant files

- `packages/model/src/ai-sdk-client.ts` — `AiSdkModelClient.stream`: the `tool-input-*` parts re-arm the idle bound and
  are dropped.
- `packages/model/src/ports.ts` — `StreamPart`: no kind for a tool call's arguments in progress.
- `packages/model/src/default-backend.ts` — `DefaultAgentBackend.runTurn`: `started` on the first part, `event` per part.
- `packages/engine/src/children/stall.ts` — `StallWatch.modelEvent` and `OUTPUT_EVENTS`.
- `packages/engine/src/run/turn.ts` — `step`: the REQ-ORCH-090 timer, REQ-CHAT-164's `armStall` / `outputArrived`, and
  the sink's `event`.
