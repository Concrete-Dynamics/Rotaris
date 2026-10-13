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
