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

## Repaired — 2026-10-01

`parseArgs` (`packages/model/src/ai-sdk-client.ts`) now hands the SDK only a plain object as a replayed call's input. A
parse that yields a string (the doubly encoded case), a number, a boolean, an array or null is wrapped exactly as an
unparseable text always was, `{ "_raw": <the text> }`, so the replayed assistant message always carries a mapping and an
endpoint whose chat template iterates the arguments accepts the request. What the gate judges is unchanged: it reads the
call's own text (`call.rawArgs`), still refuses it under REQ-TOOLS-032 with "could not be read as JSON even after repair",
and that answer now reaches the model in the next request. Unwrapping doubly encoded arguments as a fourth repair is
still not done; REQ-TOOLS-032 names three repairs, and this note does not ask for a fourth.

The live run's `terminal` scenario no longer passes over a run that died before it reached the terminal:
`terminalRunEndReading` (`apps/desktop/scripts/lib/terminal-shapes.mjs`) reads the session row against the terminal-call
count, and `live-run.mjs` fails "the terminal run did not end failed before any terminal call" when the run ended
`failed` with no terminal call, or when no session was read. A run that failed after reaching the terminal is a NOTE.

Pinned by:
- `packages/model/src/ai-sdk-client.test.ts`, "a replayed tool call always carries a mapping": the arguments
  `"{\"persona\":\"x\"}"`, `42`, `[1]`, `null` and `true` each leave as `{ "_raw": … }` in the request body (five fail
  without the repair); an object's text leaves as that object and an unreadable text as before.
- `packages/engine/src/run/turn.test.ts`, "REQ-TOOLS-032: a call whose arguments are a JSON string (encoded twice) …": a
  run through the real AI-SDK client against an endpoint that answers HTTP 400 "Can only get item pairs from a mapping."
  whenever a replayed call's arguments are not a mapping. The gate is handed the model's own text, the second request
  carries the refusal beside a mapping, and the run completes; without the repair it ends `failed`, as on 2026-10-01.
- `apps/desktop/scripts/lib/terminal-shapes.test.ts`, "how the terminal run ended": the 2026-10-01 shape (`failed`,
  `agent_session_aborted`, no terminal call) reads `died-early`.

Live run, 2026-10-01 (`katalyst`, `qwen3.8-flash-next`, `--only=terminal`, pack
`.live-run/runs/2026-10-01T16-52-47-210Z/terminal/` in the `fin3-liverunreadi` worktree, git-ignored): the run completed
(`tasks_complete`) after 14 terminal calls, every shape attempted, and the new check passed. The model encoded no call
twice this time (no `_raw` in `model-traffic.jsonl`), so the live run shows the new check on a healthy run and the
scenario green, not the repair meeting the shape; the repair's evidence is the run-level test above. A second run on the
branch merged with `origin/main` (pack `.live-run/runs/2026-10-01T17-04-24-814Z/terminal/`) read the same: completed after
14 terminal calls, the check green, no call encoded twice.
Three more runs read the same, none meeting a call encoded twice (no `_raw` and no HTTP 400 in `model-traffic.jsonl`):
the builder's third (`2026-10-01T17-33-25-804Z`, completed after 14 terminal calls), the verifier's
(`2026-10-01T17-47-18-813Z`, completed after 11) and repair round 2's (`2026-10-01T17-54-04-481Z`, completed after 14),
each with the check green and `live-run PASSED`.

Repair round 2 (2026-10-01): a run that ended otherwise than `completed` or `failed` before any terminal call (stopped,
interrupted) now reads `ended-early`, which live-run prints as a NOTE rather than passing in silence; pinned in
`apps/desktop/scripts/lib/terminal-shapes.test.ts` ("a run stopped or interrupted before any terminal call is a NOTE …",
which fails without it). The live-run header and the `terminal` row of `AGENTS.md` now name the dead-run FAIL.
