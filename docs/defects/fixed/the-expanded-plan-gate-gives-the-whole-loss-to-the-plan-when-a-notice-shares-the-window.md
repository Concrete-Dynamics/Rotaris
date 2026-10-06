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

## Outcome — repaired 2026-10-06 (finacc2, bundle `finacc2-accept1-6`)

Three rules in `packages/ui/src/shell.css` changed:

- **The plan has a floor above the todo's cap.** `.plan-gate__preview-wrap` and the edit-mode field `.plan-gate__plan`
  take `min-height: calc(var(--rt-space-16) + var(--rt-space-2))`, 72 px. Every box is `border-box`
  (`docs/design/system/base.css`), so this is above the todo's `max-height: var(--rt-space-16)` (64 px), the answers' row
  (41) and the heading (24). The plan at its floor is taller than any of them can be.
- **The plan's basis is 0** (`flex: 1 1 0`, was `1 1 auto`). The plan is the only part that grows, so while there is room
  it still takes all of it and nothing changes: at the opening size the gate read 514 px, the plan 294 and the todo 56,
  before and after. Below the floor the basis makes the floor a demand on the other parts, not what is left after them.
- **The todo yields first** (`flex: 0 1 auto`, was `0 0 auto` from `.plan-gate > *`), down to its padding and its label's
  line (`min-height: calc(2 * var(--rt-space-2) + var(--rt-space-4))`, 32 px). It already scrolls inside its cap. Only
  then does the gate scroll, with its three answers pinned to its floor as before.

Measured by `pnpm plan-gate-proof`'s reading 2c at 1000x680 beside REQ-NOTIFY-032's warning (97 px), as root under Xvfb,
Node 24, `--skip-build` after `pnpm build`, load about 4.8 on 4 CPUs:

| | gate | plan | todo | answers | gate scrolls |
| --- | --- | --- | --- | --- | --- |
| before (`c0a39ac`) | 261 | 41 | 56 | 41 | 0 |
| after | 261 | 72 | 32 | 41 | 7 px, answers each hit |

The reading asserts the plan the tallest child and the only one with a grow factor, and each of the three answers the
element under its own centre. `resilience-proof --only=auth-fallback` passed after the repair. Its `auth-fallback-plan`
case (1000x680, the re-authentication bar, no notice) read the gate 296 px, the plan 76 and the todo 56, the same as
before: the floor is not reached there. With the acceptance's case (the bar and a notice, the gate 199 px) the parts
other than the plan and the todo take about 165 px with the gate's padding and gaps, so the plan stands at its floor, the todo at its label, and the gate
scrolls with its answers pinned.

Pinned by `packages/ui/src/plan-gate.test.ts` ("the plan stays the largest part when the window is short"): the plan's
floor above the todo's cap in resolved tokens, the same floor in edit mode, the zero basis, the todo's `flex: 0 1 auto`
and its floor below the plan's, and no other part of the gate with a grow factor. Both cases are red on `c0a39ac`.

The repaired note's claim is corrected in place:
`docs/defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`, third repair round.

**What this does not settle.** Two parts of the gate are sized by content with no bound: the "You asked for" line of a
later cycle (`.plan-gate__prior`) and the revision field once opened, which the user can drag taller (`resize: vertical`).
On a short window either can stand taller than the plan's floor. PD-ORCH-002 revision 2 asks both that every other part
be "sized by its own content" and that the plan be the largest, and on such a window the two cannot both hold. This is
raised as **OQ-204** in `docs/architecture/open-questions.md`, with the reading the build proceeds under.
