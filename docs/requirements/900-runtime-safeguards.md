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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Graceful Rate Limit and Model Fallback Handling (2026-05-15)

Original: `docs/requirement-log/done/requirements-20260515-000001-rate-limits.md` — document status: Complete

#### Description

When an LLM provider returns a rate limit or usage limit error (e.g., HTTP 429), the system must gracefully handle the interruption rather than crashing. The application will first attempt to automatically fall back to another model of the same capability class (e.g., another `medium_model`). If the fallback also fails due to limits, the run is suspended into a "wait" state. The user can allow the wait to expire, manually interrupt the run, or select an alternative model. Manually selected models are persisted for the remainder of the session. If the backend reports a provider-specific quota exhaustion condition such as `insufficient_quota`, the system must treat that as exhaustion of the concrete backing provider/model rather than as a generic transient request-rate spike.

**Problem being solved:**

Heavy usage of specific agents can exhaust an LLM provider's API usage limits. When this occurs, the current behavior interrupts or fails the agent's run abruptly, disrupting long-running autonomous workflows. Users lose context and have to manually restart with a different model.

**Current behaviour:**

When a usage limit is hit, the agent does not seamlessly hand over to fallback models of the same class, nor does it pause gracefully allowing user intervention or auto-resume. It also does not distinguish between transient rate limiting and a backend-declared provider quota exhaustion condition such as `insufficient_quota` on a concrete cloud provider.

**What needs to change:**

1. Intercept usage limit errors (HTTP 429) from the LLM API.

2. Auto-fallback to another model in the same class (e.g. Medium to another Medium).

3. Suspend execution (Wait State) if the fallback limit is also exhausted.

4. Display wait state in the TUI, showing estimated resume time based on API feedback (if provided by headers like `Retry-After`).

5. Offer TUI actions to the user during the wait state: Wait, Interrupt, or Change Model.

6. Persist any user-selected model override for the duration of the current session so that the agent doesn't revert to the rate-limited model upon the next tool call.

7. Treat backend 429 responses with structured quota codes such as `insufficient_quota` as provider-specific exhaustion signals, and avoid blindly resuming the same exhausted provider/model without fallback or explicit user choice.

#### Implementation Notes

**Requirements Document:**

**Dependencies:**

- Depends on: TUI Core (`docs/requirement-log/partial/requirements-20260413-000004-tui-core.md`), Config models (`docs/requirement-log/partial/requirements-20260413-000002-personas-and-config.md`)

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution N/A | None identified. | Adds new error handling paths without overriding terminal states (Wait is a non-terminal interrupted state).

**Notes:**

- **Assumptions**: We assume the OpenHands SDK provides access to HTTP 429 exception details or raw headers so we can parse `Retry-After` or `x-ratelimit-*`. We acknowledge that GitHub Copilot's SDK / API often omits these headers, and Azure OpenAI sometimes returns `0` or `-1`. Because of this, the local exponential backoff requirement (REQ-20260515-005) is a critical fallback rather than just an edge case.

- **Observed backend signal**: Current backend logs already emit provider-specific quota exhaustion in a structured form (`status=429`, `result=insufficient_quota`, `error.type=insufficient_quota`, `error.code=insufficient_quota`) for the concrete requested model. This requirement treats that signal differently from a generic retryable burst limit.

- **Out of scope**: Cross-session persistence of rate limits. Limits are strictly session runtime concepts here.

- **Proactive complement — Per-model delegation queue (2026-06-10):** The reactive
  rate-limit / quota handling described in this document is complemented by a
  proactive mechanism: `ModelConfig.max_parallel` caps concurrent children per
  model (default 3 for `deepseek` provider), and the `RotarisDelegateExecutor`
  enqueues over-cap delegations into `WAITING_ON_MODEL_SLOT` instead of rejecting
  them. This prevents quota/rate-limit errors from occurring in the first place for
  parallel delegation bursts. See ADR-016 in
  docs/architecture/16-decision-record.md.

#### Acceptance Criteria

**Acceptance Criteria:**

- [x] A simulated 429 response from the primary model successfully triggers an automatic execution continuation using a secondary model of the same class.

- [x] A simulated 429 on both primary and secondary models transitions the TUI agent status to "Waiting" and displays a countdown timer (if a `Retry-After` header is provided).

- [x] The TUI displays "Cancel Run" and "Change Model" buttons/binds during the Wait state.

- [x] Clicking/binding "Cancel Run" interrupts the run through the existing stop path while the wait state is active.

- [x] Selecting a new model through the TUI immediately resumes the run using the new model, and subsequent LLM calls in the same session use this newly selected model without reverting.

- [x] If the wait countdown expires natively, the run resumes automatically on the original model for generic transient rate limits.

- [x] A simulated backend response of HTTP 429 with `error.type=insufficient_quota` for a concrete requested model causes the system to mark that provider/model as exhausted for the session and avoid automatic retry on the same provider/model unless the user explicitly reselects it.

### Requirements Document (2026-06-09)

Original: `docs/requirement-log/unresolved/requirements-20260609-message-limit-confirm.md` — document status: Not Started

#### Summary

A user-configurable message (iteration) limit that, when reached during a session, pauses execution mid-loop and displays an onscreen modal dialog asking the user whether they want to continue. While the dialog is shown, no LLM requests are dispatched and no child agents are spawned. The user may choose to continue (resume execution), cancel (stop the session), or optionally adjust the limit before continuing.

---

#### Context

### Problem being solved

Long-running agentic sessions can consume significant token budgets and compute time without the user's continuous attention. Currently, the system supports a hard `max_iterations` limit that stops the loop unconditionally, but there is no mid-session pause-and-confirm mechanism. The user needs a soft check-in point: after a configurable number of messages (iterations), execution pauses, the user is shown a dialog, and only proceeds after explicit consent. This prevents runaway cost/execution while keeping the session alive for continued work.

### Current behaviour

- `RuntimePolicy.max_iterations` (default 20) causes the Ralph loop to stop at a hard ceiling with `stop_reason = "iteration limit reached"`. There is no user dialog, no pause, and no way to continue past the limit without restarting.
- The `CircuitBreaker` (`CircuitBreakerConfig.message_count_threshold`) counts messages for automatic loop detection but has no user-facing dialog or pause-resume semantics.
- The `QuotaWaitScreen` modal already demonstrates the pause-with-dialog pattern for rate-limit suspension, but it is scoped to provider quota exhaustion rather than a user-configured iteration gate.
- `SessionState` has no dedicated message counter; iteration count is carried inside `RalphProgressFile` only.

### What needs to change

1. A new `message_limit` configuration field (or reuse/extend `max_iterations` with a confirmation mode) that defines the pause-and-confirm threshold.
2. A monotonic message counter that increments after each child agent completes an iteration and is persisted in `SessionState` so it survives crashes and session restarts.
3. A new modal dialog (`MessageLimitConfirmScreen`) integrated into the TUI that pauses the Ralph loop, blocks further LLM requests, and offers the user explicit actions.
4. A resume mechanism that continues the loop from the exact iteration that triggered the pause.
5. Background-mode handling for the pause condition since no TUI is available.
6. Tests covering the pause, dialog, resume, and background-mode paths.

---

#### Acceptance Criteria

- [ ] A `message_limit` of `null` (default) causes no pause behaviour — all existing sessions continue without change (backward compatible).
- [ ] A `message_limit` of `5` pauses the loop after the 5th iteration and displays the `MessageLimitConfirmScreen`.
- [ ] "Continue" on the modal resumes the loop; the counter continues from 6 onward without reset.
- [ ] "Double Limit" doubles the limit (e.g. 5 → 10) and resumes the loop immediately.
- [ ] "Cancel Run" stops the session with `stop_reason = "user cancelled at message limit"`.
- [ ] While the modal is displayed, no LLM HTTP requests originate from the Ralph loop (verified via spy on the LLM client).
- [ ] A background session with `message_limit=3` pauses after the 3rd iteration, writes `/.message_limit_paused`, sets `execution_status = "paused_message_limit"`, and does not auto-continue.
- [ ] Reattaching to a paused background session shows the `MessageLimitConfirmScreen` without additional user action.
- [ ] After a simulated crash (kill + restart), the restored session has the correct `message_count` and `message_limit` values and does not re-prompt the user for already-counted iterations.
- [ ] The existing `max_iterations` hard stop continues to function independently — it is not affected by the new `message_limit` feature.

---

#### Dependencies

- Depends on: `rath/loop.py` (pause hook insertion point), `tui/screens/modals.py` (new modal screen), `session/state.py` (new counter field), `config/schema.py` (new config field), `tui/ralph_loop.py` (TUI overlay integration), `tui/app.py` and `tui/session_manager.py` (reattach awareness)
- Blocks: Nothing

---

#### Resolved Conflicts

| Prior Requirement                                                             | Conflict                                                                                                               | Resolution                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `max_iterations` in `RuntimePolicy`                                           | Both cap the number of iterations. `max_iterations` stops unconditionally; `message_limit` pauses with a user dialog.  | The two are independent and can coexist. `max_iterations` is a hard safety ceiling; `message_limit` is a soft user check-in. Whichever fires first governs behaviour.                     |
| Circuit Breaker (`requirements-20260414-091500.md`) `message_count_threshold` | Both involve a message count. The Circuit Breaker is an automatic loop-detection mechanism with no user-facing dialog. | The new `message_limit` is orthogonal: it is a user-configured cost/attention gate, not a stuck-agent detector. Both counters may exist independently.                                    |
| `REQ-RALPH-007` Stop Conditions                                               | Stop conditions list iteration limit, time limit, and task completion but do not mention a user-pause path.            | This requirement supersedes `REQ-RALPH-007` by adding a new pause-and-continue path that is not a terminal stop condition. The stop condition list remains correct — pause is not a stop. |

---

#### Notes

- **Assumption: message = Ralph loop iteration.** The counter increments once per completed loop iteration, not per individual LLM response within a child agent. This is deliberate: iterations are the natural checkpoint boundary and avoid race conditions with nested agent conversations.
- **Assumption: default is disabled (`null`).** Backward compatibility is essential — existing users and configs must not be affected.
- **Self-resolved: Double Limit behaviour.** The "Double Limit" action doubles the effective limit for the current session only (stored in `SessionState`, not persisted to the config file). This lets the user say "go further" without permanently changing their configuration.
- **Self-resolved: no auto-continue in background mode.** Unlike the `QuotaWaitScreen` which has an optional auto-resume, the message limit pause requires explicit user action because the user deliberately configured the limit. Auto-continuing would defeat the purpose.
- **Self-resolved: check fires between iterations, not mid-iteration.** This avoids the complexity of suspending an in-flight child agent and guarantees clean state boundaries.
- **Innovation suggestion:** Consider making the `message_limit` adjustable at runtime via the command palette (e.g. "Set message limit" with a numeric input). This lets users say "warn me every N iterations" without restarting. Captured as a Low-priority command palette entry (`REQ-20260609-009`).
