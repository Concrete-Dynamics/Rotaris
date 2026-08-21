---
req-id: SWR-3504
status: approved
trace: required
test: required
title: "A change without behavioural impact is re-verified, not re-implemented"
epic: SWR-3500
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3504 — A change without behavioural impact is re-verified, not re-implemented

When the analysis concludes that behaviour is unchanged, the correct action is
not "do nothing" — the satisfied hash still points at the old text, so the board
would keep reporting work that does not exist. It is also not "trust the
analysis": the claim that nothing changed is worth exactly as much as the
verification that follows it.

Requirement: an outcome of `no behavioural impact` triggers a verification of
the existing implementation against the new requirement version. If verification
passes, the new hash is adopted as `satisfied_hash`, the requirement returns to
`Done`, and the adoption is recorded with the verifying run. If verification
fails, the requirement stays in `Needs Update` and the failure becomes the input
to a new analysis.

## Acceptance criteria

- The hash is adopted only after a passing verification, never on the analysis
  alone.
- Adoption records which run verified it and against which commit.
- A failing verification does not adopt the hash.
- No agent code change is started for this outcome.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Adoption gated on verification, the failure path, and the recorded verifier run | The adoption rule | `tests/unit/requirements/test_impact_outcomes.py` |
| Integration | A reworded requirement over a passing suite adopts its new hash and returns to Done | Analysis + verification + delivery store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user rewords a delivered requirement and the board returns to done after a verification, with no code change | Public product boundary → user-observable result | `tests/integration/test_requirement_impact.py` |

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
