# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01, under `owner-decisions.md` **SR-4** (the delegated-child ledger is named in
  that ruling's own table as a database row kind), **SR-1** and **SR-2** (no second process can hold a
  child record), and the amendment of `REQ-SESSION-067` (no save is deferred, parked or coalesced).
  **The decision itself is unchanged — a persisted ledger driven to quiescence, not a promise graph.**
  What changed is the medium, and the medium makes two of this record's mechanisms *stronger* rather
  than merely different: the start claim and the transition function. The crash story changed outright.
- **Origin:** RUNTIME (ADR-RUNTIME-06)
- **Depends on:** ADR-0006, ADR-0008, ADR-0058

## Parts

Since 2026-10-26 the rest of this document is in [`0012-the-delegated-child-scheduler/`](0012-the-delegated-child-scheduler/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](0012-the-delegated-child-scheduler/01-context.md) | Context |
| [02](0012-the-delegated-child-scheduler/02-alternatives-considered.md) | Alternatives considered |
| [03](0012-the-delegated-child-scheduler/03-decision.md) | Decision |
| [04](0012-the-delegated-child-scheduler/04-consequences-accepted.md) | Consequences accepted |
| [05](0012-the-delegated-child-scheduler/05-revisit-if.md) | Revisit if |
| [06](0012-the-delegated-child-scheduler/06-first-execution-2026-09-03-the-ledger-with.md) | First execution — 2026-09-03, the ledger with children in it |
| [07](0012-the-delegated-child-scheduler/07-read-back-from-a-live-run-2026-09-12-the.md) | Read back from a live run — 2026-09-12: the report's commands and edited files |
| [08](0012-the-delegated-child-scheduler/08-read-back-from-a-live-run-2026-09-16-the.md) | Read back from a live run — 2026-09-16: the ceiling's graceful arm had never run |
| [09](0012-the-delegated-child-scheduler/09-first-execution-of-the-inherited-context-path.md) | First execution of the inherited-context path — 2026-09-28: a field the ledger stored and nothing read |
| [10](0012-the-delegated-child-scheduler/10-first-execution-of-a-resumed-childs-retry.md) | First execution of a resumed child's retry payload — 2026-09-30: what the launch held in memory |
| [11](0012-the-delegated-child-scheduler/11-first-execution-of-the-stall-watchdog-2026-09.md) | First execution of the stall watchdog — 2026-09-29: consequence 5's watchdog, and the message it makes possible |
| [12](0012-the-delegated-child-scheduler/12-first-execution-of-the-process-wide-count-2026.md) | First execution of the process-wide count — 2026-09-30: the cap was one iteration's |
| [13](0012-the-delegated-child-scheduler/13-first-execution-of-req-orch-098s-teardown-for-a.md) | First execution of REQ-ORCH-098's teardown for a child the scheduler settles — 2026-09-30; The cancel paths outside the scheduler and the execution — 2026-10-01 |
| [14](0012-the-delegated-child-scheduler/14-the-stall-callback-reaches-a-host-2026-09-30.md) | The stall callback reaches a host — 2026-09-30: the watchdog's badge, the root's watch and the steer |
