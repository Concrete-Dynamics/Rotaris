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
