## The live run's terminal reader counts a send the gate refused for another reason as reached

The `terminal` scenario of `pnpm live-run` reads each shape from the first send that reached execution (`shapeSends`,
`reachedShape` in `apps/desktop/scripts/lib/terminal-shapes.mjs`). What "did not reach execution" means is
`GATE_REFUSALS`, which holds `todo_list_owed` and `invalid_request` only. The tool gate (`packages/agent-tools/src/gate.ts`)
settles four more refusals before a call runs: `plan_gate_withheld` (the run held at the plan gate), `write_scope_claimed`
(a write inside another agent's live write scope), `interrupted` with status `blocked` (an approval withdrawn when the run
came to rest, PD-ORCH-005 clause 9) and `hook_blocked` (a `pre_tool` hook stopped it). A terminal send refused by one of
them carries the refusal's text, and the scenario would read that text as the shape's answer, the same hollow reading
`docs/defects/fixed/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md` repaired for the
todo gate.

How likely each is, as the scenario stands: `write_scope_claimed` cannot fire on a terminal call (`writeScopeRefusal`
applies only where `fencedByWriteScope` holds, `write_file` or `haet_edit` with a path); `plan_gate_withheld` and
`hook_blocked` need a plan gate or a `pre_tool` hook, and the terminal launch sets up neither; a withdrawn approval needs
an ask, and the scenario runs `autonomous`. None has produced a hollow PASS. `interrupted` is also the kind of a call the
run cut while it ran (PD-TOOLS-013 revision 2, status `failed`), which did run, so the kind alone cannot decide it.

Two text gaps on the same reader, from the same review (fin40's reviewer, `wf_77cf7c64-21b`, "optional"):

- The scenario's header (`live-run.mjs`, scenario 8 in the list and the "terminal under duress" docblock) says only that a
  shape the model never attempted is a NOTE; a shape whose every send the gate refused before it ran is one too ("not
  reached"), and the header does not say so.
- When one of the `wedge-again` / `behind-paused` pair is not reached and the other was never sent, the NOTE goes through
  `notReachedNote` with the not-reached id alone, so the one never sent goes unnamed.

Recorded 2026-10-13 by fin41 (item N92) before the repair.

## Specs

- None: a harness fault. The scenario's header says each assertion reads what came back from the call the shape issued,
  and a refused send issued nothing.

## Relevant files

- `apps/desktop/scripts/lib/terminal-shapes.mjs` — `GATE_REFUSALS`, `reachedShape`, `shapeSends`, `notReachedNote`.
- `apps/desktop/scripts/lib/terminal-shapes.test.ts` — the selection's tests.
- `apps/desktop/scripts/live-run.mjs` — the header's scenario 8, the terminal docblock, and the wedge pair's NOTE.
- `packages/agent-tools/src/gate.ts` — the refusals settled before a call runs.

## Outcome

Repaired 2026-10-13 by fin41 (item N92), in the harness only. `GATE_REFUSALS` holds every refusal `gate.ts` settles before
a call runs: `todo_list_owed`, `invalid_request`, `plan_gate_withheld`, `write_scope_claimed` (listed though it never meets
a terminal call, so the set is the gate's whole list) and `hook_blocked`. `reachedShape` also reads `interrupted` with status
`blocked` (an approval withdrawn before the call ran) as not reached, and keeps `interrupted` with status `failed` (a call the
run cut while it ran) as reached. The scenario's header (scenario 8 and the terminal docblock) says a shape whose every send
the gate refused is a NOTE, and the wedge pair's NOTE goes through the new `pairNotReachedNote`, which names the member never
sent beside the one refused. Pinned by `apps/desktop/scripts/lib/terminal-shapes.test.ts`'s "the gate refusals that leave a
shape unasked, all of them (N92)" block, three cases red before the change. Not driven live: as the scenario stands none of
the added refusals can fire, so a live run shows the same terminal readings as before.
