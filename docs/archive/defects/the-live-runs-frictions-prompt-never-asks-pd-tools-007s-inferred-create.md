## The live run's frictions prompt never asks PD-TOOLS-007's inferred create

PD-TOOLS-007 reads a `write_file` call that carries a path and content and no `operation` as a create when its file does
not exist. `pnpm live-run` reads that shape over every session it keeps (`checkToolRecord`, `lib/tool-frictions.mjs`'s
`runWideReadings`), and reports a NOTE, "PD-TOOLS-007's inferred create was not asked", when no session held one. The
`frictions` scenario exists to induce first-use `write_file` shapes, but its prompt only says "Create a file called
friction-probe.txt in the workspace root containing exactly one line with the text probe-ok", and a model that reads the
tool's schema sends `operation: "create"`, so the shape the directive governs is left to chance. The 2026-10-13 survey found
the NOTE in the default run at `552d346`, its duress run, and the default run at `0bc3eee`. The directive has met the shape
live only once, by chance (the resume session's ordinal 9 at `c2a9444`, PD-TOOLS-007's "The live shape, 2026-10-06"), and
no built-app proof sends it: the scripted client has no `write_file` step without an operation.

## Specs

- None in the product. The harness's claim is unmet: the `frictions` scenario's header says it is "engineered to trip the
  inducible run-autopsy frictions (first-use `write_file` without `operation` …)", and its prompt does not ask for that call.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `frictions` prompt and its write checks; `checkToolRecord`'s NOTE.
- `apps/desktop/scripts/lib/tool-frictions.mjs` — `writeSelectorReadings`, the inferred-create reading.
- `apps/desktop/src/run-host/scripted-client.ts` — the scripted client's `write` step always names its operation.
- `packages/agent-tools/src/gate.ts`, `packages/agent-tools/src/tools/files.ts` — where PD-TOOLS-007's reading happens.

Noticed 2026-10-13 by the survey of what is left (item N60 (b)); recorded by fin42 before its repair.

## Repaired — 2026-10-13

Repaired by fin42 (`fin42-live-gaps`), in the harness and the scripted client.

- `apps/desktop/scripts/live-run.mjs`'s `frictions` prompt asks for the probe file to be written by "write_file with only the
  two arguments path and content, and leave out operation", and the scenario reads the probe's write: one with the directive's
  sentence ("No operation was given, so this call was read as 'create'") must have settled `ok` with `operation: create` in its
  record (a check); one that named its operation anyway is a NOTE saying the shape was not asked. `results.json` names the
  inferred creates' ordinals. `checkToolRecord`'s run-wide reading is unchanged and now has a session that asks.
- `apps/desktop/src/run-host/scripted-client.ts` gains the step `writeinfer`: `write_file` with `{ path: 'INFERRED.md',
  content: 'inferred-ok\n' }` and no operation; `apps/desktop/src/run-host/scripted-client.test.ts` pins it beside `write`,
  which names its operation (red before: the step answered instead of calling a tool).
- `apps/desktop/scripts/tool-shapes-proof.mjs` (`pnpm tool-shapes-proof`, new) sends it through the built application. Run
  2026-10-13 under `xvfb-run`: `inferred-create` settled `ok`, its result carrying the sentence, its record `operation: create`,
  `INFERRED.md` holding `inferred-ok`; `inferred-existing`, the same call over an existing file, was refused `invalid_request`
  saying the file exists, the content untouched, and filed one `tool_error` issue referencing it (REQ-SESSION-136).

The live measurement is the next default live run's: its `frictions` scenario should PASS "the probe's write with no operation
was read as a create" and `checkToolRecord` should PASS PD-TOOLS-007's check with the frictions session's ordinal among those
read as a create, rather than the NOTE "PD-TOOLS-007's inferred create was not asked". A model that names the operation
regardless leaves the NOTE, which says so.
