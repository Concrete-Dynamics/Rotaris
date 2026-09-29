## A skip answered before the open's resolution has run swallows the background task

The window reads the initialization state as it mounts (`useInitialization` in `apps/desktop/src/renderer/main.tsx`,
`initialization.read`), and main's one automatic resolution runs on a timer 800 ms after the run host acknowledges the
workspace (`apps/desktop/src/main/index.ts`, `initialization.resolve(true)`). The mount read's view already carries a
pending consent task and no run in progress, so the window opens the setup dialog **before** the resolution has started
the background task it owes. The dialog lists the runnable tasks, `code-intelligence-setup` among them
(REQ-WORKSPACE-083). A skip answered in that interval (Escape, the close control, "Skip for now") reaches
`InitializationCoordinator.skip` while `attempting` is still empty, so it records **every** listed id as skipped,
the background task included. The resolution then finds nothing pending and starts nothing. The code-intelligence
setup never runs on that open, and every later open reads it as skipped, so it never starts by itself again.

The `attempting` rule (ADR-0064's first execution, "the write race") covers a skip that arrives while the background
task **runs**. It does not cover a skip that arrives before the task has started.

Measured 2026-09-28 on Linux as root under Xvfb, Node 24 (`init-proof`, scenario 3): the sweep's two runs on `main`
at `392f681`, and a reproduction on `fa377e6` in `/home/user/Rotaris-crw-wt-prfb5` with nothing else running. In the
sweep's run the window loaded at +0 ms and the run host acknowledged the workspace at +191 ms. The proof's Escape,
pressed as soon as the dialog existed, was taken at +889 ms, and main logged `initialization: skipped
code-intelligence-setup, verification-consent` at +901 ms. The resolution logged `0 pending (0 needing consent),
2 runnable` at +999 ms and started nothing. The reproduction gave +182, +888, +902 and +991 ms, the same order. No `running code-intelligence-setup … (background)` line appears in that launch. The marker holds
`skipped: [code-intelligence-setup, verification-consent]`, and on reopening the sidebar hint reads "Not run yet: Code
intelligence project setup, Verification consent task." On the Windows host where the proof was written, the
resolution won the race: the background task started first, `attempting` kept it out of the skip, and the hint read
"Not run yet: Verification consent task.", the value the proof asserts. The proof's expectation is right. The product
reaches it only when it wins a race.

## Specs

- **REQ-WORKSPACE-083**: on open, resolution produces "for pending background tasks, an immediate-start list
  regardless of whether a prompt is also due". Here a prompt answered before the resolution empties that list.
- **REQ-WORKSPACE-088**: the default task "starts by itself when the workspace opens, raising no dialog and gating no
  run". Here it is withheld by a dialog's answer and never starts.
- **REQ-WORKSPACE-082**'s own reasoning, in the other direction: a background task's fate must not depend on a prompt
  answered beside it, just as finishing it "can never swallow a prompt still owed".

REQ-WORKSPACE-111 ("the skip path SHALL persist the listed task ids as skipped") is read as ADR-0064 already reads it
for a task under way: the user skips what the prompt asks about. A background task the open owes is not asked about
(REQ-WORKSPACE-088).

## Relevant files

- `apps/desktop/src/main/initialization.ts`: `InitializationCoordinator.skip`, `resolve`, the `attempting` field and
  its comment.
- `apps/desktop/src/main/index.ts`: the 800 ms timer before `initialization.resolve(true)`.
- `apps/desktop/src/renderer/main.tsx`: `useInitialization`'s mount read and the auto-open effect it feeds.
- `apps/desktop/scripts/init-proof.mjs`: scenario 3b's hint assertion, which caught it.
