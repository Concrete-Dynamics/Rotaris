---
req-id: SWR-3207
status: approved
trace: required
test: required
title: "Evidence health projection"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3207 — Evidence health projection

The board must be able to say, for one requirement, whether its evidence is
present, current and passing — without the user reading a log. The inputs
already exist: ReqToCode's coverage query (SWR-2336) knows the sites, the
completion verifier's requirement evidence (SWR-2606) knows which covering tests
ran and with what result, and the run history knows what executed.

Requirement: a projection computes, per requirement and per obligation, one of
`satisfied`, `stale`, `failed` or `missing`, together with the inputs it was
derived from. `satisfied` requires evidence that exists *and* was verified;
evidence that exists but was not re-verified since the last relevant change is
`stale`, not `satisfied`; a failing covering test is `failed` even when
traceability is complete.

## Acceptance criteria

- A requirement with complete traces and a failing test projects `failed`, not
  `satisfied`.
- A requirement whose covering test exists but never ran projects `stale`.
- A requirement with no covering test and a `test: required` obligation projects
  `missing`, naming the requirement.
- The projection is pure over its inputs and independently testable without a
  repository.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each obligation state is produced from crafted inputs, including complete-but-failing and present-but-unrun | The projection function | `tests/unit/requirements/test_evidence_health.py` |
| Integration | The projection over this repository's store and a real verifier report agrees with the verifier's own evidence | Projection + ReqToCode + verifier evidence | `tests/integration/test_requirement_evidence_health.py` |
| User-flow E2E | `N/A — its product flow is the ring's colours (SWR-3305)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
