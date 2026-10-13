## A window opened while a retrospective is pending shows it as not pending until the next publication

PD-LIBRARY-002 revision 2, clause (e) (OQ-236): while a retrospective of a workspace is pending, that workspace's main window
disables both "Run retrospective" gestures. Main tells a window so only inside the improvement coordinator's `activity`
publication (`apps/desktop/src/main/index.ts`, `retrospective_pending` per main window), which happens when a job is queued,
starts or ends. A main window opened, or switched to another workspace, while a retrospective of its workspace is pending keeps
the copy it last had — none, for a new window — until the next publication, so the gesture looks available; pressed, the
handler refuses it with the one info notice, which is the authority. An initial snapshot sent when a main window loads or
changes workspace would close it, but needs the coordinator to republish its current state on demand and two window hooks.
Found by fin34's review (`review:library-and-intent#1`); recorded by fin36, not repaired.

## Specs

- `PD-LIBRARY-002` revision 2, clause (e): the gesture is unavailable while a retrospective of the workspace is pending. The
  refusal keeps the outcome right; the drawn state is stale.

## Relevant files

- `apps/desktop/src/main/index.ts` — the coordinator's `activity` callback, the only sender of `improvement:activity`.
- `apps/desktop/src/main/improvements.ts` — `publish` and `retrospectivePending`.
- `packages/ui/src/shell-state.ts` — the renderer's copy of the activity.

## Outcome (fin38, 2026-10-13) — repaired

The initial snapshot the note asked for. The coordinator answers its activity as it stands (`current()`,
`apps/desktop/src/main/improvements.ts`: what a publication with no job would carry), and `MainWindows.open`
(`apps/desktop/src/main/main-windows.ts`) calls a new `workspaceOpened` dependency once a window's workspace id is set — on
every path that gives a window a workspace (a launch, an added window, a replacement, a hand-over, a reopen after a restore),
each of which has loaded the window first, so its renderer has subscribed. Main's handler (`apps/desktop/src/main/index.ts`)
sends that window the snapshot through the same per-window rule as a publication (`sendImprovementActivity`: its own
workspace's `retrospective_pending`), on the existing `improvement:activity` channel. One window hook, not two: a switch of
workspace is a replacement window, which opens through the same `open`. Pinned by `main-windows.test.ts` ("tells main each time
a window has opened a workspace…") and `improvements.test.ts` ("its current activity is the publication as it stands…"), each
red without the change. `retrospective-proof` drives the pending gesture in one window; no proof opens a second window while a
retrospective is pending.
