---
reference: ROTARIS-CRW-001
domain: event-history-replay-export
date: 2026-08-29
status: draft
---

# Machine-Readable Event Stream, Replay, and Trajectory Export

## Overview

A run of the agent is consumable by software as well as readable by a person. Every run raises a stream of events — one JSON object per runtime event — covering session boundaries, iterations, tool calls, permission decisions, hooks, checkpoints, gates, approvals, transcript rows, usage, errors, and a single terminal outcome. That stream is delivered live to whatever is watching the run and, whether or not anything is, is recorded line by line into a per-session file on disk. That file can afterwards be listed, filtered, and replayed from the desktop interface, handed over as JSON lines identical to the ones the run emitted, or converted into one portable JSON document per run for offline scoring and comparison. Human-readable text never travels on the event channel; it reaches the user through the interface's own surfaces. Masking is part of what an event *is*, not something a later stage applies, so the on-disk history and any exported document can only ever contain what the emitted event already contained.

---

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

**REQ-EVENTS-015** — Observation MUST change only what is observed, never the work performed. Given two otherwise identical runs, one observed by an attached live consumer (REQ-EVENTS-164, REQ-EVENTS-165) and one observed by none, the two runs MUST create the same set of file names under `<workspace>/.rotaris/sessions/<session_id>/`, and their stored histories MUST hold the same number of events, of the same types, in the same order, each event carrying the same set of field names. Comparing the two histories event by event and field by field, only these values may differ: timestamps, durations, the session id, per-run identifiers (`call_id`, `request_id`, `child_id`, `hook_id`, checkpoint `ref` and `sequence`), and token and cost figures. Every other field MUST compare equal, and both runs MUST reach the same terminal status.

**REQ-EVENTS-016** — For any run that actually starts, the emitted stream MUST begin with a `session.start` event, MUST end with a `result` event, MUST contain exactly one `result` event, and MUST place `session.end` before `result`.

**REQ-EVENTS-017** — Every event delivered on the live channel, and every non-empty line of a stored history, MUST parse as exactly one JSON object; MUST carry the four envelope fields of REQ-EVENTS-036 with the types stated there; MUST carry an `event` value drawn from the catalog of REQ-EVENTS-041; and MUST carry every payload field listed for that type under "Event catalog and payload fields", each of the type stated there, falling back to that field's documented default where the run has no value for it. A payload field may therefore be null or empty, but MUST NOT be absent. For a run that started and reached its terminal `result`, a consumer that decodes and validates every event of that run MUST reject none of them.

**REQ-EVENTS-018** — The moment `session.start` is emitted, the desktop interface MUST make observable that a session began, stating whether it was created or resumed and naming its session id. The announcement MUST NOT be placed on the live event channel (REQ-EVENTS-013). Its wording and placement are the implementation's; the two facts it carries are not. A run that never starts MUST announce nothing.

**REQ-EVENTS-019** — At the end of a run the desktop interface MUST report the outcome exactly once for that run. The report MUST state the terminal status of REQ-EVENTS-026 in words; MUST carry the run summary — the `summary` field of the terminal `result` payload — where that summary is neither empty nor only whitespace; MUST carry the `error` field of that payload where the status is `error`; and, where the summary is empty, MUST still convey the status rather than reporting nothing. The status is therefore always recoverable from the report and never inferred from the presence or absence of a summary. Wording is the implementation's, subject to those obligations.

### C. Terminal outcome and statuses

**REQ-EVENTS-020** — Every way a run can end MUST produce exactly one terminal `result` event. There is no path — success, failure, refusal before start, crash, or a stop the user asked for — on which a run's event sequence ends without one.

**REQ-EVENTS-021** — Given a run refused before it starts — an invalid run configuration, a prerequisite the host cannot supply, or any other condition detected before the run loop exists — the entire event sequence for that run MUST consist of exactly one `result` event with status `error`, no `session.start` may be emitted, and the reason MUST be reported to the user per REQ-EVENTS-019.

**REQ-EVENTS-022** — Given a failure the run does not itself handle, the stream MUST end with a `result` event whose status is `error`; that `result` MUST be the last event delivered on the live channel and the last line the run contributes to its stored history; and the failure MUST be reported to the user per REQ-EVENTS-019. No event for that session may be observed on any channel after that `result`.

**REQ-EVENTS-023** — Given the user stops or cancels a run, the stream MUST end with a `result` event of status `interrupted`, and the outcome report of REQ-EVENTS-019 MUST state that the run was interrupted.

**REQ-EVENTS-024** — Given an execution sandbox that was requested but that the host cannot supply, the run MUST be refused before it starts on the terms of REQ-EVENTS-021: no `session.start` may be emitted, and the event sequence MUST consist of exactly one `result` with status `error`. The `error` field of that `result` payload MUST contain, as unaltered substrings, both the reason the sandbox backend gave for refusing and the corrective step that backend suggested, so that a consumer can act on the backend's own wording without inspecting the host itself.

**REQ-EVENTS-025** — *Withdrawn.* The application does not exit when a run ends, so a run's terminal status is the whole of its machine-readable outcome (REQ-ORCH-083) and no mapping onto a process exit code exists to state. The status vocabulary itself is unaffected and is carried by REQ-EVENTS-026.

**REQ-EVENTS-026** — The run status vocabulary on the wire MUST be exactly `completed`, `failed`, `max_iterations`, `interrupted`, `error`, matching the terminal run-result statuses of REQ-ORCH-083. That vocabulary is closed for the `status` field of a terminal `result` payload: a value outside it MUST NOT be emitted. Given a derivation that produced an unrecognized value, the run MUST report `error` — never a successful status — and MUST record a diagnostic that quotes the unrecognized value, so the defect is evidenced rather than silently rewritten.

**REQ-EVENTS-027** — Terminal status MUST be decided by matching the `stop_reason` the run recorded, compared by exact, case-sensitive equality against the stop-reason strings REQ-ORCH-083 and REQ-SESSION-077 fix: `stopped by user`, `interrupted by user` and `user cancelled at message limit` MUST yield `interrupted`; `agent session aborted` MUST yield `failed`, even where the run otherwise appears to have finished its work; `iteration limit reached` MUST yield `max_iterations`. Any other recorded stop reason — including `all tasks completed`, `time limit reached` and `no pending tasks` — selects no status by this rule. Where no rule matched, the session's persisted `execution_status` (REQ-SESSION-073) decides instead: `completed` → `completed`; `failed` → `failed`; `paused`, `paused_message_limit`, `stopped` and `interrupted` (the status stale repair writes, REQ-SESSION-061) → `interrupted`. Every other member of that vocabulary — `idle`, `running`, `background`, `starting`, `pausing`, `cancelling`, `awaiting_plan_decision`, and any value the vocabulary gains later — is not a terminal state for this purpose and MUST yield `error`; none of them may be reported as a successful status. `paused_message_limit` is a status of its own in that vocabulary, not the paused status qualified by something else.

**REQ-EVENTS-028** — Given a cancellation requested before the run loop exists, the run MUST NOT start and MUST still produce an `interrupted` terminal result. Given a cancellation was requested at any point, `interrupted` MUST win over an apparently completed outcome.

### D. Stream writer robustness

**REQ-EVENTS-029** — Each event MUST be appended to the session's history as exactly one line terminated by a single line feed, written in one write followed by an immediate flush, so that a follower tailing the file (REQ-SESSION-159) observes each event as it happens rather than in buffer-sized batches. Delivery to a live consumer MUST likewise be per event, never in accumulated batches.

**REQ-EVENTS-030** — Events raised concurrently MUST NOT interleave within a line. However many events a run raises at once, every line of the history MUST be one complete, independently parseable event, and no line may contain fragments of two.

**REQ-EVENTS-031** — Given a live consumer that goes away — it detaches, its channel closes, or delivery to it fails with an equivalent error — delivery to that consumer MUST stop permanently and silently and the run MUST continue to completion. A consumer that takes one event and detaches MUST end its own delivery only, leaving the run to finish and leaving the stored history complete.

**REQ-EVENTS-032** — Given an event that cannot be serialized, that one event MUST NOT be delivered or stored; a warning MUST be recorded stating the event type concerned and why serialization failed; delivery MUST stay open; and every subsequent event MUST still be written, so the history carries exactly one line fewer than the number of events the run raised. One unserializable event MUST NOT truncate the stream, MUST NOT suppress the terminal `result`, and MUST NOT change the run's outcome.

**REQ-EVENTS-033** — *Withdrawn.* There is no standard output whose destination could be re-resolved or found absent; the durable history has one fixed destination, fixed by REQ-EVENTS-079, and the failure to attach it is governed by REQ-EVENTS-084.

**REQ-EVENTS-034** — Closing the event channel MUST flush pending output, MUST be idempotent, MUST cause any later event to be dropped rather than delivered or stored, and MUST NOT damage or truncate the durable history file it was appending to.

**REQ-EVENTS-035** — The event channel and the session's store MUST be established before any part of run start-up can fail, so that even a run refused before it starts produces its terminal `result` (REQ-EVENTS-021), and MUST be closed unconditionally after the run.

### E. Event envelope and schema versioning

**REQ-EVENTS-036** — Every event, of every type, MUST carry the same envelope fields: `schema_version` (integer), `event` (string type discriminator), `timestamp` (string), and `session_id` (string, defaulting to the empty string).

**REQ-EVENTS-037** — `timestamp` MUST be an ISO-8601 instant in UTC including an explicit `+00:00` offset.

**REQ-EVENTS-038** — The event schema version MUST be `1`. It MUST be versioned independently of the on-disk session snapshot version; the two numbers may differ and MUST NOT be assumed to move together.

**REQ-EVENTS-039** — Backward compatibility: given a line carrying keys it does not know — extra envelope keys, extra payload keys, or both — a consumer built against schema version `1` MUST decode that line successfully, MUST populate every field it does know from the values that line carries, and MUST let neither the presence nor the content of an unknown key alter a known field or cause the line to be rejected. Adding a payload field, adding an envelope field, or adding an event type MUST leave `schema_version` at `1`. The version MUST be raised only for a change a version-1 consumer cannot absorb: removing or renaming a field or an event type, changing the type of an existing field, or changing the meaning of an existing value.

**REQ-EVENTS-040** — Field validation, including redaction, MUST be re-applied when a field is assigned after construction, so that no caller can produce an event carrying an unmasked secret by mutating an already-built event.

### F. Event catalog and per-type behavioral guarantees

**REQ-EVENTS-041** — The published event catalog MUST contain exactly these 23 types, discriminated by `event`: `session.start`, `session.end`, `iteration.start`, `iteration.end`, `child.spawn`, `child.transition`, `child.complete`, `tool.start`, `tool.finish`, `permission.decision`, `verifier.result`, `verifier.progress`, `transcript.row`, `usage.update`, `error`, `result`, `hook.start`, `hook.finish`, `checkpoint.created`, `checkpoint.restored`, `gate.decision`, `gate.repair`, `approval.requested`.

**REQ-EVENTS-042** — On `session.start`, the sandbox flag MUST report whether a sandbox is actually available and in force for this run, never merely what was requested; the flag MUST NOT read `true` when no sandbox actually came up. The permission mode reported MUST be the mode configured at start; any later downgrade is reported by subsequent permission events, not by revising this field.

**REQ-EVENTS-043** — `checkpoint.created` MUST report the number of changed paths as a count and MUST NOT enumerate the paths, so that an event line stays a fixed size no matter how many paths changed.

**REQ-EVENTS-044** — `checkpoint.restored` MUST report whether the restore happened, the safety checkpoint sequence (which MUST be read explicitly and MUST NOT be inferred from the restored flag, because a refused restore can still have produced one), a changed-path count of `0` when refused, and a blocking reason that is empty on success.

**REQ-EVENTS-045** — `gate.decision` MUST report the decision (`passed`, `gated`, or `exempt`), its reason, the unsatisfied checks, the advisory-only failures, and any model verdict that was overruled — the verdict MUST remain visible even when the gate decided against it.

**REQ-EVENTS-046** — `gate.repair` MUST report the action (`retry` or `escalate`), the 1-based attempt number, the configured maximum attempts, and the remaining attempts carried explicitly and clamped at zero or above. A gated iteration MUST produce exactly one repair event; `retry` and `escalate` are alternatives, and exactly one of them is chosen.

**REQ-EVENTS-047** — Each hook that executes MUST produce exactly one `hook.start` and one `hook.finish` carrying the same `hook_id`, and that `hook.finish` MUST report `skipped` false. Given a hook the trust gate of REQ-HOOKS-090 withheld — a workspace-scoped hook for which no stored approval matches the current workspace hook-set fingerprint, or a hook carrying a scope outside REQ-HOOKS-020's trusted set — exactly one event MUST be emitted for it: a `hook.finish` with `skipped` true, `skip_reason` exactly `untrusted_workspace` (the only defined value, REQ-HOOKS-126), `exit_code` null and `duration_ms` null, and `hook_name` carrying the hook's stable id rather than its configured display name (REQ-HOOKS-102). No `hook.start` bearing that `hook_id` may appear. A hook that produced no exit code MUST report `exit_code` as null; a numeric stand-in such as `0` or `-1` MUST NOT be substituted, even where the durable timeline records that state as `-1` (REQ-HOOKS-119).

**REQ-EVENTS-048** — `lifecycle_point` MUST carry exactly one of the seven hook events of REQ-HOOKS-001 — `pre_tool`, `post_tool`, `session_start`, `session_end`, `iteration_end`, `child_completed`, `verifier_finished` — and no other value. On every `hook.finish` whose `lifecycle_point` is not `pre_tool`, `blocked` MUST be false. Only a hook running at `pre_tool` may report `blocked` true, so a consumer may read `blocked` true as implying that lifecycle point.

**REQ-EVENTS-049** — `approval.requested` MUST reach every channel while the request is still outstanding, and therefore MUST precede the `permission.decision` carrying the same `request_id`. `resolver` MUST carry exactly one of the two values REQ-TOOLS-061 fixes, `brokered` or `headless`. `timeout_seconds` MUST be null exactly when `resolver` is `headless`, which never waits for a response, and MUST otherwise carry the wait in seconds (default `300.0`, REQ-EVENTS-167). `unattended_reason` MUST be the empty string on every request a person could still answer, and MUST be exactly `headless-policy` — the only defined value, spelled as REQ-TOOLS-061 spells it — on every request none can, which is exactly the requests whose `resolver` is `headless`. Expiry of the wait MUST NOT be reported on this event; it is reported on the paired `permission.decision` (REQ-EVENTS-051).

**REQ-EVENTS-050** — `approval.requested` MUST name the blocked agent by its canonical name when the resolver knows it, and MUST report an empty name rather than a guess when it does not. The persona field MUST always be populated truthfully; when the agent name is empty it is the only value a consumer can route on. For a top-level agent the reported name may be a persona label for which no `child.spawn` was ever emitted. A consumer that cannot match the two MUST conclude the agent is not a child rather than assume an event went missing.

**REQ-EVENTS-051** — A `permission.decision` that resolves a previously announced approval MUST carry the same request identifier as its `approval.requested`. A decision reached without ever asking a human MUST claim no request identifier. A request raised for one call MUST NOT be claimed by another. A fail-closed timeout MUST also be reported as a resolving `permission.decision`.

**REQ-EVENTS-052** — `transcript.row` MUST carry the transcript row verbatim in `row` and its position in `index`. A row that is produced incrementally MUST yield exactly two events for its `index` — one when the row first appears and one when it has reached its final form — and none for any state in between, so an answer produced token by token yields two events for its row rather than one per token. A row that is already in its final form when it first appears MUST yield exactly one event for its `index`: there is no separate settling state to announce, and a second event carrying an identical row would be indistinguishable from a genuine revision. One or two events per index is therefore the whole contract, and never more. The semantics are upsert by `index`, never append: a consumer MUST replace whatever it holds at that index rather than adding a row. Indices MUST be assigned contiguously from `0` in row order, so an index higher than the next one a consumer expects is evidence that events were lost. A consumer that detects such a gap MUST fill every skipped index with the placeholder row of REQ-SESSION-160 and continue, so that every later row still sits at its own index; the live stream is never rewound, and the events actually missed are recovered — if at all — by reading the session's stored history (REQ-EVENTS-083), which is the only complete record. Clearing the transcript restarts indices at `0`.

**REQ-EVENTS-053** — A `usage.update` MUST NOT be emitted when it would carry no figures, that is when `tokens` and `cost` are each either null or an empty object, so that a consumer never receives an empty payload it could mistake for a reset to zero. Every emitted `usage.update` carries run-to-date cumulative totals, so the most recent one supersedes all earlier ones (REQ-EVENTS-136).

**REQ-EVENTS-054** — `verifier.progress` MUST be emitted for exactly three phases, spelled on the wire `started` (the suite began), `check_started`, and `check_finished`. `check` MUST name the check the event concerns on `check_started` and `check_finished`, and MUST be the empty string on `started`. `index` MUST be the 1-based position of the check for `check_started` and `check_finished`, and `0` for `started`. `total` MUST be the number of checks in the suite. `elapsed_s` MUST be the seconds since the suite began; `deadline_s` MUST be the suite's time budget in seconds, or null where none applies. `status` MUST be present only on `check_finished`, where it MUST carry exactly one of the five check statuses REQ-ORCH-123 fixes — `passed`, `failed`, `timeout`, `skipped`, `invalid` — and MUST be the empty string on the other two phases.

**REQ-EVENTS-055** — `verifier.result` MUST carry the iteration number, `passed`, the per-check details in `checks`, and a `summary` that is a non-empty human-readable string. Each entry of `checks` MUST carry exactly these fields: `name` (the check name, `:subdir`-qualified as REQ-ORCH-122 qualifies it), `command` (masked per REQ-EVENTS-059), `status` (one of the five of REQ-ORCH-123), `severity` (`blocking` or `advisory`), `exit_code` (integer or null), `duration_ms` (float or null), `skip_reason` (empty unless `status` is `skipped`), and `output_path` (the session-relative path of the check's full output under `evidence/verifier/`, empty where none was written). `passed` MUST report whether the suite blocks completion under REQ-ORCH-116 — false exactly when at least one blocking check ended in a status that gates — and MUST NOT be read as an assertion that verification occurred: a suite that was skipped executed no check, blocks nothing, and therefore reports `passed` true with an empty `checks` list. The gate's own `exempt` decision on `gate.decision` is the authoritative signal that nothing was verified. The summary MUST identify which of exactly three outcomes occurred and MUST carry the information needed to act on it: that every check passed; that specific checks failed, in which case it MUST name each failed check; or that the suite was skipped, in which case it MUST state the reason. Its wording is the implementation's.

**REQ-EVENTS-056** — An issue recorded during a run (REQ-SESSION-135) MUST reach the wire as an `error` event only when its severity is `error`. Issues at `warning`, `info` or `debug` severity — the other three members of the severity vocabulary REQ-SESSION-134 fixes — MUST produce no event at all, so that a healthy run does not appear to be failing. An `error` event derived from a recorded issue MUST set `fatal` to false, MUST carry the issue's `kind` verbatim in `error_class`, and MUST carry in `detail` a locator of the form `<session-relative file>#<issue id>` — for an issue in the session's `issues.json`, `issues.json#` followed by that issue's 12 hexadecimal characters — by which the recorded issue can be found without searching. The `error_class` vocabulary is open-ended and owned by whichever domain records the issue (`hook_failure` and `hook_trust` from REQ-HOOKS-120 and REQ-HOOKS-086, `permission_denied` from REQ-TOOLS-081, and others); a consumer MUST treat an unfamiliar kind as opaque text rather than rejecting the event.

**REQ-EVENTS-057** — A completed tool call MUST produce a `tool.start` and a matching `tool.finish` sharing a call identifier, with the finish carrying status, duration in milliseconds, and an error description when the call failed. The `status` on `tool.finish` MUST carry exactly one of the three settled values of REQ-MONITOR-105 — `ok`, `failed`, or `blocked` — and never that vocabulary's `running`, which describes a call a `tool.finish` has by definition ended.

**REQ-EVENTS-058** — The `status` on `session.end` MUST carry exactly one value of the run status vocabulary of REQ-EVENTS-026, or the empty string where no status could be derived. A consumer MUST read the empty string as *unknown* and never as failure. This matches the reading REQ-HOOKS-075 gives the same field in a hook's `session_end` payload, so one word means the same thing on the wire and in a hook payload; a value outside the vocabulary MUST NOT be emitted here.

**REQ-EVENTS-176** — Recording a notice to a session's timeline under REQ-NOTIFY-268 MUST NOT by itself publish any event. A `warning` notice produces no event at all, consistent with REQ-EVENTS-056, and an `error` notice produces one only by way of the error-severity issue the underlying condition was recorded as (REQ-SESSION-135) — so one failure reaches the event stream exactly once, whether or not it was also shown to the user, and a consumer counting `error` events counts failures rather than renderings. The timeline entry remains the durable record of what the user was told, and REQ-EVENTS-072's ordering rule binds the issue-derived `error` event to its issue record, not to the notice.

### G. Redaction and payload bounding

**REQ-EVENTS-059** — Masking MUST be a property of the event definition rather than of any particular producer: for the fields below, no event delivered on the live channel, no line in a stored history, and no event inside an exported document may carry a value to which the masking of REQ-EVENTS-060 and REQ-EVENTS-063 has not been applied — whatever code produced the event, and whether the field was populated when the event was built or set on it afterwards. The masked fields MUST be: `arguments` on `tool.start`; `summary` on `permission.decision`; `command` on `hook.start`; `output` on `hook.finish`; `summary` on `approval.requested`; `command` within each entry of `checks` on `verifier.result`; and every string at any nesting depth within `row` on `transcript.row`. The mask literal MUST be exactly the three characters `***`, with nothing appended to it.

**REQ-EVENTS-060** — Argument masking MUST render every argument value as a string, since `arguments` is a string-to-string map on the wire. A value whose key names a credential MUST be replaced in its entirety by the mask literal, leaving no fragment of the original value. Key matching MUST be performed on a normalized form of the key in which every `_`, `-` and camel-case boundary becomes a single space and every letter is lower-cased, so that `apiKey`, `api_key`, `API-KEY` and `api key` all match alike; a key whose normalized form contains any of `api key`, `token`, `secret`, `password`, `credentials`, or `auth` MUST count as naming a credential. That list of six is closed: masking is deterministic and testable, and a producer MUST NOT extend or narrow it, so two builds mask the same argument identically. A credential-shaped substring appearing inside the text of a value whose key does not name a credential MUST also be replaced by the mask literal, with the surrounding text left readable. Credential-shaped means exactly these four forms and no others, each recognized by its shape rather than by any measure of the value's randomness: an assignment inside the text — `key=value`, `key: value`, or `key value` where the key is quoted or preceded by a flag marker — whose key normalizes to one of the six fragments above, in which the value alone is masked; an `Authorization` header value or a bearer credential, in which everything after the scheme word is masked; the userinfo password of a URL of the form `scheme://user:password@host`, in which the password alone is masked; and the body of a PEM-delimited private key block, in which everything between the delimiters is masked. No entropy or length heuristic may be used, so an ordinary hash, identifier or path is never masked by accident.

**REQ-EVENTS-061** — Each rendered tool-argument value MUST be clipped to 240 characters plus a trailing single-character ellipsis, so a clipped value is 241 characters long and is distinguishable from an untruncated one. Ordinary short values MUST remain fully readable.

**REQ-EVENTS-062** — Masking MUST be idempotent: re-applying it to already-masked content MUST change nothing, so validation on construction, on assignment, and on re-parse all agree.

**REQ-EVENTS-063** — Masking MUST be applied to a transcript row string before that string is clipped, never after, so that no clipped string can retain a fragment of a value masking would have replaced. Clipping MUST be to 16,000 characters followed by a single `…`, making a clipped string 16,001 characters and distinguishable from one that fitted; the limit counts characters, not bytes. Values inside a row that are not strings MUST pass through unchanged.

### H. Serialization and parsing

**REQ-EVENTS-064** — An event MUST serialize to compact JSON with no spaces after separators, with object keys sorted, and with non-ASCII characters escaped (so that the output survives non-UTF-8 consoles and so that line separators embedded in text cannot break a line). Two equal events MUST serialize to byte-identical lines, so that a consumer comparing two runs sees stable output.

**REQ-EVENTS-065** — A serialized event MUST occupy exactly one line: embedded newlines in payload text MUST be escaped, and a line break that somehow survives serialization MUST raise rather than be emitted.

**REQ-EVENTS-066** — Non-string mapping keys inside a payload MUST be converted to strings before serialization, so that a payload containing, for example, integer keys cannot break serialization mid-stream.

**REQ-EVENTS-067** — Round-trip fidelity: for every event type, serializing an event, decoding the JSON, and re-validating it MUST yield an equal event of the same type, field for field.

**REQ-EVENTS-068** — Strict parsing MUST reject a line whose `event` value lies outside the known catalog, raising a validation error instead of inferring a type. A consumer encountering such a line SHOULD skip it.

### I. Emission sites, ordering, and delivery guarantees

**REQ-EVENTS-069** — Each run MUST publish its lifecycle pair exactly once: one `session.start` and one `session.end`, both to every attached live consumer and in the session's stored history. Counting either type across the events of a single run MUST give exactly one, and no duplicate pair describing that run may be observed on either channel. A stored history covering several runs of one session (REQ-EVENTS-097) MUST therefore contain as many pairs as it contains runs.

**REQ-EVENTS-070** — For a run that started, the terminal `session.end` and `result` MUST be delivered through the normal event delivery path, while delivery is still active, so that an attached consumer observes how the run ended — exactly once, never zero times and never twice. Only a run that never started (and therefore has no session to address) may deliver its terminal result by the direct path; the two paths are mutually exclusive.

**REQ-EVENTS-071** — For a run that started, every way it can end — normal completion, failure, and abrupt termination alike — MUST end it with its `session.end` followed by its terminal `result`, on the live channel and in the stored history alike. (A run that never started emits the terminal `result` alone, per REQ-EVENTS-021 and REQ-EVENTS-024.) After that `result`, no further event bearing that session id may be observed anywhere: the stored history gains no further line and no consumer receives another event. A later run MUST NOT be refused on the grounds that an earlier run used the same session id, MUST observe only the events it raised itself, and MUST NOT have any of its events delivered to a consumer that attached to the earlier run. Where the terminal status cannot be determined, the terminal pair MUST still be emitted, carrying the status REQ-EVENTS-027 assigns to a state that is not terminal.

**REQ-EVENTS-072** — Where an event mirrors a durable record, that record MUST already be written and readable by the time the event can be observed on any channel. A consumer holding such an event MUST therefore find the matching record already written, and a run killed between the two MUST leave a record with no event, never an event with no record. The pairs are exactly these, and no other catalog type has a durable counterpart this rule binds: `tool.start` and `tool.finish` against `<session_dir>/evidence/tool-calls.jsonl`; `permission.decision` against `<session_dir>/evidence/permissions.jsonl` (REQ-TOOLS-078); `error` against the issue record in `<session_dir>/issues.json` its `detail` locates (REQ-EVENTS-056, REQ-SESSION-135); `gate.decision` and `gate.repair` against the `completion_gate_decision`, `repair_attempt_scheduled` and `repair_escalation` entries of `<session_dir>/timeline.jsonl` they are bridged from (REQ-SESSION-134); `checkpoint.created` and `checkpoint.restored` against the `checkpoint_created` and `checkpoint_restored` entries of that same timeline (REQ-GIT-048, REQ-GIT-062); and `hook.finish` against the `hook_run` entry of that timeline (REQ-HOOKS-119) — `hook.start` has no counterpart, because the invocation record is written only once the invocation has completed.

**REQ-EVENTS-073** — Malformed source data behind a derived event MUST NOT abort the iteration it came from, nor the run. Exactly one of two things MUST happen, and which one MUST be decided by whether the event's identity survives. The event MUST be emitted with the malformed portion coerced where the catalog's declared type can be reached by a total conversion: a scalar of the wrong type rendered as its string form for a declared string field; a value absent, null, or of an irreconcilable type replaced by that field's declared default; a number truncated toward zero for a declared integer field; a mapping key that is not a string converted per REQ-EVENTS-066. No event MUST be emitted, and a warning MUST be recorded instead, where the event cannot be identified or rendered at all: the event type is missing or outside the catalog of REQ-EVENTS-041; the payload is not a mapping; a value has no textual form (a self-referential structure among them); or a string still carries a record separator after escaping, which REQ-EVENTS-065 forbids emitting. Either way the iteration MUST continue, its `iteration.end` MUST still be emitted, and the run's terminal status MUST be what it would have been had the source data been well formed.

**REQ-EVENTS-074** — An exception raised by a consumer MUST NOT fail the run: the exception MUST be swallowed into a logged warning. A faulty consumer may lose events for itself; the run's progress and outcome are unaffected.

**REQ-EVENTS-075** — Event delivery MUST be addressed per session: events for one session MUST NEVER be delivered to a consumer registered for another session, and there MUST be no fallback across sessions. Registering delivery for an empty session id MUST be rejected as invalid. Publishing when no consumer is registered MUST do nothing and MUST NOT raise.

**REQ-EVENTS-076** — Within a run the following orderings MUST hold, judged alike by delivery order on the live channel and by line position in the stored history: `session.start` precedes every other event of that run; `iteration.start` precedes its matching `iteration.end`; `child.spawn` precedes every other event naming that child, `child.complete` included; `tool.start` precedes the `tool.finish` sharing its `call_id`; `session.end` precedes `result`. Within a single iteration in which each of the following occurs once, their relative order MUST be `hook.start`, `hook.finish`, `checkpoint.created`, `approval.requested`, `permission.decision`, `gate.decision`, `gate.repair`, and none of them may be emitted more than once for the same occurrence.

**REQ-EVENTS-077** — `child.spawn` MUST be announced exactly once per child even when the spawn is reported through more than one internal path. `child.transition` MUST carry a real prior state, MUST suppress a repeated notification of the same state, and a child first seen partway through its life MUST still get a `child.spawn` emitted ahead of any other event referring to it.

**REQ-EVENTS-078** — Publishing MUST never propagate a failure outward: an error raised at any emission point MUST NOT abort an iteration, a hook, or the run.

### J. Durable per-session event store (write side)

**REQ-EVENTS-079** — A session's durable event history MUST live at `<session_dir>/evidence/events.jsonl`, beside the session's other evidence files, where session directories live at `<workspace>/.rotaris/sessions/<session_id>/`. A truncation marker, when it exists, MUST live at `<session_dir>/evidence/events.meta.json`.

**REQ-EVENTS-080** — A stored line MUST be byte-for-byte what the live stream would have emitted for the same event — same field names, same schema version, same key ordering — so that a consumer written for the live stream can read a stored file and vice versa.

**REQ-EVENTS-081** — Every run MUST leave a stored history, with no exception and no excluded path: the guarantee spans every run that goes through the shared run lifecycle (REQ-SESSION-089, REQ-SESSION-174), whatever started it and whatever is watching it — a run the user drives from the Workspace view, a run continuing in the background while the user is elsewhere, a run of a session opened in a second window, and a run driven by a programmatic embedding of the engine alike. Given the same task, any two of those MUST leave the same set of evidence file names in the session directory, and their stored histories MUST match one another under the field-by-field comparison of REQ-EVENTS-015. Whether a live consumer is attached decides only where events are additionally forwarded, never whether they are recorded.

**REQ-EVENTS-082** — Recording MUST be independent of consumption. Where a consumer is attached and fails on every event it receives, the session's stored history MUST still contain that run's complete event sequence — the same lines, in the same order, that a fault-free consumer would have received — and the run MUST still reach its terminal `result` carrying the status that outcome maps to (REQ-EVENTS-027).

**REQ-EVENTS-083** — A session's history file MUST exist from the start of a run (REQ-EVENTS-087) and MUST contain every event raised for that session, in emission order, up to and including that run's terminal `result`. Once that `result` has been written the file MUST gain no further line: any event bearing that session id raised afterwards MUST leave the file byte-identical, unless a later run resumes the same session, which appends its own events per REQ-EVENTS-097.

**REQ-EVENTS-084** — Given a store that cannot be attached (read-only session directory, full disk, a non-directory blocking the evidence path), the failure MUST degrade to a logged warning explaining that no durable history will exist for the session and that it can therefore be neither replayed nor exported; the run MUST continue and complete normally, and no exception may reach the caller.

**REQ-EVENTS-085** — A stored session's identity MUST be resolved in this order: the id supplied for it with leading and trailing whitespace removed, whenever that leaves a non-empty value; failing that, the name of the session directory the history is written into; failing both, the empty string. That resolved identity is the one reported for the session in a listing (REQ-EVENTS-129) and the one an export falls back to (REQ-EVENTS-139), and it MUST NOT change because an individual recorded event carries a different `session_id`. The bytes of a recorded line MUST NOT be altered to impose it (REQ-EVENTS-080, REQ-EVENTS-095).

**REQ-EVENTS-086** — An absent store cap — and only an absent cap — MUST mean unbounded. A cap of zero or a negative cap MUST be rejected with a clear error stating that a numeric cap must be greater than zero and that unbounded is requested by supplying no cap at all. A configured `0` asks for an empty store and therefore MUST NOT be reinterpreted as "no limit".

**REQ-EVENTS-087** — Initializing a store MUST up front make the evidence directory and place an empty history file in it, alongside the other evidence files, so that the session directory already shows its full set of evidence files before the first event lands. Initialization failure MUST be reported as a failure rather than raising. No truncation marker file may exist until a trim actually drops lines.

**REQ-EVENTS-088** — Appending MUST never raise. A serialization failure MUST drop that one event with a warning and let later events land. A write failure (for example, a full disk) MUST produce a warning and a failure return value, not an exception. Given a write that fails or that reports fewer bytes written than the line holds — the characteristic behavior of a volume that has just filled — the store MUST be marked failed for the remainder of that run, no further append may be attempted for it, and one warning MUST be recorded stating that the session's history is incomplete from that point. A partial line may therefore remain as the file's last line; it is read as a damaged line and skipped with a warning under REQ-EVENTS-106, exactly as the truncated tail of a killed run is, and MUST NOT be repaired by a reader (REQ-EVENTS-100). Refusing further appends after the first failure is what keeps a full volume from accumulating a run of partial lines.

**REQ-EVENTS-089** — A line containing a carriage return or line feed MUST be refused rather than appended, because such a character would split one record across two lines and corrupt both.

**REQ-EVENTS-090** — Stored bytes MUST use a single line feed as the record terminator on every platform, for both appended lines and lines rewritten during a trim, so stored bytes equal wire bytes even after a trim.

**REQ-EVENTS-091** — The default cap MUST be 20,000 events per session. The history MAY hold up to `cap + (cap ÷ 8, rounded down)` lines; an append that leaves the file holding more than that figure MUST be followed by a trim before any further append is accepted. A cap below 8 therefore trims at exactly the cap, and the default cap trims once the file exceeds 22,500 lines. A trim MUST keep the newest `cap` lines and discard the rest, MUST count the lines from the file's current contents rather than from a figure carried over from earlier appends, and MUST replace the file in one atomic step, so that an interruption during a trim leaves either the previous contents or the trimmed contents and never a partly rewritten file. A trim that did not complete — including one that ran out of space while writing its replacement — MUST leave the previous contents in force, MUST NOT be reflected in the truncation marker, and MUST record a warning; the history then exceeds its cap, which is a bounded and visible cost, rather than losing lines to a failed rewrite.

**REQ-EVENTS-092** — When a trim drops lines, a truncation marker file MUST be written atomically containing a single JSON object with sorted keys and a trailing newline, recording: whether the store is truncated, the cumulative number of dropped events, the cap in force (or null for unbounded), and the ISO-8601 UTC time of the last trim. An absent marker MUST be interpreted as zero drops. A marker that is corrupt or unreadable MUST be interpreted as untruncated rather than causing a failure. The marker MUST occupy its own file next to the history, never a line within it, so the invariant that each line of the history is a wire event continues to hold.

**REQ-EVENTS-093** — Reading store metadata MUST accept any of: the session directory, the history file path, or the marker file path, and resolve to the same answer. A session with no store at all MUST report no truncation.

**REQ-EVENTS-094** — Dropped-event counts MUST accumulate across store instances over the life of one session id, seeded from the marker. A resumed session, or a second process, MUST report the session's cumulative loss and MUST NOT reset to zero — reporting a lower figure would understate how much history an export is missing.

**REQ-EVENTS-095** — The store MUST NOT apply a second masking pass. The bytes written are exactly the bytes the schema already masked: a credential can reach the stored file only if it was present on the wire.

**REQ-EVENTS-096** — The store cap MUST NOT be exposed as a user-facing configuration key; it is a property of how a store is attached.

**REQ-EVENTS-097** — A resumed session MUST append to the same store file. A session run twice therefore holds both runs' events in one file, with `session.start` … `result` appearing twice.

**REQ-EVENTS-098** — Concurrent writers within one process MUST be serialized so that neither can split the other's line and a trim cannot race an append. Across processes the rule MUST be single-writer: at most one process may hold a session's store open for writing, and the right to write is exactly the right to hold that session's lock (REQ-SESSION-056). A process that does not hold the lock MUST NOT open the store for writing and MUST degrade per REQ-EVENTS-084 rather than append beside the holder, so interleaved lines, racing trims and racing markers cannot arise. Reading is unrestricted and needs no lock: any number of processes may read or follow a session's history concurrently with its writer, because reading never writes (REQ-EVENTS-100).

### K. Reading a stored session (replay primitives)

**REQ-EVENTS-099** — Reading MUST be streaming and lazy: a reader MUST pull no further than the caller has consumed, and reading a long history MUST NOT require holding the whole file in memory. A read MUST accept either a path to a stored file or any sequence of lines supplied by the caller, so a stored file, a captured stream, or any other line source is handled the same way.

**REQ-EVENTS-100** — Reading MUST be read-only: it MUST NEVER rewrite, compact, or repair the store. Repeated reads of a damaged store MUST leave its bytes untouched.

**REQ-EVENTS-101** — A missing store file MUST read as an empty session; this is a successful outcome and MUST NOT be an error, since a session may have emitted nothing yet, or may be examined in the window before any event has landed. An unreadable store (for example, a permission failure) MUST log a warning and read as empty.

**REQ-EVENTS-102** — Reading MUST be forward compatible. When a stored line carries a type that is absent from this build's catalog, the reader MUST still return it, preserving the raw payload untouched and setting a flag that marks the type as unrecognized. It MUST NEVER be dropped and MUST NEVER raise. The set of recognized types MUST be derived from the current event catalog rather than written out separately, so that adding a type to the catalog immediately makes it recognized.

**REQ-EVENTS-103** — Reading a stored line MUST preserve its decoded payload exactly as the file holds it, and MUST make available the line's 1-based position in the file and whether its `event` value belongs to the catalog of REQ-EVENTS-041. An envelope field that is missing, or whose JSON type is not the type REQ-EVENTS-036 declares, MUST NOT fail the read and MUST NOT disturb any other field: `event`, `session_id` and `timestamp` read as the empty string unless the line supplies a JSON string, and `schema_version` and `iteration` read as having no value unless the line supplies a JSON number — no other JSON type may stand in for one. A line whose `event` therefore reads as empty counts as damaged rather than unrecognized (REQ-EVENTS-106).

**REQ-EVENTS-104** — A stored record MUST be able to re-render itself as a line byte-identical to the one the live stream would have written, produced from the stored payload itself, so that a type outside this build's catalog reproduces exactly as well.

**REQ-EVENTS-105** — Tolerant reading MUST be what a caller gets unless strict validation is asked for explicitly. No history-reading surface may fail, and no record may be withheld from its output, because a stored record carries an `event` value outside the catalog of REQ-EVENTS-041 (REQ-EVENTS-102, REQ-EVENTS-159). Where strict validation is requested instead, the read MUST stop at the first such record and report it as a validation failure, consistent with the strict-parsing rule of REQ-EVENTS-068: records preceding it are still produced, records following it are not.

**REQ-EVENTS-106** — A damaged line met while reading a whole file MUST be skipped rather than ending the read, and MUST produce exactly one warning. Each warning MUST carry the line's 1-based position in the file, a reason, and the first 200 characters of the offending line. Every warning MUST be logged, and MUST be presented wherever this specification requires it to be surfaced (REQ-EVENTS-170). The rendered one-line form MUST be `line {n}: {reason}`; the excerpt is carried by the warning but is not part of that rendering. The reasons MUST distinguish three cases: a line that is not valid JSON — which includes the truncated final line of a killed run — quoting the decoder's own message; a line that is valid JSON but not an object; and an object carrying no non-empty string `event` value, which counts as damaged rather than as an unrecognized type, since no type can be determined at all. Every event read before a damaged line MUST still be returned, and every event after it MUST still be read.

**REQ-EVENTS-107** — Blank and whitespace-only lines MUST be skipped silently with no warning.

### L. Resumable following of a growing store

**REQ-EVENTS-108** — A resumable read MUST accept a byte offset and return the events found after it, the new offset, and a restart flag. The returned offset MUST only ever be placed immediately after a completed record. The cost of a read MUST be proportional to what was appended since the offset, not to the length of the file.

**REQ-EVENTS-109** — Given nothing was appended since the offset, the read MUST return no events and the same offset.

**REQ-EVENTS-110** — Given a partial trailing line (a live writer mid-append), that fragment MUST be held without any warning — an incomplete tail is expected, not corruption — and MUST be delivered exactly once, whole, on a later read.

**REQ-EVENTS-111** — Given the file has become shorter than the offset, or the byte preceding the offset is not a record terminator, the read MUST set its restart flag and return the whole file starting from its first line, so that a caller can discard state derived from the earlier contents rather than continuing to append onto a history that has been replaced. A trim (REQ-EVENTS-091) is exactly such a replacement, and a follower MUST detect it in every case, not only where the file happened to become shorter: each resumable read MUST also read the truncation marker of REQ-EVENTS-092, and MUST set its restart flag whenever the marker's dropped-event count has risen since that follower's previous read. Because a trim replaces the file atomically, a follower observes either the whole previous file or the whole trimmed file and never a half-rewritten one; the marker comparison is what makes the restart guaranteed rather than incidental.

**REQ-EVENTS-112** — Given the file is missing, the read MUST return no events, offset `0`, and a restart flag that is true exactly when the caller's offset was greater than zero.

**REQ-EVENTS-113** — A corrupt line encountered in a resumable read MUST be skipped with a warning, and the offset MUST still advance past it so that the same corrupt line is not re-read forever.

**REQ-EVENTS-114** — Line numbers reported in resumable-read warnings are counted from the start of that read rather than from the start of the file, because counting from the file's start would force the full scan this mode exists to avoid.

**REQ-EVENTS-115** — Bytes in a resumable read that are not valid UTF-8 MUST produce a warning naming the decoding failure and MUST be skipped per line.

**REQ-EVENTS-116** — Successive resumable reads MUST deliver every event exactly once and in emission order, never delivering one twice. A final read after the run has ended MUST return nothing new.

### M. Query, filtering, and replay semantics

**REQ-EVENTS-117** — A query MUST support four independent filter axes: event types, iteration numbers, a lower time bound, and an upper time bound. An axis left unset MUST impose no restriction. Axes that are set MUST be combined with AND. Both time bounds MUST be inclusive. A query MUST be able to report whether it filters anything at all. Results MUST always be returned in original emission order — the order the history holds them in — and a filter MUST NOT reorder, deduplicate, or collapse them.

**REQ-EVENTS-118** — An empty result MUST be a normal, successful answer at every layer — query, replay, and the surfaces of Section P — and MUST NEVER be an error. A run that performed no tool calls simply yields zero matching events, which is a valid result.

**REQ-EVENTS-119** — Iteration attribution MUST be derived from iteration boundaries as the history is read: an event carrying an explicit iteration number retains it, while every other event takes whichever iteration is currently open; after an iteration ends, the context closes and subsequent events belong to no iteration; events before any iteration (such as `session.start`) MUST match no iteration filter. Asking for an iteration MUST therefore return the tool calls, permission decisions, and errors that happened inside it, not only the events that explicitly record the iteration number.

**REQ-EVENTS-120** — An event `timestamp` and a query's lower and upper bounds MUST all be read as ISO-8601 instants, a value carrying no offset being read as UTC, and MUST be compared as absolute instants: a bound written in one offset MUST select exactly the same events as the identical instant written in any other. An event whose `timestamp` is empty or is not a parseable instant MUST match no query that sets either bound, and MUST still be returned by a query that sets neither. A history mixing offsets, or mixing stamped and unstamped events, MUST still yield the complete matching set for a bounded query: setting a time bound may never end a read early and may never turn it into an error. Timestamps are wall-clock and carry no monotonic guarantee, and the comparison is therefore defined on the stamp alone: every event bearing an instant equal to a bound is selected, ties are neither broken nor reordered but returned in stored order (REQ-EVENTS-117), and a clock that moved backwards mid-run may make a bounded query select a set that is not contiguous in the history. That is a permitted outcome, never an error, and no requirement obliges a reader to detect or correct it.

**REQ-EVENTS-121** — Unknown event types MUST remain fully queryable: they MUST be selectable by type filter and MUST inherit iteration context exactly like known events.

**REQ-EVENTS-122** — Filtering MUST be applied per event during the read: querying a long history MUST NOT build the whole event list in memory, and the read MUST stop advancing once the caller stops consuming.

**REQ-EVENTS-123** — Replaying a session means reading its stored history, never re-executing anything. Replay MUST leave the store byte-identical before and after.

### N. Session discovery and listing

**REQ-EVENTS-124** — Listing MUST return every direct child directory of the sessions root that holds a history file (REQ-EVENTS-125 defines what counts as holding one), and nothing else — not the root itself, and not directories nested deeper. The order MUST be descending by the instant of the session's last event; where that instant is missing, empty, or unparseable, by the instant of its first event; and a session yielding no parseable instant at all MUST sort after every session that yields one. Sessions that still compare equal MUST be ordered by session id, descending. A sessions root that does not exist MUST yield an empty listing, not an error.

**REQ-EVENTS-125** — A session counts as having a store when the history file exists; an empty file still qualifies, so that a run which recorded nothing stays distinguishable from a session that has no history at all. Sessions with no store MUST simply be absent from the listing rather than causing an error.

**REQ-EVENTS-126** — Summarizing a session for the listing MUST make a single pass that counts non-empty lines and decodes just the earliest and the latest of them — enough to derive the time span — so that listing a workspace holding long histories does not decode every event. Consequently the listed count is a count of stored lines: a killed run's unparseable trailing line is counted here but skipped by replay, so a listing may be one higher than replay on a damaged store, while export reports the exact number.

**REQ-EVENTS-127** — Unknown event types MUST be counted in the listing, otherwise the listed total would not match what replay produces.

**REQ-EVENTS-128** — An unreadable store MUST summarize as empty with a logged warning; a single damaged session MUST NEVER fail the listing as a whole.

**REQ-EVENTS-129** — Each listed session MUST report: session id (explicit or directory name), session directory, event count, first timestamp, last timestamp, truncation flag, and dropped-event count. Truncation MUST be carried beside the count on purpose: a capped store's count is a count of survivors.

**REQ-EVENTS-130** — A session identity supplied to a reading surface — chosen in the interface, or carried in a document, a link, or a stored preference — MUST be validated before it is used to locate anything on disk. The resolved candidate directory MUST lie inside the resolved workspace sessions root; otherwise it MUST resolve to "not found". An absolute path, or one containing parent-directory traversal, MUST NOT be able to make the command read a store outside the named workspace. An empty id, a non-directory, and a directory without a store MUST also resolve to "not found".

**REQ-EVENTS-131** — The sessions root a history surface reads MUST be derived from the workspace by the same path rule a run uses when choosing where to write sessions, so that the history surface always finds the sessions runs produced.

### O. Trajectory export

**REQ-EVENTS-132** — An export MUST produce, for each session, a single self-contained JSON document. It MUST hold the identity fields of the run, the events in their original order, and a summary block. The document MUST remain usable away from the machine that produced it: it MUST remain readable once the session directory is gone, MUST NOT embed absolute paths local to the producing machine apart from the workspace path the run recorded in its own events, and MUST be readable with any standard JSON parser without any of this product's code present.

**REQ-EVENTS-133** — The trajectory document version MUST be `1` and MUST carry its own version number, separate from the event schema version. Each embedded event states its own schema version, so revising the enclosing document format does not alter the event format.

**REQ-EVENTS-134** — The exported events MUST be the stored payloads in order, copied exactly as written, with no second masking pass — this is what lets an older build read a newer store's export, and it guarantees the exported events are exactly the events that were emitted.

**REQ-EVENTS-135** — Every number in the summary MUST be computed afresh from the exported events, so the summary cannot drift from what it describes. In particular, the sum of the per-type counts MUST equal the total event count.

**REQ-EVENTS-136** — The summary MUST report: total event count; count of events of unrecognized type; count of unreadable lines skipped while reading; number of runs (occurrences of `session.start`); number of distinct iterations started; iterations completed as reported by the last `session.end`; tool calls started and tool calls finished with an error; permission decisions and the subset that denied; verifier runs and the subset that did not pass; child agents spawned; errors and the subset flagged fatal; per-type event counts with sorted keys including unknown types; and token and cost figures taken from the most recent usage or session-end payload (usage accumulates, so the latest figure is the total).

**REQ-EVENTS-137** — When the source history contained unreadable lines, the document MUST disclose that through its skipped-line count rather than quietly presenting a shorter event list.

**REQ-EVENTS-138** — Run identity — task, workspace, persona, permission mode — MUST come from the LAST `session.start`; outcome — status, stop reason, duration, iterations completed — MUST come from the LAST `session.end`; if no `session.end` set a status, the LAST `result` event's status and stop reason MUST be used, so that a run terminated before its end event still reports a status. Taking every field from the last occurrence is deliberate: it prevents a resumed session from pairing one run's task with a different run's outcome, and the runs count tells a reader that more than one run is represented.

**REQ-EVENTS-139** — The exported session id MUST be resolved in this precedence: an explicitly supplied id wins; otherwise the first event's session id; only when no event carries an id does the directory name apply — so that a session directory that was copied or renamed still exports under the id recorded in its own events.

**REQ-EVENTS-140** — Truncation MUST be reflected in the document: a capped store exports with the truncation flag set and the cumulative dropped count; an intact store exports as not truncated with a dropped count of zero.

**REQ-EVENTS-141** — Unknown event types MUST survive export verbatim and MUST be counted separately as well as in the per-type totals; a future event type or field MUST round-trip into the document unchanged.

**REQ-EVENTS-142** — A session whose store was initialized but never written MUST export as a valid empty document: directory-name identity, an empty event list, a zero event count, and empty start time and status.

**REQ-EVENTS-143** — A credential present in the run but masked on the wire MUST appear nowhere in the export document, while the surrounding context (tool name, masked argument marker) MUST remain present and readable.

**REQ-EVENTS-144** — Batch export MUST produce one trajectory per selected session, in the order those sessions are listed in the selection (REQ-EVENTS-173), wrapped in a batch document carrying the trajectory version, the count of documents, and the list of trajectories.

**REQ-EVENTS-145** — Writing an export to a file MUST create missing parent directories, MUST write pretty-printed JSON with sorted keys, two-space indentation, and a trailing newline, and MUST write atomically, so that a partially written document can never be consumed as though it were complete.

### P. Session history in the desktop interface

**REQ-EVENTS-146** — *Withdrawn.* There is no command group and no process exit code. The two conditions this contract distinguished — no stored history for the named session, and a time bound that cannot be read — are reported in place by REQ-EVENTS-174 and REQ-EVENTS-171 respectively, and an empty result remains an ordinary success (REQ-EVENTS-118).

**REQ-EVENTS-147** — *Withdrawn.* The listing capability, its ordering, and every column it carried are held by REQ-EVENTS-168; character-cell padding and an arrow glyph have no meaning in a rendered table.

**REQ-EVENTS-148** — *Withdrawn.* The empty-listing capability is held by REQ-EVENTS-169.

**REQ-EVENTS-149** — *Withdrawn.* The per-event row, its fields, its unknown-type marker and its detail rendering are held by REQ-EVENTS-170.

**REQ-EVENTS-150** — *Withdrawn.* Obtaining the selected events as JSON lines byte-identical to the stored lines is held by REQ-EVENTS-172.

**REQ-EVENTS-151** — *Withdrawn.* Keeping damaged-line warnings out of the machine-readable output while still showing them to a person is held by REQ-EVENTS-170 and REQ-EVENTS-172.

**REQ-EVENTS-152** — *Withdrawn.* Reporting a session that resolves to no store, and refusing to disclose anything about a path outside the workspace, are held by REQ-EVENTS-174.

**REQ-EVENTS-153** — *Withdrawn.* Rejecting an unreadable time bound before any store is read is held by REQ-EVENTS-171.

**REQ-EVENTS-154** — *Withdrawn.* Writing an export to a chosen destination, atomically and with parents created, and confirming what was written and where, are held by REQ-EVENTS-173.

**REQ-EVENTS-155** — *Withdrawn.* There is no standard output to write a document to; a document reaches the user as a file under REQ-EVENTS-173.

**REQ-EVENTS-156** — *Withdrawn.* The multi-run and truncation disclosures, and the rule that neither is a failure, are held by REQ-EVENTS-173.

**REQ-EVENTS-157** — Given an export of several sessions in which any one of them cannot be resolved, the export MUST NOT proceed: no file may be written and no partial document may be produced, and the unresolved session MUST be reported per REQ-EVENTS-174.

**REQ-EVENTS-158** — *Withdrawn.* There is only one surface, so there is no second one to hold to byte-identical output.

**REQ-EVENTS-159** — Every history-reading surface MUST tolerate unknown event types and damaged lines without failing; each surface MUST adopt the reader's tolerance rather than making a separate determination of its own.

**REQ-EVENTS-168** — The desktop interface MUST offer a session-history surface for the workspace the window has open, reached through a named action in the vocabulary of REQ-SHELL-048 and from a session in the session browser of REQ-SHELL-126. It MUST list every stored session of that workspace's sessions root (REQ-EVENTS-124, REQ-EVENTS-131) in the order of REQ-EVENTS-124, presenting for each the seven facts of REQ-EVENTS-129: session id, session directory, event count, first timestamp, last timestamp, whether the store is truncated, and the dropped-event count. The time span MUST be presented as the absence of any timestamp where the session has none; as the first timestamp alone where there is no last timestamp or the two are equal; and otherwise as both. Truncation MUST be presented beside the count, never instead of it, and MUST NOT be conveyed by colour alone (REQ-SHELL-149), because a truncated store's count is a count of survivors. There is no workspace to choose and no path to type: the surface reads the window's workspace and no other. Opening it MUST start no run, publish no event, and write nothing to any session directory (REQ-EVENTS-100, REQ-EVENTS-123).

**REQ-EVENTS-169** — Given no session in the workspace holds a stored history, the surface MUST present its empty condition, MUST name the absolute path of the sessions root it searched, and MUST NOT present this as an error — a workspace whose runs recorded nothing, and one that has never been run in, are both ordinary states. The wording is the implementation's; the path and the fact that the search succeeded are not.

**REQ-EVENTS-170** — Selecting a session MUST present its events, one row per matching event in emission order, each row carrying: the event's `timestamp`, or an explicit marker of its absence where it has none; the `event` value; a marker that the type falls outside this build's catalog, where it does, conveyed in text and not by colour alone (REQ-SHELL-149); and a detail rendering of the payload with the four envelope fields removed, serialized as one compact JSON object with sorted keys and clipped to 110 characters followed by a single `…`, so a clipped detail is 111 characters and is distinguishable from one that fitted — the same counting rule REQ-EVENTS-061 and REQ-EVENTS-063 use, so one rule governs every clip in this document. An event of an unrecognized type MUST be shown and flagged, never omitted, and MUST NOT stop the surface. Warnings about damaged stored lines (REQ-EVENTS-106) MUST be presented in this surface alongside the events, each naming the line's position and its reason, and MUST NOT be interleaved into any machine-readable output the surface produces (REQ-EVENTS-172).

**REQ-EVENTS-171** — The surface MUST offer controls for exactly the four filter axes of REQ-EVENTS-117: event types, iteration numbers, an inclusive lower time bound, and an inclusive upper time bound. The type control MUST offer the catalog of REQ-EVENTS-041 together with any unrecognized type present in the history being read, so an unknown type stays selectable (REQ-EVENTS-121). An axis left unset MUST restrict nothing, and a filter that matches no event MUST present as an empty result — never as an error or a failure (REQ-EVENTS-118). Time bounds MUST be entered through a date-and-time control, so an unreadable bound is unreachable from this surface; where a bound is nevertheless supplied as text, it MUST be rejected in place, naming which bound was rejected and quoting the value, and no store content may be read on account of the rejected query.

**REQ-EVENTS-172** — The surface MUST be able to hand the user the currently selected events as JSON lines, each line byte-identical to the stored line (REQ-EVENTS-080, REQ-EVENTS-104), whether by copying them or by writing them to a file the user chooses. For an unfiltered selection those lines MUST equal the run's lines exactly; for a filtered selection they MUST equal the corresponding subset. The output MUST carry events and nothing else: no warning, no heading, and no row rendering may appear in it, so a consumer reads replayed output and live output interchangeably.

**REQ-EVENTS-173** — The surface MUST offer an export action over one or more selected sessions, producing the trajectory document of REQ-EVENTS-132 for a single session and the batch document of REQ-EVENTS-144 for several, in the order the sessions are listed in the selection. The destination MUST be chosen through the platform's own file chooser; the document MUST be written atomically with missing parent directories created (REQ-EVENTS-145). On success the surface MUST state how many trajectory documents were written and the absolute path they were written to. The export MUST still be produced, and MUST NOT be reported as a failure, in either of two cases, each of which MUST be disclosed to the user: the session holds more than one run, where the disclosure MUST state how many runs the document spans — the figure the document's `summary.runs` carries — and that the identity fields describe the most recent of them (REQ-EVENTS-138); and the store is truncated, where the disclosure MUST state how many events were dropped — the figure the document's `dropped_events` carries — and that the document therefore does not cover the whole history. Where both apply, both MUST be disclosed. Wording is the implementation's; the figures and the facts are not.

**REQ-EVENTS-174** — Given a session identity that resolves to no store under the workspace the window has open, the surface MUST report that in place, naming both the identity exactly as it was supplied and the absolute path of the sessions root searched, and MUST NOT present the condition as an empty result — so a session that was looked for in the wrong workspace is distinguishable from a session that recorded nothing, which is an ordinary empty result under REQ-EVENTS-118. An identity that attempts to escape the workspace (REQ-EVENTS-130) MUST produce the same report and MUST disclose nothing about whether anything exists at the path it named.

**REQ-EVENTS-175** — Reading a history MUST NOT block the interface. Given a session whose history has already been read, a change to any filter of REQ-EVENTS-171 MUST be reflected within 100 ms of the interaction. Given a history still being read, the surface MUST present a progress state and MUST remain interactive, and reading MUST stay incremental and lazy (REQ-EVENTS-099, REQ-EVENTS-122, REQ-EVENTS-126) so that neither a long history nor a workspace holding many sessions is ever held whole in memory. Cancelling a read MUST leave the store byte-identical (REQ-EVENTS-100).

### Q. Cross-cutting integration invariants

**REQ-EVENTS-160** — For any run, the stored history MUST equal the emitted stream exactly: same payloads, same order, same envelopes; the first stored event `session.start`, the last `result`, exactly one `result`, and every stored event carrying the session's id.

**REQ-EVENTS-161** — The terminal `result` event MUST reach the store as well as any live consumer, so the store's last line is independent evidence that the terminal event traversed the normal delivery path.

**REQ-EVENTS-162** — An exported trajectory's event list MUST equal the lines the live stream emitted for the same run, and its summary counts MUST agree with what actually happened during the run.

**REQ-EVENTS-163** — The per-session evidence files are distinct contracts and MUST NOT be conflated by a consumer: the tool-call evidence log holds arguments exactly as they were passed, with no masking applied; the permission audit trail (REQ-TOOLS-078) and the verification-gate log (REQ-TOOLS-190) each hold their own record under their own retention rule; while the event history holds only masked wire events, under this document's cap and trim rules alone. A figure taken from one of these files MUST NOT be assumed to agree with a figure taken from another: they are capped independently and record different things.

**REQ-EVENTS-164** — A programmatic consumer MUST be able to iterate a run's events asynchronously while the run is still in progress, receiving the same events, in the same order, that the live stream carries. Pending events MUST be buffered up to 1024; while 1024 are outstanding, each further event MUST be discarded rather than blocking the run, and the number discarded MUST be readable by the caller once iteration has ended, so that an incomplete stream is detectable rather than silent. Discarding events MUST NOT affect the caller's ability to obtain the run's terminal outcome, which the call itself returns rather than requiring it to be recovered from the stream. Iteration MUST end once the `result` event has been yielded. The discard count MUST be readable at any time, during iteration as well as after it, and MUST only ever rise, so that a caller can notice a backlog while it can still act on it rather than learning of the loss only once the run is over; it MUST NOT be reset by reading it. This programmatic interface MUST carry its own version, independent of the event schema version, whose current value MUST be the string `"1"`.

**REQ-EVENTS-165** — A live consumer MUST receive every event raised for the session it is registered for, in emission order, with no event delivered twice and none skipped where the consumer returns normally; delivery MUST complete before the run proceeds past the operation that raised the event, so a slow consumer delays the run rather than losing or reordering events. Every event delivered MUST already satisfy the validation of REQ-EVENTS-017, so a consumer never receives a partially populated or unmasked event. A consumer that fails MUST NOT fail the run (REQ-EVENTS-074); the contract is nevertheless that a consumer returns without failing and does not block. That contract MUST be enforced rather than left advisory: delivery of one event to one consumer MUST be bounded at 5 seconds, and a consumer that has not returned by then MUST be treated exactly as one that went away under REQ-EVENTS-031 — delivery to it stops permanently, a warning is recorded naming the session and the event type that was outstanding, and the run proceeds. No other consumer's delivery is affected, and recording is unaffected (REQ-EVENTS-082). A bound is required because an unbounded wait would let one faulty consumer stall a run indefinitely, which REQ-EVENTS-074 already refuses to allow for a consumer that fails outright.

**REQ-EVENTS-166** — Decoding one event line, reading a whole stored history, or reading an exported trajectory document MUST require nothing beyond a standard JSON parser and this specification: no part of the agent runtime, no configuration loading, no network access, and no access to the workspace the run took place in. A stored history or an exported document copied to another machine MUST yield every field of every event when read there with a stock JSON parser.

**REQ-EVENTS-167** — The default wait for a human approval MUST be 300 seconds, and this value MUST be visible to consumers as the timeout field on `approval.requested`.

**REQ-EVENTS-177** — The verification-gate log of REQ-TOOLS-190 MUST NOT gain an event type in the catalog of REQ-EVENTS-041. Every write and every decline it records is an attempt an agent made through a tool, and is therefore already observable on the stream as the `tool.start` / `tool.finish` pair of REQ-EVENTS-057 for that call, with the decline carried as that call's failure; the gate's own reasoning — its `outcome`, `decline_case`, `reason`, `checks` and `detail` — stays durable in `<session_dir>/evidence/verification-gate.jsonl` and in the timeline entry that requirement also writes. A consumer needing that detail MUST read the evidence file rather than expect a wire event, and MUST NOT treat the absence of such an event as evidence that no gate decision was taken. This is a deliberate exclusion, not an omission: the catalog stays at the 23 types of REQ-EVENTS-041.

---

## Data & Formats

### On-disk layout

```
<workspace>/.rotaris/sessions/<session_id>/
  evidence/
    events.jsonl        # one wire event per line, LF-terminated, UTF-8, ASCII-escaped
    events.meta.json    # truncation marker; present only after a trim dropped lines
    tool-calls.jsonl    # separate contract: arguments verbatim (unredacted)
    permissions.jsonl   # separate contract: permission audit (REQ-TOOLS-078)
    verification-gate.jsonl  # separate contract: gate writes and declines (REQ-TOOLS-190); no wire event (REQ-EVENTS-177)
```

Session directories are named after the session id, but an exported document prefers the id the events themselves recorded (REQ-EVENTS-139).

### Line format

One JSON object per line, compact (no whitespace after separators), object keys sorted, non-ASCII escaped, terminated by a single line feed. Two equal events produce byte-identical lines. The event as delivered live, the stored line, and the line handed over by REQ-EVENTS-172 are byte-identical for the same event.

### Event envelope (present on every event)

| Field | Type | Notes |
| --- | --- | --- |
| `schema_version` | integer | `1` |
| `event` | string | type discriminator; see catalog |
| `timestamp` | string | ISO-8601 UTC with `+00:00` offset |
| `session_id` | string | defaults to `""` |

Unknown extra fields are ignored by a version-1 consumer. Unknown `event` values are opaque-but-preserved when reading a store, and rejected by strict parsing.

### Event catalog and payload fields

Values default to empty string, `0`, `null`, or an empty container unless noted. Fields listed are in addition to the envelope.

| `event` | Payload fields |
| --- | --- |
| `session.start` | `task`, `workspace`, `persona`, `permission_mode`, `sandboxed` (bool, default false — whether a sandbox is actually in force), `max_iterations` (int or null) |
| `session.end` | `status` (one run status of REQ-EVENTS-026, or `""` meaning unknown), `stop_reason` (one stop-reason string of REQ-ORCH-083, or `""`), `iterations_completed` (int), `duration_seconds` (float or null), `tokens` (object or null), `cost` (object or null) |
| `iteration.start` | `iteration` (int), `task` |
| `iteration.end` | `iteration` (int), `outcome`, `summary` |
| `child.spawn` | `child_id`, `agent_name`, `task` |
| `child.transition` | `child_id`, `from_state`, `to_state` |
| `child.complete` | `child_id`, `report` (object or null) |
| `tool.start` | `tool_name`, `call_id`, `arguments` (string→string map; masked and clipped) |
| `tool.finish` | `tool_name`, `call_id`, `status` (`ok` \| `failed` \| `blocked`, per REQ-MONITOR-105), `duration_ms` (float or null), `error` (string or null) |
| `permission.decision` | `request_id` (pairs with `approval.requested`), `tool_name`, `decision` (`allow` \| `ask` \| `deny`, per REQ-TOOLS-079; `deny` is the denial marker), `source` (a decision-source value of REQ-TOOLS-028), `rule_id`, `summary` (masked) |
| `verifier.result` | `iteration`, `passed` (bool; blocks-completion, not verification-occurred — REQ-EVENTS-055), `checks` (list of objects: `name`, `command` (masked), `status`, `severity`, `exit_code`, `duration_ms`, `skip_reason`, `output_path`), `summary` |
| `verifier.progress` | `iteration`, `phase` (`started` \| `check_started` \| `check_finished`), `check`, `index` (1-based; `0` for `started`), `total`, `status` (one of `passed` \| `failed` \| `timeout` \| `skipped` \| `invalid` per REQ-ORCH-123, only on `check_finished`; `""` otherwise), `elapsed_s`, `deadline_s` |
| `transcript.row` | `index` (int, upsert key), `row` (object; every nested string masked then clipped to 16,000 chars) |
| `usage.update` | `tokens` (object or null), `cost` (object or null) — cumulative |
| `error` | `message`, `error_class`, `detail`, `fatal` (bool, default false) |
| `result` | `result` (object; contains at least `status`, `session_id`, `stop_reason`, `summary`, `iterations_completed`, `report`, `tokens`, `cost`, `error`) |
| `hook.start` | `hook_id` (stable identity), `hook_name`, `lifecycle_point` (one of the seven hook events of REQ-HOOKS-001), `scope` (a scope value of REQ-HOOKS-020: `default` \| `global` \| `workspace`, or an external-agent scope such as `external:claude-code`), `tool_name`, `command` (masked) |
| `hook.finish` | same identity fields plus `exit_code` (int or null; null, never `-1`, for a hook that produced no exit status), `duration_ms` (float or null), `blocked` (bool; only ever true at `pre_tool`), `timed_out` (bool), `skipped` (bool), `skip_reason` (`untrusted_workspace` is the only defined value, REQ-HOOKS-126), `output` (masked, bounded) |
| `checkpoint.created` | `sequence` (int, monotonic per session), `ref`, `kind` (`iteration` \| `pre_restore` \| `manual`), `iteration` (int; `0` outside the loop), `changed_paths` (int count, never the paths) |
| `checkpoint.restored` | `sequence`, `restored` (bool), `safety_sequence` (int or null), `changed_paths` (`0` when refused), `blocked_reason` (empty on success) |
| `gate.decision` | `iteration`, `decision` (`passed` \| `gated` \| `exempt`), `reason`, `unsatisfied_checks` (list of strings), `advisory_failures` (list of strings), `llm_verdict` (string or null, retained even when overruled) |
| `gate.repair` | `iteration`, `action` (`retry` \| `escalate`), `attempt` (1-based), `max_attempts`, `remaining_attempts` (clamped ≥ 0), `unsatisfied_checks`, `reason` |
| `approval.requested` | `request_id`, `agent_name` (canonical; empty when unknown, never guessed), `persona`, `tool_name`, `rule_id`, `summary` (masked), `resolver` (`brokered` \| `headless`, REQ-TOOLS-061), `timeout_seconds` (float or null; null exactly when `resolver` is `headless`, meaning no wait occurs), `unattended_reason` (`headless-policy` on the headless path, `""` otherwise) |

Transcript row keys are: `role` (one of `user`, `agent`, `thinking`, `tool`, `verifier`, `system`), `name`, `persona`, `content`, plus role-specific extras. Consumers read the keys they know and ignore the rest.

### Run status vocabulary

Exactly `completed`, `failed`, `max_iterations`, `interrupted`, `error` (REQ-EVENTS-026, matching REQ-ORCH-083). The application does not exit when a run ends, so no process exit code is fixed by this document or by any other (REQ-EVENTS-025 withdrawn, REQ-ORCH-083).

Selection (REQ-EVENTS-027): stop reason `stopped by user`, `interrupted by user`, `user cancelled at message limit` → `interrupted`; `agent session aborted` → `failed`; `iteration limit reached` → `max_iterations`. Otherwise by persisted `execution_status` (REQ-SESSION-073): `completed` → `completed`; `failed` → `failed`; `paused`, `paused_message_limit`, `stopped`, `interrupted` → `interrupted`; every other status → `error`.

### Truncation marker (`events.meta.json`)

A single JSON object with sorted keys plus a trailing newline:

| Field | Type | Meaning |
| --- | --- | --- |
| `truncated` | bool | whether any line was ever dropped |
| `dropped_events` | int | cumulative across runs and processes for this session |
| `max_events` | int or null | cap in force; null when unbounded |
| `last_trimmed_at` | string | ISO-8601 UTC |

An absent file means zero drops. A file that cannot be parsed is treated as untruncated.

### Trajectory document

| Field | Meaning |
| --- | --- |
| `trajectory_version` | `1` |
| `session_id` | resolved per REQ-EVENTS-139 |
| `task`, `workspace`, `persona`, `permission_mode` | from the last `session.start` |
| `started_at`, `ended_at` | timestamps of the first and last exported events |
| `status`, `stop_reason`, `duration_seconds` | from the last `session.end`, falling back to the last `result` |
| `truncated`, `dropped_events` | from the truncation marker |
| `summary` | see below |
| `events` | stored payloads, in order, copied exactly as written |

Summary block: `event_count`, `unknown_event_count`, `read_warning_count`, `runs`, `iterations`, `iterations_completed`, `tool_calls`, `tool_failures`, `permission_decisions`, `permission_denials`, `verifier_runs`, `verifier_failures`, `child_agents`, `errors`, `fatal_errors`, `event_counts` (per-type map with sorted keys, including unknown types), `tokens`, `cost`.

Batch document: `{"trajectory_version": 1, "count": <N>, "trajectories": [ ... ]}`.

Files are written pretty-printed (sorted keys, two-space indent) with a trailing newline, atomically.

### Bounds and constants

| Value | Meaning |
| --- | --- |
| `1` | event schema version |
| `1` | trajectory document version |
| `"1"` | programmatic consumer API version |
| 16,000 chars | transcript-row string limit, trailing `…` |
| 240 chars | tool-argument value limit, trailing `…` (clipped values are 241 chars) |
| `***` | mask literal |
| 20,000 | default stored events per session |
| cap ÷ 8 | headroom permitted above the cap before a trim rewrite runs |
| 200 chars | reader warning excerpt limit |
| 110 chars | history-row detail limit, trailing `…` (clipped details are 111 chars) |
| 1024 | pending-event buffer for a programmatic consumer |
| 300.0 s | default approval wait, surfaced as `timeout_seconds` |
| 5 s | bound on delivering one event to one live consumer before it is detached (REQ-EVENTS-165) |
| 100 ms | bound on reflecting a filter change on an already-read history (REQ-EVENTS-175) |

### Read-damage warning reasons

| Condition | Reason text shape |
| --- | --- |
| blank / whitespace line | (skipped silently, no warning) |
| invalid JSON | `not valid JSON ({decoder message})` |
| valid JSON, not an object | `not a JSON object` |
| object with no non-empty string `event` | `no 'event' discriminator` |
| undecodable bytes (resumable read) | `not valid UTF-8 (...)` |

Rendered warning: `line {n}: {reason}`.

---

## Open Questions

None outstanding. Every open question raised in the draft was resolved; see [`resolutions/20-event-history-replay-export.md`](resolutions/20-event-history-replay-export.md).
