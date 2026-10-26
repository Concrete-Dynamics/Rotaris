## A root's stuck corrective follows a child's report after an empty turn

A root that delegates a background child and then ends its turn with neither text nor a call arms REQ-ORCH-096's stuck trigger.
The root is not idle — its child is pending — so `IterationChildren.runWithChildren` asks no follow-up of the run's own (no
`PD-ORCH-009` answer re-prompt, no REQ-ORCH-078 plan correction) and waits. When the child ends, the root is resumed with the
report, and that turn's first step takes the pending trigger: a stuck classification is asked and the corrective ("Pause and
reassess …") follows the report in the same request, with one stuck `loop_supervisor_activation` for the root. Two instructions
where the root was given one, after a silence that was the root waiting for what it delegated. Confirmed by test before this
note was written (`children.test.ts`, "as found: a root silent while its background child runs is resumed with the report, and
the stuck corrective follows the report"). Noticed 2026-10-14 by fin44 (`fin44-supervision-and-match`) measuring the route
[OQ-284](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-284)'s ruling set aside; raised as
[OQ-296](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296). Not repaired: whether the report replaces the corrective is the ruling's.

## Specs

REQ-ORCH-096 makes every empty reply with no call a stuck report and REQ-ORCH-104's stuck-mode clause recovers it "ALWAYS";
REQ-ORCH-055..059 resume the parent with its children's reports. `PD-ORCH-009` revision 4 withdraws the stuck trigger for three
follow-ups of the run's own (the answer re-prompt, a child's REQ-ORCH-095 re-prompt, the plan correction) and names this one as
unchanged. No requirement says whether a parent's silence while it waits on a child is a stuck report.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — `IterationChildren.runWithChildren`: the follow-up asked only once no child
  is pending; the report message that resumes the parent.
- `packages/engine/src/run/turn.ts` — `observeStuck()` on an empty reply with no call; `check()` at the next turn's first step.
- `packages/engine/src/children/children.test.ts` — the case that pins it as found.

## Outcome

**Repaired 2026-10-14 by fin45 (`fin45-supervision-and-quit`)** under [OQ-296](../../architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296)'s
ruling ([R-072](../../product/requests.md#r-072)), recorded as [`PD-ORCH-009`](../../product/directives/pd-orch-009.md#pd-orch-009) revision 5,
case (d): a parent's turn that ends with neither text nor a call while a child of its is pending or ended unobserved is
REQ-ORCH-055's wait and no stuck report. `IterationChildren.runWithChildren` (`packages/engine/src/children/orchestration.ts`)
calls `withdrawStuck()` on the parent's supervisor as it takes the parent into that wait, so the children's reports are the only
message the run adds for that turn; a repetition, cycle or raw-count trigger is kept and the consecutive count is not reset.
**Pinned by** `children.test.ts`, "PD-ORCH-009 revisions 4 and 5": the as-found case named above, flipped (the report ends the
resumed request, no classification, no activation), a root waiting silently over three batches that completes with no escalation,
a delegated child waiting silently on its own background child, and the answer re-prompt still owed to a root silent with nothing
pending — all four red on `ee586d3`; and by `pnpm part-h-proof`'s `silent-wait` launch (0 stuck activations, 0 escalations, the
session `completed`), which on a build without the call ended `failed` / `agent_session_aborted` after three stuck activations.
**Not shown:** a live run (the orchestrator's).
