---
req-id: SWR-3222
status: approved
trace: required
test: required
title: "A requirement returns to Done only on a verification the ring also saw"
type: technical
derived-from: SWR-3221
epic: SWR-3200
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-propagation.md
---

# SWR-3222 — A requirement returns to Done only on a verification the ring also saw

Two rules in epic 3500 give a requirement its `Done` back, and both cost a
verification: a reworded requirement whose behaviour did not change (SWR-3504),
and a delivery whose evidence disappeared and came back (SWR-3513). Both consume
the `Reverifier` protocol, which had no implementation at all.

The obvious way to give it one is the wrong one. "Run this requirement's covering
tests and answer whether they passed" is a few lines, and it produces a second
measurement that nothing records — so a card can stand in `Done` on a suite run
the traceability ring never saw, next to a ring still reporting the last thing
anybody wrote down. The delivery axis and the evidence axis would then disagree
about the same requirement, silently, and the disagreement would be invisible
because each is individually correct about what it measured.

It would also be a way *around* SWR-3221. That requirement refuses to record a
verification whose commit is not reachable from the target branch, which is what
makes a unit worktree's green meaningless as requirement evidence. A second
verification path that answered a delivery-state question directly would grant
exactly the `Done` SWR-3221 exists to withhold.

Requirement: there is one measurement, read two ways.

- The verification the change package consumes **is** SWR-3221's pass. The same
  run produces the recorded artefact (SWR-3220) and the verdict the decision
  reads; neither is derived from the other afterwards.
- A requirement moved to `Done` by a reverification leaves an audit entry and a
  verification record naming **the same run and the same commit**. The state and
  the ring cannot report different last-known verdicts.

  Note which record that is *not*. The delivery keeps naming the run that
  delivered the version it recorded — a restore re-states the delivery that
  already stands rather than minting one (SWR-3204), so `satisfied.run_id` is the
  delivering run and stays so. "Which run delivered this version" and "which run
  last measured it" are two questions, and answering them with one field is how a
  restore would come to claim a delivering run that never happened.
- The reachability refusal is inherited rather than restated: a requirement the
  pass refused reads as *not verified*, carrying the pass's own reason. No
  caller can obtain a passing reverification for a commit SWR-3221 refused.
- A workspace that declares no check suite yields *not verified*, with a stated
  reason — never a pass. "Nobody checked" and "everything holds" stay two
  answers (SWR-3410).
- One suite run answers however many requirements ask in one pass. A rule
  restoring fifty requirements runs the workspace's tests once, not fifty times
  over the same tree.

## Acceptance criteria

- Every `Done` granted by a reverification has a stored verification for the same
  requirement, and the audit entry that granted it names that verification's run
  and commit; the delivery still names the run that delivered the version.
- A reverification of a requirement the pass refused does not pass, and names the
  refusal's own reason.
- A workspace with no configured checks produces no passing reverification.
- A pass in which several requirements are reverified runs the check suite once.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The two readings of one run, the inherited refusal, the no-suite answer, and the single-run guarantee | The reverifier | `tests/unit/requirements/test_reverification.py` |
| Integration | A requirement restored to Done after a real suite run carries a verification record for the run that restored it | Reverifier + verification store + delivery store | `tests/integration/test_requirement_change.py` |
| User-flow E2E | `N/A — mechanism; its product flows are SWR-3513's restore and SWR-3504's adoption` | — | — |

Derived from: [SWR-3221 — The verification pass](SWR-3221-verification-pass.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
