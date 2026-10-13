## The live run's terminal shapes read a call the todo gate refused before it ran

The `terminal` scenario of `pnpm live-run` reads each shape from the first terminal call whose command matches the
shape's pattern (`attempted(id)[0]`), whatever became of that call. When the coordinator sends a shape before it has
written a todo list, REQ-ORCH-029's gate (OQ-213 as ruled) refuses the send unrun (`blocked`, `failure_kind`
`todo_list_owed`), the model writes its list, and sends the same command again, which runs. The scenario still reads the
refused send: its result is the gate's refusal text, so the shape's checks measure nothing.

The confirming default live run at `0bc3eee` (pack `.live-run/runs/2026-10-13T12-18-40-282Z`, git-ignored; terminal session
`6f11bf67-7e24-457d-b04f-beee048277db`) printed one FAIL from it: "all 40 lines of output reached the agent — 0 distinct of
0 marker(s)". Ordinal 2, the `long-output` awk command byte for byte, was refused at the gate (423 characters, no `LINE-`
marker); ordinal 5, the same command, ran and returned all 40 lines, 40 distinct, none doubled, no escape sequence, and
the model's request 6 carried them whole. The two checks beside the FAIL, "no two output lines were concatenated into
one" and "the agent read a VT-stripped capture", read the same refused call and passed without measuring anything.

Systemic: `long-output` is the second shape of the prompt on both platforms, and the gate refuses the coordinator's second
work item while no list exists, so the FAIL returns whenever the model starts without writing a list first. The passing
run at `552d346` (pack `2026-10-13T07-25-27-766Z`) wrote its list at ordinal 1, so its one `long-output` call was the call
that ran. Every `attempted(id)[0]` site, the poll, interrupt and next-command finds over `terminals`, and the
`diagnostics` map in `results.json` carry the same weakness. The same exposure applies to a send refused by the gate's
schema check (`invalid_request`), which never runs either.

A permission-blocked call is not a gate refusal in this sense: `pipe-to-shell` is measured by its block (ordinal 33 of the
same session, `blocked` with no `failure_kind`), so a predicate that drops every `blocked` call, as
`lib/coordinator-todo.mjs`'s `ran` does, is not the repair.

## Specs

- None in the product: REQ-ORCH-029's refusal is OQ-213 working as ruled, and when the command ran its whole output reached
  the model. The fault is the harness's own: the scenario's header (`live-run.mjs`, "The terminal under duress") says each
  assertion reads what came back from the call the shape issued, and a refused send issued nothing.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `attempted` (the terminal scenario's selector, matching on the command alone), every
  `attempted(id)[0]` site, the poll/interrupt/next-command finds over `terminals`, the "what the model attempted" NOTE and
  the `diagnostics` map.
- `apps/desktop/scripts/lib/terminal-shapes.mjs` — the shapes and their readers; where the selection belongs so a test pins it.
- `apps/desktop/scripts/lib/terminal-shapes.test.ts` — the shapes' tests.
- `apps/desktop/scripts/lib/coordinator-todo.mjs` — `ran`, the precedent that excludes every `blocked` call (too broad here).
- `packages/agent-tools/src/gate.ts` — where `todo_list_owed` and `invalid_request` are settled.
