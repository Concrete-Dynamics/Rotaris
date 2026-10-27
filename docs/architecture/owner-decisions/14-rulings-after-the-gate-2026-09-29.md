# Product-owner decisions on the architecture record — Rulings after the gate — 2026-09-29

Part 14 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Rulings after the gate — 2026-09-29

*Ruled together under [R-067](../../product/requests.md#r-067). The owner was asked to rule eight open decisions as
recommended and chose "Accept all eight (Recommended)". ESC-42 is ruled above, in its own entry. The other seven are
recorded where each was raised, and are listed here so that one place names all eight.*

- **The status a graceful stop persists — `paused`, as built.** `PD-ORCH-005` revision 5 (clause 21) names
  `REQ-SESSION-186` among what it narrows, with `REQ-SESSION-073`, whose vocabulary glosses `stopped` with the user's
  stop; recorded under OQ-96 in `open-questions.md`.
- **A cancel in flight when the host died — clause 3 governs.** The explicit cancel is made durable when it is accepted,
  and the next repair or continue ends its agents `cancelled`; recorded under OQ-103.
- **REQ-LIBRARY-092's fallback — only for a record with no task id.** Raised and ruled as OQ-113, answered by amending
  `REQ-LIBRARY-092`.
- **`delegate`'s `session_id` — the caller's own settled child, resumed from its record.** OQ-66's open part, ruled by
  `PD-ORCH-005` revision 5 (clause 22) and `PD-TOOLS-006` revision 3.
- **The two retry layers — as the specification states them.** Raised and ruled as OQ-110; the 2026-09-22 row of
  `first-executions.md` is corrected in place.
- **What the child-report summariser reads — the start and the most recent part, and the report's deterministic
  facts.** Raised and ruled as OQ-111.
- **A `write_scope` for a persona with no file-writing tool — refused.** Raised and ruled as OQ-112, by `PD-TOOLS-006`
  revision 3.

**What these rulings do not do.** They build nothing. Each ruling's repair is owed to the defect note it settles or
names, and reports its first execution into the record that decided it.
