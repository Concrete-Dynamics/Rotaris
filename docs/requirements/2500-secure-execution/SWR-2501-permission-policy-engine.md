---
req-id: SWR-2501
status: approved
trace: required
test: required
title: "Permission policy engine (allow/ask/deny)"
epic: SWR-2500
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2501 — Permission policy engine (allow/ask/deny)

Every tool dispatch (built-in tools, custom tools, MCP tools) MUST pass through
a central permission policy engine before execution. For each call the engine
resolves exactly one decision: `allow` (execute), `ask` (suspend until an
interactive approval per SWR-2504 resolves), or `deny` (reject with a
structured, agent-visible refusal message that names the violated rule).

- The decision considers: tool name, persona, workspace policy config
  (SWR-2503), command patterns for terminal calls (SWR-2502), and path scope
  (delegating to the existing `PathAuth`, SWR-2111).
- A `deny` MUST NOT abort the session; the refusal is returned as the tool
  result so the agent can re-plan.
- The engine is fail-closed: an unresolvable or malformed policy yields `ask`
  in interactive hosts and `deny` in headless mode, never `allow`.
- Every decision is emitted as an auditable event (SWR-2506).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Decision resolution for allow/ask/deny across tool/persona/pattern inputs; fail-closed on malformed policy | Policy engine API | `tests/unit/test_permission_engine.py` |
| Integration | Tool dispatch path consults the engine; deny returns structured refusal to the agent without aborting the run | Scheduler/tool executor seam | `tests/integration/test_permission_dispatch.py` |
| User-flow E2E | A run with a deny rule on a terminal command completes with the command blocked and the refusal visible in the transcript | Public product boundary → user-observable result | `tests/integration/test_permission_denial_e2e.py` |

## Implementation notes

The gate lives in `RotarisAgent._execute_action_event`
(`src/rotaris_core/agents/safe_agent.py`): the SDK routes every tool call —
built-in, custom plugin, and MCP alike — through that one tool runner, so
overriding it covers all of them without wrapping individual executors. A
`deny` comes back as an `AgentErrorEvent` carrying the original
`tool_call_id`, which the SDK renders as a `role="tool"` message; the agent
sees a tool result naming the violated rule and re-plans, and both UIs already
display it.

The engine itself is in `src/rotaris_core/permissions/`. It ships with the
permissive `ALLOW_ALL_POLICY`: the engine sits in front of every dispatch, but
nothing is gated until the follow-ups supply rules and presets. The seams they
plug into are `PermissionRule.matcher` (SWR-2502), `PermissionPolicy.preset_name`
/ `default_decision` (SWR-2503), `ApprovalResolver` (SWR-2504, currently the
fail-safe deny resolver that requirement prescribes), and `AuditSink`
(SWR-2506). Effective-mode downgrade for unsandboxed autonomous runs (SWR-2508)
belongs at the policy-construction site, `factory.py::_build_permission_engine`.

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
