## An automatic queue starts nothing after a launch until something kicks the dispatch

Main's run coordinator claims from the scheduler only when `dispatch()` is called. Nothing calls it when the application
launches or a workspace opens. Its only callers are the renderer (after a run-starting board move, or after a queue
release, start, automatic switch or concurrency change) and the coordinator itself (after a board run ends). So, after a
relaunch, a workspace with automatic scheduling on and candidates in `ready` starts nothing on its own. The cards wait
until a person acts on the board or the queue, or a run ends.

That includes the cards the restart recovery now makes claimable. Since 2026-10-02 the delivery service rebuilds the
launch of a card resting in `ready` (`recoverLaunch`), and main stamps its standing disclosure on every command it sends
the service. The queue therefore names such a card `next`, and a claim would take it, but no claim is made. `requirements-runs-proof`'s seventh assertion calls `runs.dispatch()`
itself, standing in for the kick. The built app has no such kick at launch.

Noticed while repairing `a-card-resting-in-ready-across-a-restart-can-never-be-started.md` (bundle `fin7-queue-and-roles`,
repair round 1). Recorded, not repaired: a dispatch at workspace open asks the service for a claim, and so parses the
requirement store at every open of every workspace. Where that belongs (main's workspace open, the service's first pass,
or the board's first read) is a design choice, and the startup budget bears on it. The outcome below makes it.

**Amended 2026-10-02 (fifth triage of the open notes, by code reading on origin/main `c1381f5`).** A sibling gap of the
same shape: under `automatic`, an accepted act that lands a card in `ready` without starting a run — a `reject` from
review, chiefly — is followed by no dispatch either. `perform` in `RequirementsView.tsx` dispatches only after a
run-starting move (`moveStartsRun`), so the rejected card waits in `ready`, named `next`, until a person acts again or
another run ends. REQ-TRACE-476 ("The queue SHALL resume where it stopped") and REQ-TRACE-482 leave no reading in which a
relaunch waits for a person, so where the kick lives is the build's choice; the board's first read is not a placement
(REQ-TRACE-408: a read creates no execution unit; REQ-TRACE-512: nothing starts on its own initiative from opening the
view).

**Outcome — repaired 2026-10-02 (bundle `fin9-queue-dispatch-and-disclosure`).** The kick lives in main's post-open
slot: `openWorkspaceInner` (`apps/desktop/src/main/index.ts`), once the window is interactive and beside the
initialization's resolve, calls the coordinator's new `opened(root, workspaceId)`
(`apps/desktop/src/main/requirements-runs.ts`), a dispatch for the workspace just opened rather than the focused
window's. The coordinator's dispatches are serialised per workspace root. The claim's parse runs in the workspace service,
and a `manual` workspace with nothing armed is answered without it (the claim's guard, added by the repair of
[`a-rejected-card-back-in-ready-can-never-start-its-next-unit.md`](a-rejected-card-back-in-ready-can-never-start-its-next-unit.md)).
The sibling gap is closed too: the board kicks the coordinator after an act that rests a card in `ready` under automatic
scheduling (`dispatchesAfter` in `packages/ui/src/requirements/model.ts`, used by `perform`). The board's first read
dispatches nothing (REQ-TRACE-408/512). Pinned by three cases in `requirements-runs.test.ts` (an open with a claimable
candidate starts it with no renderer command; an open with nothing claimable starts nothing; the open's dispatch addresses
the opened workspace whatever window holds the focus), all red on the coordinator before, and one in
`requirements.test.ts`; `requirements-runs-proof`'s seventh assertion now kicks through `opened`. Shown by
`requirements-proof`'s new `ready-restart-automatic` stage: under automatic scheduling with the disclosure accepted
permanently, REQ-101 rested in `ready` across the quit; relaunched with nothing clicked it read `ready` at 9 s and 15 s on
the unrepaired build, and `review` at both on the repair, its run on the recorded tree. ADR-0041 records it in "Repair —
2026-10-02: an automatic queue resumes at a workspace open", keeping the replaced clause.

## Specs

- `REQ-TRACE-482`: with automatic scheduling enabled, "the system itself picks up the next candidate as capacity becomes
  available". After a relaunch, capacity is available and a candidate is in `ready`, but nothing picks it up until a
  person acts.
- `REQ-TRACE-478`: the queue is the scheduler's own order. It names a candidate `next` that nothing dispatches.
- `REQ-TRACE-476`: "The queue SHALL resume where it stopped". After a relaunch it does not, until a person acts.

## Relevant files

- `apps/desktop/src/main/requirements-runs.ts`: `dispatch()`, the only path from a scheduler offer to a run; its
  callers are the `op: 'dispatch'` command and the `run.result` handler.
- `apps/desktop/src/main/index.ts`: `openWorkspaceInner`, the workspace open; it starts the service and kicks no
  dispatch.
- `packages/ui/src/requirements/RequirementsView.tsx`: `perform` and `queueSet`, the renderer's two `dispatchRuns()` calls.
- `apps/desktop/src/workspace-service/delivery.ts`: `recoverLaunch` and `claim`, which take the card once a claim is made.
- `apps/desktop/src/main/requirements-runs.proof.test.ts`: the seventh assertion, which kicks the dispatch itself.
