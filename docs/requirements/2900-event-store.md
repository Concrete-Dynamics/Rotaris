---
req-id: SWR-2900
status: draft
trace: optional
test: optional
title: "Event Store, Replay & Trajectory Export"
---

# SWR-2900 — Event Store, Replay & Trajectory Export

Durable, queryable persistence for the runtime event stream: every event a run emits is
written to a per-session store, can be read back in order after the run ended, filtered by
type/iteration/time, and exported as a trajectory for evaluation.

The stream itself already exists — SWR-1828 emits it and SWR-1829 gives it a versioned
schema — but it is **emission only**. Nothing persists it in a form anyone can query, so
three findings of the market analysis stay open: no session replay, no trajectory export
for evals, and no aggregated analysis of failure causes and retries
([docs/research/marktanalyse-agentic-harnesses-2026-08.md](../research/marktanalyse-agentic-harnesses-2026-08.md),
sections 3.1 and 3.8). It is also the prerequisite for the two capabilities deliberately
deferred until history exists: adaptive model routing and an evaluation gate for learned
improvements.

Scope boundary: this epic owns **storage, retrieval and export**. Producing events is
SWR-1828/1829/1831; presenting them in Rotaris is the Mission-Control work.

## Requirements

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-2901](2900-event-store/SWR-2901-session-event-store.md) | Durable per-session event store | P2 | draft |
| [SWR-2902](2900-event-store/SWR-2902-query-and-replay.md) | Query and replay API | P2 | draft |
| [SWR-2903](2900-event-store/SWR-2903-trajectory-export.md) | Trajectory export for evaluation | P2 | draft |
| [SWR-2904](2900-event-store/SWR-2904-event-store-cli.md) | CLI surface for replay and export | P2 | draft |

## History

- 2026-08-09 — Epic created from the Phase 2 gap report
  ([docs/plans/2026-08-09-marktanalyse-offene-punkte.md](../plans/2026-08-09-marktanalyse-offene-punkte.md),
  item O4). Block 2900 was claimed because the 2000 block is exhausted (SWR-2099 is the
  last free id in it).
