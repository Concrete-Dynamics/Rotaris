---
reference: ROTARIS-CRW-001
domain: sessions-persistence
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Session Persistence, Resume, and Background Sessions

## Overview

Every run persists its complete observable state in the workspace's durable session store, recorded as the run proceeds and never in a way a reader can observe half-applied, so that a crash loses only work for which no save was ever requested. That store is machine-local and is found through a stable workspace identifier that travels with the workspace (REQ-SESSION-197, REQ-SESSION-198); a small, closed set of per-session files sits beside it for the things a person opens directly. Because the store is machine-local, backing up a workspace does not back up its sessions — a property the product states rather than leaving a user to discover (REQ-SESSION-200), and for which it offers a backup of the whole store that is valid while runs are live and a restore that is always explicit (REQ-SESSION-201). A session is in one of two conditions and never a third (REQ-SESSION-159): it is live, owned and executed by the one running instance of the application, which publishes its progress to every surface that instance shows; or it is not running, and exists as a persisted record that is opened and continued from that record. A persisted session can be listed, resumed with its full transcript and metrics intact, repaired when the process that owned it died while its record still asserts a run in progress, exported — as a standalone trajectory document, and as the timeline, issues, metrics and permission-audit records in a form a stock tool can read (REQ-SESSION-199) — and deleted cleanly. One shared run lifecycle serves every way a run can be started — in the foreground of a desktop window, detached into the background, or launched from the requirement board — so locking, background execution, message-limit pauses, cancellation, and terminal results behave identically regardless of how the run was started.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`07-sessions-persistence/`](07-sessions-persistence/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](07-sessions-persistence/01-requirements.md) | Requirements; 1. Where a Session Is Stored | REQ-SESSION-001 – REQ-SESSION-202 (13) |
| [02](07-sessions-persistence/02-2-session-identity.md) | 2. Session Identity; 3. Resumable State: Schema Rules and Defaults; 4. Saving State; 5. Loading State, Legacy Fallback, and Corruption; 6. Session Listing; 7. Session Locking | REQ-SESSION-009 – REQ-SESSION-050 (42) |
| [03](07-sessions-persistence/03-8-process-liveness-probing.md) | 8. Process Liveness Probing; 9. Stale-Session Detection and Repair; 10. Save Ordering and Durability; 11. Run Status Lifecycle and Results | REQ-SESSION-051 – REQ-SESSION-187 (31) |
| [04](07-sessions-persistence/04-12-the-shared-run-lifecycle.md) | 12. The Shared Run Lifecycle; 13. Background Runs and Their Desktop Surface; 14. Message-Limit Pause and Reattach; 15. Resume and Continue Semantics | REQ-SESSION-080 – REQ-SESSION-119 (44) |
| [05](07-sessions-persistence/05-16-transcript-recording-and-persistence.md) | 16. Transcript Recording and Persistence; 17. Diagnostics and Evidence Records | REQ-SESSION-120 – REQ-SESSION-199 (27) |
| [06](07-sessions-persistence/06-18-durable-per-session-event-history.md) | 18. Durable Per-Session Event History; 19. Reattach Surfaces and Projections; 20. Live Sessions and Sessions at Rest | REQ-SESSION-143 – REQ-SESSION-161 (24) |
| [07](07-sessions-persistence/07-21-checkpoints-as-session-data.md) | 21. Checkpoints as Session Data; 22. Session Deletion; 23. Metrics Continuity Across Resume; 24. Reasoning-Content Repair at Open; 25. Cross-Cutting Invariants | REQ-SESSION-162 – REQ-SESSION-181 (21) |
| [08](07-sessions-persistence/08-data-formats.md) | Data & Formats; Where things are kept; Session id; Resumable state; Listing record; Status vocabulary and run outcomes; Wire and stored events; Transcript rows; Timeline, issues, tool calls, permissions; Trajectory export document; Concrete constants | — |
| [09](07-sessions-persistence/09-open-questions.md) | Open Questions | — |
