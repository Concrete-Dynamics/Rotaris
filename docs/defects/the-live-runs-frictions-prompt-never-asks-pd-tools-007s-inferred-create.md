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
