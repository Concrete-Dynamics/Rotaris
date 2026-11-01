# Product-owner decisions on the architecture record — Structural rulings under the standing direction

Part 4 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in [the archive](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md), one index line each here: SR-1; SR-2; SR-3; SR-4; SR-5; SR-6.

## Structural rulings under the standing direction

The first three findings of that direction, ruled on 2026-08-31. Together they remove filesystem-mediated
communication from the product entirely. Files remain the system of record; they are no longer a transport.

- SR-1 — one running instance; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-1)
- SR-2 — a run this application does not own cannot be viewed; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-2)
- SR-3 — no polling; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-3)
- SR-4 — a database is the store for what only the application reads; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-4)
- SR-5 — a workspace held by another machine is refused, and that refusal is a safety feature; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-5)
- SR-6 — the export obligation covers every record a user could previously read for themselves; ruled; [archived](../../archive/architecture/owner-decisions/04-structural-rulings-under-the-standing-direction.md#sr-6)

---
