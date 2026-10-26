# Machine-Readable Event Stream, Replay, and Trajectory Export — A. Withdrawn command-line surfaces

Part 1 of 7 of [domain 20](../20-event-history-replay-export.md), which indexes every part. Defines REQ-EVENTS-001 – REQ-EVENTS-040.

## Requirements

### A. Withdrawn command-line surfaces

This product is one graphical desktop application. It has no command-line interface, no headless
entry point, and no full-screen text-mode interface, so no requirement of this domain is expressed
as a shell invocation, a flag, a subcommand, an exit code, or a byte stream on standard output. The
capabilities this section once carried are reachable from the desktop interface under Section P.

**REQ-EVENTS-001** — *Withdrawn.* The product has no command-line surface, so there are no two surfaces to hold to observable equality; the equality that remains — every run leaving the same stored history whatever observes it — is carried by REQ-EVENTS-081.

**REQ-EVENTS-002** — *Withdrawn.* There is no invocation to carry an output-format flag; the machine-readable event stream is not an alternative to human output but is produced unconditionally by every run (REQ-EVENTS-081) and reachable through Section P.

**REQ-EVENTS-003** — *Withdrawn.* No flag exists to carry a rejected value, and there is no process exit code.

**REQ-EVENTS-004** — *Withdrawn.* No invocation exists that could pair an output format with a missing task.

**REQ-EVENTS-005** — *Withdrawn.* There is no non-interactive execution path and no standard output an interface could contend for; every run executes inside the desktop application.

**REQ-EVENTS-006** — *Withdrawn.* The inspect, replay, and export capabilities of the `events` command group are carried by the desktop session-history surface of REQ-EVENTS-168, REQ-EVENTS-170 and REQ-EVENTS-173.

**REQ-EVENTS-007** — *Withdrawn.* There is no workspace flag; a history surface reads the workspace its window has open, per REQ-EVENTS-168.

**REQ-EVENTS-008** — *Withdrawn.* The four filter axes are carried by REQ-EVENTS-171 as controls on the history surface, and the JSON-lines form of the selection by REQ-EVENTS-172.

**REQ-EVENTS-009** — *Withdrawn.* Selecting several sessions for one export, and choosing where the document is written, are carried by REQ-EVENTS-173.

**REQ-EVENTS-010** — *Withdrawn.* No flags exist to constrain; the listing capability is carried by REQ-EVENTS-168.

**REQ-EVENTS-011** — *Withdrawn.* There is no command group to invoke without a subcommand, and no exit code.

**REQ-EVENTS-012** — *Withdrawn.* There is no headless surface, no stdout to keep free of setup output, and no exit code; first-run setup is the desktop application's own start-up concern and belongs to no requirement of this domain.

### B. Live event channel semantics

**REQ-EVENTS-013** — The live event channel MUST carry exactly one JSON object per runtime event and no other content: no human-readable text, no progress rendering, and nothing a component other than this product constructed may be placed on it. Human-readable messages produced during a run — including those produced while a run is being stopped — reach the user through the desktop notice channel, the session transcript, and the session's durable diagnostics, never through this channel. This specification fixes which events occur and in what relative order (REQ-EVENTS-076); it fixes no arrival frequency, and a consumer MUST NOT derive one from event spacing.

**REQ-EVENTS-014** — *Withdrawn.* There is no alternative text output stream to keep free of events; the human-readable presentation of a run is the desktop interface, which is fed by the same events and never by a parallel text rendering. The guarantee that a run records its durable history whatever is observing it is carried by REQ-EVENTS-081.

**REQ-EVENTS-015** — Observation MUST change only what is observed, never the work performed. Given two otherwise identical runs, one observed by an attached live consumer (REQ-EVENTS-164, REQ-EVENTS-165) and one observed by none, the two runs MUST leave the same kinds of durable record for their sessions — the same evidence records, present or absent alike — and their stored histories MUST hold the same number of events, of the same types, in the same order, each event carrying the same set of field names. Comparing the two histories event by event and field by field, only these values may differ: timestamps, durations, the session id, per-run identifiers (`call_id`, `request_id`, `child_id`, `hook_id`, checkpoint `ref` and `sequence`), and token and cost figures. Every other field MUST compare equal, and both runs MUST reach the same terminal status.

**REQ-EVENTS-016** — For any run that actually starts, the emitted stream MUST begin with a `session.start` event, MUST end with a `result` event, MUST contain exactly one `result` event, and MUST place `session.end` before `result`.

**REQ-EVENTS-017** — Every event delivered on the live channel, every event held in a stored history, and every non-empty line of an exported history (REQ-EVENTS-172), MUST parse as exactly one JSON object; MUST carry the four envelope fields of REQ-EVENTS-036 with the types stated there; MUST carry an `event` value drawn from the catalog of REQ-EVENTS-041; and MUST carry every payload field listed for that type under "Event catalog and payload fields", each of the type stated there, falling back to that field's documented default where the run has no value for it. A payload field may therefore be null or empty, but MUST NOT be absent. For a run that started and reached its terminal `result`, a consumer that decodes and validates every event of that run MUST reject none of them.

**REQ-EVENTS-018** — The moment `session.start` is emitted, the desktop interface MUST make observable that a session began, stating whether it was created or resumed and naming its session id. The announcement MUST NOT be placed on the live event channel (REQ-EVENTS-013). Its wording and placement are the implementation's; the two facts it carries are not. A run that never starts MUST announce nothing.

**REQ-EVENTS-019** — At the end of a run the desktop interface MUST report the outcome exactly once for that run. The report MUST state the terminal status of REQ-EVENTS-026 in words; MUST carry the run summary — the `summary` field of the terminal `result` payload — where that summary is neither empty nor only whitespace; MUST carry the `error` field of that payload where the status is `error`; and, where the summary is empty, MUST still convey the status rather than reporting nothing. The status is therefore always recoverable from the report and never inferred from the presence or absence of a summary. Wording is the implementation's, subject to those obligations.

### C. Terminal outcome and statuses

**REQ-EVENTS-020** — Every way a run can end MUST produce exactly one terminal `result` event. There is no path — success, failure, refusal before start, crash, or a stop the user asked for — on which a run's event sequence ends without one.

**REQ-EVENTS-021** — Given a run refused before it starts — an invalid run configuration, a prerequisite the host cannot supply, or any other condition detected before the run loop exists — the entire event sequence for that run MUST consist of exactly one `result` event with status `error`, no `session.start` may be emitted, and the reason MUST be reported to the user per REQ-EVENTS-019.

**REQ-EVENTS-022** — Given a failure the run does not itself handle, the stream MUST end with a `result` event whose status is `error`; that `result` MUST be the last event delivered on the live channel and the last record the run contributes to its stored history; and the failure MUST be reported to the user per REQ-EVENTS-019. No event for that session may be observed on any channel after that `result`.

**REQ-EVENTS-023** — Given the user stops or cancels a run, the stream MUST end with a `result` event of status `interrupted`, and the outcome report of REQ-EVENTS-019 MUST state that the run was interrupted.

**REQ-EVENTS-024** — Given an execution sandbox that was requested but that the host cannot supply, the run MUST be refused before it starts on the terms of REQ-EVENTS-021: no `session.start` may be emitted, and the event sequence MUST consist of exactly one `result` with status `error`. The `error` field of that `result` payload MUST contain, as unaltered substrings, both the reason the sandbox backend gave for refusing and the corrective step that backend suggested, so that a consumer can act on the backend's own wording without inspecting the host itself.

**REQ-EVENTS-025** — *Withdrawn.* The application does not exit when a run ends, so a run's terminal status is the whole of its machine-readable outcome (REQ-ORCH-083) and no mapping onto a process exit code exists to state. The status vocabulary itself is unaffected and is carried by REQ-EVENTS-026.

**REQ-EVENTS-026** — The run status vocabulary on the wire MUST be exactly the closed terminal run-result set of REQ-ORCH-083; this document holds no copy of that set and mints no status string of its own. What it relies on that requirement for is that the set is closed and machine-readable, so that a status read off the wire is the same value the run recorded. That vocabulary is closed for the `status` field of a terminal `result` payload: a value outside it MUST NOT be emitted. Given a derivation that produced an unrecognized value, the run MUST report `error` — never a successful status — and MUST record a diagnostic that quotes the unrecognized value, so the defect is evidenced rather than silently rewritten.

**REQ-EVENTS-027** — Terminal status MUST be decided from the `stop_reason` the run recorded, matched against the closed stop-reason set of REQ-MONITOR-301 by exact, case-sensitive equality and classified by the total mapping that requirement fixes; the terminal result that mapping produces is the status this document emits on the wire (REQ-EVENTS-026). This document holds no copy of that set and no second mapping: `agent_session_aborted` therefore yields `failed` even where the run otherwise appears to have finished its work, exactly as REQ-MONITOR-301 says, and a recorded stop reason outside the closed set is a defect, not a value for a fallback to classify — it MUST yield `error` with the diagnostic REQ-EVENTS-026 requires, and MUST NOT be reported as a successful status. Where the run recorded no stop reason at all, the session's persisted `execution_status` decides instead, through the total mapping of REQ-SESSION-076 over the closed vocabulary of REQ-SESSION-073; this document restates neither that vocabulary nor that mapping, and any status those requirements do not map to a definite outcome yields `error`, never a successful status.

**REQ-EVENTS-028** — Given a cancellation requested before the run loop exists, the run MUST NOT start and MUST still produce an `interrupted` terminal result. Given a cancellation was requested at any point, `interrupted` MUST win over an apparently completed outcome.

### D. Stream writer robustness

**REQ-EVENTS-029** — Each event MUST be added to the session's history as exactly one record, made durable individually at the moment it is raised and never in accumulated batches. Durable individually is not an optimization and serves no reader: it is what makes the durable record REQ-EVENTS-072 binds an event to already written and readable at the moment that event can be observed on any channel, so a run killed between the two leaves a record with no event and never an event with no record; and it is what leaves a session abandoned by a crash or a force-quit holding its history complete to the last event raised. The history is **not** thereby the more complete of that session's two records, and no reader, no surface and no recovery path may treat it as one. This requirement formerly reasoned from a debounced state snapshot that could lag by its whole window; no save is deferred behind a timer, parked, or coalesced with a later one any more, so every save that was requested is durable and every save that was interrupted is absent whole (REQ-SESSION-067, REQ-SESSION-034). The two records therefore agree at the point the session was abandoned, and such a session — opened from its persisted record once its stale lock has been settled (REQ-SESSION-047, REQ-SESSION-196) — is restored from that record alone and is never completed from the history, which would be a second derivation of state the product does not have (REQ-SESSION-196). Two observables follow and MUST hold however the history is stored. First, an event is either wholly in the history or wholly absent from it: no reader may observe a partial, half-written or unparseable record that this product's own store produced. Second, the durability that makes an event readable MUST be reached before that event is observable anywhere, so no arrangement that defers several events' durability to one later step is permitted, whatever it costs. A recording step that fails is governed by REQ-EVENTS-088. Delivery to a live consumer MUST likewise be per event, never in accumulated batches.

**REQ-EVENTS-030** — Events raised concurrently MUST NOT interleave within a record. However many events a run raises at once, every record of the history MUST be one complete, independently parseable event, and no record may contain fragments of two. This binds the *ordering* as well as the content: the history holds concurrently raised events in the order they were raised, each whole.

**REQ-EVENTS-031** — Given a live consumer that goes away — it detaches, its channel closes, or delivery to it fails with an equivalent error — delivery to that consumer MUST stop permanently and silently and the run MUST continue to completion. A consumer that takes one event and detaches MUST end its own delivery only, leaving the run to finish and leaving the stored history complete.

**REQ-EVENTS-032** — Given an event that cannot be serialized, that one event MUST NOT be delivered or stored; a warning MUST be recorded stating the event type concerned and why serialization failed; delivery MUST stay open; and every subsequent event MUST still be recorded, so the history carries exactly one record fewer than the number of events the run raised. One unserializable event MUST NOT truncate the stream, MUST NOT suppress the terminal `result`, and MUST NOT change the run's outcome.

**REQ-EVENTS-033** — *Withdrawn.* There is no standard output whose destination could be re-resolved or found absent; the durable history has exactly one destination per session, and the failure to open it is governed by REQ-EVENTS-084.

**REQ-EVENTS-034** — Closing the event channel MUST make any outstanding event durable, MUST be idempotent, MUST cause any later event to be dropped rather than delivered or stored, and MUST NOT damage or shorten the durable history it was recording into.

**REQ-EVENTS-035** — The event channel and the session's store MUST be established before any part of run start-up can fail, so that even a run refused before it starts produces its terminal `result` (REQ-EVENTS-021), and MUST be closed unconditionally after the run. A store that cannot be opened at all is the one exception, and it is not a partial state: no session comes into existence and the run is refused before it starts (REQ-EVENTS-084).

### E. Event envelope and schema versioning

**REQ-EVENTS-036** — Every event, of every type, MUST carry the same envelope fields: `schema_version` (integer), `event` (string type discriminator), `timestamp` (string), and `session_id` (string, defaulting to the empty string).

**REQ-EVENTS-037** — `timestamp` MUST be an ISO-8601 instant in UTC including an explicit `+00:00` offset.

**REQ-EVENTS-038** — The event schema version MUST be `1`. It MUST be versioned independently of the on-disk session snapshot version; the two numbers may differ and MUST NOT be assumed to move together.

**REQ-EVENTS-039** — Backward compatibility: given a line carrying keys it does not know — extra envelope keys, extra payload keys, or both — a consumer built against schema version `1` MUST decode that line successfully, MUST populate every field it does know from the values that line carries, and MUST let neither the presence nor the content of an unknown key alter a known field or cause the line to be rejected. Adding a payload field, adding an envelope field, or adding an event type MUST leave `schema_version` at `1`. The version MUST be raised only for a change a version-1 consumer cannot absorb: removing or renaming a field or an event type, changing the type of an existing field, or changing the meaning of an existing value.

**REQ-EVENTS-040** — Field validation, including redaction, MUST be re-applied when a field is assigned after construction, so that no caller can produce an event carrying an unmasked secret by mutating an already-built event.
