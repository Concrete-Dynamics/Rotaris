---
req-id: SWR-3204
status: approved
trace: required
test: required
title: "Satisfied hash records which specification version was delivered"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3204 — Satisfied hash records which specification version was delivered

"Done" without a version is a claim that decays silently: the requirement is
edited, the code stays as it was, and the board keeps showing green. Recording
*which* version was satisfied is what turns a later edit into visible work.

Requirement: a requirement that reaches `Done` stores the `current_hash`
(SWR-3107) it was delivered against as its `satisfied_hash`, together with the
run that delivered it, the verified commit and the timestamp. The comparison
`current_hash == satisfied_hash` is the product's definition of "the
implementation matches the specification"; a mismatch is the trigger for
SWR-3502.

## Acceptance criteria

- Reaching `Done` without a recorded hash is impossible.
- Previous satisfied hashes are retained, not overwritten, so the revision
  history of SWR-3214 can name which run delivered which version.
- A requirement never delivered has no satisfied hash, which is distinguishable
  from a satisfied hash that no longer matches.
- The stored hash is the source's hash at run start (the snapshot, SWR-3402),
  not the hash at the moment of acceptance.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Done records the snapshot hash; earlier satisfied hashes are retained; never-delivered is distinct from stale | The delivery record | `tests/unit/requirements/test_satisfied_hash.py` |
| Integration | A completed run through the delivery store leaves a satisfied hash equal to the snapshot's | Run completion + delivery store | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | `N/A — its user-visible half is the Needs Update badge (SWR-3502, SWR-3304)` | — | — |

Derived requirements: [SWR-3219 — A satisfied delivery names its origin](SWR-3219-satisfied-delivery-origin.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
