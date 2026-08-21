---
req-id: SWR-3503
status: approved
trace: required
test: required
title: "Agentic impact analysis of a requirement change"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3503 — Agentic impact analysis of a requirement change

A text change is not a behaviour change. Fixing a typo, rewording a sentence or
adding documentation must not cost an agent run and a code change; changing an
acceptance criterion must. Only a reading of both versions can tell the two
apart.

Requirement: a changed requirement that was already delivered is analysed
against the diff between its satisfied version and its current version, and the
analysis yields exactly one outcome from `no behavioural impact`,
`tests affected`, `implementation affected`, `implementation and tests
affected`, `decomposition required` and `human clarification required`. The
analysis receives the requirement diff, the existing traces and tests, and the
evidence health, and states its reasoning.

## Acceptance criteria

- The outcome is one of the six; an analysis that cannot decide yields `human
  clarification required` rather than guessing.
- The reasoning and the inputs are recorded (SWR-3514).
- Analysis never edits code, tests or the requirement source.
- An analysis failure leaves the requirement in `Needs Update` with the failure
  stated, not in an invented state.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Outcome parsing and validation, the undecidable fallback, and the read-only guarantee | The analysis result | `tests/unit/requirements/test_impact_analysis.py` |
| Integration | A scripted analysis over a whitespace-only diff and over a criterion change yields the two expected outcomes | Analysis + change detection | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user fixes a typo in a delivered requirement and Rotaris does not start a code change for it | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
