## The Overview's header reads "running" beside a run row that reads "Run needs recovery"

Found on 2026-11-11 while moving the delegation graph onto the Overview
([`PD-MONITOR-009`](../product/directives/pd-monitor-009.md#pd-monitor-009)); recorded, not repaired.

In REQ-CHAT-008's recovery state (the stored status of a session is still a busy one, and no run is under way in this
window) the graph card's run row reads the recovery label, "Run needs recovery", as the Workspace's run header does
(PD-ORCH-005 clause 13, OQ-100). The Overview's header above it reads `session {name} · running · {runtime}`: it takes its
status word from the stored status alone (`presentationStatus(session.executionStatus)` in
`packages/ui/src/OverviewView.tsx`), and so does the sessions card's row.

Until PD-SHELL-015 the two readings stood on two views: the Mission view's subtitle and run row carried the recovery
label, and the Overview's header did not. They now stand on one view, 90 px apart. The Mission view's subtitle, which
carried the label too, is gone with the view; the run row keeps it (`packages/ui/src/cancel-paused.test.ts`).

Not reproduced in the built application in this round: read from the source and from the unit test that renders the card
in that state.

## Specs

REQ-MONITOR-164 gives the header the form `session {name} · {status} · {runtime}` and does not say which word a session
in the recovery state takes; REQ-CHAT-008 names the recovery state for the run header. Whether the Overview's header and
its sessions card read the recovery state is not stated, so the repair needs a reading first.

## Relevant files

- `packages/ui/src/OverviewView.tsx` — `headerLabel`, and `sessionDot` for the sessions card.
- `packages/ui/src/DelegationCards.tsx` — the run row's `statusLabel`, which reads `recovery`.
- `apps/desktop/src/renderer/main.tsx` — the `Overview` root, which already holds `needsRecovery`.
