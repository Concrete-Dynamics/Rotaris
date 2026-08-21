---
req-id: SWR-3219
status: approved
trace: required
test: required
title: "A satisfied delivery names its origin"
type: technical
derived-from: SWR-3204
epic: SWR-3200
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-adoption.md
---

# SWR-3219 — A satisfied delivery names its origin

`SatisfiedDelivery` records which specification version was delivered, by which
run, verified at which commit. Until now there was only one kind of answer: a
Rotaris execution run implemented it. Adoption (SWR-3217) produces a second kind
— a verification run confirmed work that was already there — and a card that
presented the two identically would imply an implementing run that never
happened.

The same question arrives again from outside: a requirement read from an issue
tracker may carry that system's own notion of being finished (SWR-3118). That is
a third kind of answer to *the same* question — where does this claim come from —
and answering it three times in three vocabularies is how a model drifts.

Requirement: a satisfied delivery names its origin, from a closed set that covers
all three cases from the start.

- `rotaris` — a Rotaris execution run delivered it. The default, and what every
  existing record means.
- `adopted` — a Rotaris verification run confirmed an implementation Rotaris did
  not write (SWR-3217).
- `external` — a requirement source reported it (SWR-3118). Part of the
  vocabulary now so a later adapter extends nothing; no code produces it yet.
- The origin is a property of the *claim*, never a second delivery state and
  never an input to a transition's legality beyond the adoption door SWR-3218
  describes.
- Records written before this field existed read back as `rotaris`, because that
  is what they were, and the store keeps accepting them unchanged.
- Every surface that shows a delivery — the card, the revision history panel
  (SWR-3313), the audit trail — states the origin where it states the run, so
  "delivered by run 72" and "adopted from verification" are never confusable.

## Acceptance criteria

- The set is closed and round-trips through the delivery store.
- A record persisted without an origin loads as `rotaris` and is not rewritten
  merely by being read.
- An adopted delivery renders differently from a delivered one wherever a run is
  named.
- The origin never appears among the inputs to `derive_health` or to the
  completion conditions.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each origin round-trips; a legacy record without one reads as `rotaris`; the summary distinguishes them | `SatisfiedDelivery` + the store payload | `tests/unit/requirements/test_delivery_store.py` |
| Integration | An adopted and a delivered requirement in one store keep their origins across a reload | Delivery store | `tests/integration/test_requirement_adoption.py` |
| User-flow E2E | `N/A — model field; its product flow is the adopted card of SWR-3217` | — | — |

Derived from: [SWR-3204 — Satisfied hash](SWR-3204-satisfied-hash.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
