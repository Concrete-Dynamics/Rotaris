## An automatic queue starts nothing after a launch until something kicks the dispatch

Main's run coordinator claims from the scheduler only when `dispatch()` is called. Nothing calls it when the application
launches or a workspace opens. Its only callers are the renderer (after a run-starting board move, or after a queue
release, start, automatic switch or concurrency change) and the coordinator itself (after a board run ends). So, after a
relaunch, a workspace with automatic scheduling on and candidates in `ready` starts nothing on its own. The cards wait
until a person acts on the board or the queue, or a run ends.

That includes the cards the restart recovery now makes claimable. Since 2026-10-02 the delivery service rebuilds the
launch of a card resting in `ready` (`recoverLaunch`), and main's claim carries its standing disclosure. A claim would
therefore take such a card, but no claim is made. `requirements-runs-proof`'s seventh assertion calls `runs.dispatch()`
itself, standing in for the kick. The built app has no such kick at launch.

Noticed while repairing `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` (bundle `fin7-queue-and-roles`,
repair round 1). Recorded, not repaired: a dispatch at workspace open asks the service for a claim, and so parses the
requirement store at every open of every workspace. Where that belongs (main's workspace open, the service's first pass,
or the board's first read) is a design choice, and the startup budget bears on it.

## Specs

- `REQ-TRACE-482`: with automatic scheduling enabled, "the system itself picks up the next candidate as capacity becomes
  available". After a relaunch, capacity is available and a candidate is in `ready`, but nothing picks it up until a
  person acts.
- `REQ-TRACE-478`: the queue is the scheduler's own order. It names a candidate `next` that nothing dispatches.

## Relevant files

- `apps/desktop/src/main/requirements-runs.ts`: `dispatch()`, the only path from a scheduler offer to a run; its
  callers are the `op: 'dispatch'` command and the `run.result` handler.
- `apps/desktop/src/main/index.ts`: `openWorkspaceInner`, the workspace open; it starts the service and kicks no
  dispatch.
- `packages/ui/src/requirements/RequirementsView.tsx`: `perform` and `queueSet`, the renderer's two `dispatchRuns()` calls.
- `apps/desktop/src/workspace-service/delivery.ts`: `recoverLaunch` and `claim`, which take the card once a claim is made.
- `apps/desktop/src/main/requirements-runs.proof.test.ts`: the seventh assertion, which kicks the dispatch itself.
