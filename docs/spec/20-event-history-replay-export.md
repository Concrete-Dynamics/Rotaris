---
reference: ROTARIS-CRW-001
domain: event-history-replay-export
date: 2026-08-29
status: draft
---

# Machine-Readable Event Stream, Replay, and Trajectory Export

## Overview

A run of the agent is consumable by software as well as readable by a person. When machine output is selected, standard output becomes a stream of JSON lines — one line per runtime event — covering session boundaries, iterations, tool calls, permission decisions, hooks, checkpoints, gates, approvals, transcript rows, usage, errors, and a single terminal outcome, while every human-readable message is diverted to standard error. Whether or not a live consumer is attached, each run also records those same lines into a per-session file on disk. That file can afterwards be listed, filtered, replayed with identical bytes, or converted into one portable JSON document per run for offline scoring and comparison. Masking is part of what an event *is*, not something a later stage applies, so the on-disk history and any exported document can only ever contain what the emitted event already contained.

---

## Requirements

### A. Command surfaces, subcommands, and flags

**REQ-EVENTS-001** — Two command-line surfaces exist: a primary CLI and a headless CLI. For every behavior in this specification the two surfaces MUST be observably identical (same accepted flags, same stdout bytes, same stderr semantics, same exit codes). The headless surface MUST be usable in an environment with no terminal capabilities and MUST NOT require or start any interactive terminal UI.

**REQ-EVENTS-002** — The `run` command on both surfaces MUST accept `--output-format` with exactly two accepted values, `text` and `stream-json`. Given no `--output-format`, the effective value MUST be `text`. Help output MUST list the values in the order `text`, `stream-json`.

**REQ-EVENTS-003** — Given `--output-format` with any value other than `text` or `stream-json`, both surfaces MUST reject the invocation with exit code `2`, write a diagnostic naming the rejected value and the accepted values to stderr, and MUST NOT start a run.

**REQ-EVENTS-004** — Given `--output-format stream-json` with no task on the primary CLI, the invocation MUST exit `2` with a stderr diagnostic stating that this output format requires a task and cannot start the interactive UI.

**REQ-EVENTS-005** — Given `--output-format stream-json` with a task, the run MUST execute on the non-interactive path so that no interactive UI ever writes to stdout, regardless of the terminal the command was launched from.

**REQ-EVENTS-006** — Both surfaces MUST expose an `events` command group containing exactly three subcommands: `list`, `replay <session>`, and `export <session>...`. The group help MUST describe it as inspecting, replaying, and exporting the event history of a completed run.

**REQ-EVENTS-007** — All three `events` subcommands MUST accept `--workspace` / `-w PATH`. Given the flag is omitted, the workspace MUST default to the current working directory. The supplied path MUST be resolved to an absolute path before use.

**REQ-EVENTS-008** — `events replay` MUST accept, identically on both surfaces: a required positional session id, in the form `events list` prints; `--type` / `-t TYPE`, repeatable, restricting output to the named event types; `--iteration` / `-i N`, repeatable and integer-valued, restricting output to the named iterations; `--since ISO` and `--until ISO`, inclusive time-window bounds; and `--json`, which emits the selected events as JSON lines in the same form the live stream uses.

**REQ-EVENTS-009** — `events export` MUST accept one or more positional session ids (several ids export as one batch) and `--output` / `-o PATH`, which writes the document to a file instead of stdout.

**REQ-EVENTS-010** — `events list` MUST accept only `--workspace` / `-w`.

**REQ-EVENTS-011** — Given the headless surface is invoked with the `events` group but no subcommand, it MUST print the command help and exit with code `1`.

**REQ-EVENTS-012** — On the headless surface, a command other than the version command MAY complete first-run setup before it executes. Whether or not it does, stdout MUST carry only the invoked command's own documented output: for identical arguments, the stdout bytes captured on a workspace that has never been used before MUST equal the stdout bytes captured on an already-initialized workspace, apart from values that necessarily differ between any two invocations (timestamps, durations, the session id, and per-run identifiers). Every message first-run setup produces MUST appear on stderr, and whether setup ran MUST NOT change the command's exit code. (What first-run setup consists of, and the spelling of the exempt version command, are Open Question 11.)

### B. Live stream channel semantics

**REQ-EVENTS-013** — Given `--output-format stream-json`, stdout MUST carry exactly one JSON object per line, one per runtime event, and no other content. Every human-readable message produced during the run — including messages produced by interrupt handling — MUST be written to stderr.

**REQ-EVENTS-014** — Given `--output-format text` (the default), stdout MUST carry human-readable output only: the announcement line of REQ-EVENTS-018, the run's progress text, and the single outcome line of REQ-EVENTS-019. No line of stdout may parse as a JSON object carrying an `event` field, and no event type name from the catalog of REQ-EVENTS-041 may appear on stdout. The chosen output format MUST NOT change the exit code. Suppression applies to the live stdout stream only: the run still records its durable history (REQ-EVENTS-081).

**REQ-EVENTS-015** — The output-format flag MUST change only the observation channel, never the work performed. Given two otherwise identical invocations, one with `--output-format stream-json` and one with `--output-format text`, the two runs MUST create the same set of file names under `<workspace>/.rotaris/sessions/<session_id>/`, and their stored histories MUST hold the same number of events, of the same types, in the same order, each event carrying the same set of field names. Comparing the two histories event by event and field by field, only these values may differ: timestamps, durations, the session id, per-run identifiers (`call_id`, `request_id`, `child_id`, `hook_id`, checkpoint `ref` and `sequence`), and token and cost figures. Every other field MUST compare equal, and both invocations MUST exit with the same code.

**REQ-EVENTS-016** — For any run that actually starts, the emitted stream MUST begin with a `session.start` event, MUST end with a `result` event, MUST contain exactly one `result` event, and MUST place `session.end` before `result`.

**REQ-EVENTS-017** — Every non-empty line written to stdout in stream mode MUST parse as exactly one JSON object; MUST carry the four envelope fields of REQ-EVENTS-036 with the types stated there; MUST carry an `event` value drawn from the catalog of REQ-EVENTS-041; and MUST carry every payload field listed for that type under "Event catalog and payload fields", each of the type stated there, falling back to that field's documented default where the run has no value for it. A payload field may therefore be null or empty, but MUST NOT be absent. For a run that started and reached its terminal `result`, a consumer that decodes and validates every stdout line MUST reject none of them.

**REQ-EVENTS-018** — The moment `session.start` is emitted, a human-readable announcement line MUST be produced: `Created session {id}` for a new session, `Resuming session {id}` for a resumed one. In text mode it MUST be the first line on stdout; in stream mode it MUST go to stderr. A run that never starts MUST announce nothing.

**REQ-EVENTS-019** — At the end of a run exactly one human-readable outcome line MUST be produced — on stderr in stream mode, on stdout in text mode — selected by the terminal status of REQ-EVENTS-026. The run summary named here is the `summary` field of the terminal `result` payload, and `{message}` is that payload's `error` field. `completed` prints the run summary, or exactly `Done.` when that summary is empty or contains only whitespace; `interrupted` prints the run summary, or exactly `Interrupted.` when it is empty; `failed` and `max_iterations` print the run summary (Open Question 12 covers an empty summary for those two); `error` prints `Error: {message}`. Where the message already begins with `Error: `, the printed line MUST carry that prefix exactly once.

### C. Terminal outcome, statuses, and exit codes

**REQ-EVENTS-020** — Every exit path of a stream-mode invocation MUST produce exactly one terminal `result` event. There is no path — success, failure, argument error, crash, refusal, or interrupt — on which a stream ends without one.

**REQ-EVENTS-021** — Given a pre-run argument error (for example, two mutually exclusive execution-isolation flags), the entire stdout stream MUST consist of exactly one `result` line with status `error`, the process MUST exit `1`, and the diagnostic MUST appear on stderr.

**REQ-EVENTS-022** — Given a failure the run does not itself handle, the stream MUST end with a `result` event whose status is `error`; that `result` MUST be the last line on stdout and the last line the run contributes to its stored history; the process MUST exit `1`; and the failure MUST be reported on stderr in the `Error: {message}` form of REQ-EVENTS-019. No event for that session may be observed on any channel after that `result` line.

**REQ-EVENTS-023** — Given an interrupt signal, the stream MUST end with a `result` event of status `interrupted`, the process MUST exit `130`, and `Interrupted.` MUST appear on stderr.

**REQ-EVENTS-024** — Given an execution sandbox that was requested but that the host cannot supply, the run MUST be refused before it starts: no `session.start` may be emitted, stdout MUST consist of exactly one `result` line with status `error`, and the process MUST exit `1` per REQ-EVENTS-025. The `error` field of that `result` payload MUST contain, as unaltered substrings, both the reason the sandbox backend gave for refusing and the corrective step that backend suggested, so that a caller can act on the backend's own wording without inspecting the host itself.

**REQ-EVENTS-025** — The process exit code and the status carried inside the terminal `result` event MUST both be derived from the same outcome value, so the two can never differ. The mapping MUST be: `completed` → `0`; `failed` → `1`; `error` → `1`; `max_iterations` → `2`; `interrupted` → `130`.

**REQ-EVENTS-026** — The run status vocabulary on the wire MUST be exactly `completed`, `failed`, `max_iterations`, `interrupted`, `error`, and REQ-EVENTS-025 maps every one of them to an exit code. A status value outside that vocabulary MUST produce a non-zero exit code — never `0` — together with a stderr diagnostic that quotes the unrecognized value. Which non-zero code is Open Question 13.

**REQ-EVENTS-027** — Terminal status MUST be decided by matching the `stop_reason` the run recorded: a stop reason meaning the user stopped the run, that the user interrupted it, or that the user cancelled it at the message limit MUST yield `interrupted`; a stop reason meaning the agent session was aborted MUST yield `failed`, even where the run otherwise appears to have finished its work; a stop reason meaning the iteration limit was reached MUST yield `max_iterations`. Where the run recorded no such reason, the session's own execution state decides instead: `completed` → `completed`, `failed` → `failed`, `paused` → `interrupted`, paused at the message limit → `interrupted`. A state that is not terminal (idle, running) MUST yield `error`; it MUST NOT be reported as any successful status. (The wire spellings of the stop reasons, and of the session execution states, are Open Question 14.)

**REQ-EVENTS-028** — Given a cancellation requested before the run loop exists, the run MUST NOT start and MUST still produce an `interrupted` terminal result. Given a cancellation was requested at any point, `interrupted` MUST win over an apparently completed outcome.

### D. Stream writer robustness

**REQ-EVENTS-029** — Each event MUST be written to stdout as exactly one line terminated by a single line feed, emitted in one write followed by an immediate flush, so that a consumer tailing the pipe observes each event as it happens rather than in buffer-sized batches.

**REQ-EVENTS-030** — Events emitted concurrently MUST NOT interleave within a line. However many events a run raises at once, every line on stdout MUST be one complete, independently parseable event, and no line may contain fragments of two.

**REQ-EVENTS-031** — Given a consumer that hangs up (broken pipe, closed stream, or an equivalent I/O failure), the stream MUST close permanently and silently and the run MUST continue to completion. A consumer that reads a single line and exits MUST terminate the stream only, leaving the run to finish.

**REQ-EVENTS-032** — Given an event that cannot be serialized, that one event MUST NOT appear on stdout; a warning MUST be written to stderr stating the event type concerned and why serialization failed; the stream MUST stay open; and every subsequent event MUST still be written, so stdout carries exactly one line fewer than the number of events the run raised. One unserializable event MUST NOT truncate the stream, MUST NOT suppress the terminal `result`, and MUST NOT change the run's outcome or exit code. (The warning wording is Open Question 10.)

**REQ-EVENTS-033** — The output destination MUST be resolved at write time, not when the stream is established, so that redirection of standard output after startup is honored. Given no standard output exists at all (for example, a windowed process with no console), the stream MUST close cleanly rather than fail.

**REQ-EVENTS-034** — Closing the stream MUST flush pending output, MUST be idempotent, MUST cause any later event to be dropped rather than written, and MUST NOT close the underlying standard output.

**REQ-EVENTS-035** — The stream MUST be established before any part of the invocation can fail, so that even an argument error produces a terminal `result` line on stdout, and MUST be closed unconditionally after the run.

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

**REQ-EVENTS-047** — Each hook that executes MUST produce exactly one `hook.start` and one `hook.finish` carrying the same `hook_id`, and that `hook.finish` MUST report `skipped` false. Given a hook that is not executed because the workspace is not trusted, exactly one event MUST be emitted for it: a `hook.finish` with `skipped` true, a `skip_reason` that is a non-empty string, `exit_code` null and `duration_ms` null. No `hook.start` bearing that `hook_id` may appear. A hook that produced no exit code MUST report `exit_code` as null; a numeric stand-in such as `0` or `-1` MUST NOT be substituted. (The `skip_reason` vocabulary and the rule by which a workspace counts as untrusted are Open Question 15.)

**REQ-EVENTS-048** — On every `hook.finish` whose `lifecycle_point` is not the pre-tool point, `blocked` MUST be false. Only a hook running at the pre-tool point may report `blocked` true, so a consumer may read `blocked` true as implying that lifecycle point. (The `lifecycle_point` vocabulary, and the exact spelling of the pre-tool point, are Open Question 16.)

**REQ-EVENTS-049** — `approval.requested` MUST reach every channel while the request is still outstanding, and therefore MUST precede the `permission.decision` carrying the same `request_id`. `timeout_seconds` MUST be null exactly when the resolver in force will not wait for a response, and MUST otherwise carry the wait in seconds (default `300.0`, REQ-EVENTS-167). `unattended_reason` MUST be the empty string on every request a person could still answer, and MUST be non-empty — currently only `headless_policy` — on every request none can. Expiry of the wait MUST NOT be reported on this event; it is reported on the paired `permission.decision` (REQ-EVENTS-051). (Which resolvers wait is Open Question 17.)

**REQ-EVENTS-050** — `approval.requested` MUST name the blocked agent by its canonical name when the resolver knows it, and MUST report an empty name rather than a guess when it does not. The persona field MUST always be populated truthfully; when the agent name is empty it is the only value a consumer can route on. For a top-level agent the reported name may be a persona label for which no `child.spawn` was ever emitted. A consumer that cannot match the two MUST conclude the agent is not a child rather than assume an event went missing.

**REQ-EVENTS-051** — A `permission.decision` that resolves a previously announced approval MUST carry the same request identifier as its `approval.requested`. A decision reached without ever asking a human MUST claim no request identifier. A request raised for one call MUST NOT be claimed by another. A fail-closed timeout MUST also be reported as a resolving `permission.decision`.

**REQ-EVENTS-052** — `transcript.row` MUST carry the transcript row verbatim in `row` and its position in `index`. A row that is produced incrementally MUST yield exactly two events for its `index` — one when the row first appears and one when it has reached its final form — and none for any state in between, so an answer produced token by token yields two events for its row rather than one per token. The semantics are upsert by `index`, never append: a consumer MUST replace whatever it holds at that index rather than adding a row. Indices MUST be assigned contiguously from `0` in row order, so an index higher than the next one a consumer expects is evidence that events were lost. Clearing the transcript restarts indices at `0`. (Open Question 18 covers a row that is already final when it first appears, and consumer recovery after a gap.)

**REQ-EVENTS-053** — A `usage.update` MUST NOT be emitted when it would carry no figures, that is when `tokens` and `cost` are each either null or an empty object, so that a consumer never receives an empty payload it could mistake for a reset to zero. Every emitted `usage.update` carries run-to-date cumulative totals, so the most recent one supersedes all earlier ones (REQ-EVENTS-136).

**REQ-EVENTS-054** — `verifier.progress` MUST be emitted for exactly three phases, spelled on the wire `started` (the suite began), `check_started`, and `check_finished`. `check` MUST name the check the event concerns on `check_started` and `check_finished`, and MUST be the empty string on `started`. `index` MUST be the 1-based position of the check for `check_started` and `check_finished`, and `0` for `started`. `total` MUST be the number of checks in the suite. `elapsed_s` MUST be the seconds since the suite began; `deadline_s` MUST be the suite's time budget in seconds, or null where none applies. `status` MUST be present only on `check_finished`. (Its vocabulary is Open Question 19.)

**REQ-EVENTS-055** — `verifier.result` MUST carry the iteration number, `passed`, the per-check details in `checks`, and a `summary` that is a non-empty human-readable string. The summary MUST identify which of exactly three outcomes occurred and MUST carry the information needed to act on it: that every check passed; that specific checks failed, in which case it MUST name each failed check; or that the suite was skipped, in which case it MUST state the reason. (Exact wording is Open Question 10; the shape of a `checks` entry, and what `passed` reports for a skipped suite, are Open Question 19.)

**REQ-EVENTS-056** — An issue recorded during a run MUST reach the wire as an `error` event only when its severity is error. Issues at warning or informational severity MUST produce no event at all, so that a healthy run does not appear to be failing. An `error` event derived from a recorded issue MUST set `fatal` to false, MUST carry the issue's kind in `error_class`, and MUST carry in `detail` a reference by which the recorded issue can be located in the session's evidence. (The severity vocabulary, the `error_class` vocabulary, and the format of that reference are Open Question 20.)

**REQ-EVENTS-057** — A completed tool call MUST produce a `tool.start` and a matching `tool.finish` sharing a call identifier, with the finish carrying status, duration in milliseconds, and an error description when the call failed.

**REQ-EVENTS-058** — The status string on `session.end` is a free-form string and is NOT guaranteed to be a member of the run-status vocabulary of REQ-EVENTS-026; a consumer MUST NOT assume that enumeration for this field.

### G. Redaction and payload bounding

**REQ-EVENTS-059** — Masking MUST be a property of the event definition rather than of any particular producer: for the fields below, no line on stdout, no line in a stored history, and no event inside an exported document may carry a value to which the masking of REQ-EVENTS-060 and REQ-EVENTS-063 has not been applied — whatever code produced the event, and whether the field was populated when the event was built or set on it afterwards. The masked fields MUST be: `arguments` on `tool.start`; `summary` on `permission.decision`; `command` on `hook.start`; `output` on `hook.finish`; `summary` on `approval.requested`; and every string at any nesting depth within `row` on `transcript.row`. The mask literal MUST be exactly the three characters `***`, with nothing appended to it.

**REQ-EVENTS-060** — Argument masking MUST render every argument value as a string, since `arguments` is a string-to-string map on the wire. A value whose key names a credential MUST be replaced in its entirety by the mask literal, leaving no fragment of the original value. Key matching MUST be performed on a normalized form of the key in which every `_`, `-` and camel-case boundary becomes a single space and every letter is lower-cased, so that `apiKey`, `api_key`, `API-KEY` and `api key` all match alike; a key whose normalized form contains any of `api key`, `token`, `secret`, `password`, `credentials`, or `auth` MUST count as naming a credential. A credential-shaped substring appearing inside the text of a value whose key does not name a credential MUST also be replaced by the mask literal, with the surrounding text left readable. (Whether the key list is closed, and what defines a credential-shaped substring, are Open Question 21.)

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

**REQ-EVENTS-069** — Each run MUST publish its lifecycle pair exactly once: one `session.start` and one `session.end`, both on stdout in stream mode and in the session's stored history. Counting either type across the events of a single run MUST give exactly one, and no duplicate pair describing that run may be observed on either channel. A stored history covering several runs of one session (REQ-EVENTS-097) MUST therefore contain as many pairs as it contains runs.

**REQ-EVENTS-070** — For a run that started, the terminal `session.end` and `result` MUST be delivered through the normal event delivery path, while delivery is still active, so that an attached consumer observes how the run ended — exactly once, never zero times and never twice. Only a run that never started (and therefore has no session to address) may deliver its terminal result by the direct path; the two paths are mutually exclusive.

**REQ-EVENTS-071** — For a run that started, every exit path — normal completion, failure, and abrupt termination alike — MUST end it with its `session.end` followed by its terminal `result`, on stdout in stream mode and in the stored history alike. (A run that never started emits the terminal `result` alone, per REQ-EVENTS-021 and REQ-EVENTS-024.) After that `result`, no further event bearing that session id may be observed anywhere: the stored history gains no further line and no consumer receives another event. A later run MUST NOT be refused on the grounds that an earlier run used the same session id, MUST observe only the events it raised itself, and MUST NOT have any of its events delivered to a consumer that attached to the earlier run. Where the terminal status cannot be determined, the terminal pair MUST still be emitted, carrying the status REQ-EVENTS-027 assigns to a state that is not terminal.

**REQ-EVENTS-072** — Where an event mirrors a durable record, that record MUST already be written and readable by the time the event can be observed on any channel. In particular, a `tool.start` or `tool.finish` MUST NOT be observable before the corresponding row exists in `<session_dir>/evidence/tool-calls.jsonl`. A consumer holding such an event MUST therefore find the matching record already written, and a run killed between the two MUST leave a record with no event, never an event with no record. (Which further event types mirror a durable record, and where the diagnostics timeline is stored, are Open Question 26.)

**REQ-EVENTS-073** — Malformed source data behind a derived event MUST NOT abort the iteration it came from, nor the run. Exactly one of two things MUST happen: the event is emitted with the malformed portion coerced to the type the catalog declares for that field (a value of the wrong type rendered as its string form; an absent value replaced by the declared default), or no event is emitted for it and a warning is written to stderr. Either way the iteration MUST continue, its `iteration.end` MUST still be emitted, and the run's terminal status and exit code MUST be what they would have been had the source data been well formed. (Which malformations are recoverable is Open Question 22.)

**REQ-EVENTS-074** — An exception raised by a consumer MUST NOT fail the run: the exception MUST be swallowed into a logged warning. A faulty consumer may lose events for itself; the run's progress and outcome are unaffected.

**REQ-EVENTS-075** — Event delivery MUST be addressed per session: events for one session MUST NEVER be delivered to a consumer registered for another session, and there MUST be no fallback across sessions. Registering delivery for an empty session id MUST be rejected as invalid. Publishing when no consumer is registered MUST do nothing and MUST NOT raise.

**REQ-EVENTS-076** — Within a run the following orderings MUST hold, judged alike by position on stdout and by line position in the stored history: `session.start` precedes every other event of that run; `iteration.start` precedes its matching `iteration.end`; `child.spawn` precedes every other event naming that child, `child.complete` included; `tool.start` precedes the `tool.finish` sharing its `call_id`; `session.end` precedes `result`. Within a single iteration in which each of the following occurs once, their relative order MUST be `hook.start`, `hook.finish`, `checkpoint.created`, `approval.requested`, `permission.decision`, `gate.decision`, `gate.repair`, and none of them may be emitted more than once for the same occurrence.

**REQ-EVENTS-077** — `child.spawn` MUST be announced exactly once per child even when the spawn is reported through more than one internal path. `child.transition` MUST carry a real prior state, MUST suppress a repeated notification of the same state, and a child first seen partway through its life MUST still get a `child.spawn` emitted ahead of any other event referring to it.

**REQ-EVENTS-078** — Publishing MUST never propagate a failure outward: an error raised at any emission point MUST NOT abort an iteration, a hook, or the run.

### J. Durable per-session event store (write side)

**REQ-EVENTS-079** — A session's durable event history MUST live at `<session_dir>/evidence/events.jsonl`, beside the session's other evidence files, where session directories live at `<workspace>/.rotaris/sessions/<session_id>/`. A truncation marker, when it exists, MUST live at `<session_dir>/evidence/events.meta.json`.

**REQ-EVENTS-080** — A stored line MUST be byte-for-byte what the live stream would have emitted for the same event — same field names, same schema version, same key ordering — so that a consumer written for the live stream can read a stored file and vice versa.

**REQ-EVENTS-081** — Every run MUST leave a stored history, not only a `stream-json` run. Given the same task, an interactive text-mode run, a streamed run, and a headless automated run MUST each leave the same set of evidence file names in the session directory, and their stored histories MUST match one another under the field-by-field comparison of REQ-EVENTS-015. Whether a live consumer is attached decides only where events are additionally forwarded, never whether they are recorded. (Open Question 3 covers which run paths this guarantee spans.)

**REQ-EVENTS-082** — Recording MUST be independent of consumption. Where a consumer is attached and fails on every event it receives, the session's stored history MUST still contain that run's complete event sequence — the same lines, in the same order, that a fault-free consumer would have received — and the run MUST still reach its terminal `result` and exit with the code that outcome maps to (REQ-EVENTS-025).

**REQ-EVENTS-083** — A session's history file MUST exist from the start of a run (REQ-EVENTS-087) and MUST contain every event raised for that session, in emission order, up to and including that run's terminal `result`. Once that `result` has been written the file MUST gain no further line: any event bearing that session id raised afterwards MUST leave the file byte-identical, unless a later run resumes the same session, which appends its own events per REQ-EVENTS-097.

**REQ-EVENTS-084** — Given a store that cannot be attached (read-only session directory, full disk, a non-directory blocking the evidence path), the failure MUST degrade to a logged warning explaining that no durable history will exist for the session and that it can therefore be neither replayed nor exported; the run MUST continue and complete normally, and no exception may reach the caller.

**REQ-EVENTS-085** — A stored session's identity MUST be resolved in this order: the id supplied for it with leading and trailing whitespace removed, whenever that leaves a non-empty value; failing that, the name of the session directory the history is written into; failing both, the empty string. That resolved identity is the one reported for the session by `events list` (REQ-EVENTS-129) and the one an export falls back to (REQ-EVENTS-139), and it MUST NOT change because an individual recorded event carries a different `session_id`. The bytes of a recorded line MUST NOT be altered to impose it (REQ-EVENTS-080, REQ-EVENTS-095).

**REQ-EVENTS-086** — An absent store cap — and only an absent cap — MUST mean unbounded. A cap of zero or a negative cap MUST be rejected with a clear error stating that a numeric cap must be greater than zero and that unbounded is requested by supplying no cap at all. A configured `0` asks for an empty store and therefore MUST NOT be reinterpreted as "no limit".

**REQ-EVENTS-087** — Initializing a store MUST up front make the evidence directory and place an empty history file in it, alongside the other evidence files, so that the session directory already shows its full set of evidence files before the first event lands. Initialization failure MUST be reported as a failure rather than raising. No truncation marker file may exist until a trim actually drops lines.

**REQ-EVENTS-088** — Appending MUST never raise. A serialization failure MUST drop that one event with a warning and let later events land. A write failure (for example, a full disk) MUST produce a warning and a failure return value, not an exception.

**REQ-EVENTS-089** — A line containing a carriage return or line feed MUST be refused rather than appended, because such a character would split one record across two lines and corrupt both.

**REQ-EVENTS-090** — Stored bytes MUST use a single line feed as the record terminator on every platform, for both appended lines and lines rewritten during a trim, so stored bytes equal wire bytes even after a trim.

**REQ-EVENTS-091** — The default cap MUST be 20,000 events per session. The history MAY hold up to `cap + (cap ÷ 8, rounded down)` lines; an append that leaves the file holding more than that figure MUST be followed by a trim before any further append is accepted. A cap below 8 therefore trims at exactly the cap, and the default cap trims once the file exceeds 22,500 lines. A trim MUST keep the newest `cap` lines and discard the rest, MUST count the lines from the file's current contents rather than from a figure carried over from earlier appends, and MUST replace the file in one atomic step, so that an interruption during a trim leaves either the previous contents or the trimmed contents and never a partly rewritten file. A trim that did not complete MUST NOT be reflected in the truncation marker.

**REQ-EVENTS-092** — When a trim drops lines, a truncation marker file MUST be written atomically containing a single JSON object with sorted keys and a trailing newline, recording: whether the store is truncated, the cumulative number of dropped events, the cap in force (or null for unbounded), and the ISO-8601 UTC time of the last trim. An absent marker MUST be interpreted as zero drops. A marker that is corrupt or unreadable MUST be interpreted as untruncated rather than causing a failure. The marker MUST occupy its own file next to the history, never a line within it, so the invariant that each line of the history is a wire event continues to hold.

**REQ-EVENTS-093** — Reading store metadata MUST accept any of: the session directory, the history file path, or the marker file path, and resolve to the same answer. A session with no store at all MUST report no truncation.

**REQ-EVENTS-094** — Dropped-event counts MUST accumulate across store instances over the life of one session id, seeded from the marker. A resumed session, or a second process, MUST report the session's cumulative loss and MUST NOT reset to zero — reporting a lower figure would understate how much history an export is missing.

**REQ-EVENTS-095** — The store MUST NOT apply a second masking pass. The bytes written are exactly the bytes the schema already masked: a credential can reach the stored file only if it was present on the wire.

**REQ-EVENTS-096** — The store cap MUST NOT be exposed as a user-facing configuration key; it is a property of how a store is attached.

**REQ-EVENTS-097** — A resumed session MUST append to the same store file. A session run twice therefore holds both runs' events in one file, with `session.start` … `result` appearing twice.

**REQ-EVENTS-098** — Concurrent writers within one process MUST be serialized so that neither can split the other's line and a trim cannot race an append. Cross-process write safety for one session id is NOT guaranteed (see Open Questions).

### K. Reading a stored session (replay primitives)

**REQ-EVENTS-099** — Reading MUST be streaming and lazy: a reader MUST pull no further than the caller has consumed, and reading a long history MUST NOT require holding the whole file in memory. A read MUST accept either a path to a stored file or any sequence of lines supplied by the caller, so a stored file, a captured stream, or any other line source is handled the same way.

**REQ-EVENTS-100** — Reading MUST be read-only: it MUST NEVER rewrite, compact, or repair the store. Repeated reads of a damaged store MUST leave its bytes untouched.

**REQ-EVENTS-101** — A missing store file MUST read as an empty session; this is a successful outcome and MUST NOT be an error, since a session may have emitted nothing yet, or may be examined in the window before any event has landed. An unreadable store (for example, a permission failure) MUST log a warning and read as empty.

**REQ-EVENTS-102** — Reading MUST be forward compatible. When a stored line carries a type that is absent from this build's catalog, the reader MUST still return it, preserving the raw payload untouched and setting a flag that marks the type as unrecognized. It MUST NEVER be dropped and MUST NEVER raise. The set of recognized types MUST be derived from the current event catalog rather than written out separately, so that adding a type to the catalog immediately makes it recognized.

**REQ-EVENTS-103** — Reading a stored line MUST preserve its decoded payload exactly as the file holds it, and MUST make available the line's 1-based position in the file and whether its `event` value belongs to the catalog of REQ-EVENTS-041. An envelope field that is missing, or whose JSON type is not the type REQ-EVENTS-036 declares, MUST NOT fail the read and MUST NOT disturb any other field: `event`, `session_id` and `timestamp` read as the empty string unless the line supplies a JSON string, and `schema_version` and `iteration` read as having no value unless the line supplies a JSON number — no other JSON type may stand in for one. A line whose `event` therefore reads as empty counts as damaged rather than unrecognized (REQ-EVENTS-106).

**REQ-EVENTS-104** — A stored record MUST be able to re-render itself as a line byte-identical to the one the live stream would have written, produced from the stored payload itself, so that a type outside this build's catalog reproduces exactly as well.

**REQ-EVENTS-105** — Tolerant reading MUST be what a caller gets unless strict validation is asked for explicitly. No `events` invocation may fail, and no record may be withheld from its output, because a stored record carries an `event` value outside the catalog of REQ-EVENTS-041 (REQ-EVENTS-102, REQ-EVENTS-159). Where strict validation is requested instead, the read MUST stop at the first such record and report it as a validation failure, consistent with the strict-parsing rule of REQ-EVENTS-068: records preceding it are still produced, records following it are not.

**REQ-EVENTS-106** — A damaged line met while reading a whole file MUST be skipped rather than ending the read, and MUST produce exactly one warning. Each warning MUST carry the line's 1-based position in the file, a reason, and the first 200 characters of the offending line. Every warning MUST be logged, and MUST reach stderr wherever this specification requires it to be surfaced (REQ-EVENTS-151). The rendered one-line form MUST be `line {n}: {reason}`; the excerpt is carried by the warning but is not part of that rendering. The reasons MUST distinguish three cases: a line that is not valid JSON — which includes the truncated final line of a killed run — quoting the decoder's own message; a line that is valid JSON but not an object; and an object carrying no non-empty string `event` value, which counts as damaged rather than as an unrecognized type, since no type can be determined at all. Every event read before a damaged line MUST still be returned, and every event after it MUST still be read.

**REQ-EVENTS-107** — Blank and whitespace-only lines MUST be skipped silently with no warning.

### L. Resumable following of a growing store

**REQ-EVENTS-108** — A resumable read MUST accept a byte offset and return the events found after it, the new offset, and a restart flag. The returned offset MUST only ever be placed immediately after a completed record. The cost of a read MUST be proportional to what was appended since the offset, not to the length of the file.

**REQ-EVENTS-109** — Given nothing was appended since the offset, the read MUST return no events and the same offset.

**REQ-EVENTS-110** — Given a partial trailing line (a live writer mid-append), that fragment MUST be held without any warning — an incomplete tail is expected, not corruption — and MUST be delivered exactly once, whole, on a later read.

**REQ-EVENTS-111** — Given the file has become shorter than the offset, or the byte preceding the offset is not a record terminator, the read MUST set its restart flag and return the whole file starting from its first line, so that a caller can discard state derived from the earlier contents rather than continuing to append onto a history that has been replaced.

**REQ-EVENTS-112** — Given the file is missing, the read MUST return no events, offset `0`, and a restart flag that is true exactly when the caller's offset was greater than zero.

**REQ-EVENTS-113** — A corrupt line encountered in a resumable read MUST be skipped with a warning, and the offset MUST still advance past it so that the same corrupt line is not re-read forever.

**REQ-EVENTS-114** — Line numbers reported in resumable-read warnings are counted from the start of that read rather than from the start of the file, because counting from the file's start would force the full scan this mode exists to avoid.

**REQ-EVENTS-115** — Bytes in a resumable read that are not valid UTF-8 MUST produce a warning naming the decoding failure and MUST be skipped per line.

**REQ-EVENTS-116** — Successive resumable reads MUST deliver every event exactly once and in emission order, never delivering one twice. A final read after the run has ended MUST return nothing new.

### M. Query, filtering, and replay semantics

**REQ-EVENTS-117** — A query MUST support four independent filter axes: event types, iteration numbers, a lower time bound, and an upper time bound. An axis left unset MUST impose no restriction. Axes that are set MUST be combined with AND. Both time bounds MUST be inclusive. A query MUST be able to report whether it filters anything at all. Results MUST always be returned in original emission order.

**REQ-EVENTS-118** — An empty result MUST be a normal, successful answer at every layer — query, replay, and command line — and MUST NEVER be an error. A run that performed no tool calls simply yields zero matching events, which is a valid result.

**REQ-EVENTS-119** — Iteration attribution MUST be derived from iteration boundaries as the history is read: an event carrying an explicit iteration number retains it, while every other event takes whichever iteration is currently open; after an iteration ends, the context closes and subsequent events belong to no iteration; events before any iteration (such as `session.start`) MUST match no iteration filter. Asking for an iteration MUST therefore return the tool calls, permission decisions, and errors that happened inside it, not only the events that explicitly record the iteration number.

**REQ-EVENTS-120** — An event `timestamp` and the `--since` / `--until` bounds MUST all be read as ISO-8601 instants, a value carrying no offset being read as UTC, and MUST be compared as absolute instants: a bound written in one offset MUST select exactly the same events as the identical instant written in any other. An event whose `timestamp` is empty or is not a parseable instant MUST match no query that sets either bound, and MUST still be returned by a query that sets neither. A history mixing offsets, or mixing stamped and unstamped events, MUST still yield the complete matching set for a bounded query: setting a time bound may never end a read early and may never turn it into an error.

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

**REQ-EVENTS-130** — A session id supplied on the command line MUST be validated before it is used to locate anything on disk. The resolved candidate directory MUST lie inside the resolved workspace sessions root; otherwise it MUST resolve to "not found". An absolute path, or one containing parent-directory traversal, MUST NOT be able to make the command read a store outside the named workspace. An empty id, a non-directory, and a directory without a store MUST also resolve to "not found".

**REQ-EVENTS-131** — The sessions root used by the `events` commands MUST be derived from the workspace by the same path rule the run path uses when choosing where to write sessions, so that `events` commands always find the sessions `run` produced.

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

**REQ-EVENTS-144** — Batch export MUST produce one trajectory per requested session in the order requested, wrapped in a batch document carrying the trajectory version, the count of documents, and the list of trajectories.

**REQ-EVENTS-145** — Writing an export to a file MUST create missing parent directories, MUST write pretty-printed JSON with sorted keys, two-space indentation, and a trailing newline, and MUST write atomically, so that a partially written document can never be consumed as though it were complete.

### P. `events` command behavior (both surfaces)

**REQ-EVENTS-146** — The `events` group exit-code contract MUST be: `0` when the command completed its request, an empty result included; `2` when no stored history exists for the named session under the given workspace, or when a `--since` / `--until` value cannot be parsed.

**REQ-EVENTS-147** — `events list` MUST print one row per stored session to stdout, one row per line, in the order of REQ-EVENTS-124, each row carrying in this order: the session id, padded on the right to the width of the longest id in the listing so that the following columns align; the event count, right-aligned, followed by the word `events`; the time span; and, only when that store is truncated, a trailing element stating how many events were dropped. The time span MUST render as `-` when the session has no timestamps at all; as the start alone, with any fractional-seconds component removed, when there is no end timestamp or the end equals the start; and otherwise as the start and the end, both with fractional seconds removed, separated by an arrow. (Column spacing and the arrow glyph are Open Question 10.)

**REQ-EVENTS-148** — Given no session in the workspace holds a stored history, `events list` MUST write nothing at all to stdout — not even an empty line — MUST write to stderr a message containing the absolute path of the workspace it searched, and MUST exit `0`. (The wording is Open Question 10.)

**REQ-EVENTS-149** — `events replay` in its default human mode MUST print one line per matching event to stdout, in emission order, carrying, in this order: the event's `timestamp`, or `-` where it has none; the `event` value; the literal marker `(unknown)` where that value falls outside this build's catalog; and a detail rendering of the event's payload with the four envelope fields removed, serialized as one compact JSON object with sorted keys and truncated to 110 characters with a trailing ellipsis where longer. An event of an unrecognized type MUST be printed and flagged — never omitted — and MUST NOT stop the command. (Whether the 110 counts the ellipsis, and which character it is, are Open Question 23; field separators are Open Question 10.)

**REQ-EVENTS-150** — `events replay --json` MUST reproduce each matching stored line byte-for-byte as the live stream produced it, so one consumer implementation handles replayed output and live output interchangeably. For an unfiltered replay the emitted lines MUST equal the live run's lines exactly; for a filtered replay they MUST equal the corresponding subset.

**REQ-EVENTS-151** — Warnings about unreadable stored lines MUST go to stderr even under `--json`, so a pipe receives only events while a human still learns that a line was damaged. The message MUST name the line number and the reason.

**REQ-EVENTS-152** — Given a session id that resolves to no store in the named workspace, the command MUST write nothing at all to stdout — not even an empty line — MUST write to stderr a message containing both the id exactly as the user supplied it and the absolute path of the workspace searched, and MUST exit `2` — so that a mistargeted workspace can be told apart from a session that simply recorded nothing (which exits `0` with an empty result, REQ-EVENTS-118). An id that attempts to escape the workspace (REQ-EVENTS-130) MUST produce the same message form and the same exit code, and MUST NOT disclose whether anything exists at the path it named.

**REQ-EVENTS-153** — Given an unparseable `--since` or `--until` value, the command MUST write a message to stderr naming the flag as the user spelled it and quoting the rejected value, MUST exit `2`, and MUST refuse before reading any store content.

**REQ-EVENTS-154** — `events export --output PATH` MUST write to `PATH` the trajectory document for one session id, or the batch document for several, creating missing parent directories and writing atomically (REQ-EVENTS-145). It MUST write nothing at all to stdout, MUST write a confirmation to stderr stating the number of trajectory documents written and the absolute path they were written to, and MUST exit `0`. (The wording is Open Question 10.)

**REQ-EVENTS-155** — `events export` without `--output` MUST write the pretty-printed document to stdout — a single trajectory for one session, a batch document for several — and the output MUST parse as JSON.

**REQ-EVENTS-156** — `events export` MUST still emit the complete document and MUST still exit `0` while warning on stderr in either of these cases: the session holds more than one run, where the warning MUST state how many runs the document spans — the same figure the document's `summary.runs` carries — and that the identity fields describe the most recent of them (REQ-EVENTS-138); or the store is truncated, where the warning MUST state how many events were dropped — the same figure the document's `dropped_events` carries — and that the document therefore does not cover the whole history. Where both cases apply, both warnings MUST be written. Truncation MUST be a warning and never a failure: the partial document remains useful, and the `truncated` and `dropped_events` fields inside it let a consumer detect the gap.

**REQ-EVENTS-157** — Given a multi-session export in which any id cannot be resolved, the command MUST exit `2` and MUST write nothing partial — no file and no partial document on stdout.

**REQ-EVENTS-158** — For identical arguments, both surfaces MUST produce byte-identical replay output. The headless surface exists precisely for environments with no terminal that have only an exit code and a pipe.

**REQ-EVENTS-159** — Every `events` reading path MUST tolerate unknown event types and damaged lines without failing the command; each surface MUST adopt the reader's tolerance rather than making a separate determination of its own.

### Q. Cross-cutting integration invariants

**REQ-EVENTS-160** — For any run, the stored history MUST equal the emitted stream exactly: same payloads, same order, same envelopes; the first stored event `session.start`, the last `result`, exactly one `result`, and every stored event carrying the session's id.

**REQ-EVENTS-161** — The terminal `result` event MUST reach the store as well as any live consumer, so the store's last line is independent evidence that the terminal event traversed the normal delivery path.

**REQ-EVENTS-162** — An exported trajectory's event list MUST equal the lines the live stream emitted for the same run, and its summary counts MUST agree with what actually happened during the run.

**REQ-EVENTS-163** — The per-session evidence files are distinct contracts and MUST NOT be conflated by a consumer: the tool-call evidence log holds arguments exactly as they were passed, with no masking applied, while the event history holds only masked wire events.

**REQ-EVENTS-164** — A programmatic consumer MUST be able to iterate a run's events asynchronously while the run is still in progress, receiving the same events, in the same order, that the live stream carries. Pending events MUST be buffered up to 1024; while 1024 are outstanding, each further event MUST be discarded rather than blocking the run, and the number discarded MUST be readable by the caller once iteration has ended, so that an incomplete stream is detectable rather than silent. Discarding events MUST NOT affect the caller's ability to obtain the run's terminal outcome, which the call itself returns rather than requiring it to be recovered from the stream. Iteration MUST end once the `result` event has been yielded. This programmatic interface MUST carry its own version, independent of the event schema version, whose current value MUST be the string `"1"`. (Whether the discard count is observable mid-iteration is Open Question 24.)

**REQ-EVENTS-165** — A live consumer MUST receive every event raised for the session it is registered for, in emission order, with no event delivered twice and none skipped where the consumer returns normally; delivery MUST complete before the run proceeds past the operation that raised the event, so a slow consumer delays the run rather than losing or reordering events. Every event delivered MUST already satisfy the validation of REQ-EVENTS-017, so a consumer never receives a partially populated or unmasked event. A consumer that fails MUST NOT fail the run (REQ-EVENTS-074); the contract is nevertheless that a consumer returns without failing and does not block. (Whether any limit is enforced on how long it may take is Open Question 25.)

**REQ-EVENTS-166** — Decoding one event line, reading a whole stored history, or reading an exported trajectory document MUST require nothing beyond a standard JSON parser and this specification: no part of the agent runtime, no configuration loading, no network access, and no access to the workspace the run took place in. A stored history or an exported document copied to another machine MUST yield every field of every event when read there with a stock JSON parser.

**REQ-EVENTS-167** — The default wait for a human approval MUST be 300 seconds, and this value MUST be visible to consumers as the timeout field on `approval.requested`.

---

## Data & Formats

### On-disk layout

```
<workspace>/.rotaris/sessions/<session_id>/
  evidence/
    events.jsonl        # one wire event per line, LF-terminated, UTF-8, ASCII-escaped
    events.meta.json    # truncation marker; present only after a trim dropped lines
    tool-calls.jsonl    # separate contract: arguments verbatim (unredacted)
    permissions.jsonl   # separate contract: permission audit
```

Session directories are named after the session id, but an exported document prefers the id the events themselves recorded (REQ-EVENTS-139).

### Line format

One JSON object per line, compact (no whitespace after separators), object keys sorted, non-ASCII escaped, terminated by a single line feed. Two equal events produce byte-identical lines. Live stdout lines, stored lines, and `events replay --json` lines are byte-identical for the same event.

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
| `session.end` | `status` (free-form string), `stop_reason`, `iterations_completed` (int), `duration_seconds` (float or null), `tokens` (object or null), `cost` (object or null) |
| `iteration.start` | `iteration` (int), `task` |
| `iteration.end` | `iteration` (int), `outcome`, `summary` |
| `child.spawn` | `child_id`, `agent_name`, `task` |
| `child.transition` | `child_id`, `from_state`, `to_state` |
| `child.complete` | `child_id`, `report` (object or null) |
| `tool.start` | `tool_name`, `call_id`, `arguments` (string→string map; masked and clipped) |
| `tool.finish` | `tool_name`, `call_id`, `status`, `duration_ms` (float or null), `error` (string or null) |
| `permission.decision` | `request_id` (pairs with `approval.requested`), `tool_name`, `decision` (`deny` is the denial marker), `source`, `rule_id`, `summary` (masked) |
| `verifier.result` | `iteration`, `passed` (bool), `checks` (list of objects), `summary` |
| `verifier.progress` | `iteration`, `phase` (`started` \| `check_started` \| `check_finished`), `check`, `index` (1-based; `0` for `started`), `total`, `status` (only on `check_finished`), `elapsed_s`, `deadline_s` |
| `transcript.row` | `index` (int, upsert key), `row` (object; every nested string masked then clipped to 16,000 chars) |
| `usage.update` | `tokens` (object or null), `cost` (object or null) — cumulative |
| `error` | `message`, `error_class`, `detail`, `fatal` (bool, default false) |
| `result` | `result` (object; contains at least `status`, `session_id`, `stop_reason`, `summary`, `iterations_completed`, `report`, `tokens`, `cost`, `error`) |
| `hook.start` | `hook_id` (stable identity), `hook_name`, `lifecycle_point`, `scope` (`global` \| `workspace` \| `default`), `tool_name`, `command` (masked) |
| `hook.finish` | same identity fields plus `exit_code` (int or null), `duration_ms` (float or null), `blocked` (bool; only ever true at the pre-tool point), `timed_out` (bool), `skipped` (bool), `skip_reason`, `output` (masked, bounded) |
| `checkpoint.created` | `sequence` (int, monotonic per session), `ref`, `kind` (`iteration` \| `pre_restore` \| `manual`), `iteration` (int; `0` outside the loop), `changed_paths` (int count, never the paths) |
| `checkpoint.restored` | `sequence`, `restored` (bool), `safety_sequence` (int or null), `changed_paths` (`0` when refused), `blocked_reason` (empty on success) |
| `gate.decision` | `iteration`, `decision` (`passed` \| `gated` \| `exempt`), `reason`, `unsatisfied_checks` (list of strings), `advisory_failures` (list of strings), `llm_verdict` (string or null, retained even when overruled) |
| `gate.repair` | `iteration`, `action` (`retry` \| `escalate`), `attempt` (1-based), `max_attempts`, `remaining_attempts` (clamped ≥ 0), `unsatisfied_checks`, `reason` |
| `approval.requested` | `request_id`, `agent_name` (canonical; empty when unknown, never guessed), `persona`, `tool_name`, `rule_id`, `summary` (masked), `resolver`, `timeout_seconds` (float or null; null means "does not wait"), `unattended_reason` (currently only `headless_policy`) |

Transcript row keys are: `role` (one of `user`, `agent`, `thinking`, `tool`, `verifier`, `system`), `name`, `persona`, `content`, plus role-specific extras. Consumers read the keys they know and ignore the rest.

### Run status vocabulary and exit codes

| Status | Exit code |
| --- | --- |
| `completed` | 0 |
| `failed` | 1 |
| `error` | 1 |
| `max_iterations` | 2 |
| `interrupted` | 130 |

`events` group exit codes: `0` (success, including an empty result), `2` (no such stored session in this workspace, or an unparseable time bound). Headless `events` with no subcommand: help output, exit `1`.

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
| 110 chars | human replay-row detail limit, trailing ellipsis |
| 1024 | pending-event buffer for a programmatic consumer |
| 300.0 s | default approval wait, surfaced as `timeout_seconds` |

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

1. **Event cadence under a real model backend.** This specification fixes which events occur and in what relative order (REQ-EVENTS-076), not how frequently they arrive. Cadence, interleaving under genuine concurrency, and whether stderr must be kept free of output from third-party components during a streamed run are undecided.
2. **Cross-process store safety.** Write serialization is guaranteed only within one process (REQ-EVENTS-098). What happens when two processes append to one session's history concurrently — interleaving, trim races, marker races — is undefined and needs a decision: advisory lock, single-writer rule, or a documented prohibition.
3. **Which run paths the store guarantee spans.** REQ-EVENTS-081 requires every run to leave a stored history. Whether a desktop or bridge front end that drives the iteration loop itself is inside that guarantee, or is an explicit exclusion, needs a decision, and this specification must then say which.
4. **Full-disk and read-only-filesystem behavior.** REQ-EVENTS-084 and REQ-EVENTS-088 require degradation to a warning. The exact behavior on a genuinely full or read-only volume — in particular whether a partially written line can be left behind, and whether a trim that runs out of space can lose the history — is not fixed here.
5. **Non-UTF-8 console behavior end to end.** ASCII escaping (REQ-EVENTS-064) is intended to keep a streamed run safe on a legacy console encoding, but the behavior at the console boundary — including whether the human-readable stderr text is subject to the same escaping — is not specified.
6. **Ordering of identically stamped events for time-window filtering.** Timestamps are wall-clock and no monotonic ordering is guaranteed. The behavior of `--since` / `--until` under equal stamps, and under a clock that moves backwards mid-run, is undefined.
7. **Live trim races.** What a follower using the resumable read (REQ-EVENTS-108 – REQ-EVENTS-116) observes while a trim rewrites the same file concurrently, and whether the restart flag is guaranteed to be raised in that case, is undecided.
8. **Terminal rendering of aligned rows.** The listing and replay row formats are specified structurally (REQ-EVENTS-147, REQ-EVENTS-149); their legibility on a narrow terminal — whether rows should wrap, elide, or adapt to the detected width — is unresolved.
9. **`session.end` status vocabulary.** REQ-EVENTS-058 makes this field free-form, so it may carry values outside the run-status enumeration of REQ-EVENTS-026. Whether to normalize it to a single vocabulary, or to keep it free-form and say so, is an open decision.
10. **Exact row spacing and message wording.** The column separators and padding for `events list` (REQ-EVENTS-147) and `events replay` (REQ-EVENTS-149) rows, the arrow glyph used for a time span, and the exact wording of the export confirmation (REQ-EVENTS-154), the empty-listing message (REQ-EVENTS-148), the not-found message (REQ-EVENTS-152), the export warnings (REQ-EVENTS-156), the unserializable-event warning (REQ-EVENTS-032) and the `verifier.result` summary sentences (REQ-EVENTS-055) are not fixed. What information each must carry is specified; the wording should be fixed by the implementation's own tests.
11. **REQ-EVENTS-012 — first-run setup.** What first-run setup consists of, and the exact spelling of the version command that is exempt from it, are not determined by this specification.
12. **REQ-EVENTS-019 — outcome line for an empty summary on a failure.** `completed` falls back to `Done.` and `interrupted` to `Interrupted.`. No fallback is defined for `failed` or `max_iterations` when the run summary is empty: what should be printed?
13. **REQ-EVENTS-026 — exit code for an unmapped status.** A status outside the vocabulary must not exit `0`. Which non-zero code it must produce is not determined.
14. **REQ-EVENTS-027 — `stop_reason` and execution-state wire values.** The specification states the meanings that select each terminal status, not the exact strings. What are the canonical `stop_reason` values, and is the set closed? The same is unanswered for the session execution states the fallback path reads (`completed`, `failed`, `paused`, paused at the message limit, idle, running): what is each one spelled, and is "paused at the message limit" a state of its own or the paused state qualified by something else?
15. **REQ-EVENTS-047 — skipped hooks.** The vocabulary of `skip_reason` values, and the rule by which a workspace counts as untrusted for hook execution, are not determined.
16. **REQ-EVENTS-048 — `lifecycle_point` vocabulary.** The complete set of `lifecycle_point` values, and the exact spelling of the pre-tool point on which `blocked` may be true, are not determined.
17. **REQ-EVENTS-049 — `resolver` vocabulary.** The set of `resolver` values, and which of them wait for a response (which is what makes `timeout_seconds` null rather than `300.0`), are not determined.
18. **REQ-EVENTS-052 — transcript row lifecycle.** Does a row that is already in its final form when it first appears produce one event or two? And what recovery is offered to a live consumer that detects an index gap, given that the live stream cannot be rewound?
19. **REQ-EVENTS-054 / REQ-EVENTS-055 — verifier check vocabulary.** The `status` values a finished check may report, and the field shape of an entry in the `checks` list on `verifier.result`, are not determined. Nor is what `passed` reports when the suite was skipped rather than run: is a skipped suite `passed` true or false?
20. **REQ-EVENTS-056 — issue severity, error class, and evidence reference.** Three facts are missing: the exact severity vocabulary of a recorded issue (only the meanings "error", "warning" and "informational" are fixed here, not their spellings); the vocabulary of issue kinds that reach the wire as `error_class`; and what identifier or locator the `detail` field carries so that a consumer can find the recorded issue in the session's evidence.
21. **REQ-EVENTS-060 — credential detection.** Is the credential key list (`api key`, `token`, `secret`, `password`, `credentials`, `auth`) closed, or open-ended? And what patterns define a credential-shaped substring found inside the text of a value whose key is innocuous?
22. **REQ-EVENTS-073 — recoverable versus dropped events.** Which malformations of the underlying data must be coerced into a valid event, and which must instead drop the event with a warning, are not determined.
23. **REQ-EVENTS-149 — replay detail truncation.** Does the 110-character detail limit include the trailing ellipsis, and which character is the ellipsis? Elsewhere the specification uses `…` and counts it beyond the limit (REQ-EVENTS-061, REQ-EVENTS-063); it is not stated whether this limit follows the same rule.
24. **REQ-EVENTS-164 — visibility of the discard count.** Must the number of discarded events be readable while iteration is still in progress, or only once it has ended?
25. **REQ-EVENTS-165 — consumer time budget.** Is any bound enforced on how long a live consumer may take before the run proceeds — a watchdog, a detachment threshold — or is "returns promptly" advisory only?
26. **REQ-EVENTS-072 — which events mirror a durable record.** Only the tool-call evidence log is named on disk, so only `tool.start` and `tool.finish` can be tested against it. Which further event types have a durable counterpart that must be committed before the event becomes observable — `permission.decision` against `permissions.jsonl`, `error` against a diagnostics timeline — and where that diagnostics timeline lives in the session directory, are not determined.
