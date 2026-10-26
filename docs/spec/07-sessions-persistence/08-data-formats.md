# Session Persistence, Resume, and Background Sessions — Where things are kept

Part 8 of 9 of [domain 07](../07-sessions-persistence.md), which indexes every part.

## Data & Formats

The shapes below are observable three ways: as wire events a consumer subscribes to, as the files listed here, and as the exports of REQ-SESSION-189 and REQ-SESSION-199. Where a shape is a machine-readable contract its field names are fixed and are stated as such; where a shape is only ever read by this application, what is fixed is the field set and what each field means, and no encoding is fixed by naming one.

### Where things are kept

Only what a person or another tool opens directly is a file; everything else a session records is held in
the workspace's durable session store, and what makes that store reachable is the workspace identifier
rather than a path (REQ-SESSION-197, REQ-SESSION-198).

```
the workspace, exactly where the user keeps it
  .rotaris/
    the workspace identifier        # stable, human-readable, travels with the workspace (REQ-SESSION-197)
    configuration, personas, model slots   # YAML the user edits; version control tracks it

this machine's own per-user storage  # never inside the workspace, never on synchronised storage
  the workspace's durable session store, located by the workspace identifier and never by path
    per session: the listing record (REQ-SESSION-030); the resumable state; the transcript rows and
      their released pages (REQ-SESSION-131, REQ-SESSION-192); the edit diffs; the launch audit
      (REQ-SESSION-138); the lock record (REQ-SESSION-046); the durable event history and the record
      of what a trim dropped (REQ-SESSION-143, REQ-SESSION-144); the timeline; the issues record;
      the metrics document; the evidence records — tool calls, model inputs, context selections,
      report validations, memory, the permission audit, and the conversation index with its events;
      the checkpoint list; the delegated-child records
  per session, as files held with the store (REQ-SESSION-002)
    the session log                 # REQ-SESSION-142; opened by REQ-SESSION-191
    the summary                     # REQ-SESSION-140; derived, written for a person to read
    artifact, attachment and image bodies   # referenced by the record, never held inside it

the user's own repository
  refs/rotaris/checkpoints/         # checkpoint refs (REQ-SESSION-162)
```

The four records a file manager no longer reaches — the timeline, the issues record, the metrics document
and the permission audit — are obtained through the export of REQ-SESSION-199; the event history through
the export of REQ-SESSION-189.

Nothing under `this machine's own per-user storage` is reached by backing up, copying or synchronising the
workspace, which is what REQ-SESSION-200 obliges the product to say and REQ-SESSION-201 gives the user a
remedy for. Everything under `the workspace` and `the user's own repository` travels with the user's own
material and needs nothing from this product.

### Session id

`YYYYMMDD-HHMMSS-` + 12 lowercase hex characters; regex `^\d{8}-\d{6}-[0-9a-f]{12}$`. The id is a lookup key and never a path (REQ-SESSION-010, REQ-SESSION-151). Ids are never reused (REQ-SESSION-009, REQ-SESSION-012).

### Resumable state

One record carrying `schema_version` (currently 1). Field inventory (bulk content referenced rather than copied, per REQ-SESSION-029; `workspace_root` is the run's effective root, which for a worktree-bound run is the worktree path and not the anchoring workspace of REQ-SESSION-001): `session_id`, `workspace_root`, `created_at`, `updated_at` (UTC, `Z`-suffixed), `config_snapshot`, `transcript_events`, `ui_edit_diffs`, `child_states`, `report_artifacts` (refs with `id`/`agent_name`/`status`/`path`), `todo_state`, `agent_todo_state`, an outer-loop progress record (nullable), `token_usage` (nullable legacy aggregate), `execution_status`, `exhausted_provider_models`, `message_count`, `message_limit` (nullable), `wait_state` (nullable), `run_intent`, `permission_mode`, `check_suite` (nullable), `sandboxed`, `sandbox_backend`, `requirement_id`, `unit_id`, `worktree` (nullable binding record), `checkpoints`, `last_restored_sequence` (nullable, default null — REQ-SESSION-195), `internal`, `run_type`, `global_tool_call_count`, `global_token_usage`, `global_cost` (default reads as source-unavailable), `global_compressions`, `agent_metrics` (map of agent name to `{tool_call_count, tool_calls, token_usage, cost, compressions, last_prompt_tokens}`), `root_context_tokens`, `seen_compression_ids` (map of agent name to sorted id list), `pending_questions`, `pending_approvals` (map of request id to payload), `verifier_state` (nullable), `gate_warning`, `active_model_key` (nullable), `runtime_model_configs`, `improvement_artifact_ids`.

Worktree binding record: the field set, the closed `merge_status` vocabulary and the defaults of REQ-GIT-015; this document holds no copy of any of them (REQ-SESSION-018). Persisted under `worktree`, null where the session has none.

Checkpoint entry: the persisted checkpoint record of REQ-GIT-016 — its field set, its defaults, and its closed `kind` vocabulary — which this document holds no copy of. What this document adds is where the record lives and in what order (REQ-SESSION-162): under `checkpoints`, the list ordered newest-last.

### Listing record

Exactly: `session_id`, `created_at`, `updated_at` (ISO strings), `execution_status`, `schema_version`, `internal`, `worktree` (record or null), `checkpoint_count`, `task_title`, `requirement_id`, `unit_id`, `awaiting_input`. Reader defaults: `checkpoint_count` 0, `task_title` falls back to the session id, attribution empty, `awaiting_input` false. The field set and those defaults are fixed by REQ-SESSION-030, and a listing reads nothing else but the lock record (REQ-SESSION-042).

### Status vocabulary and run outcomes

- Active statuses (assert an in-progress run): `starting`, `running`, `background`, `waiting`, `pausing`, `cancelling` (REQ-SESSION-055).
- Terminal/idle/blocked statuses: `idle`, `paused`, `paused_message_limit`, `awaiting_plan_decision`, `completed`, `failed`, `stopped`, `interrupted` (repair-only). Together with the six active values this set is the whole closed vocabulary (REQ-SESSION-073), which is the single definition every other document cites.
- Stop reasons and their classification: REQ-MONITOR-301 (this domain restates neither, REQ-SESSION-077).
- Child terminal states: the terminal subset REQ-MONITOR-300 declares absorbing, over the state set of REQ-MONITOR-014; this document holds no copy of either.
- Terminal run outcomes: the closed set of REQ-ORCH-083, carried here through REQ-SESSION-187; this document holds no copy of it. No outcome is expressed as a numeric code.
- Session lock record: `{"pid": <int>, "host": "<machine id>", "acquired_at": "<UTC ISO>"}` — the same three field names and value types REQ-GIT-020 fixes. A `host` that is not this machine is never reaped and is reported as a session held by another machine (REQ-SESSION-047, REQ-SESSION-048).

### Wire and stored events

Every event the run published, recorded in the order emitted, each reproducing every field the live stream emitted (REQ-SESSION-143); the line-delimited form a user can take away is the export's (REQ-SESSION-189). The event catalogue itself, and each type's payload fields, are fixed by REQ-EVENTS-041 and the event-history document's own catalogue; this document holds no copy of either and lists below only the types with persistence significance: `session.start` (first event of every run; payload per REQ-SESSION-090), `session.end` (mirrors the terminal result), `result` (exactly once per run), `transcript.row` (index + row copy, on append and settle), `tool.start`/`tool.finish`, `iteration.start`/`iteration.end` (iteration attribution boundaries), `gate.decision`, `gate.repair`, `error` (from error-severity issues, `fatal: false`). Unknown event types must survive read and export intact.

### Transcript rows

Persisted dictionaries with roles: `user`; `system`; `agent {name, persona, content}`; `thinking {name, persona, content, started_at?, chars, duration?}`; `tool {name, persona, tool, content (summary), detail (≤400 chars, single line), full_text (≤2000), full_detail (line structure preserved), tool_event_key, tool_terminal, status (one value of the four-value tool-row status vocabulary REQ-MONITOR-105 fixes, not copied here), started_at, duration?, stream_id? ("fg:<agent_name>" for terminal tools)}`; `verifier` (tool-shaped, `tool_event_key = "verify:<iteration>:<index>"`; a check outcome reaches this row's `status` through the mapping of REQ-NOTIFY-142, total over the closed five-value check-outcome set of REQ-ORCH-123 and into the row-status vocabulary of REQ-MONITOR-105 — neither set nor mapping is copied here, REQ-SESSION-129). Every row carries `ts` in local `HH:MM:SS`. Thinking content caps at 4000 chars while `chars` keeps counting.

Edit diffs persist separately keyed `diff_id = "<agent>:<tool_event_key>"` and merge beside exactly one row at display time.

### Timeline, issues, tool calls, permissions

- Timeline entry: `{id: 12 hex, timestamp: UTC ISO, type, severity (default info), actor, message, metadata}`; durable entry first, derived wire event second (REQ-SESSION-134).
- Issue: `{id: 12 hex, timestamp, kind, severity, actor, message, evidence_ref, metadata}` (REQ-SESSION-135). `evidence_ref` is empty or a `<record kind>#<record id>` locator whose form and closed token set are REQ-EVENTS-056's; nothing that reads or exports these records resolves one.
- Tool call: `{timestamp, agent_name, tool_name, call_id, status, elapsed_ms, is_error}` + optional `args`, `result`, `outcome_kind`, `exit_code`, `failure_kind`, `warnings`; error-path args/result truncated to 2000 chars (REQ-SESSION-136).
- Permission decision: `{timestamp, session_id, agent_id, persona, tool_name, decision, rule_id, source, summary, reason, request_id?}`; mode change: `{event: "permission_mode_change", requested_mode, effective_mode, previous_mode, source, reason, skipped_personas}` (REQ-SESSION-137). Entries stand in the order the decisions were taken and are never altered; the export of REQ-SESSION-199 must show that, and must say so where the retention cap has dropped earlier entries.
- Repair timeline entry: type `session.interrupted_recovered`, severity `warning`, actor `rotaris`, message `Session was still marked '<status>' but <reason>; status set to 'interrupted'.`, metadata `{previous_execution_status, execution_status, reason}`.

### Trajectory export document

The document's content is fixed by REQ-SESSION-153 and its top-level key names by REQ-SESSION-193; the outline below restates neither and is given so the file's shape is readable beside the rest of this section. `trajectory_version: 1`; identity (session id, task, workspace as the run reported it); permission mode; started/ended; status; stop reason; duration; `truncated`/`dropped_events`; recomputed summary (event/unknown/warning counts, `runs` = count of `session.start` boundaries, iterations, tool calls/failures, permission decisions/denials, verifier runs/failures, child agents, errors/fatal errors, per-type counts, tokens, cost); raw stored events (redaction inherited from the wire schema; unknown types intact).

Several sessions exported together are wrapped in the batch document of REQ-EVENTS-144, whose closed
three-key inventory is that requirement's and is neither restated nor extended here.

### Concrete constants

Every figure below is a restatement of the requirement named beside it, which is where it is fixed; where a row states that this domain fixes no figure, the named requirement is the only place the value is stated and this table holds no copy of it.

| Constant | Value | Fixed by |
| --- | --- | --- |
| State schema version | 1 | REQ-SESSION-013 |
| Cancel grace before hard cancel | 30.0 s | REQ-SESSION-092 |
| File-replacement retry (Windows access denied) | 5 attempts; backoff 0.05/0.1/0.2/0.4/0.8 s | REQ-SESSION-033 — the only replacement ladder this domain states |
| Event history cap / trim slack | not fixed by this domain | REQ-CONFIG-473 (the cap), REQ-EVENTS-091 (the headroom and the trim); consumed here by REQ-SESSION-144 |
| Stale-lock reap attempts | 1 reap, 2 create attempts total | REQ-SESSION-047 |
| Diagnostics ring caps | issues 500; tool calls 5000; model inputs 5000; context selections 2000; permissions 5000; report validations 2000; memory 2000 | REQ-SESSION-133 |
| Transcript caps | detail 400; full text 2000; full detail 8000; thinking 4000 chars | REQ-SESSION-122 |
| Resident transcript window | 5000 rows, older rows released to the record | REQ-SESSION-192 |
| Released transcript page size | 50 rows | REQ-SESSION-131 |
| Truncation marker | `...`, counted inside the cap | REQ-SESSION-194 |
| Follow-up payload budgets | 6 events; 700 chars/event; 3200 chars history; 20 todos; 5 iterations; 700 chars/item; 6000 chars latest artifact; 8000 chars artifact baseline; 80-char titles | REQ-SESSION-115 |
| Summary task line cap | 240 chars | REQ-SESSION-140 |
| Reader warning excerpt cap | 200 chars | REQ-SESSION-148, over the reader-warning rule of REQ-EVENTS-106 |
| Replay compact payload cap | 110 chars | REQ-SESSION-188, under the marking rule of REQ-SESSION-194 |
| Slowest tools reported | 10 in metrics; 5 in summary | REQ-SESSION-139, REQ-SESSION-140 |
| Save timing | no debounce and no write-volume bound; a save is durable when requested | REQ-SESSION-067, REQ-SESSION-071 |
