# Agent Tooling, Terminal Execution, Permissions, and Approvals — Where this domain's material is kept (workspace-observable)

Part 8 of 9 of [domain 05](../05-tools-permissions-approvals.md), which indexes every part.

## Data & Formats

### Where this domain's material is kept (workspace-observable)

Files below are files because a user reads or edits them, or because a filesystem guarantee is what protects them; the records below are records because they are the application's own high-volume, queried, transactional state rather than material a person edits, and each names the requirement that owns where it lives. This document fixes no path for any record. Being a record says where a thing is kept and says nothing about whether the user may have a copy of it: a record is offered as an export when it carries no unredacted user or tool content, and is not when it does, which is the test REQ-TOOLS-190 fixes.

- `<workspace>/.rotaris/agents.yaml` — workspace configuration, including all `runtime.*` keys below; the desktop mode selector persists `runtime.permission_mode` here.
- `secrets.yaml` — in the global config directory and `<workspace>/.rotaris/`; MCP secrets; atomically written; `.rotaris/` is auto-appended to the workspace `.gitignore`.
- The permission audit — permission decisions and mode changes, recorded in decision order, never altered, ring-capped at 5000 (REQ-TOOLS-078, REQ-SESSION-137). It is a durable record rather than a file, and the file the user gets is its export (REQ-SESSION-199).
- The tool-call evidence record — tool-call outcomes, including terminal outcome kinds and warnings (REQ-SESSION-136); its ring cap is not fixed here and is REQ-SESSION-133's. It holds the arguments an agent passed unredacted, and is for that reason the one record on this list that is never offered as an export and never may be (REQ-TOOLS-190).
- The verification-gate record — verification-gate writes and declines, ring-capped at 5000 (REQ-TOOLS-190). It is a durable record rather than a file, and the file the user gets is its export (REQ-TOOLS-190, on the terms REQ-SESSION-199 fixes).
- Session evidence issues (`permission_denied` kind) and timeline events (`permission_approved`, `permission_mode_changed`, `permission_mode_downgraded`).
- Session state snapshot (recorded for audit visibility in the session's launch audit, REQ-SESSION-138): `permission_mode` (effective preset at run start; empty on pre-feature snapshots), `sandboxed` (bool), `sandbox_backend` (`seatbelt`/`bubblewrap`/empty), `pending_approvals` (live map keyed by request id), the task list, and transcript events including any downgrade notice.
- `<workspace>/.rotaris/plugins/` — the designated workspace plugin folder listed by the settings inventory. Its members are the plugin modules the host process can load in-process (REQ-TOOLS-161, REQ-TOOLS-165); this document fixes no file extension, language or packaging form for them.

### Record shapes

Permission decision entry (field set; no encoding is fixed by naming one — REQ-TOOLS-078):
`timestamp` (ISO-8601 UTC), `session_id`, `agent_id`, `persona`, `tool_name`, `decision` (`allow|ask|deny`), `rule_id`, `source` (one of the 12 decision-source values), `summary` (the redacted request summary of REQ-TOOLS-016), `reason`, optional `request_id` (only when an approval was raised). Carries no argument values beyond the redacted command facet inside `summary`. Each entry additionally carries an identifier, the one a locator names it by (REQ-TOOLS-079, REQ-EVENTS-056), as a field of the entry and under the same field in every entry and every export, so that a locator resolves against an exported audit on a machine carrying none of this product's code. Mode-change entries carry no such identifier and their field set below is unchanged, because no locator names one.

Mode-change entry (same audit as the decision entries, interleaved in write order — REQ-TOOLS-082):
`{timestamp, event: "permission_mode_change", session_id, agent_id, requested_mode, effective_mode, previous_mode, source, reason, skipped_personas: [...]}` — `skipped_personas` present even when empty.

Approval payload:
`{request_id (hex UUID), session_id, agent_id, persona, tool_name, command (redacted), argument_summary, rule_id, reason}`.

Verification-gate record entry (REQ-TOOLS-190):
`{timestamp (ISO-8601 UTC), session_id, agent_id, persona, outcome: "write"|"decline", decline_case: "missing_reason"|"invalid_suite"|"requires_proposal"|"", reason, checks, detail}`.

Stream events (envelope: `schema_version`, `event`, `timestamp` ISO-8601 UTC, `session_id`; unknown fields ignored):
- `approval.requested`: `request_id`, `agent_name` (may be empty), `persona`, `tool_name`, `rule_id`, `summary` (redacted), `resolver` (`"brokered"|"headless"`), `timeout_seconds` (nullable), `unattended_reason`.
- `permission.decision`: `request_id` (empty = unpaired), `tool_name`, `decision`, `source`, `rule_id`, `summary` (re-redacted on construction/assignment).
- `session.start`: includes `permission_mode`, `sandboxed`.
- `tool.start` / `tool.finish`: redacted arguments (values clipped at 240 chars), outcome, duration.

Terminal observation extras:
- `[terminal_diagnostic]` JSON block (sorted keys, nulls dropped): backend, command, detail, error_class, exit_code, failure_kind, kill_status, outcome_kind, outcome_severity, output_truncated (present only when the capture was truncated), session_reinitialized, timeout, timeout_seconds, warnings, working_dir, session fields when applicable.
- Output section labels: `[terminal_output]`, `[partial_terminal_output]` (timed-out), `(no output)` placeholder, `[RESET]` command label.
- Background list entries: `{session_id, command, status, exit_code, started_at (ISO-8601)}` plus an aligned text table with `▶/✓/✗` status glyphs.
- Fetch error observations: `[fetch_diagnostic]` JSON block; observation metadata `url`, `final_url`, `status_code`, `content_type`, `truncated`.

Identifier formats:
- Terminal background session ids: `ts_` + 8 hex characters.
- Delegated task ids: `bg_` + 8 hex characters.
- Artifact ids: `art_` + 8 hex characters.
- Task-list phase/task ids: 8 hex characters.
- Approval request ids: hexadecimal UUID.
- Session approval rule ids: `session:allow:<n>` (1-based). Other rule-id spellings: `builtin:meta-tool`, `preset:<preset_name>`, `failclosed:unresolvable-policy`, `approval:once`, `approval:session`, `starter:*` (nine spellings per REQ-TOOLS-039), `<preset>:fetch-remote-host`, `<preset>:fetch-local-host`, `<preset>:network-command`, `restricted:read-outside-workspace`, `restricted:read-only-tool`, `ask:read-only-tool`.

### Configuration key reference (behavioral defaults)

Every figure below is fixed by the requirement named beside it and is restated here for reading convenience only; where a cell and the requirement that owns the figure differ, the requirement governs.

| Key | Values / type | Default | Notes |
|---|---|---|---|
| `runtime.permission_mode` | not restated — REQ-TOOLS-041 | not restated — REQ-TOOLS-046 | vocabulary REQ-TOOLS-041's, shipped default and the resolution of an unrecognized name REQ-TOOLS-046's; a per-persona `permission_mode` pin wins over a session override unless that override is at least as restrictive as the pin (REQ-TOOLS-048, REQ-TOOLS-074) |
| `runtime.allow_unsandboxed_autonomous` | bool | `false` (REQ-TOOLS-067) | per-workspace opt-in to unattended permissive mode without sandbox; the key is one of the three conditions of REQ-TOOLS-067 and nothing more |
| `runtime.headless_approval_policy` | `deny`\|`abort` (REQ-TOOLS-065) | `deny` (REQ-TOOLS-065) | unrecognized behaves as `deny` |
| `runtime.approval_timeout_seconds` | not restated — REQ-CONFIG-126 | not restated — REQ-CONFIG-126 | the key, its value space, its default and its reading of `0` are REQ-CONFIG-126's, relied on by REQ-TOOLS-055 and REQ-TOOLS-178; shared with user-question waits |
| `runtime.allow_outside_workspace` | bool | `false` (REQ-TOOLS-130) | set through the YAML surface or the confirmed desktop control of REQ-TOOLS-191; no launch-time override exists |
| `runtime.additional_read_only_roots` | absolute paths (REQ-TOOLS-132) | `[]` (REQ-TOOLS-132) | readable outside the fence, never writable; relative entries rejected; registered in `runtime:` by REQ-CONFIG-468 |
| `runtime.sandbox_mode` | not restated — REQ-SANDBOX-048 | not restated — REQ-SANDBOX-048 | the vocabulary, the default and the validation are REQ-SANDBOX-048's; REQ-TOOLS-114 adds the per-session selector and the absence of any launch-time override |
| `runtime.sandbox_writable_roots` | not restated — REQ-SANDBOX-050 | not restated — REQ-SANDBOX-050 | the key, its default and its entry rules are REQ-SANDBOX-050's; REQ-TOOLS-116 adds the writability model that consumes it |
| `runtime.sandbox_allow_network` | not restated — REQ-SANDBOX-051 | not restated — REQ-SANDBOX-051 | REQ-TOOLS-117 adds only that the switch is binary for terminal commands |
| `runtime.network_egress_policy` | not restated — REQ-SANDBOX-001 | not restated — REQ-SANDBOX-001 | value space, default and spelling match are REQ-SANDBOX-001's and REQ-SANDBOX-002's (REQ-TOOLS-088) |
| `runtime.network_allowed_hosts` / `runtime.network_denied_hosts` | not restated — REQ-SANDBOX-003 | not restated — REQ-SANDBOX-003 | defaults, normalization and the rule that a denial wins are REQ-SANDBOX-003's and REQ-SANDBOX-004's (REQ-TOOLS-088) |
| `runtime.shell_command_timeout` | int (seconds) | not restated — REQ-CONFIG-116 | the key's name and default are REQ-CONFIG-116's over REQ-NOTIFY-100's; REQ-TOOLS-097 adds only that it is the foreground hard timeout for an action that is not keystroke input |
| `runtime.shell_max_background_sessions` | int 1–64 | `20` (REQ-TOOLS-108) | registered in `runtime:` by REQ-CONFIG-116, which owns the range |
| `runtime.shell_background_timeout` | int ≥ 1 (seconds) | `3600` (REQ-TOOLS-108) | registered in `runtime:` by REQ-CONFIG-116 |
| `runtime.tool_call_timeout` | int (seconds) | not restated — REQ-CONFIG-115 | the fetch default; the whole precedence chain, the bare-executor fallback included, is REQ-SANDBOX-021's (REQ-TOOLS-093) |
| `runtime.terminal_stream_enabled` | bool | `true` (REQ-TOOLS-126) | disabling costs the live view only |
| `runtime.terminal_stream_interval_ms` | int 20–2000 | `100` (REQ-TOOLS-126) | a ceiling on batching, not a fixed cadence (REQ-CONFIG-117) |
| `runtime.terminal_stream_buffer_kb` | int 0–8192 | `256` (REQ-TOOLS-126) | `0` disables replay |

Persona-level tool controls: `tools`, `custom_tools`, `mcp_servers`, `mcp_tools` (per-server grant), `coordinator_only`, `read_only`, `tool_restrictions`, `can_publish_artifacts`, `skip_auto_sibling_context`, `permission_mode`, `delegates_to`. Each field's type, default and merge behavior are REQ-CONFIG-098 to REQ-CONFIG-110's and are not restated here; what this domain fixes is what each control removes from the resolved tool set (REQ-TOOLS-006).

Config layering: not restated here — REQ-CONFIG-031 and REQ-CONFIG-449. What this domain relies on is that the workspace scope outranks the global one and that rule lists replace rather than merge, so a workspace never inherits half of a policy.

### Limits and timing inventory (defaults)

Every figure below is fixed by the requirement named beside it and is restated here for reading convenience only; where a row and the requirement that owns the figure differ, the requirement governs. A row whose value reads "not fixed here" names the owner instead, because the figure belongs to another domain and is not duplicated.

| Quantity | Value | Fixed by |
|---|---|---|
| Approval timeout / user-question timeout | not fixed here | REQ-CONFIG-126 (REQ-TOOLS-055, REQ-TOOLS-178) |
| Foreground shell hard timeout | not fixed here | REQ-CONFIG-116 (REQ-TOOLS-097) |
| Foreground no-output soft-pause window | 30 s (only when the call supplies no `timeout`) | REQ-TOOLS-097 |
| Foreground captured output cap | 100,000 chars/call (oldest-first truncation) | REQ-TOOLS-097 |
| Background session timeout | 3600 s | REQ-TOOLS-108 |
| Background kill grace | 5 s (upper bound) | REQ-TOOLS-109 |
| Sandbox trial timeout | not fixed here | REQ-SANDBOX-069 (REQ-TOOLS-119) |
| Fetch timeout | not fixed here | REQ-SANDBOX-021 over REQ-CONFIG-115 (REQ-TOOLS-093) |
| Redirect cap | not fixed here | REQ-SANDBOX-024 (REQ-TOOLS-090) |
| Verification probe timeout | 30 s | REQ-TOOLS-159 |
| Stream sample interval | 100 ms (a ceiling, not a cadence) | REQ-TOOLS-126 over REQ-CONFIG-117 |
| Background output buffer | 1 MB/session (oldest-first truncation) | REQ-TOOLS-108 |
| Stream replay buffer | 256 KiB/stream (0–8 MiB) | REQ-TOOLS-126 |
| Audit ring / verification-gate ring | 5000 entries each | REQ-TOOLS-078, REQ-TOOLS-190 |
| Tool-call ring | not fixed here | REQ-SESSION-133 |
| read_file cap | 30,000 chars / 2000 lines default | REQ-TOOLS-134 |
| Search scan file cap | 2 MiB | REQ-TOOLS-139 |
| Binary sniff | 8192 B (file engine) / 1024 B (search) | REQ-TOOLS-132, REQ-TOOLS-139 |
| Argument/stream value preview | 240 chars | REQ-TOOLS-057, REQ-TOOLS-173 |
| Hook result truncation | not fixed here | REQ-HOOKS-066 (REQ-TOOLS-031) |
| Undo history per path | 10 entries | REQ-TOOLS-132 |
| grep max matches | 100 | REQ-TOOLS-138 |
| fetch max lines | 1000 | REQ-SANDBOX-020 (REQ-TOOLS-093) |
| Max background sessions | 20 (configurable 1–64) | REQ-TOOLS-108 over REQ-CONFIG-116 |
| Artifact list limit | 20 (1–200, out-of-range clamped) | REQ-TOOLS-149 |
| Delegation attached-artifact budget | 100,000 chars (whole bodies dropped from the first that overflows) | REQ-TOOLS-152 |
| User-question shape | ≤ 10 steps × ≤ 8 options | REQ-TOOLS-157 |
| Delegation fan-out | not fixed here | REQ-CONFIG-112 (`max_children`, `max_active_children`, `max_depth`) |
| Exit codes | 124 timeout; 126 sandbox-unavailable (never ran); −1 soft pause / killed | REQ-TOOLS-179 |

> *Note, 2026-10-07:* the delegation attached-artifact budget's dropping rule is [`PD-TOOLS-006`](../../product/directives/pd-tools-006.md#pd-tools-006) revision 5's: an overflowing body is left out and every later one is still considered, rather than every body from the first that overflows. The figure stays 100,000 characters. The row above is kept as written.
