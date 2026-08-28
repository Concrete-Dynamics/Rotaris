---
req-id: [SWR-2100, SWR-2101, SWR-2102, SWR-2103, SWR-2104, SWR-2105, SWR-2106, SWR-2107, SWR-2108, SWR-2110, SWR-2111, SWR-2112, SWR-2113, SWR-2114, SWR-2115, SWR-2116, SWR-2117, SWR-2118, SWR-2119, SWR-2120, SWR-2121]
status: approved
trace: required
test: required
title: "Security, Policy & NFRs"
---

# 2100-security-policy spec

## SWR-2100 — Security, Policy & NFRs
trace: optional
test: optional

Non-functional requirements and security hardening: operational policy, centralized path authorization, secret redaction.

## SWR-2101 — pip Package
trace: optional
legacy-id: NFR-1
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Distributed as a **`pip` package** (`pip install rotaris-core`). Tagged GitHub Releases also publish installable wheel + sdist bundles for direct download/install.

## SWR-2102 — Docker Image
status: draft
legacy-id: NFR-2
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Official **Docker image** for containerized/CI use.

> **Deferred (2026-08-09).** Explicitly postponed by the maintainer when Phase 2
> started. This is a *distribution* concern, not the execution sandbox — sandboxing
> ships as an OS-level per-command wrapper (SWR-2507, Seatbelt/bubblewrap), so nothing
> in the security model waits on this image. Revisit when CI/container distribution
> becomes a real user request.

## SWR-2103 — Python
trace: optional
test: optional
legacy-id: NFR-3
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Implementation language: **Python** (natural fit with OpenHands SDK).

## SWR-2104 — CLI Entrypoints
trace: optional
legacy-id: NFR-4
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

`rotaris-cli run "your task"`, `rotaris-cli run --background "your task"`, or `rotaris-cli` for interactive TUI mode.

## SWR-2105 — Workspace Root
trace: optional
legacy-id: NFR-5
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Workspace root defaults to launch CWD and may be overridden explicitly via CLI argument.

## SWR-2106 — No Daemon
trace: optional
test: optional
legacy-id: NFR-6
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Must not require a running server or persistent daemon.

## SWR-2107 — OpenHands SDK First
trace: optional
legacy-id: NFR-7
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

OpenHands SDK is a core dependency; do not reimplement what the SDK already provides.

## SWR-2108 — Single-Process Asyncio
trace: optional
legacy-id: NFR-8
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

Runtime concurrency is single-process and asyncio-based.

## SWR-2110 — Protected LLM Completion Against Bare-Raise Crash
legacy-id: NFR-10
date: 2026-04-13
source: docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md

The LLM completion wrapper (`wrap_llm_completion`) must catch `RuntimeError("No active exception to reraise")` that can arise from concurrency edge cases on the thread-pool boundary during `asyncio.to_thread` execution. On catch, it must log a critical diagnostic with the full traceback and retry once, since the bug is non-deterministic (thread timing) and a retry almost always succeeds. Other `RuntimeError` types must propagate normally.

## SWR-2111 — Centralized `PathAuth` class
legacy-id: FR-ROTARIS-PATHAUTH-001
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

Create `src/rotaris_core/core/path_auth.py` with a `PathAuth` class. Constructor accepts `workspace_root: Path` and `allow_outside: bool = False`. `validate(path, *, for_write)` resolves the path, checks `is_relative_to(workspace_root)`, and raises `ValueError` if outside and `allow_outside` is `False`. `is_allowed(path)` returns `bool`. Traversal attacks (`../outside`) are resolved and rejected.

## SWR-2112 — FileToolEngine wiring
legacy-id: FR-ROTARIS-PATHAUTH-002
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

In `src/rotaris_core/tools/file_engine.py`, replace the inline `_allow_outside_workspace` flag and the body of `resolve_path()` with delegation to `self._path_auth.validate()`. `extra_read_roots` logic remains as a pre-check in FileToolEngine before delegating.

## SWR-2113 — HAET engine wiring
legacy-id: FR-ROTARIS-PATHAUTH-003
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

In `src/rotaris_core/haet/engine.py`, replace the inline `_resolve_path` logic with delegation to `PathAuth.validate()`.

## SWR-2114 — Search/glob wiring
legacy-id: FR-ROTARIS-PATHAUTH-004
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

In `src/rotaris_core/tools/search.py`, replace `_is_within_workspace()` with delegation to `PathAuth.is_allowed()`. All callers pass a `PathAuth` instance instead of `workspace_root + allow_outside_workspace` separately.

## SWR-2115 — Git commit wiring
legacy-id: FR-ROTARIS-PATHAUTH-005
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

In `src/rotaris_core/tools/git_commit.py`, replace the inline `_resolve_file_path` logic with delegation to `PathAuth.validate()`.

## SWR-2116 — Terminal sandbox warning
test: optional
legacy-id: FR-ROTARIS-PATHAUTH-006
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

The terminal tool description in `src/rotaris_core/tools/terminal.py` explicitly states that terminal commands run with `cwd = workspace_root` but the shell itself is not sandboxed — `cd /etc` and `cat /etc/passwd` work regardless of the workspace boundary toggle. No path enforcement is added to the terminal tool.

## SWR-2117 — Backward compatibility
trace: optional
legacy-id: FR-ROTARIS-PATHAUTH-007
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md

Default `allow_outside=False` preserves the existing restrictive policy. Existing tool tests pass unchanged after wiring. The `RuntimePolicy.allow_outside_workspace` config field drives `PathAuth` construction — no new config class is added.

## SWR-2118 — Non-interactive UI status
status: draft
trace: optional
legacy-id: FR-ROTARIS-REDACT-CLEANUP-001
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-secret-redaction-cleanup.md

Settings → Runtime Policy and workspace chrome display a static, non-interactive label: "Secret redaction: always active" (settings) and "redaction: always on" (chrome). No toggle switch, checkbox, button, or editable control exists for secret redaction.

## SWR-2119 — No store field or toggle
status: draft
trace: optional
legacy-id: FR-ROTARIS-REDACT-CLEANUP-002
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-secret-redaction-cleanup.md

No `secret_redaction` boolean field, setter, or getter exists in `WorkspaceStore`, `RuntimeToggles`, or any Rotaris state model. No backend `RuntimePolicy` toggle field claims to disable redaction.

## SWR-2120 — No onboarding mention
status: draft
trace: optional
legacy-id: FR-ROTARIS-REDACT-CLEANUP-003
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-secret-redaction-cleanup.md

The Rotaris onboarding flow contains no mention of disabling, toggling, or configuring secret redaction. Redaction appears only as an informational point that it is always active.

## SWR-2121 — Dead code removal
status: draft
trace: optional
legacy-id: FR-ROTARIS-REDACT-CLEANUP-004
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-secret-redaction-cleanup.md

Any unreferenced `secret_redaction` field, unused setter, stale comment, or phantom toggle reference found in `apps/rotaris/src/rotaris/` or `src/rotaris_core/` is removed. If no dead code exists, the task is already satisfied.

> **Inspection result (2026-08-09).** SWR-2118–2121 were re-checked across both trees
> while planning Phase 2: there is no `secret_redaction` field in `config/schema.py` or
> `apps/rotaris/src/rotaris/models/state.py`, no toggle widget (the Settings row is a
> static `QLabel` "Secret redaction: always active", `views/settings.py`; workspace
> chrome shows "redaction: always on", `views/chrome.py`), and onboarding never mentions
> it. The four acceptance criteria already hold — nothing to remove. They stay `draft`
> until a guard test pins the absence, so a phantom toggle cannot reappear unnoticed;
> the flip to `approved` follows with that test.

## History

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - NFRs and Operational Policy (2026-04-13)

Original: `docs/requirement-log/partial/requirements-20260413-000005-nfr-and-policy.md` — document status: Partial - pip packaging and GitHub Release bundle automation are complete; Docker image remains open

#### Description

Non-functional requirements covering distribution, runtime constraints, and observability. The default runtime policy table defines v1 timeout, retry, and concurrency defaults.

#### Implementation Notes

**Requirements - Non-Functional Requirements & Default Runtime Policy:**

**Migrated From:** `REQUIREMENTS.md` NFR section, Default Runtime Policy (dissolved 2026-05-03) Docker image and some timeout policy enforcement may be incomplete.

**Default Runtime Policy (v1):**

Setting | Default Max active direct children / parent | `8` Max delegation depth | `3` levels below the entry persona Child agent wall-clock timeout | `20 minutes` from spawn to terminal report artifact Model call timeout | `120 seconds` Shell tool timeout | `300 seconds` Non-shell tool timeout | `30 seconds` Summary agent timeout | `60 seconds` Automatic retries | `1` retry for transient transport/runtime failures; `0` automatic retries for validation errors, HAET hash mismatches, or non-zero shell exits Dependency failure behavior | Dependents move to `blocked` and are not auto-started Parent/session cancellation behavior | Cancellation cascades to active descendants; completed child reports remain available

**Out of Scope for v1:**

Topic | Notes Community persona registry | Future - shareable personas via Git repos or a registry endpoint GUI / web interface | TUI only for v1 Persistent agent memory across sessions | Long-term memory/learning is not a v1 requirement; evaluate MCP memory servers as an optional integration Multi-workspace / multi-project orchestration | Single workspace per session Agent authentication / multi-user | Single-developer local tool

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Partial - pip packaging and GitHub Release bundle automation are complete; Docker image remains open`.

### Centralized Path Authorization (2026-07-14)

Original: `docs/requirement-log/unresolved/requirements-20260714-centralized-path-auth.md` — document status: Not Started

#### Description

Replace scattered per-tool workspace-boundary checks with a centralized
`PathAuth` class that enforces the "Allow outside workspace" runtime policy
consistently. The safe default rejects path escapes; explicit opt-in allows
stated paths. Wire `PathAuth` into `FileToolEngine`, HAET engine, search/glob,
and git-commit. The terminal tool explicitly documents that shell execution is
not sandboxed regardless of the workspace boundary toggle.

#### Acceptance Criteria

- `PathAuth(workspace_root, allow_outside=False).validate("/etc/passwd")` raises `ValueError`.
- `PathAuth(workspace_root, allow_outside=True).validate("/etc/passwd")` returns the resolved path.
- `PathAuth(workspace_root).validate("src/main.py")` resolves correctly relative to workspace root.
- Traversal attempt `validate("../outside")` resolves outside the workspace and raises `ValueError`.
- `FileToolEngine.resolve_path("/etc/passwd")` raises `ValueError` when `allow_outside=False`;
  returns resolved path when `allow_outside=True`.
- HAET engine and git-commit reject outside-workspace paths with the same semantics.
- Search/glob skip results outside the workspace when `allow_outside=False`.
- All existing tool tests pass without modification.
- Unit tests for `PathAuth` cover 7+ scenarios (relative, absolute, outside-rejected,
  outside-allowed, traversal, is_allowed, normalization).
- Terminal tool description documents the absence of a shell sandbox.

### Secret Redaction Cleanup (2026-07-14)

Original: `docs/requirement-log/unresolved/requirements-20260714-secret-redaction-cleanup.md` — document status: Not Started

#### Description

Secret redaction must always be active. Remove any editable toggle, store field,
or onboarding logic that suggests redaction can be disabled. Present a
non-interactive "always active" status in the Runtime Policy settings and chrome.
Backend redaction behaviour is unchanged — this is a UI cleanup and dead-code
removal task only.

#### Acceptance Criteria

- `grep -ri "secret_redaction\|redaction.*toggle\|redaction.*disabled\|redaction.*off" apps/rotaris/src/rotaris/ src/rotaris_core/`
  returns only the two expected non-interactive display lines in `settings.py` and `chrome.py`.
- No editable toggle, store field, or `secret_redaction` boolean exists anywhere in Rotaris or
  the backend config schema.
- Onboarding does not mention disabling or toggling redaction.
- All existing tests pass without modification — no test relies on a now-removed toggle.
- Rotaris Settings → Runtime Policy shows "Secret redaction: always active" as a muted,
  non-interactive label.
