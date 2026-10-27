# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: a card's next unit is provisioned at the claim

Part 12 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: a card's next unit is provisioned at the claim

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`](../../../defects/fixed/a-rejected-card-back-in-ready-can-never-start-its-next-unit.md).*

**One clause of the repair above is replaced, and kept above as written: "It never provisions: the queue's release
writes no worktree row, and REQ-TRACE-464 forbids a second tree."** It held for the card that repair was about — a
card released and resting in `ready`, whose unit a run-starting action had provisioned — and not for a card resting in
`ready` on a unit nothing provisioned. A reject (review → `ready`, not run-starting, REQ-TRACE-386) and a run ending
classified `cancelled` (a run stopped at its iteration limit persists `stopped`, which main's `outcomeOf` reads as
`cancelled`) both rest a card in `ready` after a run began, so its `Units` fact has moved and its next unit has no
tree. The launch the service held was the finished unit's: under `automatic` the scheduler named the card `next` on the
finished unit, the claim handed that launch out, main started a session in the rejected unit's kept tree, and
`requirements.run.started` was refused by `delivery_runs`' primary key, which also skipped `claimed.delete` and left the
card `next` holding a slot; under `manual` the queue's release found no row for the next unit and stated the stall.

Now the held launch of an earlier unit is **spent**: the scheduler names the card's current unit (`unitOfCard`), and the
claim never hands the finished unit out. Its disclosure carries to the next unit (it was given in this launch of the
application, REQ-TRACE-472); its tree stays where REQ-TRACE-423 keeps it, and a send-back's instructions do not carry.
**The claim provisions** the card's current unit when the store records no tree row for it at all — the system's
dispatch, under both modes; the queue's release only records the disclosure and arms — and writes the row at once
through the writer's new `recordWorktreeProvisioned` (`workspace/src/delivery/transition.ts`), so a restart before the
run starts takes the tree over rather than provisioning a second one (REQ-TRACE-464). A recorded row whose tree is gone
stays the stated stall. The read pass never provisions (REQ-TRACE-408), and neither does the reject (REQ-TRACE-389 and
REQ-TRACE-422 fix what it says it does to the worktree). `requirements.run.started` settles the claim whatever its write
does (pinned by a `delivery.test.ts` case whose start the primary key refuses: the next candidate takes the freed slot). A claim made before the first pass under `manual` with nothing armed answers `null` without parsing the store, so a
kick at a workspace open costs a `manual` workspace no parse. `requirements-runs-proof`'s eighth assertion shows it
against a real scratch repository: a reviewed card rejected, `runs.dispatch()`, and u2 runs on its own worktree beside
the kept u1.
