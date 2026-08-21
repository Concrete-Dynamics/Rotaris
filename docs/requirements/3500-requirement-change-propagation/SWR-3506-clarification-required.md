---
req-id: SWR-3506
status: approved
trace: required
test: required
title: "An unclear change asks rather than guesses"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3506 — An unclear change asks rather than guesses

A requirement change can be ambiguous, self-contradictory, or a product decision
in disguise. An agent that picks an interpretation in those cases produces
confident, wrong software, and the wrongness surfaces long after the run.

Requirement: an outcome of `human clarification required` moves the requirement
to `Blocked` with the specific question stated — what is ambiguous, which two
readings are possible, and what each would imply. No units are created and no
code is changed until the question is answered. Answering it re-runs the
analysis.

## Acceptance criteria

- The block states a concrete question, not "unclear requirement".
- No execution unit and no run is created while the question is open.
- Answering the question re-runs the analysis and records both the question and
  the answer.
- The requirement's previous delivery record is untouched by the block.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Block creation with the question payload, the no-units guarantee, and the re-analysis on answer | The clarification path | `tests/unit/requirements/test_impact_outcomes.py` |
| Integration | A contradictory requirement change blocks with a question and unblocks after an answer | Analysis + delivery store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user writing a contradictory change is asked which reading is meant instead of getting arbitrary code | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
