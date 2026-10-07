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

Confirmed on `c0a39ac` by `pnpm plan-gate-proof`'s new reading 2c (`notice-at-minimum`): at 1000x680 with REQ-NOTIFY-032's
persistent warning about another session on screen (97 px; the reading asserts the slot's text names
`ses_otherfailedsession` before it reads the plan), the gate stood 261 px and read
`plan-gate__header=24|plan-gate__body=19|plan-gate__preview-wrap=41|visually-hidden=1|plan-gate__todo=56|`
`plan-gate__changes-details=22|dialog-actions=41`. The plan was not the largest element of the gate. (Until 2026-10-06's
repair round this paragraph said the project setup's failure notice stood there with the warning queued behind it; it was
written from the reading's first pass, before the reading waited for the warning itself, and the bundle's verifier's run
on the base CSS went red at the plan check after that wait.)

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
  `.plan-gate__preview-wrap` (the plan's floor is 0), `.plan-gate__todo` (capped at `--rt-space-16`; it keeps its content height up to the cap),
  `.notice-slot` (the notice's height comes off the view).
- `packages/ui/src/PlanGate.tsx`: the gate's parts in order.
- `apps/desktop/scripts/plan-gate-proof.mjs`: reading 2c measures the gate at 1000x680 with a persistent notice.
- `apps/desktop/scripts/resilience-proof.mjs`: `auth-fallback-plan`, where the acceptance found it.

## Outcome — repaired 2026-10-06 (finacc2, bundle `finacc2-accept1-6`)

**The plan has a floor above the todo's cap; every other part keeps its content height; below the floor the gate
scrolls.** In `packages/ui/src/shell.css`:

- `.plan-gate__preview-wrap` takes `min-height: calc(var(--rt-space-16) + var(--rt-space-2))`, 72 px (was `0`). Every box
  is `border-box` (`docs/design/system/base.css`), so this is above the todo's `max-height: var(--rt-space-16)` (64 px),
  the answers' row (41) and the heading (24): the plan at its floor is taller than any of them can be. Its flex stays
  `1 1 auto`, so nothing changes while there is room: at the opening size the gate read 514 px, the plan 294 and the
  todo 56, before and after.
- **Edit mode's floor is the adopted `textarea.input` rule's**, 80 px (`docs/design/system/components.css`), also above
  the todo's cap. The field is a `textarea.input`, and `textarea.input` (specificity 0,1,1) outranks `.plan-gate__plan`
  (0,1,0), so a min-height on the class never governs: the `min-height: 0` it carried before did not, and neither did the
  72 px floor this repair first wrote there, which the bundle's verifier measured as 80 px in the built app. The class
  now carries no min-height. (The same rule's `resize: vertical` outranks the class's `resize: none` too, which only lets
  the user drag the plan taller; no requirement names it.)
- **The todo and every other part keep their content height** (`.plan-gate > * { flex: 0 0 auto; }`, unchanged), as
  PD-ORCH-002 revision 2 asks ("every other part of the gate is sized by its own content"). Below the plan's floor the
  gate scrolls, its three answers pinned to its floor as before (`.plan-gate__actions`, `position: sticky`).
- **While the revision field is open the plan's floor rises above it**, in both modes:
  `.plan-gate:has(.plan-gate__changes-details[open]) .plan-gate__preview-wrap, … .plan-gate__plan` takes
  `min-height: calc(var(--rt-space-24) + var(--rt-space-4))`, 112 px. Opened by its summary, the field stands at its default
  height: the summary's line (`--rt-text-xs` at `--rt-leading-body`, about 18 px), `--rt-space-1` and a `textarea.input` at
  the adopted 80 px, which scrolls rather than grows with what is typed, 102 px in all. That beat the plan's 72 (preview)
  and 80 (edit mode) at 1000x680 with or without a notice, on the ordinary path to Revise; the selector outranks
  `textarea.input`, so it governs edit mode too. The field stays at its content height and the gate scrolls.

*Corrected in place, 2026-10-06 (repair round 1 of the bundle).* The first form of this repair also gave the plan a basis
of 0 and let the todo yield first (`flex: 0 1 auto`) down to its label's line (32 px), so the gate scrolled only 7 px. The
bundle's verifier found that this chose between PD-ORCH-002's clauses where a layout keeping both exists (the plan at its
floor, the todo at its content, the gate scrolling with its answers reachable): the todo no longer yields and the basis is
`auto` again. That form's figures are kept in the table.

*Corrected in place, 2026-10-06 (repair round 2 of the bundle).* Round 1 left the revision field opened by its summary at
its default height among the parts with no bound, and the plan below it: the bundle's verifier read, in the built app on
round 1's form, `plan-gate__preview-wrap=72 | plan-gate__todo=56 | plan-gate__changes-details=102 | plan-gate__actions=41` at
1000x680 beside the warning, the gate scrolling 111 px, after one click on the summary with nothing typed or dragged. The
field at its default height is bounded, and a floor above it while it is open keeps both clauses, so it is repaired here
rather than asked; only a field the user drags taller is unbounded (below, and OQ-204).

Measured by `pnpm plan-gate-proof`'s reading 2c at 1000x680 beside REQ-NOTIFY-032's warning (97 px), as root under Xvfb,
Node 24, `--skip-build` after `pnpm build`:

| | gate | plan | todo | answers | gate scrolls |
| --- | --- | --- | --- | --- | --- |
| before (`c0a39ac`) | 261 | 41 | 56 | 41 | 0 |
| first form (todo yields; load about 4.8) | 261 | 72 | 32 | 41 | 7 px, answers each hit |
| round 1, the field opened in edit mode (round 1's form; load 5.1 to 6.1) | 261 | 80 (min-height `80px`); the open field 102 | 56 | 41 | red: the plan not the largest |
| round 1, the field opened in preview (the same launch) | 261 | 72; the open field 102 | 56 | 41 | red (the verifier's own reading: 111 px) |
| repaired, preview (round 2; load 5.1 at the start, 14.1 at the end, other agents on the host) | 261 | 72 | 56 | 41 | 31 px, answers each hit |
| repaired, edit mode (same launch) | 261 | 80 (the field's min-height read `80px`) | 56 | 41 | 39 px, answers each hit |
| repaired, the field opened in edit mode (same launch) | 261 | 112 (min-height `112px`); the open field 102 | 56 | 41 | 151 px, answers each hit |
| repaired, the field opened in preview (same launch) | 261 | 112 (min-height `112px`); the open field 102 | 56 | 41 | 151 px, answers each hit |

Layout figures do not depend on load; it is recorded because the runs shared the host. (Round 1's table put its repaired
rows at "load 0.7 to 1.4"; the run its figures came from read 1.1 at the start and 4.0 at the end. Round 2's run read the
same figures for those two rows.)

The reading asserts, in both modes, the plan the tallest child and the only one with a grow factor, no other part with a
shrink factor, and each of the three answers the element under its own centre; the edit-mode reading clicks
`plan-gate-toggle-edit` as a user does and waits for the size and the warning again. Two more readings follow in the same
launch: the revision field opened by a click on its summary in edit mode, then `plan-gate-toggle-preview` with the field
still open, each asserting the same. On the first form's CSS it went red:
`a part other than the plan yields below its content: ["plan-gate__todo"]`; on round 1's form the open-field reading
went red: `in edit mode with the revision field open at 1000x680 with a notice the plan is not the largest element of the
gate (plan min-height 80px, field min-height 80px): …plan-gate__plan=80|plan-gate__todo=56|plan-gate__changes-details=102…`.
At the open-field readings the gate scrolls to the field the summary focuses, so the plan, the largest part, stands above
the scrolled view while the user writes the changes; the answers stay pinned. `resilience-proof --only=auth-fallback`
passed after the repair; its `auth-fallback-plan` case (1000x680, the re-authentication bar, no notice) read the gate
296 px, the plan 76 and the todo 56, the floor not reached there. The acceptance's own case (the bar and a notice, the gate
199 px) is reasoned, not measured: the parts other than the plan take about 190 px with the gate's padding and gaps, so the
plan stands at its floor and the gate scrolls with its answers pinned.

Pinned by `packages/ui/src/plan-gate.test.ts` ("the plan stays the largest part when the window is short"): the preview's
floor above the todo's cap in resolved tokens; edit mode's field a `textarea.input` with no min-height of its own and the
adopted rule's floor above the todo's cap; the todo with no flex, shrink or min-height of its own; and no part of the gate
but the plan with a grow or a shrink factor; and, while the revision field is open, a floor for the plan in both modes above
the open field's default height computed from the adopted tokens and `textarea.input`'s floor, with the field closed in the
default markup. On `c0a39ac` the first two are red; on the first form the three are; on round 1's form the open-field case is.

The repaired note's claim is corrected in place:
`docs/defects/fixed/a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`, third repair round.

**What this does not settle.** Two parts of the gate are sized by content with no bound: the "You asked for" line of a
later cycle (`.plan-gate__prior`) and a revision field the user drags taller than its default (`resize: vertical`); the
field opened at its default height is bounded and repaired above. *(Round 1 read "the revision field once opened, which the
user can drag taller", which counted the open field at its default height among the unbounded parts.)*
On a short window either can stand taller than the plan's floor. PD-ORCH-002 revision 2 asks both that every other part
be "sized by its own content" and that the plan be the largest, and on such a window the two cannot both hold. This is
raised as **OQ-204** in `docs/architecture/open-questions.md`, with the reading the build proceeds under.

**Settled 2026-10-07 (fin28, bundle `fin28-window-gate-timeout`).** OQ-204 was ruled under the owner's delegation
([R-072](../../product/requests.md#r-072)) and recorded as [`PD-ORCH-002`](../../product/directives.md#pd-orch-002) revision 3:
"largest" holds against every part the product sizes. The "You asked for" line is now capped like the todo
(`max-height: var(--rt-space-16)`), scrolls inside itself and wraps an unbroken run; a revision field the user drags taller
keeps the user's height and may then stand taller than the plan, the one case where "largest" yields; a gate shorter than
its parts scrolls with its three answers pinned, as built. Pinned by the "caps a later cycle's 'You asked for' line" case
in `packages/ui/src/plan-gate.test.ts` and `pnpm plan-gate-proof`'s `revised-at-minimum` launch.
