## A tool call whose arguments are a JSON string ends the run with HTTP 400

In the live run's `terminal` scenario on 2026-10-01 (endpoint `katalyst`, model `qwen3.8-flash-next`), the orchestrator
called `delegate` with its arguments encoded twice. The `arguments` text was a JSON string literal holding the object
(`"{\"persona\": \"coding-agent\", …}"`), not the object itself. The gate answered as REQ-TOOLS-032 asks: "The arguments
for 'delegate' could not be read as JSON even after repair. Re-issue the call with a well-formed object." The model never
saw that answer. The next request carried the assistant message back with that call's arguments, and the endpoint
refused the whole request: HTTP 400, `{"error":{"message":"Can only get item pairs from a mapping.",…}}`. The run ended
`failed` (`agent_session_aborted`) 48 s in, after two tool calls.

The cause is in how the request is written, not in the gate. `packages/model/src/ai-sdk-client.ts`'s `parseArgs` gives the
SDK `JSON.parse(text)` as the call's `input`, and falls back to `{ _raw: text }` only when the parse throws. A JSON string
literal parses without throwing, into a string. The SDK then sends that string as the arguments, and the endpoint's chat
template, which iterates the arguments as a mapping, rejects the conversation. Any argument text that parses to a
non-object (a string, a number, an array) would do the same on such an endpoint.

The live run reported `live-run PASSED`: its `terminal` check asserts that the run reached a result inside the wait, and
a failed run is a result. Every shape the scenario looks for was a NOTE ("not attempted"), because the run died before
any terminal call.

## Specs

- `REQ-TOOLS-032`: a payload still unreadable after repair "is returned to the model as a recoverable tool-result error …
  The call is not executed, the host never silently re-sends it, and **the run is never ended by it**". Here the run was
  ended by it.
- Whether REQ-TOOLS-032's repairs should also unwrap arguments encoded twice is a separate question. The requirement
  names exactly three repairs, and that is not one of them. This note does not ask for it.

## Evidence

- Pack `.live-run/runs/2026-10-01T09-29-52-765Z/terminal/` in the `fin2-uigeometryan` worktree (git-ignored), session
  `73bd7cb9`: `autopsy.txt` (summary, `invalid_request ×1 [delegate]`) and `model-traffic.jsonl`, whose third request
  carries the assistant message with the doubly encoded `delegate` arguments and whose response is the 400.

## Relevant files

- `packages/model/src/ai-sdk-client.ts` — `parseArgs`, which hands a non-object parse result to the SDK as a call's input.
- `packages/agent-tools/src/gate.ts` — `repairPayload` and the "could not be read as JSON even after repair" answer.
- `apps/desktop/scripts/live-run.mjs` — the `terminal` scenario, whose pass did not notice that the run failed.
