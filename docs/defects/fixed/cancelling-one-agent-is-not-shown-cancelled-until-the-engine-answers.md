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

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067. The renderer's `cancelAgent` (`apps/desktop/src/renderer/session-actions.ts`) lays an
optimistic overlay over the window's session before it sends the control. The overlay is
`packages/ui/src/cancel-overlay.ts`, and the window's store is `cancelOverlays` in `shell.ts`. It shows:
- the agent `cancelled`, reading "The user cancelled this agent.";
- each unfinished descendant `cancelled`, reading "Cancelled with <name>, which the user cancelled.". The set is
  `cancelCascade`'s, the one the confirmation names;
- for the at-rest cancel of a paused child (`PD-ORCH-005` clause 16), the Continue count lower by the paused agents
  cancelled.

A refusal removes the overlay, so the prior state shows again with the engine's words or "That agent is no longer
cancellable." (REQ-MONITOR-128's words, which replace "not cancellable (unknown, or already finished)"). An acceptance
pins the overlay to the record held at that moment, and the next whole-session update overwrites it (REQ-MONITOR-296).
Every surface that cancels one agent comes through `cancelAgent`: the inspector, the agents header, the Mission view and
a persona window. The Workspace, Mission and Overview roots read the session through `useShownSession`, and a persona
window through `useCancelOverlaid`. The replica is never written (ADR-0043). OQ-128 records the reading: which line,
which window, until when.

The pins are:
- `packages/ui/src/cancel-overlay.test.ts`: the set and the lines, holding over an unrelated publication, the refusal,
  the overwrite and the clause 16 count;
- `apps/desktop/src/renderer/session-actions.test.ts`, "REQ-MONITOR-128: a confirmed cancel of one agent is shown
  cancelled before the engine answers, and restored on its refusal", which is red without the overlay's `begin`;
- `apps/desktop/src/renderer/cancel-overlay-wiring.test.ts`, which pins the roots' source.

In the built app, `mission-proof`'s fourth launch sampled the Mission table 40 ms after the confirm:
- the build without the overlay read `alpha` and `sub` `running`;
- the build with it read both `cancelled`, with the two activity lines;
- at 9 s both builds showed the engine's record (`cancelled`, the task as activity), and the proof asserts that.
