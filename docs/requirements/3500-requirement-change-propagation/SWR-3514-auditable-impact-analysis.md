---
req-id: SWR-3514
status: approved
trace: required
test: required
title: "Impact analyses are auditable and reproducible"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3514 — Impact analyses are auditable and reproducible

Impact analysis is the one place where a model's judgement decides whether code
gets changed. That judgement has to be inspectable after the fact, or the
delivery record becomes "an agent decided something once".

Requirement: every impact, decomposition and migration analysis records its
inputs (requirement versions, diff, traces, tests, evidence), its outcome, its
reasoning, the persona and model that produced it, and its timestamp. The record
is retained with the requirement (SWR-3213), is shown where the outcome is acted
on, and is sufficient to re-run the analysis over the same inputs.

## Acceptance criteria

- Each analysis leaves exactly one record naming persona, model and inputs.
- The record is retrievable from the requirement's history.
- An outcome presented to the user links to the record that produced it.
- Re-running an analysis appends a record rather than replacing one.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Record shape and completeness, append-only behaviour, and the link from outcome to record | The analysis record | `tests/unit/requirements/test_analysis_records.py` |
| Integration | Two analyses of one requirement leave two retrievable records with their inputs | Analysis + audit store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user asks why Rotaris decided a change needed no code and reads the analysis that said so | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
