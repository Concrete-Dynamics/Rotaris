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

## Outcome

**Repaired 2026-10-07** (finacc3, task F02). Confirmed on the branch before the change by four failing cases: the two in
`ai-sdk-client.test.ts` read the step's first part as the finished `tool-call` (`expected 'tool-call' to be 'tool-input'`;
the backend's `started` then `tool-call`), the `stall.test.ts` case read `quietFor` as 97,000 ms after 97 s of argument pieces,
and the `children.test.ts` case published the child's live row with `stalledSince` ten seconds into the arguments.

- `StreamPart` (`packages/model/src/ports.ts`) gains `tool-input` (`callId`): a tool call under way, activity only.
  `AiSdkModelClient.stream` yields one for each `tool-input-start` and `tool-input-delta` part; the call itself still
  arrives once, whole, as `tool-call`, so nothing is assembled twice. `tool-input-end` is still not forwarded: the SDK
  sends it immediately before the call's `tool-call` part, which is itself a model event, so it carries no activity the
  watch would miss. `DefaultAgentBackend.runTurn` sends it to
  `TurnSink.started` when it is the first part and to `TurnSink.event` always, and assembles nothing from it.
- `StallWatch`'s `OUTPUT_EVENTS` (`packages/engine/src/children/stall.ts`) counts `tool-input` as output, so
  REQ-NOTIFY-112's `quietFor` reads a child streaming arguments as producing output; every model event already reset the
  silence the warning reads, so the false warning and `stall` issue go with the client's change.
- `step`'s sink (`packages/engine/src/run/turn.ts`) clears and re-arms REQ-CHAT-164's ten seconds on a `tool-input` or
  `tool-call` event, as it does on text, reasoning and usage.
- REQ-ORCH-090's watchdog needed no change of its own: it disarms on the first part the backend sees, which is now the
  call's first piece.

Pinned by `ai-sdk-client.test.ts`, "model — a tool call's streamed arguments are model events" (two cases, over an
OpenAI-shaped stream of six argument pieces), `stall.test.ts`, "REQ-ORCH-089 / REQ-NOTIFY-112: a piece of a tool call's
streamed arguments is a model event and output …", `children.test.ts`, "REQ-ORCH-089 / REQ-NOTIFY-112 / REQ-CHAT-164: a
child streaming a tool call's arguments for 95 s is not stalled, its row is not marked stalled, and a failure after it earns
no corrective message", and `ladder.test.ts`, "REQ-ORCH-090: a step whose first part is a streamed tool-call piece is not
given up as unresponsive however long the call streams" (red, re-run on the fallback, when the backend drops the pieces).
The runtime view's model-step, unresponsive-model and stall-watch paragraphs, and ADR-0027's
thirteenth execution, say so.

Shown in the built app against `katalyst` by `live-run.mjs --only=faults`'s new `faults-args` launch, which streams every
tool-call argument piece slowly through the recording proxy under a 10 s stall threshold (`AGENTS.md`, the `faults`
section). On the product before the repair (`43b3fca`, the new harness copied in), pack `2026-10-07T00-21-02-195Z`: red,
three `stall` issues written while agents streamed paced arguments — the root warned `no model event or token for 10
seconds` about 9.8 s into a 246-piece `write_file` whose arguments streamed for 29.5 s, and a delegated child twice
(inside its 11.1 s and 12.3 s spans). On the repaired head, packs
`2026-10-07T00-16-35-425Z` (220 pieces over 13.3 s) and `2026-10-07T00-26-10-472Z` (220 pieces over 26.4 s): no `stall`
issue in the session, passed; `docs/architecture/first-executions.md` carries the row.
