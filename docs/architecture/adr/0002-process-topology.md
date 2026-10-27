# ADR-0002 — Process topology

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-1 (one running instance) and to record the crash-domain
  consequence as accepted rather than as an unresolved slice conflict.
- **Revised:** 2026-09-01, to carry the double-hop measurement. The topology is **confirmed by
  measurement, not reopened**: the "Revisit if" clause that turned on it is discharged and retired, and
  the `MessagePort` remedy is recorded as an available option rather than as a contingency.
- **Revised:** 2026-09-02, to **settle** the workspace-identity question this record previously left as a
  correction owed, and to place two allocations ESC-19 and ESC-21 create: who takes the whole-store
  backup, and who owns `REQ-STARTUP-166`'s storage classification.
- **Revised:** 2026-09-02, second time, against defect **D3**. Consequence 11 gains the three obligations
  it created and did not state — the refusal to start runs must be in force **before** liveness is judged;
  every acknowledgement is bounded and expiry **refuses** rather than proceeds; and the refusal is a lease
  the run host expires by itself, because a process that has died cannot release anything. All three were
  being carried by ADR-0058 alone, which is the wrong place for properties of this capability.
- **Origin:** RUNTIME (ADR-RUNTIME-01), EXEC (ADR-EXEC-01), DATA (ADR-DATA-08), UI (ADR-UI-01, ADR-UI-05), MODEL (ADR-MODEL-05, ADR-MODEL-12)
- **Depends on:** ADR-0001
- **Governed by:** `owner-decisions.md` SR-1, SR-4, SR-8, ESC-15, **ESC-19**, **ESC-21**
- **Evidence:** `../spikes/ipc-hop-latency.md`

## Parts

Since 2026-10-26 the rest of this document is in [`0002-process-topology/`](0002-process-topology/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0002-process-topology/01-context.md) | Context |
| [02](0002-process-topology/02-alternatives-considered.md) | Alternatives considered |
| [03](0002-process-topology/03-decision.md) | Decision; What identifies a workspace — settled, 2026-09-02; What SR-4 does and does not change here; The transport between the run host and a renderer |
| [04](0002-process-topology/04-consequences-accepted.md) | Consequences accepted |
| [05](0002-process-topology/05-unresolved-conflict-between-slices.md) | Unresolved conflict between slices |
| [06](0002-process-topology/06-discharged-the-double-hop-latency-clause.md) | Discharged — the double-hop latency clause, retired 2026-09-01 |
| [07](0002-process-topology/07-revisit-if.md) | Revisit if |
| [08](0002-process-topology/08-first-execution-2026-09-03-the-walking-skeleton.md) | First execution — 2026-09-03, the walking skeleton |
| [09](0002-process-topology/09-first-execution-2026-09-03-consequence-7s.md) | First execution — 2026-09-03, consequence 7's narrow request back to main |
| [10](0002-process-topology/10-first-execution-2026-09-05-the-quit-path-during.md) | First execution — 2026-09-05, the quit path during a run |
| [11](0002-process-topology/11-first-execution-2026-10-20-req-tools-111-on.md) | First execution — 2026-10-20, REQ-TOOLS-111 on Windows (consequence 5) |
