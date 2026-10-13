## `pending_approvals` holds one agent's list when two agents wait on approvals

Each agent's tool port builds its own `PendingApprovals` registry (`createToolPort`, `apps/desktop/src/run-host/tools.ts`),
and the gate mirrors **that registry's** list into the session's one column on every change
(`deps.sink.pendingChanged(deps.approvals.pending())`, `packages/agent-tools/src/gate.ts`; the sink writes
`pending_approvals: JSON.stringify(pending)`). With two agents of one run waiting on an approval at once — two delegated
children, each asking — the second request overwrites the first agent's list with its own, and when either is answered its
port writes its own (now empty) list, so the column reads `[]` while the other request still waits. Read from the code on
2026-10-13 by fin41 while building the question mirror beside it (which mirrors the session's whole list instead), not
reproduced in a run. What reads the column then reads it short: the listing's `awaitingInput` (REQ-SESSION-031), the
stored record's `pendingApprovals`, and a crash's record, which withdraws only what the column holds (PD-ORCH-005
clause 9), so an approval the overwrite dropped is never recorded as withdrawn. Recorded, not repaired.

## Specs

PD-ORCH-005 clause 9 (a crash withdraws every pending approval, recorded as withdrawn); REQ-SESSION-031 (`awaiting_input`
while any approval is pending).

## Relevant files

- `apps/desktop/src/run-host/tools.ts` — one `PendingApprovals` per port; `writerSink`'s `pendingChanged`.
- `packages/agent-tools/src/gate.ts` — `pendingChanged(deps.approvals.pending())`.
- `packages/engine/src/run/crash.ts` — `withdrawStoredApprovals`, which reads the column.
