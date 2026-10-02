## A board run is settled against the focused window's workspace, not its own

Main's board-run coordinator (`apps/desktop/src/main/requirements-runs.ts`) keeps no workspace root for the runs it
starts. When the run host's terminal `run.result` arrives, it sends `requirements.run.ended` to the service of
`deps.currentWorkspace()`, and a `publish.snapshot` that flips a run's waiting-on-a-person fact sends
`requirements.run.waiting` there too; the dispatch that follows a run's ending claims from it as well. `currentWorkspace`
is the most recently focused main window's workspace (`activeWindow()` in `apps/desktop/src/main/index.ts`;
`MainWindows.active()` in `main-windows.ts`), not the workspace the run was started for. With two windows on two
workspaces, a board run of A that ends while B's window is focused sends `run.ended` to B's service, which answers "No
running unit is recorded for session …"; A's card stays `running` until a restart's reap reports it interrupted, and the
next candidate of A is not picked up. A run of A that starts waiting on a person while B is focused is marked on nothing.
The run host's exit reaps only the focused window's workspace, so the runs of the other are left `running` until a
restart. Found by code reading on 2026-10-02 (the fifth triage of the open defect notes, on origin/main `c1381f5`), and
recorded before any repair by bundle `fin9-queue-dispatch-and-disclosure`.

**Outcome — repaired 2026-10-02 (bundle `fin9-queue-dispatch-and-disclosure`).** `runs` in
`apps/desktop/src/main/requirements-runs.ts` keeps each board run's workspace root and id, written at its start. The
`run.result` handler sends `run.ended` to that root's service and dispatches for that workspace after it; the
`publish.snapshot` handler sends `run.waiting` there; the run host's exit reaps every root that held a run, beside the
focused window's. Pinned by a case in `requirements-runs.test.ts` with two workspaces and the focus moved to the other
mid-run (the waiting fact, the ending and the next claim all addressed `C:\ws` while `D:\other` held the focus; the exit
reaped `C:\ws`), red on the coordinator before. `requirements-runs-proof` has no two-window stage, so the unit test
carries it. ADR-0041 records it in "Repair — 2026-10-02: a board run is settled against its own workspace".

## Specs

- `REQ-TRACE-477`: "a flow that terminates on its worker SHALL deliver its ending to the same surface that was told it
  began". The ending is delivered to another workspace's service, which has no record of it.
- `REQ-TRACE-466`: a run waiting on a person is shown so on its card. The fact is sent to the wrong workspace.
- `REQ-TRACE-476`: a run is reported running only while its process is alive. A's card reads `running` after its run
  ended, until a restart.
- `REQ-TRACE-482`: the next candidate is picked up as capacity becomes available. The dispatch after A's run ends claims
  from B.

## Relevant files

- `apps/desktop/src/main/requirements-runs.ts`: `runs` (the live board runs, keyed by session, with no workspace), the
  `run.result` and `publish.snapshot` handlers and the run host's exit, each reading `deps.currentWorkspace()`.
- `apps/desktop/src/main/index.ts`: the coordinator's wiring, whose `currentWorkspace` is `activeWindow()`'s.
- `apps/desktop/src/main/main-windows.ts`: `active()`, the most recently focused main window.
