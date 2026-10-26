# Notifications, Error Handling, and Recovery — What a session records, as this document relies on it

Part 6 of 7 of [domain 19](../19-notifications-errors-recovery.md), which indexes every part.

## Data & Formats

### What a session records, as this document relies on it

Not a layout this document defines, and no longer a layout at all. Where a session's record is held, and which parts of it remain files, are fixed by REQ-SESSION-001, REQ-SESSION-002 and REQ-SESSION-198; the lock record's fields and the liveness test taken over it by REQ-SESSION-046 and REQ-SESSION-056, and what a refusal to take it must convey by REQ-SESSION-048; and the durable condition a background run paused at its message limit leaves by REQ-SESSION-107. This document holds no copy of any of them.

What this document relies on is behaviour, not placement: that a session's diagnostics issues and its timeline outlive the process that wrote them, so a run whose notices no one was watching can still be accounted for afterwards; that the full output of every verification check is retained and reachable in full from that check's own record after the run has ended (REQ-ORCH-123), which is what the evidence surfaces of section C3 read; and that a session's record and diagnostics belong to the workspace the run was started against and never to a worktree, so integrating or discarding a worktree never takes them with it (REQ-SESSION-001). The per-session debug log level defaults to WARNING (`runtime.session_log_level`).

One consequence is load-bearing for REQ-NOTIFY-248 and REQ-NOTIFY-266. A run paused at its message limit is recorded as paused in its own durable state and leaves no marker file for another process to find (REQ-SESSION-107, REQ-ORCH-087). The condition therefore survives the application closing and reopening, and is recoverable from the record alone; a surface that reports it reads the recorded status and never the presence or absence of anything on disk.

### Persistent notice shape

The field set and each field's meaning are fixed by REQ-NOTIFY-023, which this appendix illustrates rather than restates: `{ id, severity, title, message, details, persistent, action_label, action_id, session_id }`, where `details` is the copyable technical block and an empty `session_id` scopes the notice to the focused run (REQ-NOTIFY-028).

### Notice action vocabulary

A notice action is carried as an opaque identifier chosen by the implementation. The vocabulary it must express is the one given in REQ-NOTIFY-044: focusing a named session, parameterised by session identifier; opening the project-initialization surface, parameterised by workspace; installing a pending update and restarting after one; navigating to a named view, taken from REQ-SHELL-023; opening settings at a named category, taken from REQ-CONFIG-269 and including `hooks` and `models`, and saving settings; opening the library at a named tab, taken from REQ-LIBRARY-103 and including `artifacts` and `proposals`; opening the hook review, parameterised by workspace; starting the guided provider setup, parameterised by provider where the action names one (*both added 2026-09-06 under ESC-34*); retrying the failed run; reverting a recorded proposal review decision, parameterised by the artifact, the proposal and the prior decision. An action carrying a parameter encodes that parameter alongside the action, so the handler acts without a further lookup. No action in the vocabulary performs work in the user's project; each either navigates, or acts on application state the user has already agreed to.

### Status vocabularies

Members are listed alphabetically except where a severity ordering is stated.

- Normalised run lifecycle: `cancelling`, `completed`, `failed`, `idle`, `paused`, `pausing`, `running`, `starting`, `stopped` (REQ-NOTIFY-048; `cancelled` is withdrawn from this vocabulary and `stopped` holds its place).
- Persisted execution statuses treated as active: the set fixed by REQ-SESSION-055 over the closed vocabulary of REQ-SESSION-073; this document holds no copy of it. Post-crash repair writes `interrupted`, which is outside that set. A background run paused at its message limit carries `paused_message_limit`.
- Terminal child states: the terminal members of the delegated-child state set of REQ-MONITOR-014, cited as REQ-ORCH-041; this document holds no copy of them.
- Transcript tool row status: the vocabulary of REQ-MONITOR-105; this document holds no copy of it.
- Notice severity, ascending: `info`, `success`, `warning`, `error` (REQ-NOTIFY-023). Acknowledgement kind, ascending: `info`, `ok`, `warn`, `fail` (REQ-NOTIFY-018).
- Verification verdict: `failed`, `passed`, `skipped` (REQ-NOTIFY-126). Check outcome: the closed five-value set of REQ-ORCH-123, which is the single definition of it; this document holds no copy and renders it under REQ-NOTIFY-142. Completion gate decision: the closed set of REQ-ORCH-116, which is the single definition of it; this document holds no copy and cites it from REQ-NOTIFY-128.
- Provider status: `checking`, `coming_soon`, `error`, `healthy`, `unauthenticated`, `unknown`, `warning` (REQ-NOTIFY-200, the single definition of this vocabulary, its entry conditions and its precedence order).
- Hosted-cloud credit phase, describing the state of this document's own fetch rather than the account: `error`, `loading`, `ready`, `signed_out`. The account's own credit states are the four of REQ-PROVIDER-130, of which this document holds no copy; it renders each as one readable label — Funded, Out of credit, Overdrawn, Unknown state.
- MCP server health: the four-state vocabulary of REQ-CONFIG-353, cited from REQ-NOTIFY-242; this document holds no copy of it.

### Report artifact read by a parent in place of a child transcript

Not a schema this document defines. The report's shape is REQ-ORCH-109's, and the status it carries is one member of the child-report status vocabulary REQ-ORCH-112 is the single definition of; this document holds no copy of either. What this document relies on is that verification evidence with its verdict and per-check results, the gate state, and the repair decision are set by the execution runtime alone and are stripped from model output, so a report a parent reads in place of a transcript cannot have been talked into clearing its own gate.

### Timeline and diagnostics entries produced by this domain

Each is a distinctly typed record in the session timeline or the diagnostics log. Type naming is left to the implementation; the set must be distinguishable. Listed alphabetically by what each records:

- a completion-gate decision;
- a post-crash status repair of a session;
- a provider marked exhausted for the session;
- a quota-driven model change, and the quota fallback that caused it;
- a persistent notice of severity `warning` or `error`, recorded under REQ-NOTIFY-268;
- a repair attempt being scheduled, and repair escalation once the budget is spent;
- the start of an orchestration iteration;
- a transient model failure that was retried automatically;
- verification suite start, per-check start, per-check finish, and suite completion or skipping.

### Reports whose information content is fixed and whose wording is not

Each is rendered in the desktop surface that requested it. The facts listed are required; phrasing, punctuation, ordering within the report and inflection are the implementation's.

- Machine setup step (REQ-NOTIFY-236, REQ-NOTIFY-265): the tool, the command run, the exit status, the reason.
- Recovery-pass entry, one per requirement corrected (REQ-NOTIFY-165): the requirement, the delivery state it remains in, the blocking condition.
- Repaired session entry, one per session repaired (REQ-NOTIFY-264): the session, the status it previously carried, that it now reads `interrupted`, the reason it was judged not live. Where nothing was repaired: that no session was left marked as running by a stopped process.
- Session list row (REQ-NOTIFY-156, REQ-NOTIFY-160): the normalised status, plus a stale marker where the session reads stale and an interrupted marker where its persisted status is `interrupted`.
- Unit failure (REQ-NOTIFY-174): the requirement, the unit, the attempt number, retries used against the bound, the failure reason, the path at which the work was kept.

### Retry-after forms accepted from a provider

An explicit retry-after value carrying a unit suffix of `s`, `sec`, `seconds`, `m`, `min` or `minutes`; and the plain-language phrasing `try again in N \<unit\>`. Minutes are converted to seconds, and the effective wait is at least 1 second.

### Structured-output format preference order

Requested in this order, most constrained first; the next format tried after a refusal is the next one below that the model has not already refused within this run of the application (REQ-NOTIFY-098).

1. A provider-native response schema the provider itself enforces.
2. A tool call whose parameters carry the schema.
3. A provider JSON-object mode carrying no schema.
4. A plain text response parsed against the schema.

### Configuration keys named in this document

The layered YAML configuration surface, and each key's registered type and default, belong to the settings-and-configuration specification; this table names the keys this document's behaviour reads and restates each registered default for convenience only, holding no default of its own. Where a value below and that specification's registration of the same key disagree, the registration governs.

| Key | Default |
| --- | --- |
| `message_limit` | no limit set (REQ-CONFIG-112) |
| `requirements.execution.retry_limit` | 1, giving 2 attempts |
| `runtime.auto_retries_transient` | 1 |
| `runtime.auto_retries_validation` | 0 |
| `runtime.child_stall_timeout` | 90 s |
| `runtime.child_timeout` | 1200 s |
| `runtime.improvement_collector_timeout` | 60 s |
| `runtime.llm_response_timeout` | 120 s, minimum 30 s |
| `runtime.loop_classification_timeout` | 2 s, and never more than the activation budget left |
| `runtime.session_log_level` | WARNING |
| `runtime.shell_command_timeout` | 100 s |
| `runtime.summary_timeout` | 120 s |
| `runtime.terminal_stream_enabled` | true |
| `runtime.tool_call_timeout` | 30 s |
| `verifier.author_gate` | true |
| `verifier.checks` | unset |
| `verifier.gate_completion` | true |
| `verifier.max_repair_attempts` | 2 |
| `verifier.suite_timeout` | 900 s |

The per-workspace composer draft is not a key of that surface at all: it is a key of the per-user preference store whose registry REQ-SHELL-006 closes, and its default and write behaviour are REQ-SHELL-159's.

### Consolidated thresholds and timings

Rows are listed alphabetically by behaviour; the order carries no meaning. Every figure below is fixed by the requirement named beside it and is restated here for convenience only; where this table and that requirement differ, the requirement governs. Where the requirement named beside a row belongs to another document, this table holds no copy of the figure at all and the row is a citation.

| Behaviour | Value | Fixed by |
| --- | --- | --- |
| Abandoned requirement flow, grace period | 15 minutes | REQ-NOTIFY-162 |
| Acknowledgement entry / exit motion, default theme | 12 px over 160 ms / the reverse over 120 ms | REQ-NOTIFY-022 |
| Acknowledgement lifetime | 4200 ms | REQ-NOTIFY-011 |
| Acknowledgement width, single form / stacked form | at most 520 px / 360 px | REQ-NOTIFY-013 |
| Acknowledgements visible at once, stacked form | 3 | REQ-NOTIFY-016 |
| Checkpoint listing re-attempt while the channel is busy | cadence per REQ-SHELL-156; the whole re-attempt bounded at 10 s | REQ-SHELL-156 (cadence), REQ-NOTIFY-192 (bound) |
| Child task, no output produced | 90 s | REQ-NOTIFY-100 |
| Child task, total run | 1200 s | REQ-NOTIFY-100 |
| Interrupted verification check, grace before abandonment | 5 s | REQ-NOTIFY-143 |
| Loop activation cycle, end to end | 2 s | REQ-NOTIFY-106 |
| Loop classification call | 2 s, bounded by the remaining activation budget | REQ-NOTIFY-100 |
| Loop escalation | more than 2 consecutive activations | REQ-NOTIFY-105 |
| Loop repetition and cycle triggers | as REQ-ORCH-101 fixes them, at REQ-ORCH-100's defaults | REQ-ORCH-101, REQ-ORCH-100 |
| Loop volume backstop | as REQ-ORCH-101 fixes it, at REQ-ORCH-100's defaults | REQ-ORCH-101, REQ-ORCH-100 |
| Model response, fallback trigger | 120 s, minimum 30 s | REQ-NOTIFY-099 |
| Post-run improvement analysis | 60 s | REQ-NOTIFY-100 |
| Provider-supplied retry-after | overrides local backoff, minimum 1 s | REQ-NOTIFY-084 |
| Quota wait, base / cap / growth | 60 s / 300 s / doubling per attempt | REQ-NOTIFY-085 |
| Requirement unit retries | 1 retry, giving 2 attempts | REQ-NOTIFY-171 |
| Session state polling | none: no cadence exists. A live session is published to, and a publication lost in delivery is caught at once by the sequence gap on the next one rather than by a timed re-read | REQ-MONITOR-287 (fixes no such cadence), REQ-MONITOR-214 and REQ-MONITOR-226 (what replaced it) |
| Shell command | 100 s | REQ-NOTIFY-100 |
| Stall-recovery messages per child task | 1 | REQ-NOTIFY-112 |
| Summary generation | 120 s | REQ-NOTIFY-100 |
| Tool call | 30 s | REQ-NOTIFY-100 |
| Transcript row-growth publish throttle | as REQ-MONITOR-287 fixes it | REQ-MONITOR-219, REQ-MONITOR-287 |
| Transient auto-retries / delay per retry | 1 / attempt number in seconds, capped at 2 s | REQ-NOTIFY-096 |
| Update check | at most 10 s | REQ-NOTIFY-212 |
| Validation auto-retries | 0 | REQ-NOTIFY-100 |
| Verification, per check | 600 s | REQ-NOTIFY-144 |
| Verification, whole suite | 900 s | REQ-NOTIFY-144 |
| Verification repair attempts | 2 | REQ-NOTIFY-133 |
| Window close after installer hand-off | 1200 ms | REQ-NOTIFY-222 |
