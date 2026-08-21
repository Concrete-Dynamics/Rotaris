# Vital functionality gap remediation plan

## Goal

Close the user-blocking gaps found in the 2026-07-14 product audit. Prioritize controls that
currently claim to change runtime behavior but only mutate Rotaris display state, then complete
the configuration and safety workflows required to use personas, skills, MCP servers, and parallel
sessions without hand-editing YAML.

This is a coordinating plan. Where a requirement document already defines behavior, implement that
document rather than creating a competing design.

## Delivery rules

- Rotaris is the primary graphical surface. Keep PySide6 and the existing six-view structure.
- A writable control must either change the real backend/persisted configuration or be removed.
  Store-only tests are insufficient for runtime controls.
- Changes to an active run must state exactly when they take effect. Never imply that an in-flight
  model call can be changed.
- Security invariants such as secret redaction remain mandatory. Do not expose switches that only
  pretend to weaken or strengthen security.
- Keep the default workspace boundary restrictive. Permission expansion requires explicit
  confirmation and must be enforced consistently by every workspace-bound tool.
- Each workstream gets its own requirement record, version bump, focused tests, full Rotaris gates,
  and relevant backend tests. Do not ship all workstreams as one release.

## Phase 0 — remove false affordances

### 1. Make agent model and reasoning controls truthful

- Replace direct `WorkspaceStore.set_agent_model()` / `set_agent_reasoning()` mutations from live
  inspector controls with host service calls.
- For the entry/orchestrator agent, model changes use the existing `RunBridge.switch_entry_model()`
  seam and explicitly say “from next iteration.” Add the equivalent host-neutral next-iteration
  reasoning override before exposing reasoning as editable.
- For delegated children and any in-flight conversation that cannot safely accept a change, render
  model and reasoning read-only. Link users to per-persona Settings for future agent instances.
- Remove the duplicate cosmetic controls from auxiliary agent windows unless they use the same real
  service seam.
- Add integration tests proving the next spawned entry agent receives the selected model/reasoning;
  also prove active child controls cannot claim a successful change.

### 2. Correct Runtime Settings semantics

- **Circuit breaker:** add a backward-compatible `enabled: bool = true` field to its backend config.
  When disabled, scheduler construction and evaluation must bypass the circuit breaker. Load, save,
  build-run-config, status text, and tests must all use this same field.
- **Secret redaction:** remove the editable toggle. Present a non-interactive “Secret redaction:
  always on” status. Remove the Rotaris-only boolean and onboarding logic that suggests redaction can
  be disabled.
- **Outside-workspace access:** centralize path authorization for file read/write, HAET, search/glob,
  and other workspace-bound tools. Safe default rejects escapes. Explicit opt-in allows the stated
  paths consistently. UI and CLI must explain that arbitrary shell execution is not an OS sandbox.
- Add backend-wiring tests for every setting. A test that only observes `WorkspaceStore` is not an
  acceptance test.

## Phase 1 — protect concurrent work

### 3. Bind sessions to isolated worktrees

Implement
`docs/requirement-log/unresolved/requirements-20260713-git-worktree-isolation.md`.

- Separate the stable metadata workspace from the per-session execution workspace. Session files
  remain under the main workspace; agent tools and terminal commands use the selected worktree.
- Add an isolation toggle and validated branch input to new-session launch. Record worktree path and
  branch in backward-compatible session state.
- Associate worktrees with sessions in the session browser, Git view, workspace chrome, and status
  displays. Preserve worktrees after success, failure, cancellation, and crashes.
- Prevent launch when worktree creation or validation fails. Non-Git workspaces must explain why
  isolation is unavailable.
- Prove with integration tests that two isolated sessions cannot see each other’s uncommitted files
  and that neither changes the main worktree.

## Phase 2 — finish persona configuration

### 4. Add reliability-critical persona fields

- Extend persona Settings with `fallback_model` and `stall_timeout`. Fallback choices use stable
  model keys and support Workspace/Global/Unset origin semantics identical to primary model and
  reasoning.
- Ensure timeout and no-event recovery read the persisted persona fallback. Surface the attempted
  fallback and final failure in Rotaris.
- Validate model existence and timeout ranges before saving. Preserve unrelated YAML keys and use
  atomic writes.
- Add a default fallback policy intentionally: existing personas remain unchanged unless product
  defaults are explicitly migrated; newly created personas inherit the global fallback slot.

### 5. Add persona capability editing

- Add an advanced persona editor for tools, MCP-server assignments, delegation targets,
  `read_only`, `coordinator_only`, artifact publishing, purpose, and system-prompt source.
- Use the authoritative tool names from `agents/factory.py`. Unknown configured tools remain visible
  with an unavailable warning instead of being silently deleted.
- Validate delegation targets, incompatible permission combinations, prompt-file readability, and
  MCP availability before save. Permission expansion requires confirmation.
- Preserve Workspace/Global/Unset layering per edited field. A compact summary remains in the
  persona table; detailed editing opens a dedicated panel/dialog.
- Add save/reload/run-construction tests proving the generated agent receives the configured tools,
  MCP servers, prompt, and delegation policy.

## Phase 3 — make skills and MCP usable from Rotaris

### 6. Implement deterministic skill loading

Implement
`docs/requirement-log/unresolved/requirements-20260713-rotaris-skill-scoping.md`.

- Make Skills rows actionable: force-load toggle, All agents/per-persona scope, in-context state,
  and rescan.
- Persist selections for the active session and inject matching skill bodies into persistent agent
  context so compaction does not discard them.
- Show removable skill chips beside the composer persona/model controls.
- Keep the complete metadata catalog available to every agent. Unreadable/malformed skills remain
  listed but cannot be force-loaded and show an actionable error.

### 7. Add complete MCP management

- Reuse the existing backend and TUI secret-management APIs. Do not create a second secret format.
- Add create/edit/delete flows for stdio, HTTP, and SSE servers, including command/args, URL,
  headers, cwd, timeout, disabled tools, and friendly tool-name mappings.
- Add masked Workspace/Global secret and environment-variable editing. Never put secret values in
  project YAML, session snapshots, logs, or model prompts.
- Distinguish persistent enabled state from a session-only override. State when changes affect only
  newly constructed agents.
- Add availability checks, rescan/reconnect, per-persona assignment links, and actionable startup
  errors. Test real persistence and agent construction, not only toggle state.

## Phase 4 — autonomous-run guardrails

### 8. Add a soft message/iteration limit

Implement the host-neutral behavior in
`docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md`, then expose it in
both TUI and Rotaris.

- Persist a monotonic per-session counter and pause only between iterations, before any new child or
  LLM request starts.
- Rotaris dialog shows count, configured limit, token use, and actions: Continue, Double limit, and
  Cancel run. Continue must not lose todo, transcript, or queued prompts.
- Background sessions persist a distinct paused state and are resumable from the session browser.
- Keep the existing hard `max_iterations` ceiling as a separate final safety cap. UI labels must
  distinguish the soft confirmation limit from the hard cap.

## Phase 5 — coding toolchain readiness

### 9. Implement language-aware tool initialization

Implement
`docs/requirement-log/unresolved/requirements-20260413-205430.md` after the runtime correctness and
configuration work above.

- Detect workspace languages, resolve data-driven linter/formatter commands, and report missing
  dependencies before coding begins.
- Require confirmation before installing host tools. In unattended/background mode, skip missing
  installations with a visible warning unless an explicit auto-install policy is enabled.
- Register language-specific lint/format tools idempotently and expose a Rotaris “Initialize coding
  tools” action alongside the specified TUI `/inittools` command.
- Test multi-language workspaces, custom commands, unavailable package managers, repeated setup,
  and structured lint/format results.

## Cross-cutting verification and release gates

For each numbered workstream:

1. Add a requirement record with stable IDs and failure-path acceptance criteria.
2. Add service/backend integration tests that prove the user action reaches runtime or disk.
3. Add pytest-qt tests for ready, busy, success, empty, recoverable-error, cancellation, keyboard,
   accessibility, and `1000×680` / `1440×900` behavior where applicable.
4. Run relevant backend tests plus:

   ```bash
   rtk test .venv/bin/pytest apps/rotaris/tests -q --timeout=30 -p no:textual-snapshot
   rtk proxy .venv/bin/ruff check apps/rotaris/src apps/rotaris/tests
   rtk proxy .venv/bin/mypy apps/rotaris/src/rotaris
   rtk git diff --check
   rtk git status --short src/rotaris_core/tui
   ```

5. Bump root and Rotaris versions, synchronize `uv.lock`, and move the requirement record only when
   its real backend behavior and user-facing flow are complete.

## Completion criteria

- No Rotaris control can report success after only changing presentation state.
- A user can configure primary and fallback persona models, persona capabilities, skills, MCP
  servers, and MCP secrets without editing YAML.
- Parallel sessions can run in isolated worktrees without contaminating each other or the main tree.
- Autonomous runs pause at configured spend/check-in boundaries and resume without losing state.
- Coding-tool initialization is discoverable, idempotent, and safe in interactive and unattended
  modes.
