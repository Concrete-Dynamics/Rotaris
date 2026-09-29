## Cancelling one agent is not shown cancelled until the engine answers

REQ-MONITOR-128 has a confirmed cancel of one agent show it and each descendant cancelled with it at once, "optimistically",
with an activity line saying the user cancelled them, and restore the prior state on a refusal. No surface does: the
inspector, the Mission view, the Workspace's agents header and a persona window send `cancelAgent` and wait for the
engine's republished session record, which is what then shows the agents cancelled. The live cancel and the at-rest
cancel of a paused child (`PD-ORCH-005` clause 16) behave alike. Noticed while building clause 16 (R-065, 2026-09-28);
not repaired.

## Specs

REQ-MONITOR-128 ("that agent together with each of its live descendants is optimistically shown as cancelled, with an
activity line stating that the user cancelled them").

## Relevant files

- `apps/desktop/src/renderer/session-actions.ts` — `cancelAgent`, which sends the control and returns its answer only.
- `packages/ui/src/WorkspaceView.tsx`, `packages/ui/src/MissionView.tsx`, `packages/ui/src/PersonaWindow.tsx` — the
  confirmations' `onConfirm`, which set nothing before the answer.
