# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: an automatic queue resumes at a workspace open

Part 13 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: an automatic queue resumes at a workspace open

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md`](../../../defects/fixed/an-automatic-queue-starts-nothing-after-a-launch-until-something-kicks-the-dispatch.md).*

**The clause "Nothing dispatches when the application launches, so the pick-up waits for the first kick" (the second
round of the repair of a card resting in `ready`) is replaced, and kept above as written.** It described the build and
named the gap; REQ-TRACE-476 ("The queue SHALL resume where it stopped") and REQ-TRACE-482 ("the system itself picks up
the next candidate as capacity becomes available") leave no reading in which a relaunch waits for a person. Main's
post-open slot now kicks the coordinator once per workspace open, after the window is interactive, through
`requirementsRuns.opened(root, workspaceId)`: a dispatch for the workspace just opened, not for the most recently focused
window. The coordinator's dispatches are serialised per workspace root, so a kick for one workspace is never swallowed by
another's in flight. The board's first read is not the placement (REQ-TRACE-408: a read creates no execution unit;
REQ-TRACE-512: nothing starts on its own initiative from opening the view). The claim's parse runs in the workspace
service, off main's thread, and a `manual` workspace with nothing armed is answered without one (the claim's guard, from
the repair before). A sibling gap of the same shape is closed with it: under automatic scheduling the board now kicks the
coordinator after an act that rests a card in `ready` without starting a run, a `reject` chiefly (`dispatchesAfter`).
`requirements-proof`'s `ready-restart-automatic` stage shows it across a quit and a relaunch of the built app.
