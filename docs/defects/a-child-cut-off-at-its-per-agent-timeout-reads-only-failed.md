## A child cut off at its per-agent timeout reads only `failed`

When a delegated agent reaches `runtime.child_timeout`, REQ-ORCH-088's expiry path settles it `failed` with the error
"Child timed out after <N>s" (`packages/engine/src/children/orchestration.ts`, the settle). That error reaches the parent
model, the issue record and the timeline; no screen shows any of them. `AgentRecord` (`packages/contracts/src/children.ts`)
carries no end cause, so the delegation-tree row and the Mission table row read `failed` beside the delegation task, the
inspector's meta line reads `failed · … · N tool calls`, and the persona window's instance tab reads `failed`. Nothing on the
screen says the agent was stopped by a limit, what the limit was, or that Settings › Runtime › Delegation limits ›
Per-agent timeout ([`PD-CONFIG-003`](../product/directives.md#pd-config-003)) moves it — in minutes, in another view — although
the rulings that kept the 1200 s default (OQ-218, OQ-214) count on the person raising it.

Seen in the final duress live run at `a68f121` (session `e6747bd0`): the testers `wave3-verify-all` (`bg_dcecf655`, issue 14,
the parent's call `#248`) and its continuation `wave3b-finish-verification` (`bg_98fa54d7`, issue 19, the parent's call `#336`)
were each cut off at 1200 s while making progress, and each row read `failed` with nothing else (finding D2, Question 1). The
only cause a person could read was the summariser's text in the Library document (finding D9). Noticed by the R-072
consortium's question CN1 (OQ-234), raised by the D2 ruling; recorded on 2026-10-07 before its code, as the ruling asks.

## Specs

None contradicted: REQ-NOTIFY-100's report of the timeout is met by the error the report carries, and REQ-MONITOR-285 asks
only that the expiry be observable as the agent ending. The gap is that PD-CONFIG-003's relief has no pointer where the
failure shows. REQ-MONITOR-040, REQ-MONITOR-044, REQ-MONITOR-052 and REQ-MONITOR-069 list what a row, a presented agent, the
inspector and an instance tab carry, and none lists an end cause; PD-CONFIG-003 revision 3 extends them.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the settle that writes "Child timed out after <N>s" into the report.
- `packages/engine/src/children/cut-off.ts` — PD-ORCH-004's cut-off statement, the "while making progress" fact.
- `packages/contracts/src/children.ts` — `AgentRecordSchema`, with no end cause.
- `packages/engine/src/sessions.ts` — `toAgentRecord`, which reads the child row but not its stored report.
- `packages/ui/src/AgentTree.tsx`, `packages/ui/src/AgentTable.tsx`, `packages/ui/src/Inspector.tsx`,
  `packages/ui/src/PersonaWindow.tsx` — the four surfaces that show the agent `failed`.
- `packages/ui/src/settings/ConfigSettings.tsx` — the Per-agent timeout control the surfaces do not name.
