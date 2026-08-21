---
req-id: SWR-2500
status: approved
trace: optional
test: optional
title: "Secure Execution: Permissions & Sandbox"
---

# SWR-2500 — Secure Execution: Permissions & Sandbox

Runtime permission control and sandboxed execution for agent tool use: an
allow/ask/deny policy engine in front of every tool dispatch, terminal command
patterns, network egress policy, interactive approval flows, a permission audit
log, and an opt-in OS-level sandbox. Builds on the existing `PathAuth`
path-authorization layer (SWR-2111) and the per-persona tool allowlists
(`config/schema.py`).

Identified as the most critical market-readiness gap in
[docs/research/marktanalyse-agentic-harnesses-2026-08.md](../research/marktanalyse-agentic-harnesses-2026-08.md)
(P0 area "Sichere Ausführung"). See
[NOTE-marktreife-priorisierung.md](NOTE-marktreife-priorisierung.md) for the
prioritization across epics.

## Requirements

| ID | Title | Priority | Status |
| --- | --- | --- | --- |
| [SWR-2501](2500-secure-execution/SWR-2501-permission-policy-engine.md) | Permission policy engine (allow/ask/deny) | P0 | approved |
| [SWR-2502](2500-secure-execution/SWR-2502-terminal-command-patterns.md) | Terminal command permission patterns | P0 | approved |
| [SWR-2503](2500-secure-execution/SWR-2503-permission-modes.md) | Permission mode presets & config layering | P0 | approved |
| [SWR-2504](2500-secure-execution/SWR-2504-interactive-approval-flow.md) | Interactive approval flow (Rotaris primary) | P0 | approved |
| [SWR-2505](2500-secure-execution/SWR-2505-network-egress-policy.md) | Network egress policy | P1 | approved |
| [SWR-2506](2500-secure-execution/SWR-2506-permission-audit-log.md) | Permission decision audit log | P1 | approved |
| [SWR-2507](2500-secure-execution/SWR-2507-os-level-sandbox.md) | Opt-in OS-level sandbox for terminal execution | P1 | approved |
| [SWR-2508](2500-secure-execution/SWR-2508-unsandboxed-autonomous-default.md) | Ask-mode default for unsandboxed autonomous runs | P0 | approved |
| [SWR-2509](2500-secure-execution/SWR-2509-composer-permission-mode-selector.md) | Composer permission-mode selector (Rotaris) | P1 | approved |

## History

- 2026-08-07 — SWR-2507 and SWR-2505 implemented, and SWR-2507 **rewritten**:
  the container sandbox it originally specified was rejected in favour of the
  mechanism Codex CLI and Claude Code actually ship — an **OS-level sandbox
  applied as a per-command wrapper**, no container runtime, no image, no daemon.
  Apple Seatbelt (`sandbox-exec -p`) on macOS, bubblewrap (`bwrap`) on
  Linux/WSL2, unavailable on native Windows with the remediation pointing at
  WSL2. It fits the codebase far better than a container would have:
  `HardenedTerminalExecutor.__call__` (`src/rotaris_core/tools/terminal.py`) is a
  single chokepoint and both spawn paths below it — the agent SDK's foreground
  terminal and the background `subprocess.Popen` — carry a plain command string,
  so one string→string wrapper covers both; a container executor would have had
  to replace the SDK's terminal and would still have left the background spawn
  running on the host. `src/rotaris_core/sandbox/` holds the backend-neutral
  `SandboxSpec` and the two backends; `sandbox_status` answers *configured and
  available* (never merely configured), which is what `SessionState.sandboxed`,
  the Rotaris badge and the SWR-1828 `session.start` event all report. The file
  was renamed to `SWR-2507-os-level-sandbox.md`. SWR-2505 landed alongside it:
  `permissions/network.py` classifies hosts (deny → allow → default), `fetch`
  follows redirects manually and re-classifies every hop, and the network
  command patterns feed the mode presets. Two limits are recorded in the specs
  rather than implied — the sandbox has never been exercised end-to-end on the
  maintainer's Windows host, and terminal-side egress is a binary kernel switch
  with per-host filtering deferred.

- 2026-08-07 — SWR-2509 implemented, and with it SWR-2503's mid-session clause:
  Rotaris grew a permission-mode chip under the composer, next to the persona,
  model and reasoning chips. Picking a mode writes `runtime.permission_mode`
  into the workspace config; picking `autonomous` asks first. Changing it during
  a run reaches the live session through `change_session_permission_mode`
  (`src/rotaris_core/permissions/modes.py`), which re-resolves SWR-2508 against the
  session's approval host, swaps the policy on every engine registered under
  that session's binding keys (`engines_for_session`), and records a session
  mode override so agents built later — the next Ralph iteration's entry agent,
  new children — start in the new mode too. Persona-pinned engines are skipped
  on purpose. The change lands in the SWR-2506 audit log as a
  `permission_mode_change` entry and in the transcript.

- 2026-08-05 — SWR-2506 implemented: the `AuditSink` seam SWR-2501 left open is
  filled by `SessionAuditLog` (`src/rotaris_core/permissions/audit.py`), which appends
  every resolved decision to `<session_dir>/evidence/permissions.jsonl` through
  `record_permission_decision` in `session/diagnostics.py`. Sessions bind late —
  the sink looks its directory up in a session-keyed registry at record time, the
  same shape SWR-2504 used for approval hosts — so agents spawned before the run
  bootstrap are covered and a session nobody registered writes nothing.
  `PermissionDecision` gained a `source` field (`DecisionSource`) because
  `rule_id` cannot tell a user deny from a headless deny from a timeout. Denials
  become `permission_denied` issues, human approvals `permission_approved`
  timeline events, and `build_metrics` counts both. The SWR-1828 event-stream
  clause stays open until that requirement lands.
- 2026-08-05 — SWR-2508 implemented: an unattended, unsandboxed run in a
  permissive mode is downgraded to `ask` (`src/rotaris_core/permissions/modes.py`).
  "Unattended" means no approval host that can present a prompt — CLI
  `--background`, headless and the TUI; an interactive Rotaris session keeps the
  mode it asked for. `runtime.allow_unsandboxed_autonomous` is the per-workspace
  opt-in, `sandbox_active()` the seam SWR-2507 will fill. The downgrade is
  enforced in `agents/factory.py::_build_permission_engine` and announced at run
  start into the session snapshot, transcript and timeline.
- 2026-08-05 — SWR-2504 implemented: an `ask` now suspends only the requesting
  tool call and asks a human. `ApprovalBarrier` /
  `BrokeredApprovalResolver` (`src/rotaris_core/permissions/approval.py`) replace
  SWR-2501's blanket `FailSafeApprovalResolver` wherever a session registered an
  `ApprovalHost`; hosts are looked up per session at resolve time, so all three
  agent-spawn paths are covered without new `runtime_kwargs`. Rotaris registers
  its host in `_RunWorker._execute`, publishes each request through
  `SessionState.pending_approvals`, and auto-opens `ApprovalDialog` with
  approve-once / approve-for-session / deny. "Approve for this session" becomes a
  narrow allow rule via `PermissionEngine.add_session_rule` (exact tool + exact
  command, or exact arguments). Hosts without an approval UI (TUI, headless CLI)
  follow `runtime.headless_approval_policy`: `deny` (default) or `abort`, with
  `runtime.approval_timeout_seconds` bounding every wait. The shipped `ask`
  default from SWR-2503 is therefore usable for the first time.
- 2026-08-04 — SWR-2503 implemented: named mode presets `restricted`/`ask`/
  `autonomous` (`src/rotaris_core/permissions/presets.py`) fill the engine's
  `default_decision`/`preset_name` seam. The shipped default flips from
  SWR-2501's permissive allow-all to `ask` (`RuntimeConfig.permission_mode`,
  overridable per persona via `PersonaConfig.permission_mode`, layered through
  the existing global/workspace config merge). An unrecognized mode name
  falls back to `restricted`. `PermissionEngine.set_policy` supports a
  mid-session mode change taking effect on the next dispatch; the resolved
  mode is recorded in `state/run_config.json`. SWR-2504's approval UI is not
  yet layered in front of these presets.
- 2026-08-04 — SWR-2502 implemented: command-level patterns
  (`src/rotaris_core/permissions/command_patterns.py`) fill the `PermissionRule.matcher`
  seam — token-prefix matching, compound-command decomposition, and escalation to
  `ask` for segments that cannot be read statically. The starter destructive-command
  rules ship as an exported constant only; SWR-2503 wires them into the presets, so
  runtime behaviour is still unchanged.
- 2026-08-04 — SWR-2501 implemented: the policy engine
  (`src/rotaris_core/permissions/`) is consulted on every tool dispatch via
  `RotarisAgent._execute_action_event`. It ships with a permissive default, so
  behaviour is unchanged until SWR-2502/2503 supply rules and presets; `ask`
  resolves fail-safe to `deny` until SWR-2504 provides the Rotaris approval UI.
- 2026-08-03 — Epic created from the market gap analysis
  (`docs/research/marktanalyse-agentic-harnesses-2026-08.md`): Rotaris had
  path-level authorization (`PathAuth`, SWR-2111–2115) and static per-persona
  tool allowlists, but no runtime allow/ask/deny decisions, no command-level
  terminal policy, no network policy, and no sandbox (SWR-2116 only mandates a
  warning). Every direct competitor ships permission modes as a core feature.
