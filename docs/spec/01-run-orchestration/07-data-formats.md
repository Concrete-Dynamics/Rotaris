# Multi-Agent Run Orchestration — Task identifiers

Part 7 of 8 of [domain 01](../01-run-orchestration.md), which indexes every part.

## Data & Formats

All formats below are externally observable (in the session's durable record, on disk, in transcripts, in tool observations, or in host events). Exact wording of model-facing guidance messages may vary provided the specified informational content, ordering, and identifiers are preserved; enum values, statuses, stop reasons, event names, issue kinds, configuration keys, and file paths are exact.

### Task identifiers

- Task id: `bg_` followed by 8 lowercase hex characters; regex `^bg_[0-9a-f]{8}$`; unique per session; assigned at spawn for every child (REQ-ORCH-036).
- Canonical task names: character set `[A-Za-z0-9_.-]`, max 80 characters (longer names truncated with an 8-hex-character digest suffix), per-parent uniqueness via `_<n>` suffixes (REQ-ORCH-044, REQ-ORCH-045).

### Delegation observation (model-visible)

```
Task '<canonical>': <status> — <message>
task_id: <id>
```
The status set this rendering carries is REQ-TOOLS-153's; this document holds no copy of it (REQ-ORCH-033).

### Child task states

The state set, its terminal subset, and the legal-transition table are fixed by REQ-MONITOR-014 and REQ-MONITOR-300; this document holds no copy of any of the three (REQ-ORCH-040, REQ-ORCH-041).

### Child report artifact (behavioral schema)

Fields: agent name; role; status (one member of the closed report-status vocabulary this document fixes in REQ-ORCH-112, which is not copied here); summary; key findings (bullet list); last response; final response; detail payload (highlighted paths + verbatim snippets); edited files (path, change type, commit hash); created files; artifacts; commands (command, exit code, summary); tests (name, status `passed|failed|skipped|not_run`, summary) — a summarizing pass's account of tests the child itself ran, which is a different thing from the deterministic check outcomes of REQ-ORCH-123 and MUST NOT be read as that vocabulary or mapped through it; errors (type, message); next recommended actions; escalation signal; tags (closed vocabulary: research, planning, implementation, review, verification, errors). Runner-owned, model-unwritable fields: verification results, completion-gate decision, repair record, gate state, requirement-coverage evidence, scope-drift findings.

### Timeline event vocabulary (session diagnostics)

`iteration_start`, `iteration_end`, `completion_classified`, `completion_gate_decision`, `repair_attempt_scheduled`, `repair_escalation`, `verifier_started`, `verifier_check_started`, `verifier_check_finished`, `verifier_run_completed`, `verifier_run_skipped`, `verifier_gate_calibrated`, `verifier_gate_written`, `verifier_gate_authoring_skipped`, `requirement_evidence`, `child_start`, `child_end`, `child_result`, `child_conversation_closed`, `child_launch_suppressed`, `child_user_cancelled`, `quota_fallback_model`, `fallback_model`, `llm_unresponsive`, `plan_gate_opened`, `plan_gate_resolved`, plus one `session.start` and one `session.end` per run.

### Issue kinds (session diagnostics)

`stall`, `timeout`, `timeout_fallback`, `llm_unresponsive`, `llm_bad_request`, `parent_resume_bad_request`, `transient_llm_error`, `provider_quota_exhausted`, `quota_fallback`, `circuit_breaker_escalation` (loop-supervisor escalation), `incomplete_execution`, `child_exception`, `child_force_cancelled`, `stale_child_launch_claim`, `background_child_drain_timeout`, `model_override_rejected`.

### Stop reasons and run statuses

- Stop reasons: the closed set is fixed by REQ-MONITOR-301; this document holds no copy of it, mints no stop-reason string of its own, and states no mapping from a stop reason onto a run status (REQ-ORCH-069). The stops this domain's rules reach are `tasks_complete`, `iteration_limit_reached`, `time_limit_reached`, `no_pending_tasks`, `user_cancelled`, `agent_session_aborted`, and `message_limit_reached`, each recorded as the token that requirement fixes.
- Run statuses (exact strings): `completed`, `failed`, `max_iterations`, `interrupted`, `error`. This is the product's single definition of that vocabulary and other documents cite it (REQ-ORCH-083). No process exit code is fixed by this domain.
- Session execution status: the persisted vocabulary is closed and is fixed by REQ-SESSION-073; this document holds no copy of it and adds no status of its own. The conditions under which a run of this domain comes to rest in `paused_message_limit` and `awaiting_plan_decision` are REQ-ORCH-087 and REQ-ORCH-153.

### Session records

Where a session's records are held, and in what form, is fixed by the session-persistence domain (REQ-SESSION-001) and is not restated here. What this domain requires a session to hold durably, and what each guarantee is:

- **Each child's conversation transcript** — complete, identical whether or not a host observed the run, and every event of it recoverable after the run has ended (REQ-ORCH-140).
- **Each check's full output** — retained as a file on disk, reachable in full from that check's own record by a path recorded with it (REQ-ORCH-123). The `output_path` a published verification event carries is that path.
- **The per-session log** at the configured session log level, which stays a file readable without this product (REQ-SESSION-142).
- **Memory diagnostics**, when enabled.
- **The run-configuration record** — the resolved check suite with its source, and the playbook-cell audit payload (REQ-ORCH-027, REQ-ORCH-121, REQ-SESSION-138).
- **The message-limit pause** — carried as the session's persisted execution status `paused_message_limit` together with the count reached and the limit in force, and not as a separate marker of any kind (REQ-ORCH-087, REQ-SESSION-107, REQ-SESSION-110).
- **The session's persisted state**, holding at least the fields REQ-ORCH-147 names.
- **The timeline and the issue record**, in the vocabularies below — readable after the run ends, and obtainable outside the application through the export of REQ-SESSION-191, so the names fixed here stay legible to a reader carrying none of this product's code (REQ-ORCH-139).
- **Report artifacts** — bodies on disk, identity and ordering from the record (REQ-ORCH-149).

### Workspace-level files

These two are files in the workspace and stay files: the playbook overrides because a user authors them, and the gate-state record because it belongs to the workspace rather than to any session and travels with the workspace when the workspace is moved or copied.

- `<workspace>/.rotaris/verifier.state.json` — gate lifecycle metadata: state (`absent|pending|calibrated|stale`), marker content fingerprint, probe records. Tool-managed and never hand-authored (REQ-ORCH-125, REQ-ORCH-148).
- `<workspace>/.rotaris/playbooks/` — workspace-scope playbook overrides (field-wise deep merge over the global scope; may re-word variants only).
- The check suite itself lives in the user configuration (three-valued: omitted / empty list / explicit list) with per-check `timeout`, `severity` (`blocking|advisory`), `role` (`test|typecheck|lint|other`), workspace-relative `cwd`, and an optional `failure_pattern` regular expression honored for role `test` only (REQ-ORCH-123).

### Intent categories

`explicit_trivial`, `question`, `exploration`, `problem_resolution`, `single_file_change`, `small_feature`, `moderate_feature`, `large_feature`, `refactor`, `architectural`, `requirements`, `whole_project`, `ambiguous`. Fallback: `moderate_feature`. The taxonomy and its fallback are fixed by REQ-ORCH-006 and REQ-ORCH-007.

### Playbook slots and budget tiers

Slots (render order): `ROUTE`, `AUTONOMY`, `RESEARCH`, `CHUNKING`, `VERIFY`, `ARTIFACT`, `OUTPUT`, `BUDGET` (REQ-ORCH-020). Budget clamps: tight = {active 2, total 6, depth 2}; normal = {active 4, total 12, depth 3}; wide = no clamp (REQ-ORCH-024). Run overrides: `swarm`, `single` (REQ-ORCH-025).

### Loop-supervisor classifier response

JSON object `{loop_detected: bool, reason: string, corrective_message: string}`; corrective message ≤ 90 words (REQ-ORCH-103).

### Configuration defaults (consolidated)

Every figure in this table is a restatement of the requirement named beside it, which is where that figure is fixed; where a row states that this domain fixes no figure, the named requirement is the only place the value is stated and this table holds no copy of it.

| Setting (behavioral name) | Default | Fixed by |
|---|---|---|
| Max total children per iteration | 20 | REQ-ORCH-046 |
| Max active children | 6 | REQ-ORCH-046 |
| Max delegation depth | 3 | REQ-ORCH-046 |
| Max iterations | 20 | REQ-ORCH-070 |
| Per-task consecutive-retry limit | 3 | REQ-ORCH-077 |
| Child hard timeout | 1200 s | REQ-ORCH-088 |
| Child stall threshold | 90 s | REQ-ORCH-089 |
| Unresponsive-model threshold | 120 s (min 30) | REQ-ORCH-090, REQ-ORCH-143 |
| Model HTTP timeout | not fixed by this domain | REQ-CONFIG-115 (`model_timeout`); overridable per model per REQ-ORCH-145 |
| Shell command timeout | not fixed by this domain | REQ-CONFIG-116 |
| Max background shell sessions | not fixed by this domain | REQ-CONFIG-116 |
| Background shell timeout | not fixed by this domain | REQ-CONFIG-116 |
| Generic tool timeout | not fixed by this domain | REQ-CONFIG-115 (`tool_call_timeout`) |
| Summary timeout | 120 s | REQ-ORCH-110 |
| Improvement-collector timeout / enabled | 60 s / true | REQ-ORCH-137 |
| Transient retries / validation retries | 1 / 0 | REQ-ORCH-092 |
| Completion classification enabled | true | REQ-ORCH-113 |
| Relentless mode / max cycles / audit timeout | false / 3 / 60 s | REQ-ORCH-079 |
| Run-start mode | `auto` | REQ-ORCH-152 |
| Graceful-pause tool deadline | 30 s (range 5–120) | REQ-ORCH-134, REQ-ORCH-143 |
| Shutdown drain timeout | 120 s (0 disables) | REQ-ORCH-080 |
| Message limit | null (disabled) | REQ-ORCH-084 |
| Session log level | not fixed by this domain | REQ-CONFIG-121, applied to the session log by REQ-SESSION-142 |
| Provider-native agent loop | enabled | REQ-ORCH-146 |
| Intent-classification timeout / prompt cap | 12.0 s / 4000 chars | REQ-ORCH-008 |
| Completion-classifier timeout | 15 s | REQ-ORCH-113 |
| Per-check timeout / suite timeout / probe timeout | 600 s / 900 s / 30 s | REQ-ORCH-124 |
| Check-skip grace period | 5 s | REQ-ORCH-128 |
| Subproject detection depth / max roots | 3 levels / 25 | REQ-ORCH-122 |
| Gate completion / gate authoring | true / true | REQ-ORCH-117, REQ-ORCH-126 |
| Max repair attempts | 2 | REQ-ORCH-118 |
| Supervisor: classifier model | not fixed by this domain, and never a model identity | the `small_model` capability slot of REQ-PROVIDER-088 (REQ-ORCH-100) |
| Supervisor: loop-classification call bound | not fixed by this domain | `runtime.loop_classification_timeout`, REQ-CONFIG-467 (REQ-ORCH-100) |
| Supervisor: activation mode | independent | REQ-ORCH-100 |
| Supervisor: tool & message thresholds / weights / target | 60 & 60 / 0.6 & 0.4 / 1.0 | REQ-ORCH-100 |
| Supervisor: event window / transcript cap | 24 / 8000 chars | REQ-ORCH-100 |
| Supervisor: repetition / cycle thresholds / enabled | 4 / 3 / true | REQ-ORCH-100, REQ-ORCH-101 |
| Per-model parallelism | declared by the model's provider catalogue entry; uncapped where that entry declares nothing | REQ-MONITOR-021, REQ-ORCH-050 |
| Per-model retry count | provider default 5 | REQ-ORCH-145 |
| Quota backoff | 60·2^(n−1) s, cap 300 s; Retry-After honored, min 1 s | REQ-ORCH-091 |
| Content caps | resume detail 4000; repair context 6000; summarizer transcript 12000 (2000/event); supervisor transcript 8000; classification status reason 180 | REQ-ORCH-060, REQ-ORCH-119, REQ-ORCH-110, REQ-ORCH-100, REQ-ORCH-014 |
