---
req-id: SWR-3615
status: approved
trace: required
test: required
title: "A user can verify without delivering"
epic: SWR-3600
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-board-evidence-axis.md
---

# SWR-3615 — A user can verify without delivering

Every other way a verification comes about is attached to something else: a
delivery lands one, an adoption produces one, a reworded requirement triggers one
(SWR-3504). None of that helps the ordinary case — a colleague deleted a test, a
refactor moved a trace, a dependency bump turned a suite red — where the
requirement did not change, nothing was delivered, and the board's evidence is
simply older than the repository.

Requirement: a user can ask Rotaris to verify, and the board records what the
verification found.

- Verification is **offered, never performed unasked** — the discipline SWR-3613
  and SWR-3614 already hold. Opening a workspace, reading the board and switching
  a grouping axis all verify nothing.
- Before it starts, the action states what it will do: that it runs this
  workspace's own configured check suite, once, and roughly what that costs. A
  user is never surprised by a multi-minute action they did not know they asked
  for.
- It reports **per requirement** what was recorded and what was not, with the
  reason — SWR-3609's obligation on every bulk action, satisfied rather than
  bypassed.
- Verifying writes a verification (SWR-3220). It writes **no** delivery record and
  moves **no** card: a green suite is evidence, not a decision, and turning
  evidence into `Done` remains the completion gate's job (SWR-3215) reached
  through adoption or a run.
- It runs off the UI thread and leaves the board usable while it runs; a failure
  is reported and leaves the previous evidence in place.
- A requirement in any delivery state may be verified, `Backlog` included — that
  is how a user learns that something is already finished before deciding to
  adopt it.

## Acceptance criteria

- Nothing verifies until the user asks; opening and reading the board write no
  verification.
- The offer states the suite and the cost before the run starts.
- A completed verification reports one line per requirement, naming those it
  could not record and why.
- A verification moves no card and writes no delivery record, whatever the suite
  said.
- A verification of a `Backlog` requirement is accepted and changes its ring, not
  its column.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The offer's wording and counts, the per-requirement report, and the guard that a verification writes no delivery record | The controller and the action | `apps/rotaris/tests/test_requirements_verification.py` |
| Integration | A verification over a workspace records evidence and leaves every delivery record untouched | Action + verification store + delivery store | `tests/integration/test_requirement_verification.py` |
| User-flow E2E | A user verifies an unchanged workspace and the board's rings stop being uniformly incomplete | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_verification.py` |

Derived requirements: [SWR-3620 — Adoption and verification report progress to whoever started them](SWR-3620-a-pass-reports-progress-to-its-host.md)

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
