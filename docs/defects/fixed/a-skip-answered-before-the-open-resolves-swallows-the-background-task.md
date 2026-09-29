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
2 runnable` at +999 ms and started nothing. The reproduction gave +182, +888, +902 and +991 ms, the same order.
Neither launch has a `running code-intelligence-setup … (background)` line. The marker holds
`skipped: [code-intelligence-setup, verification-consent]`, and on reopening the sidebar hint reads "Not run yet: Code
intelligence project setup, Verification consent task." The proof passed on the Windows host where it was written
(ADR-0064's first execution). Its narrative, a skip answered while the background task ran, says the resolution won
the race there. That order was not measured here. The proof's expectation is right; the product meets it only when
the resolution wins the race.

## Specs

- **REQ-WORKSPACE-083**: on open, resolution produces "for pending background tasks, an immediate-start list
  regardless of whether a prompt is also due". Here a prompt answered before the resolution empties that list.
- **REQ-WORKSPACE-088**: the default task "starts by itself when the workspace opens, raising no dialog and gating no
  run". Here it is withheld by a dialog's answer and never starts.
- **REQ-WORKSPACE-082**'s own reasoning, in the other direction: a background task's fate must not depend on a prompt
  answered beside it, just as finishing it "can never swallow a prompt still owed".

The skip itself did what REQ-WORKSPACE-086 ("Skipping SHALL record every given pending task id as skipped") and
REQ-WORKSPACE-111 ("the skip path SHALL persist the listed task ids as skipped") say: the prompt listed the background
task (REQ-WORKSPACE-083) and drew its card (REQ-WORKSPACE-106), and the skip recorded it. The fault is in the order.
REQ-WORKSPACE-083 makes the prompt request a product of the open's resolution, and REQ-WORKSPACE-141 puts that
resolution in the interactive slot, yet the skip was answered before the resolution had run. Whether the dialog may open
before the resolution at all is OQ-109.

## Relevant files

- `apps/desktop/src/main/initialization.ts`: `InitializationCoordinator.skip`, `resolve`, the `attempting` field and
  its comment.
- `apps/desktop/src/main/index.ts`: the 800 ms timer before `initialization.resolve(true)`.
- `apps/desktop/src/renderer/main.tsx`: `useInitialization`'s mount read and the auto-open effect it feeds.
- `apps/desktop/scripts/init-proof.mjs`: scenario 3b's hint assertion, which caught it.

## Repaired 2026-09-28 under R-062

**What changed.** A skip that arrives before the open's one automatic resolution now performs that resolution first,
or waits for the one already under way (`InitializationCoordinator.skip` and `resolve`,
`apps/desktop/src/main/initialization.ts`). The open's automatic resolution is held as a promise from the moment it
begins. The resolution starts `code-intelligence-setup` as REQ-WORKSPACE-083 requires. The task is then attempted, and
ADR-0064's finding (2) leaves it out of the skip on REQ-WORKSPACE-084's ground. Every other given id is recorded as
REQ-WORKSPACE-086 says, the background task included when the resolution started nothing. The 800 ms slot then finds
the open's one automatic resolution made and makes no second one (REQ-WORKSPACE-102). The window's mount read, the slot
and the dialog are unchanged. `init-proof`'s scenario 3 also asserts that the background task started beside the
consent prompt and was recorded completed, so the proof pins the requirement and not the race. The reading is OQ-109's
second.

**A first repair was withdrawn before it merged.** It kept a per-workspace flag, `backgroundOwed`. While the flag held,
the skip left out a listed, pending task that needed no consent. That read REQ-WORKSPACE-086 and REQ-WORKSPACE-111
against their text for an id the prompt gives and lists. It also claimed ADR-0064's precedent, which rests on
REQ-WORKSPACE-084 and covers only a task already attempted. The flag also withheld a task no resolution would start,
one that was registered, needed no consent and was inapplicable.

**The tests that pin it.** `apps/desktop/src/main/initialization.test.ts`, three cases:
1. With a consent task registered, the mount read shows the prompt due. A skip of both listed ids before
   `resolve(true)` records only the consent task, and the published state shows the background run under way. The slot's
   `resolve(true)` then publishes nothing new, and the task's finish records it completed.
2. A skip that lands while the slot's resolution is still checking applicability records nothing until that resolution
   has started the task, then records only the consent task.
3. When the resolution a skip performs first starts nothing (the task inapplicable), the skip records both given ids.

Cases 1 and 2 fail on the original coordinator and on the withdrawn one. Case 3 fails on the withdrawn one. The existing
case for a skip once the open has resolved and nothing is running (REQ-WORKSPACE-086/111) still passes.

**Measured** as root under Xvfb on Linux, Node 24, on 2026-09-29, after one `pnpm build` of the repaired coordinator in
`/home/user/Rotaris-crw-wt-prfb5`: `init-proof --skip-build` passed three runs in a row (170 s, 170 s, 170 s), all
five scenarios. Another agent's Electron proofs were running on the host during the first two runs (8 and 10 of its
processes at their ends) and none during the third. In each run the Escape again came before the slot, about 1.1 s
after the consent task was registered. Main logged `a skip arrived before … was resolved, so the open's resolution
runs first`, then `2 pending (1 needing consent), 2 runnable`, then `running code-intelligence-setup … (background)`,
then `code-intelligence-setup is already running, so the skip leaves its outcome to the run`, then `skipped
verification-consent`. `→ success` followed 1.5–1.8 s later, and no second resolution was logged. The reopen's hint
read "Not run yet: Verification consent task." The withdrawn repair had passed the same proof three times (171 s,
170 s, 171 s), which is why the proof alone could not tell the two readings apart.
**Not shown:** the Windows order. No proof run landed a skip while the slot's resolution was checking applicability;
unit case 2 covers that interval.
