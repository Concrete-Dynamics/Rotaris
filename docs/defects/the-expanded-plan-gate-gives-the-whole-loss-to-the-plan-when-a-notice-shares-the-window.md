## The expanded plan gate gives the whole loss to the plan when a notice shares the window

At REQ-SHELL-022's minimum window, 1000x680, a persistent notice in the window's notice slot takes about 97 px off the
Workspace view, and so off the expanded plan gate's row. Every child of the gate is `flex: 0 0 auto` except the plan's own
text (`.plan-gate__preview-wrap`, `flex: 1 1 auto; min-height: 0`), and the implied todo keeps its content height up to its
`--rt-space-16` cap. So the whole loss falls on the plan, which shrinks to its padding while the todo keeps 56 px and the
answers 41.

Found by finacc2's acceptance round 1 (finding A2), run 1 of `resilience-proof`'s `auth-fallback-plan`, at 1000x680 with the
re-authentication bar and a "Session … failed" notice standing: `plan-gate__header=24|plan-gate__body=19|`
`plan-gate__preview-wrap=18|visually-hidden=1|plan-gate__todo=56|plan-gate__changes-details=22|dialog-actions=41`, the gate
112,281,868,199. The re-run without the notice measured the gate 296 px and the plan 76. Repairing A1 removed that
proof's notice, but not the layout case: any persistent notice does the same, a legitimate REQ-NOTIFY-032 warning about
another session included.

Confirmed on `c0a39ac` by `pnpm plan-gate-proof`'s new reading 2c (`notice-at-minimum`): at 1000x680 with the project
setup's persistent failure notice on screen (97 px; this host has no code-intelligence bundle, and REQ-NOTIFY-032's
injected warning queued behind it), the gate stood 261 px and read
`plan-gate__header=24|plan-gate__body=19|plan-gate__preview-wrap=41|visually-hidden=1|plan-gate__todo=56|`
`plan-gate__changes-details=22|dialog-actions=41`. The plan was not the largest element of the gate.

This contradicts a repaired note's claim. `docs/defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`
(third repair round) says the gate's row "takes the rest at every size from REQ-SHELL-022's minimum up" and that the plan
is the largest part of the gate. It records "the plan 18" as the red before that repair. The same 18 px comes back whenever
a notice shares the window.

## Specs

- **PD-ORCH-002 revision 2** (over REQ-ORCH-153): expanded, the plan's own text "SHALL be the largest element of the
  surface and the only element that grows with it: every other part of the gate is sized by its own content". At the
  minimum with a notice, the todo and the answers are each taller than the plan.
- **REQ-SHELL-022**: 1000x680 is the minimum the shell supports. The case is at that minimum, not below it, since a
  notice is part of the window at every size.

## Relevant files

- `packages/ui/src/shell.css`: `.plan-gate > * { flex: 0 0 auto; }` (every part keeps its content height),
  `.plan-gate__preview-wrap` (the plan's floor is 0), `.plan-gate__todo` (capped at `--rt-space-16` but never yields),
  `.notice-slot` (the notice's height comes off the view).
- `packages/ui/src/PlanGate.tsx`: the gate's parts in order.
- `apps/desktop/scripts/plan-gate-proof.mjs`: reading 2c measures the gate at 1000x680 with a persistent notice.
- `apps/desktop/scripts/resilience-proof.mjs`: `auth-fallback-plan`, where the acceptance found it.
