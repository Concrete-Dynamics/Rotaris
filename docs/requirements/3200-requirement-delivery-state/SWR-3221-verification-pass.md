---
req-id: SWR-3221
status: approved
trace: required
test: required
title: "The verification pass, and where a verification may be measured"
type: technical
derived-from: SWR-3220
epic: SWR-3200
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-board-evidence-axis.md
---

# SWR-3221 — The verification pass, and where a verification may be measured

A requirement started from the board runs in its own worktree (SWR-3405), and
several run in parallel in several worktrees (SWR-3406). A check suite that
passes in one of those trees says nothing about the others and nothing about the
branch they all land on: two requirements can each be green alone and red
together. A verification measured in a unit's worktree is therefore evidence
about that unit — which is exactly what SWR-3410 makes it — and **must not**
become the requirement's verification record.

Requirement: one pass produces verifications, it runs where the answer counts,
and the artefact refuses to be written anywhere else.

- The pass resolves the workspace's **own** configured check suite (SWR-2601) and
  runs it **once**, then attributes the result to every requirement whose
  covering tests that run executed (SWR-2606). One run, many records: running a
  suite per requirement would measure the same tree N times and answer no
  question the single run did not.
- It runs on the requirement's **target branch** checkout, never in a unit
  worktree. The branch is asked of the workspace rather than named, so a project
  that works on something other than its default branch is not silently measured
  in the wrong place (SWR-3419).
- A verification whose commit is not reachable from the target branch is
  **refused**, not recorded. That refusal is what makes the rule structural
  instead of conventional: a unit worktree's commit is unreachable until its work
  lands, so there is no code path that can promote one.
- Where the requirement's work never reached the target branch, no verification
  is recorded and the obligation stays `missing`. "Nobody checked" and
  "everything holds" remain two answers (SWR-3410's third criterion).
- The pass reports **per requirement** what it recorded and what it refused, with
  the reason — the same obligation SWR-3609 places on every bulk action.
- A workspace that declares no check suite yields an empty result and a stated
  reason, never an invented pass.
- The pass is the engine's, not the desktop's, and reachable without it — the
  desktop and a headless caller are two consumers of one seam, as SWR-3416
  licensed for runs.
- A run a user started by hand is untouched: it keeps SWR-2602's post-change
  verification in its own workspace and records no requirement verification. The
  distinction is drawn where the flow is composed, not by inspecting a run
  afterwards.

## Acceptance criteria

- One suite run produces records for every requirement whose covering tests it
  executed, and none for the requirements it did not cover.
- A verification offered with a commit unreachable from the target branch is
  refused, naming the precondition; a unit worktree's commit is such a commit.
- The pass names the target branch it measured, and no module in the lane names a
  branch literally.
- A workspace with no configured checks yields no records and a stated reason.
- The pass is callable in a process that imports neither the desktop package nor
  a Qt binding.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Attribution of one suite run across requirements, the unreachable-commit refusal, the no-suite case and the per-requirement report | The verification pass | `tests/unit/requirements/test_verification_pass.py` |
| Integration | Two requirements verified in two worktrees and landed one after the other: only target-branch verifications are recorded, and the first goes stale on the paths the second touched | Pass + git fixture + freshness + projection | `tests/integration/test_requirement_verification.py` |
| User-flow E2E | `N/A — mechanism; its product flow is SWR-3615's verification` | — | — |

Derived from: [SWR-3220 — A verification is recorded as one artefact](SWR-3220-verification-record-store.md)

Derived requirements: [SWR-3222 — A requirement returns to Done only on a verification the ring also saw](SWR-3222-one-measurement-two-readings.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
