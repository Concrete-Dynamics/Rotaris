---
req-id: SWR-3220
status: approved
trace: required
test: required
title: "A verification is recorded as one artefact"
type: technical
derived-from: SWR-3208
epic: SWR-3200
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-board-evidence-axis.md
---

# SWR-3220 — A verification is recorded as one artefact

SWR-3208 defines what a verification record says — verdict, commit, requirement
hash, run. SWR-3207 projects `verification` from it, and `verification` is a
required obligation for every requirement type. But nothing in the product ever
*keeps* one: `EvidenceInputs.verification` is `None` on every board of every
workspace, so `Incomplete Traceability` is the only health a requirement can
reach and the traceability ring carries no information at all.

Storing the record alone would not fix it. SWR-3209 decides whether evidence is
still current by comparing today's repository against **what the verification
saw**, and SWR-3207 can only call the test obligation satisfied if it knows
**which covering tests that run actually executed**. A record without those two
is a verdict nobody can date and nobody can trust a second time.

Requirement: one verification is persisted as one artefact, and it carries
everything the evidence projection needs to answer both questions later.

- The artefact holds the verdict record (SWR-3208), the freshness baseline it was
  measured against — verified commit, requirement hash, implementation sites and
  covering-test sites as they stood (SWR-3209) — and the per-covering-test
  outcome of that run: whether it executed, under which check, with which status
  (SWR-2606). The three are written and read together; a partial artefact is a
  read error, not a degraded one.
- It names its origin: a Rotaris run, an adoption (SWR-3217), or an external
  reporter. The third exists so a CI reporter docks onto the vocabulary rather
  than replacing it, in the same way `DeliveryOrigin` reserved `external` for a
  source adapter (SWR-3219).
- It is persisted under `<workspace>/.rotaris/requirements/`, keyed by
  requirement id, written atomically and carrying a schema version — SWR-3205's
  rules, in a store of its own beside the delivery store.
- **It is not part of the delivery record.** A verification may exist for a
  requirement that is still in `Backlog`, and putting it on the delivery record
  would force a delivery record into existence for a requirement nothing
  delivered, which SWR-3201 forbids. The delivery store answers what Rotaris'
  delivery did; this one answers what was measured.
- Only the **last** verification is kept. SWR-3208 asks for *the* last
  verification, the audit trail (SWR-3213) already keeps the sequence, and a
  second history here would be a third truth about the same events.
- Reading a workspace never writes one. Projecting a board never writes one.

## Acceptance criteria

- A verification round-trips through the store with its verdict, its baseline and
  its per-test outcomes intact, and an artefact missing the baseline is reported
  as unreadable rather than loaded without one.
- A record written by a newer schema version is reported, not reinterpreted; an
  unreadable file costs its own requirement and no other.
- A requirement in `Backlog` can carry a verification, and doing so writes no
  delivery record.
- A projection over a workspace with verifications writes no file.
- An artefact written without an origin reads back as a Rotaris one.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Round-trip, the partial artefact, schema versioning, per-record isolation of a corrupt file, and the default origin | The verification store | `tests/unit/requirements/test_verification_store.py` |
| Integration | A verification recorded for a `Backlog` requirement leaves the delivery store empty and reaches the projection | Verification store + delivery store + projection | `tests/integration/test_requirement_verification.py` |
| User-flow E2E | `N/A — mechanism; its product flow is SWR-3615's verification` | — | — |

Derived from: [SWR-3208 — Evidence details are concrete and navigable](SWR-3208-evidence-detail-records.md)

Derived requirements: [SWR-3221 — The verification pass](SWR-3221-verification-pass.md)

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
