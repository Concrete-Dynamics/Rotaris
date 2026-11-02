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

## Outcome

*Repaired 2026-10-14 by fin43 (`fin43-notices-and-config`).* Reproduced first with two real tool ports on one session
(`apps/desktop/src/run-host/tools.test.ts`, "through two ports"): two agents asking for a `write_file` approval at once left one
request id in `pending_approvals`, red on the code before. The column now holds the session's whole list: each port exposes
its registry (`pendingApprovals`), the run gathers them over every port (`Run.pendingApprovals`,
`packages/engine/src/run/run.ts`), the session hands that to each port it builds (`ToolPortContext.pendingApprovalsOfSession`,
`packages/engine/src/sessions.ts`), and the gate's `pendingChanged` writes it in place of the port's own list (`createToolPort`,
`apps/desktop/src/run-host/tools.ts`) — the shape the question mirror took on 2026-10-13. With the repair both requests stand in
the column, the first's answer leaves the second's, and the second's empties it. The gathering itself is pinned by
`packages/engine/src/children/children.test.ts` ("every port is handed the run's pending approvals over all its agents"): a
root and two delegated children each holding one approval, every port handed all three, red with the session's wiring
removed or the run's list cut to one port (added 2026-10-14 by the bundle's review). Not driven in the built app or a live run: no
proof makes two agents wait on an approval at once; a run killed while two delegated children each wait on an approval would
show it, the crash's record then withdrawing both (PD-ORCH-005 clause 9).
