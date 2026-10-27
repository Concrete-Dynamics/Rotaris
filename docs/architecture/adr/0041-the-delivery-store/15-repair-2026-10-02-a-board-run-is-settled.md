# ADR-0041 — The delivery store is per-requirement rows in the workspace database, behind a capability-split handle — Repair — 2026-10-02: a board run is settled against its own workspace

Part 15 of 16 of [ADR-0041](../0041-the-delivery-store.md), which indexes every part.

## Repair — 2026-10-02: a board run is settled against its own workspace

*Reported back in place, under CLAUDE.md's standing policy, by the repair of
[`a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md`](../../../defects/fixed/a-board-run-is-settled-against-the-focused-windows-workspace-not-its-own.md).*

Part AP's second execution has main's coordinator settle "the row from the run host's own terminal event (REQ-TRACE-477)"
and mark a run waiting on a person from its snapshots. It addressed both, the dispatch after a run's end and the run host's
exit reap, to the most recently focused window's workspace, which is the run's own only while one workspace is open. Now
the coordinator keeps each board run's workspace root and id, and addresses that workspace's service; the run host's exit
reaps every workspace that held a run, beside the focused one. `requirements-runs.test.ts` pins it with two workspaces and
the focus moved to the other; `requirements-runs-proof` has no two-window stage.
