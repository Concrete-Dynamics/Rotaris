# Machine-Readable Event Stream, Replay, and Trajectory Export — What a session keeps, and who reads it

Part 6 of 7 of [domain 20](../20-event-history-replay-export.md), which indexes every part.

## Data & Formats

### What a session keeps, and who reads it

A session's records are durable records that only this application reads. This document fixes no path, no file name and no enclosing directory for any of them (REQ-EVENTS-079 withdrawn); where they live is domain 07's and the storage decision's.

| Record | Contract |
| --- | --- |
| the event history | one record per wire event, in emission order, each holding verbatim what the live stream emitted (REQ-EVENTS-080); at most one writer, being the holder of the session's lock (REQ-EVENTS-098) |
| the truncation record | the four facts of REQ-EVENTS-092; exists only once a trim has dropped events; absent reads as not truncated, zero dropped |
| tool-call evidence | separate contract: arguments verbatim, unredacted (REQ-SESSION-136) |
| the permission audit | separate contract (REQ-TOOLS-078, REQ-SESSION-137) |
| the verification-gate record | separate contract (REQ-TOOLS-190); deliberately produces no wire event (REQ-EVENTS-177) |

None of these is conflated with another and no figure taken from one describes another (REQ-EVENTS-163). A session is identified by its session id, but an exported document prefers the id the events themselves recorded (REQ-EVENTS-139).

### Record locators

A reference from one record to an entry of another is the string `<record kind>#<record id>`, fixed by
REQ-EVENTS-056 and restated here rather than defined. The record-kind token set is closed at three, and
each id is the identifier the named kind's own requirement gives its entries:

| Token | Record | Record id | Has an export? |
| --- | --- | --- | --- |
| `issues` | the session's issues record (REQ-SESSION-135) | the issue's `id`, 12 hex characters | yes (REQ-SESSION-199) |
| `permission_audit` | the session's permission audit (REQ-SESSION-137, REQ-TOOLS-078) | REQ-TOOLS-079's to fix; a field of the decision entry, and mode-change entries have none | yes (REQ-SESSION-199) |
| `tool_call_evidence` | the tool-call evidence record (REQ-SESSION-136) | the record's `call_id` | **never** (REQ-TOOLS-190) |

A locator is carried opaquely: no export dereferences one, and where the named kind has no export the
locator names something a reader must return to the application to see (REQ-EVENTS-056).

### Line format — the export

One JSON object per line, compact (no whitespace after separators), object keys sorted, non-ASCII escaped, terminated by a single line feed on every platform (REQ-EVENTS-090). Two equal events produce byte-identical lines. The event as delivered live, the event as stored, and the line handed over by REQ-EVENTS-172 are byte-identical for the same event. This format is what leaves the application; it is not a claim about how the history is stored, and a store whose records are not separated by newlines satisfies it by exporting in this form.

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
| `session.end` | `status` (one run status of REQ-EVENTS-026, or `""` meaning unknown), `stop_reason` (one member of the closed stop-reason set of REQ-MONITOR-301, or `""`), `iterations_completed` (int), `duration_seconds` (float or null), `tokens` (object or null), `cost` (object or null) |
| `iteration.start` | `iteration` (int), `task` |
| `iteration.end` | `iteration` (int), `outcome`, `summary` |
| `child.spawn` | `child_id`, `agent_name`, `task` |
| `child.transition` | `child_id`, `from_state`, `to_state` (each one child state of REQ-MONITOR-014, the pair being a move the table of REQ-MONITOR-300 permits; this document holds no copy of either) |
| `child.complete` | `child_id`, `report` (object or null) |
| `tool.start` | `tool_name`, `call_id`, `arguments` (string→string map; masked and clipped) |
| `tool.finish` | `tool_name`, `call_id`, `status` (one settled value of the tool-status vocabulary REQ-MONITOR-105 fixes, never that vocabulary's `running` — REQ-EVENTS-057; this document holds no copy of the set), `duration_ms` (float or null), `error` (string or null) |
| `permission.decision` | `request_id` (pairs with `approval.requested`), `tool_name`, `decision` (one value of the decision vocabulary REQ-TOOLS-079 fixes, not copied here; `deny` is the value a consumer counts as a denial), `source` (a decision-source value of REQ-TOOLS-028), `rule_id`, `summary` (masked) |
| `verifier.result` | `iteration`, `passed` (bool; blocks-completion, not verification-occurred — REQ-EVENTS-055), `checks` (list of objects: `name`, `command` (masked), `status`, `severity`, `exit_code`, `duration_ms`, `skip_reason`, `output_path`), `summary` |
| `verifier.progress` | `iteration`, `phase` (`started` \| `check_started` \| `check_finished`), `check`, `index` (1-based; `0` for `started`), `total`, `status` (one of the five check statuses of REQ-ORCH-123, this document holding no copy of them; only on `check_finished`, `""` otherwise), `elapsed_s`, `deadline_s` |
| `transcript.row` | `index` (int, upsert key), `row` (object; every nested string masked then clipped to 16,000 chars) |
| `usage.update` | `tokens` (object or null), `cost` (object or null) — cumulative |
| `error` | `message`, `error_class`, `detail`, `fatal` (bool, default false) |
| `result` | `result` (object; contains at least `status`, `session_id`, `stop_reason`, `summary`, `iterations_completed`, `report`, `tokens`, `cost`, `error`) |
| `hook.start` | `hook_id` (stable identity), `hook_name`, `lifecycle_point` (one of the seven hook events of REQ-HOOKS-001), `scope` (one scope value of REQ-HOOKS-020, the external-agent scope that requirement names included; this document holds no copy of the set), `tool_name`, `command` (masked) |
| `hook.finish` | same identity fields plus `exit_code` (int or null; null, never `-1`, for a hook that produced no exit status), `duration_ms` (float or null), `blocked` (bool; only ever true at `pre_tool`), `timed_out` (bool), `skipped` (bool), `skip_reason` (one of the two values REQ-HOOKS-126 defines — `untrusted_workspace` or `plan_gate` — this document holds no copy of their meanings), `output` (masked, bounded) |
| `checkpoint.created` | the payload REQ-GIT-067 fixes, over the checkpoint record of REQ-GIT-016 and the sequence numbering of REQ-GIT-046; this document holds no copy of the field set or of the `kind` vocabulary, and adds only that the changed-path figure travels as a count and never as the paths (REQ-EVENTS-043) |
| `checkpoint.restored` | the payload REQ-GIT-068 fixes; this document holds no copy of the field set, and adds only the reading obligations of REQ-EVENTS-044 — the safety sequence is read explicitly and never inferred from the restored flag |
| `gate.decision` | `iteration`, `decision` (one value of the closed completion-gate decision set REQ-ORCH-116 fixes, not copied here), `reason`, `unsatisfied_checks` (list of strings), `advisory_failures` (list of strings), `llm_verdict` (string or null, retained even when overruled) |
| `gate.repair` | `iteration`, `action` (the two-valued repair decision of REQ-ORCH-118, spelled on the wire by REQ-EVENTS-046, which this table does not restate), `attempt` (1-based), `max_attempts`, `remaining_attempts` (clamped ≥ 0), `unsatisfied_checks`, `reason` |
| `approval.requested` | `request_id`, `agent_name` (canonical; empty when unknown, never guessed), `persona`, `tool_name`, `rule_id`, `summary` (masked), `resolver`, `timeout_seconds` (float or null), `unattended_reason` — the three values REQ-TOOLS-061 fixes for this event, whose vocabularies this table does not restate; what this document adds is the reading obligations of REQ-EVENTS-049, chiefly that `timeout_seconds` is null exactly on the resolver that never waits |

The `row` object is the persisted transcript row copied verbatim onto the wire (REQ-EVENTS-052), so its keys and its role vocabulary are the ones REQ-SESSION-121 fixes; this document holds no copy of either and adds only the masking and clipping of REQ-EVENTS-059 and REQ-EVENTS-063. That role vocabulary is open rather than closed: a consumer MUST carry an unrecognized role through unaltered rather than rejecting the row or the line, exactly as it does for an unknown key (REQ-EVENTS-039), and MUST NOT treat the roles it knows as an exhaustive set. Consumers read the keys they know and ignore the rest.

### Run status vocabulary

Exactly the closed terminal run-result set of REQ-ORCH-083, carried onto the wire by REQ-EVENTS-026; this document holds no copy of it. The application does not exit when a run ends, so no process exit code is fixed by this document or by any other (REQ-EVENTS-025 withdrawn, REQ-ORCH-083).

Selection (REQ-EVENTS-027): from the recorded stop reason, by the closed set and total mapping of REQ-MONITOR-301; where the run recorded none, from the persisted `execution_status` by the total mapping of REQ-SESSION-076 over the vocabulary of REQ-SESSION-073. Neither set nor mapping is copied here.

### Truncation record (REQ-EVENTS-092)

Four facts, carried with the session's own record and made durable in the same indivisible step as the trim that produced them:

| Fact | Type | Meaning |
| --- | --- | --- |
| truncated | bool | whether any event was ever dropped |
| dropped events | int | cumulative over the life of this session id, across runs and across launches of the application (REQ-EVENTS-094) |
| cap in force | int or null | null when unbounded |
| last trimmed at | string | ISO-8601 UTC |

An absent truncation record means zero drops, and so does a session with no stored history at all; neither is an unknown figure and neither is a failure. These are not event records and never appear among the events an export emits; the trajectory document carries the first two under its own key names (REQ-EVENTS-140, and the document's key inventory is REQ-SESSION-193's).

### Trajectory document

| Field | Meaning |
| --- | --- |
| `trajectory_version` | `1` |
| `session_id` | resolved per REQ-EVENTS-139 |
| `task`, `workspace`, `persona`, `permission_mode` | from the last `session.start` |
| `started_at`, `ended_at` | timestamps of the first and last exported events |
| `status`, `stop_reason`, `duration_seconds` | from the last `session.end`, falling back to the last `result` |
| `truncated`, `dropped_events` | from the truncation record (REQ-EVENTS-092, REQ-EVENTS-094) |
| `summary` | see below |
| `events` | stored payloads, in order, copied exactly as written |

Summary block: `event_count`, `unknown_event_count`, `read_warning_count`, `runs`, `iterations`, `iterations_completed`, `tool_calls`, `tool_failures`, `permission_decisions`, `permission_denials`, `verifier_runs`, `verifier_failures`, `child_agents`, `errors`, `fatal_errors`, `event_counts` (per-type map with sorted keys, including unknown types), `tokens`, `cost`.

Batch document: `{"trajectory_version": 1, "count": <N>, "trajectories": [ ... ]}` — the closed three-key
inventory REQ-EVENTS-144 fixes, restated here and fixed there. `count` is the number of elements in
`trajectories`; the wrapper carries no fourth key, and REQ-SESSION-189 is a follower rather than a second
definition.

Files are written pretty-printed (sorted keys, two-space indent) with a trailing newline, atomically.

### Bounds and constants

Every figure below is a restatement of the requirement named beside it, which is where it is fixed; where a row states that this document fixes no figure, the named requirement is the only place the value is stated and this table holds no copy of it.

| Value | Meaning | Fixed by |
| --- | --- | --- |
| `1` | event schema version | REQ-EVENTS-038 |
| `1` | trajectory document version | REQ-EVENTS-133 |
| `"1"` | programmatic consumer API version | REQ-EVENTS-164 |
| 16,000 chars | transcript-row string limit, trailing `…` | REQ-EVENTS-063 |
| 240 chars | tool-argument value limit, trailing `…` (clipped values are 241 chars) | REQ-EVENTS-061 |
| `***` | mask literal | REQ-EVENTS-059 |
| not fixed here | default of `runtime.event_retention_per_session`, and the reading of `0` as never trimming | REQ-CONFIG-473; the behavior of the cap it sets is REQ-EVENTS-091's |
| cap ÷ 8 | headroom of events permitted above the cap before a trim runs | REQ-EVENTS-091 |
| 200 chars | reader warning excerpt limit | REQ-EVENTS-106 |
| 110 chars | history-row detail limit, trailing `…` (clipped details are 111 chars) | REQ-EVENTS-170 |
| 1024 | pending-event buffer for a programmatic consumer | REQ-EVENTS-164 |
| not fixed here | the approval wait surfaced as `timeout_seconds` | REQ-CONFIG-126; its appearance on the wire is REQ-EVENTS-167's |
| 5 s | bound on delivering one event to one live consumer before it is detached | REQ-EVENTS-165 |
| 100 ms | bound on reflecting a filter change on an already-read history | REQ-EVENTS-175 |

### Read-damage warning reasons

| Condition | Reason text shape |
| --- | --- |
| blank / whitespace line | (skipped silently, no warning) |
| invalid JSON | `not valid JSON ({decoder message})` |
| valid JSON, not an object | `not a JSON object` |
| object with no non-empty string `event` | `no 'event' discriminator` |
| undecodable bytes | `not valid UTF-8 (...)` |

Rendered warning: `line {n}: {reason}`.

---
