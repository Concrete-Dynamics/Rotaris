# Run Monitoring and Steering — What a run leaves behind (externally observable)

Part 7 of 8 of [domain 02](../02-run-monitoring-steering.md), which indexes every part.

## Data & Formats

### What a run leaves behind (externally observable)

Where a session's record is held, and which parts of it remain files, is fixed by REQ-SESSION-001, REQ-SESSION-002 and REQ-SESSION-198; this document holds no copy of that and names no path. Listed below are only the record kinds a monitoring surface reads, so that the parity test of REQ-MONITOR-299 has a named set to compare. The test compares kinds, not directory entries: a run that nothing watched must leave every kind a watched run leaves.

- **The listing record** — the only thing a session listing reads (REQ-MONITOR-235), never observed part-way through a save (REQ-SESSION-028).
- **The resumable state** — what reopening a session restores it from (REQ-SESSION-037, REQ-SESSION-196).
- **The transcript rows** — the user-facing transcript, recorded as the run goes and equal to what the user watched (REQ-MONITOR-242, REQ-MONITOR-248).
- **The event history** — recorded in emission order, never rewritten, readable from an arbitrary recorded position (REQ-MONITOR-237).
- **The produced artifacts** — identity, ownership and ordering held in the record; bodies held as files (REQ-SESSION-002).
- **The per-session log** — a file, at the configured level (REQ-MONITOR-238, REQ-SESSION-142).

### Listing-record keys

The key set is fixed by REQ-SESSION-030, together with the reader defaults for a record written by an older version; this document holds no copy of it. What the key set means to a listing this domain shows: `awaiting_input` is true exactly when the session has pending approvals or pending questions (REQ-SESSION-031); sessions sort by `updated_at` descending; a listing record that cannot be interpreted is skipped, never fatal; and the schema version and the refusal of a newer one are REQ-SESSION-013's and REQ-SESSION-038's.

### Status vocabularies

- Execution status (persisted), and which of its values claim a live run: REQ-SESSION-073 and REQ-SESSION-055. This document holds no copy of either set (REQ-MONITOR-024).
- Agent state: `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`, `waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked`; terminal subset `succeeded`, `failed`, `cancelled`, `blocked` (REQ-MONITOR-014). Legal transitions: REQ-MONITOR-300.
- Presentation run state, and the normalisation of a persisted status into it: REQ-NOTIFY-048, REQ-NOTIFY-049, REQ-NOTIFY-050. This document holds no copy of that vocabulary (REQ-MONITOR-025); the quota wait presents distinctly per REQ-NOTIFY-263 and REQ-MONITOR-303.
- Presentation agent state: `running`, `waiting`, `queued`, `done`, `failed`, `cancelled`; the mapping from an engine state onto one of them is REQ-MONITOR-046's.
- Stop reason: `tasks_complete`, `no_pending_tasks`, `user_cancelled`, `application_shutdown`, `message_limit_reached`, `iteration_limit_reached`, `time_limit_reached`, `repetition_detected`, `agent_session_aborted` (REQ-MONITOR-301). The set is closed and its mapping to a terminal result is total.
- Terminal run result: the closed set of REQ-ORCH-083. This document holds no copy of it (REQ-MONITOR-028); a value outside it raises rather than being presented. No process exit code is derived from it — the product exposes none.

### Control result shape

A control call answers with a boolean outcome plus an optional string. The string is non-empty for exactly the two prompt-creating operations — queued-prompt creation and steering-prompt submission — where it is the new prompt id, and is absent otherwise and on every false outcome. A false outcome always means "the request was not performed", never "nothing happened, try again silently".

### Agent record (as visible to monitoring)

Name, canonical name, persona, task description, dependencies, inherited context, state, spawned-at, completed-at (UTC, stamped on entering a terminal state), parent agent id, depth (default 1), conversation id, category (`quick` / `deep` / `planning` / `research`), session id, background flag, task id, launch generation, produced artifact ids, received artifact ids, resolved model key, granted native tools, granted MCP tools per server, todo state.

### Background-agent completion notification

Task id, canonical name, description, terminal state, duration in seconds, count of background agents still running, produced artifact ids.

### Verification state

An active flag, the current check name, its command, its index, the total number of checks, the start time, and a deadline expressed as a duration in whole seconds from that start time (never an absolute instant; on expiry the check ends with outcome `timeout`, REQ-MONITOR-155). Present only while a suite runs, absent otherwise. Absent means "not verifying", never "nothing was verified". Position renders as `<check-name> (<index>/<total>)`. A separate gate warning persists across the suite lifecycle and reports that no quality gate was present.

### Quota wait state

The waiting agent, the message, the model, the wait duration in seconds, and whether automatic resume is allowed. Present while the execution status is `waiting`, cleared on resume or stop.

### Notice shape

A severity, a title, a message, detail text, a persistence flag, an optional action label and action identifier, and the owning session id. Details remain copyable. Persistent notices bound to another session survive the next run start.

### Live update payloads

- Sequence number: every publication on either channel carries one, from a single per-session counter starting at 1 and raised by exactly one per publication (REQ-MONITOR-214). A consumer that receives any number other than the one it expected has missed a publication and reconciles from a whole read at once (REQ-MONITOR-226). Nothing is polled to discover a loss.
- Incremental transcript update: the sequence number, the lowest row index whose content may still change, the rows from that index onward, any newly recorded diffs, and the persona set. Rows are deep-copied at the boundary. An index of 0 after a transcript clear means "start over".
- Whole-session update: the sequence number, plus the session record with unbounded collections emptied (transcript rows, edit diffs, report artifacts, checkpoints, seen-compression ids) and bounded collections deep-copied (agent states, run todos, per-agent todos, pending approvals, pending questions, verification state, quota wait state, queued follow-up prompts, token usage, token-history samples, agent metrics).
- Background-run summary: session id, execution status, and branch only.

### Transcript row annotations

Tool rows carry a status from the four-value vocabulary of REQ-MONITOR-105 plus a duration. Verification outcomes reach a row status through the total mapping of REQ-NOTIFY-142, over the closed check-outcome set of REQ-ORCH-123; neither is copied here (REQ-MONITOR-106). A tool row still `running` when the run reaches a terminal state settles to `blocked` (REQ-MONITOR-228). Trailing approval and question rows are derived from current pending state, always sit after all recorded rows, and read as an approval-needed line naming the command or tool, and a step-count line naming the first question title.

### Display formats

- Inspector meta line: `{state} · {elapsed or —} · {N} tool calls`.
- Context reading: `{used:,} / {limit:,}`, with an em-dash replacing a zero used value.
- Context caption: names the panel as the agent's own context window and states the compression threshold percentage.
- Per-agent metric display: token count, call count, and compression count, each labelled with its unit and each separately identifiable; order and wording are the implementation's (REQ-MONITOR-281).
- Overview session label: `session {name} · {status} · {runtime}`.
- Agent card caption: `depth {d} / {cap} · fan-out {n} / {limit}`, with a detail line of running / waiting / done / failed counts.
- Status strip token reading: `{tokens:,} tok`; credit chip: `{balance} credit` with an added warning marker when spending is blocked.
- Tree prefixes: `├─ `, `└─ `, with `│  ` and three-space continuations; roots have no prefix.

---
