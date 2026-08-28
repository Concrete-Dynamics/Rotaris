---
req-id: [SWR-200, SWR-201, SWR-202, SWR-203, SWR-204, SWR-205, SWR-206, SWR-207, SWR-208, SWR-209, SWR-210, SWR-211, SWR-212, SWR-213, SWR-214, SWR-215, SWR-216, SWR-217, SWR-218, SWR-219, SWR-220, SWR-221, SWR-222, SWR-223, SWR-224, SWR-225, SWR-226, SWR-227]
status: approved
trace: required
test: required
title: "Circuit Breaker & Loop Detection"
---

# 200-circuit-breaker spec

## SWR-200 — Circuit Breaker & Loop Detection
trace: optional
test: optional

Detecting and interrupting unproductive agent behavior: the circuit breaker agent, loop-detection tuning, and the enable/disable toggle.

## SWR-201 — Hidden Activation
legacy-id: REQ-20260414-091500-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker agent must operate without the primary agent's knowledge. It must not produce any observable side effect in the session when no loop is detected.

## SWR-202 — Tool Call Threshold Trigger
legacy-id: REQ-20260414-091500-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker must be triggered when the number of tool calls within the current agent session reaches the configured tool call threshold. Default: **10**.

## SWR-203 — Message Count Threshold Trigger
legacy-id: REQ-20260414-091500-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker must be triggered when the number of messages within the current agent session reaches the configured message count threshold. Default: **20**.

## SWR-204 — Independent Trigger Mode
legacy-id: REQ-20260414-091500-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

In independent mode, either threshold being reached must independently trigger the Circuit Breaker, without requiring both conditions to be met simultaneously. This is the default activation mode.

## SWR-205 — Weighted Trigger Mode
legacy-id: REQ-20260414-091500-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The system must support a weighted trigger mode in which the Circuit Breaker fires when a weighted score reaches or exceeds 1.0. The score is computed as: `score = (toolCalls / toolCallThreshold) * w_tools + (messageCount / messageCountThreshold) * w_messages`. Default weights: `w_tools = 0.6`, `w_messages = 0.4`.

## SWR-206 — Activation Mode Configurability
legacy-id: REQ-20260414-091500-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The activation mode (independent or weighted) must be configurable per deployment without code changes. The default mode is **independent**.

## SWR-207 — Loop Classification
legacy-id: REQ-20260414-091500-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

Upon activation, the Circuit Breaker must classify whether the primary agent is stuck in an unproductive loop. The output of this classification must be a binary decision: `loop_detected = true` or `loop_detected = false`.

## SWR-208 — No-Op on Clean State
legacy-id: REQ-20260414-091500-008
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

If `loop_detected = false`, the Circuit Breaker must take no action. The primary agent session must resume unmodified.

## SWR-209 — Context Injection on Loop
legacy-id: REQ-20260414-091500-009
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

If `loop_detected = true`, the Circuit Breaker must inject a new message into the primary agent's context window.

## SWR-210 — Injected Message - Redirection
legacy-id: REQ-20260414-091500-010
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The injected message must either direct the primary agent toward a different approach or instruct it to critically evaluate whether the current approach can achieve the session goal.

## SWR-211 — Injected Message - Identity Concealment
legacy-id: REQ-20260414-091500-011
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The injected message must not reveal the existence, role, or invocation of the Circuit Breaker agent. It must appear as a natural in-context instruction.

## SWR-212 — Counter Reset After Activation
legacy-id: REQ-20260414-091500-012
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

After the Circuit Breaker completes an activation cycle (regardless of `loop_detected` outcome), both the tool call counter and the message count counter must reset to zero.

## SWR-213 — Consecutive Activation Tracking
legacy-id: REQ-20260414-091500-013
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker must track how many times it has fired within the current session without an intervening new user instruction. This count must increment on every activation. It must reset to zero when a new user instruction is received.

## SWR-214 — Escalation on Repeated Activation
legacy-id: REQ-20260414-091500-014
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

If the consecutive activation count exceeds **2** without a new user instruction, the Circuit Breaker must abort the agent session and return control to the parent caller, regardless of the `loop_detected` classification result.

## SWR-215 — Escalation Signal to Parent
legacy-id: REQ-20260414-091500-015
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

When escalating to the parent, the Circuit Breaker must provide a structured signal that includes: the session ID, the consecutive activation count, and the reason for escalation (`repeated_loop_detection`).

## SWR-216 — Classification Latency
legacy-id: REQ-20260414-091500-016
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker's full activation cycle - from trigger to either no-op or completed context injection - must complete within **2 seconds**.

## SWR-217 — Injected Message Quality
legacy-id: REQ-20260414-091500-017
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The injected message must be dynamically generated based on the current session context, not a static template, to remain relevant to the specific loop pattern detected.

## SWR-218 — Independent Threshold Configuration
legacy-id: REQ-20260414-091500-018
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The tool call threshold and the message count threshold must be independently configurable per deployment without code changes (e.g., via environment variable or configuration file).

## SWR-219 — Default Threshold Values
legacy-id: REQ-20260414-091500-019
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

Default values must be grounded in established production norms. Defaults: tool call threshold = **10** (aligned with common `max_iterations` practice), message count threshold = **20** (aligned with the Vercel AI SDK step default). Weighted mode defaults: `w_tools = 0.6`, `w_messages = 0.4`, target score = `1.0`.

## SWR-220 — No Primary Agent Awareness
legacy-id: REQ-20260414-091500-020
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

Under no circumstances may the primary agent receive information indicating that a supervisory check occurred or that its context was externally modified.

## SWR-221 — Session Scope
legacy-id: REQ-20260414-091500-021
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-091500.md

The Circuit Breaker's state (trigger counters, activation history, consecutive activation count) must be scoped strictly to the current agent session and must not persist across sessions.

## SWR-222 — Fix Circuit Breaker False Positives
legacy-id: REQ-20260417-001
date: 2026-04-17
source: docs/requirement-log/done/requirements-20260417-140000.md

Replace raw-count circuit-breaker triggers with evidence-based repetition and cycle detection so productive tool-call chains are not cancelled as loops.

## SWR-223 — Backend `enabled` field
legacy-id: FR-ROTARIS-CB-ENABLED-001
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-circuit-breaker-enabled.md

Add `enabled: bool = Field(default=True, …)` to `CircuitBreakerConfig` in `src/rotaris_core/config/schema.py`. The field is serialized to/from YAML and defaults to `True`.

## SWR-224 — `build_circuit_breaker()` bypass
legacy-id: FR-ROTARIS-CB-ENABLED-002
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-circuit-breaker-enabled.md

When `config.circuit_breaker.enabled` is `False`, `build_circuit_breaker()` returns `None` immediately without constructing an LLM or `CircuitBreaker` instance. When `True` (default), existing behaviour is preserved.

## SWR-225 — Scheduler disabled flag
legacy-id: FR-ROTARIS-CB-ENABLED-003
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-circuit-breaker-enabled.md

The scheduler distinguishes "not yet built" from "intentionally disabled": a separate `_circuit_breaker_disabled: bool` flag is set when `enabled` is `False` during build, and `_get_circuit_breaker()` returns `None` on subsequent calls without attempting to rebuild. The run loop tolerates a `None` breaker.

## SWR-226 — Rotaris wiring via `build_run_config()`
legacy-id: FR-ROTARIS-CB-ENABLED-004
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-circuit-breaker-enabled.md

`build_run_config()` in `apps/rotaris/src/rotaris/services/config_service.py` writes `self.store.runtime.circuit_breaker` into `config.circuit_breaker.enabled`. No UI changes required — the existing toggle, chrome status, and store field already exist.

## SWR-227 — Backward compatibility
legacy-id: FR-ROTARIS-CB-ENABLED-005
date: 2026-07-14
source: docs/requirement-log/unresolved/requirements-20260714-circuit-breaker-enabled.md

Default-enabled preserves existing behaviour for all consumers. YAML roundtrip works for `enabled: true` and `enabled: false`. Serialized configs without the field deserialize to `enabled=True`. Existing tests pass unchanged.

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
