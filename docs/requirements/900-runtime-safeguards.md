---
req-id: [SWR-900, SWR-901, SWR-902, SWR-903, SWR-904, SWR-905, SWR-906, SWR-907, SWR-908, SWR-909, SWR-910, SWR-911, SWR-912, SWR-913, SWR-914, SWR-915, SWR-916, SWR-917, SWR-918]
status: draft
trace: required
test: required
title: "Runtime Safeguards & Cost Limits"
---

# 900-runtime-safeguards spec

## SWR-900 — Runtime Safeguards & Cost Limits
status: approved
trace: optional
test: optional

Guardrails for runaway runs: rate-limit/fallback handling and message-limit confirmation.

Derived requirements: [SWR-919 — LLM runtime error classification](900-runtime-safeguards/SWR-919-llm-error-classification.md), [SWR-920 — Per-model concurrency cap](900-runtime-safeguards/SWR-920-per-model-concurrency-cap.md)

## SWR-901 — Usage Limit Detection** The system must intercept 429 usage limit errors from the LLM endpoint during execution.
status: approved
legacy-id: REQ-20260515-001
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - scheduler now treats generic rate-limit responses (`LLMRateLimitError`, plain `429`, `Too Many Requests`, `rate limit`) as explicit usage-limit events instead of letting them fall through to generic failure handling.

## SWR-902 — Same-Class Auto-Fallback** Upon detecting a usage limit, the system must automatically swap to a configured secondary model of the same tier (e.g., `medium_model`) to continue the run transparently.
status: approved
legacy-id: REQ-20260515-002
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - the scheduler now selects one eligible same-tier fallback model and re-runs the active child on that model before entering the suspended wait path.

## SWR-903 — Wait State Suspension** If the auto-fallback model also encounters a usage limit (or none is configured), the system must push the agent run into a suspended \"Wait\" state instead of failing.
status: approved
legacy-id: REQ-20260515-003
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - quota/rate-limit retries now suspend behind a scheduler wait gate and surface persisted `wait_state` metadata to the TUI instead of failing the child immediately.

## SWR-904 — API Reset Inspection** The system must inspect the HTTP response headers (e.g., `Retry-After`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`) to determine the duration of the rate limit and schedule an auto-resume when the limit expires.
status: approved
legacy-id: REQ-20260515-004
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: Medium

Complete - `Retry-After` parsing is used when available to drive the wait countdown / retry delay, and the fallback path keeps honoring provider-supplied retry hints before local backoff is used.

## SWR-905 — Deterministic Local Backoff** Since APIs (like GitHub Copilot's completions API) may omit rate limit headers or provide unreliable reset values, the system must implement a local exponential backoff timer (with jitter) if the headers are absent or malformed.
status: approved
legacy-id: REQ-20260515-005
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - the scheduler retains deterministic exponential local backoff when no usable retry header is present, bounded by the configured quota-wait cap.

## SWR-906 — Wait State TUI Controls** While suspended, the TUI must present the user with three explicit options: (1) Continue waiting for auto-resume, (2) Interrupt/Cancel the run, (3) Select a different manual alternative model from a list of available models.
status: approved
legacy-id: REQ-20260515-006
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - the wait modal now exposes `Keep Waiting`, `Cancel Run`, and `Change Model` actions plus matching key bindings.

## SWR-907 — Session-wide Model Override** If the user chooses a manual alternative model during a Wait State, the system must save this choice for the remainder of the active session, overriding the exhausted model/tier to prevent recurring 429 errors on subsequent inference calls.
status: approved
legacy-id: REQ-20260515-007
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - manual model changes now update the live run immediately, persist the active model override into `SessionState`, and restore that override on later session reloads.

## SWR-908 — Concrete Provider Quota Exhaustion Handling** If the backend returns HTTP 429 with a structured provider quota exhaustion error for a concrete model/provider pair (for example `error.type=insufficient_quota`, `error.code=insufficient_quota`), the system must classify that provider/model as exhausted for the active session, must not auto-resume onto the same exhausted provider/model by default, and must instead either fall back to a different eligible model/provider or require explicit user selection.
status: approved
legacy-id: REQ-20260515-008
date: 2026-05-15
source: docs/requirement-log/done/requirements-20260515-000001-rate-limits.md
priority: High

Complete - concrete `insufficient_quota` hits are now tracked as session-scoped exhausted models, excluded from automatic same-model auto-resume, surfaced to the TUI, and recoverable via one same-tier fallback or explicit manual model selection.

## SWR-909 — Message limit configuration** — A new `message_limit` field shall be added to `RuntimePolicy` (or a sibling config section). Acceptable values: a positive integer (pause after this many messages), or `null`/`0` to disable. The default shall be `null` (disabled) to preserve backward compatibility.
status: approved
legacy-id: REQ-20260609-001
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-910 — Message counter** — A `message_count` field shall be added to `SessionState` that increments by 1 after each completed Ralph loop iteration (after `_run_iteration` returns and the iteration is appended to `progress.iterations`). The counter shall be persisted in session snapshots so it survives crashes and reattaches. The counter shall reset to 0 on a new session.
status: approved
legacy-id: REQ-20260609-002
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-911 — Pause check in Ralph loop** — After each iteration completes and before starting the next, the loop shall check whether `message_count >= message_limit` (when `message_limit` is set). If the limit is reached, execution shall pause: the loop shall not start the next iteration, no new LLM request shall be dispatched, and no new child agent shall be spawned until the user responds to the confirmation dialog.
status: approved
legacy-id: REQ-20260609-003
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-912 — TUI confirmation modal** — A `MessageLimitConfirmScreen` (subclass of `ModalScreen[str]`) shall be displayed in the TUI when the message limit is reached. The modal shall show: (a) the current message count, (b) the configured limit, (c) estimated token usage so far (from `SessionState.global_token_usage`), and (d) three actions: **Continue** (resume execution; counter continues accumulating), **Double Limit** (double the `message_limit` for this session and continue), and **Cancel Run** (stop the session as if the user requested a stop). The modal shall follow the same visual contract as the existing `QuotaWaitScreen` (centered overlay, keyboard bindings, focus management).
status: approved
legacy-id: REQ-20260609-004
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-913 — Keyboard bindings** — `MessageLimitConfirmScreen` shall support: `c` / Enter → Continue, `d` → Double Limit, `x` / Escape → Cancel Run.
status: approved
legacy-id: REQ-20260609-005
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: Medium



## SWR-914 — No LLM requests while paused** — While the modal is displayed, the scheduler must not dispatch any LLM completion requests or spawn any child agents. The pause must be enforced at the Ralph loop level (between iterations) so no agent is mid-execution when the check fires. The check shall happen _after_ `_run_iteration` returns and _before_ the next `_find_next_pending` / `_run_iteration` call, guaranteeing clean boundaries.
status: approved
legacy-id: REQ-20260609-006
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-915 — Background mode behaviour** — When the session is in background mode and the message limit is reached, the session shall auto-pause at the same loop-level boundary. A signal file (`<session_dir>/.message_limit_paused`) shall be written to disk so the reattach flow can detect the paused state. The session shall remain paused until the user reattaches via the TUI and responds to the confirmation dialog. If the user never reattaches, the session stays paused indefinitely (no auto-continue). The paused state shall be visible in `SessionState.execution_status` as `\"paused_message_limit\"`.
status: approved
legacy-id: REQ-20260609-007
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-916 — Reattach awareness** — When reattaching to a background session whose `execution_status` is `\"paused_message_limit\"`, the TUI shall immediately display the `MessageLimitConfirmScreen` after restoring the session state. The user shall not need to manually navigate to trigger the dialog.
status: approved
legacy-id: REQ-20260609-008
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: High



## SWR-917 — Command palette entry** — The command palette shall include a \"Continue paused session\" entry that is only active when the session is in `\"paused_message_limit\"` state. This provides an alternative keyboard/mouse path to the same confirm dialog.
status: approved
legacy-id: REQ-20260609-009
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: Low



## SWR-918 — Session state durability** — The `message_count` and the active `message_limit` (including any user-adjustment via \"Double Limit\") shall be persisted in `SessionState` and written to disk via the existing snapshot mechanism. After a crash and restart, the session restores the counter and limit so the user is not prompted again for iterations already counted.
status: approved
legacy-id: REQ-20260609-010
date: 2026-06-09
source: docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md
priority: Medium


Test portfolio:

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Background run durably records a reached message limit | Background observer and session persistence seam | `tests/unit/test_background_message_limit.py` |
| Integration | Message-limit counter and adjusted limit survive snapshot save/load | Session manager snapshot round-trip | Existing `tests/unit/test_session_state.py` serialization coverage plus TUI reattach test |
| User-flow E2E | User reattaches, sees confirmation, and resumes through either automatic or palette path | Textual TUI modal and command palette | `tests/unit/test_tui_app.py::test_reattached_message_limit_prompt_resolves_and_removes_signal` and `tests/unit/test_command_palette.py::test_paused_message_limit_command_is_gated_and_dispatches` |


## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
