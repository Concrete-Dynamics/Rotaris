## An at-rest cancel refused by the lock or the store tells the user the agent is "unknown, or already finished"

`Sessions.cancelPausedAtRest` (`PD-ORCH-005` clause 16) answers `{ ok: false }` for refusals that did not exist before
the revision 4 build. It refuses while another live process holds the session's lock (`lockForWrite`) and under a store
failure (OQ-103). The renderer's `cancelAgent` turned every `{ ok: false }` into "That agent is not cancellable (unknown,
or already finished).". The Workspace, the Mission view (through `confirmCancel`'s error) and a persona window all
showed that sentence. For a paused child the surface itself still draws `paused`, so the sentence was false when the
cancel was refused only because another process held the session or the store had failed.

Found 2026-09-28 by the twelfth review round of the merged revision 4 build of `PD-ORCH-005` (R-065).

## Specs

REQ-MONITOR-128 has a refused cancel state that the agent is not cancellable. That is true of an unknown or finished
agent. It is not true of a paused child whose cancel was stopped by the store or by the session's lock, which clause 16
makes cancellable while its session rests. OQ-101 records the at-rest cancel's refusals. The repair's wording departs
from REQ-MONITOR-128's refusal sentence, which clause 16 does not govern (the directive names the requirement for the
confirmation only); OQ-101 records that departure and asks it (added at the merged build's thirteenth review round).

## Relevant files

- `packages/engine/src/sessions.ts`: `cancelPausedAtRest`, the store-failure guard and the `lockForWrite` refusal.
- `packages/contracts/src/control.ts`: `CONTROL_REFUSAL_CODES`.
- `apps/desktop/src/renderer/session-actions.ts`: `cancelAgent`, the fallback sentence.

## Repaired — 2026-09-28

By the twelfth fix round of the merged revision 4 build (R-065). The two refusals now carry a `ControlRefusal` of their
own. `store_failed` reads "The workspace store requires recovery before an agent can be cancelled: …" and
`session_locked` reads "Another process holds this session, so the agent was not cancelled.". The renderer's
`cancelAgent` states the engine's message when there is one, as the `control` helper already did. It falls back to
"not cancellable" only for a refusal that states none, such as an unknown or finished agent, the run or the root, or a
failed move of the chosen child.

Evidence:
- `packages/engine/src/run/crash.test.ts`: the at-rest cancel under a store failure is refused `store_failed`, and the
  one refused by a local holder whose pid is no positive integer is refused `session_locked`.
- `packages/engine/src/children/children.test.ts`: another live process's lock on a paused session refuses the cancel
  `session_locked`.
- `apps/desktop/src/renderer/session-actions.test.ts`: "PD-ORCH-005 clause 16: a child's cancel refused by the store or
  another process's lock states the engine's words…".
