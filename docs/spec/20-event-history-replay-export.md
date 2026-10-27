---
reference: ROTARIS-CRW-001
domain: event-history-replay-export
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Machine-Readable Event Stream, Replay, and Trajectory Export

## Overview

A run of the agent is consumable by software as well as readable by a person. Every run raises a stream of events — one JSON object per runtime event — covering session boundaries, iterations, tool calls, permission decisions, hooks, checkpoints, gates, approvals, transcript rows, usage, errors, and a single terminal outcome. That stream is delivered live to whatever is watching the run and, whether or not anything is, is recorded event by event into a durable per-session history that only this application reads. That history can afterwards be listed, filtered, and replayed from the desktop interface, exported as JSON lines identical to the ones the run emitted, or converted into one portable JSON document per run for offline scoring and comparison. Those two exports are how a history leaves this application, and each is readable with a stock JSON parser on a machine carrying none of this product's code (REQ-EVENTS-166). Human-readable text never travels on the event channel; it reaches the user through the interface's own surfaces. Masking is part of what an event *is*, not something a later stage applies, so the stored history and any exported document can only ever contain what the emitted event already contained.

---

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`20-event-history-replay-export/`](20-event-history-replay-export/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](20-event-history-replay-export/01-requirements.md) | Requirements; A. Withdrawn command-line surfaces; B. Live event channel semantics; C. Terminal outcome and statuses; D. Stream writer robustness; E. Event envelope and schema versioning | REQ-EVENTS-001 – REQ-EVENTS-040 (40) |
| [02](20-event-history-replay-export/02-f-event-catalog-and-per-type-behavioral.md) | F. Event catalog and per-type behavioral guarantees; G. Redaction and payload bounding; H. Serialization and parsing | REQ-EVENTS-041 – REQ-EVENTS-068 (29) |
| [03](20-event-history-replay-export/03-i-emission-sites-ordering-and-delivery.md) | I. Emission sites, ordering, and delivery guarantees; J. Durable per-session event store (write side) | REQ-EVENTS-069 – REQ-EVENTS-098 (31) |
| [04](20-event-history-replay-export/04-k-reading-a-stored-session-replay-primitives.md) | K. Reading a stored session (replay primitives); L. Withdrawn resumable following of a growing store; M. Query, filtering, and replay semantics; N. Session discovery and listing; O. Trajectory export | REQ-EVENTS-099 – REQ-EVENTS-145 (47) |
| [05](20-event-history-replay-export/05-p-session-history-in-the-desktop-interface.md) | P. Session history in the desktop interface; Q. Cross-cutting integration invariants | REQ-EVENTS-146 – REQ-EVENTS-178 (32) |
| [06](20-event-history-replay-export/06-data-formats.md) | Data & Formats; What a session keeps, and who reads it; Record locators; Line format — the export; Event envelope (present on every event); Event catalog and payload fields; Run status vocabulary; Truncation record (REQ-EVENTS-092); Trajectory document; Bounds and constants; Read-damage warning reasons | — |
| [07](20-event-history-replay-export/07-open-questions.md) | Open Questions | — |
