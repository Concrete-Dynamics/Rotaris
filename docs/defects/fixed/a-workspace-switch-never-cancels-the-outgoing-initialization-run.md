## A workspace switch never cancels the outgoing workspace's initialization run

`InitializationCoordinator.close` exists (it aborts the entry's live run and drops the entry), but nothing in main
calls it: `apps/desktop/src/main/index.ts` calls only `initialization.open` and `initialization.resolve(true)` when a
window's workspace is opened. Two consequences follow.

- A switch away from a workspace whose background initialization run is still under way leaves that run going. It is
  never cancelled on REQ-WORKSPACE-109's terms, and its outcome is still recorded, where REQ-WORKSPACE-013 requires
  that nothing be recorded for the cancelled run and that its tasks stay pending for the next open.
- The entry for the outgoing root stays in the coordinator's map with `automatic` already set. Returning to the same
  root in the same process finds that promise settled, so the new open performs no automatic resolution of its own,
  where REQ-WORKSPACE-102 requires exactly one automatic resolution per workspace open.

It also makes the overlap described in
[a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md](a-closed-workspaces-run-can-clear-the-reopened-workspaces-setup-listener.md)
reachable without `close`: the incoming root's run installs its own `setupListener` over the outgoing run's.

Found by reading, as an optional finding of the fix-proofs-b5 verification round of 2026-09-29, and confirmed on
`main` at ec3c501 (`git grep "initialization.close"` finds no call site). Not reproduced in the built app. Pre-existing;
fix-proofs-b5 did not introduce it.

## Specs

- REQ-WORKSPACE-013: a background initialization run still under way in the outgoing window SHALL be cancelled on
  exactly the terms of REQ-WORKSPACE-109, and nothing SHALL be recorded for the cancelled run.
- REQ-WORKSPACE-102: initialization SHALL be resolved automatically exactly once per workspace open; a reopen of the
  same root is a new open.
- REQ-WORKSPACE-109: the cancellation terms (no unstarted task begins, a task under way reaches its own conclusion,
  every launched process is ended per REQ-WORKSPACE-092).

## Relevant files

- `apps/desktop/src/main/index.ts` — the workspace-open path (`initialization.open`, then `resolve(true)` after the
  window is interactive) and the window-close and switch paths, none of which call `initialization.close`.
- `apps/desktop/src/main/initialization.ts` — `open` (reuses an existing entry), `close` (aborts and drops the entry;
  never called), `resolve` (`automatic` held per entry for REQ-WORKSPACE-102).

## Outcome

Repaired 2026-09-29 under R-067. `MainWindows` gained a `workspaceClosed` dependency, called from `#forget` once the
last live main window holding a workspace has closed — a switch's outgoing window, a replacement discarded after a
vetoed close, or one of several windows (`apps/desktop/src/main/main-windows.ts`); main answers it with
`initialization.close` (`apps/desktop/src/main/index.ts`). `InitializationCoordinator.close` now marks the entry
`closed` before it aborts the run and drops the entry (`apps/desktop/src/main/initialization.ts`): the run's recordings
are refused inside their turn of the marker queue (`commit`), so nothing is recorded for the cancelled run even when the
task under way ends in success; nothing of the closed workspace is published on channel 12 or bannered; a resolution
still reading when its workspace closed starts nothing; and the surfaces fall back to the workspace most recently opened
among those still open. Because the entry is dropped, a return to the same root is a new open with its own automatic
resolution (REQ-WORKSPACE-102). The setup port's cancel is no longer fire-and-forget: a cancellation that is not
delivered is logged. As first committed that held only for a rejected request — main's port sent nothing and said
nothing when no window held a workspace, and took a refusal from the run host as delivered; the verification of this
repair found it, and the port now rejects in both cases (`deliverSetupCancel` in `initialization.ts`), so the
coordinator's log says the cancellation could not be delivered.

The rule is applied wherever no window holds a workspace any more, which reaches three cases REQ-WORKSPACE-013 does not
name: a plain close of one of several windows (PD-SHELL-001), a replacement closed after a veto, and a run the user
started. That is the build's reading, raised as
[OQ-141](../../architecture/open-questions.md), not a clause of the specification.

Pinned by `main-windows.test.ts` ("reports a workspace no window holds any more once its last window closes, …"; it and
the replacement-ordering case fail without the change) and by five cases under "closing a workspace" in
`initialization.test.ts`, four of which fail on the old coordinator (the fifth, the reopen, passed there: the coordinator
was right once called, and it is the call that was missing). Two more cases there pin the delivery: "treats a setup
cancellation as delivered only when the run host took it", which fails without `deliverSetupCancel`'s two rejections,
and "says in the log when the setup's cancellation could not be delivered". Shown in the built app by `workspace-proof`'s new scenario
8b, "a switch away from a workspace whose initialization run is under way", which points the two projects'
`code_intelligence` entry at a stand-in runtime whose `project create` holds for 90 s. On the build without the change
four of its five checks failed — no cancellation was asked, the step's process was still running 5 s after the switch,
the replacement's setup was refused as already running and reported as "not a local launch", and a return to the first
project started nothing; with it, all five passed, the step's process ending 201 ms after the switch answered (as root
under Xvfb, Node 24, `--skip-build` after one `pnpm build`).

The overlap the second note describes stayed open with this repair alone; it was repaired next, on the same branch.
