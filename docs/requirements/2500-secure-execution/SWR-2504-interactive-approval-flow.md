---
req-id: SWR-2504
status: approved
trace: required
test: required
title: "Interactive approval flow (Rotaris primary)"
epic: SWR-2500
priority: P0
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2504 — Interactive approval flow (Rotaris primary)

An `ask` decision (SWR-2501) MUST surface as an interactive approval request in
the active host and suspend only the affected tool call until resolved.

- **Rotaris (primary interface)** presents a modal/inline prompt showing: tool
  name, full command or arguments (secrets redacted), matched rule, and the
  persona requesting it. Options: approve once, approve for the session (adds
  a session-scoped allow rule), deny. The existing confirmation-modal pattern
  (`MessageLimitConfirmScreen`, SWR-912) is the interaction precedent.
- Other children continue running while one approval is pending; the pending
  request is visible in the session/agent monitor.
- Headless mode (SWR-1800) never blocks indefinitely: `ask` resolves per
  configured headless policy — `deny` (default) or fail-fast run abort — and
  the resolution is recorded in the audit log (SWR-2506) and the event stream
  (SWR-1828).
- **TUI (secondary interface, deferred):** an equivalent TUI approval prompt
  is a follow-up, not part of this requirement's acceptance. Until it ships,
  an `ask` decision in a TUI-hosted session resolves fail-safe via the
  headless policy (default `deny`) with a visible notification — it never
  silently allows and never hangs the session.
- Approval responses MUST come from the host UI; nothing in agent or tool
  output can satisfy an approval.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Approval request payload construction; session-scoped allow rule creation; headless/TUI fallback resolution policy | Approval controller API | `tests/unit/test_approval_barrier.py`, `tests/unit/test_approval_resolver.py`, `tests/unit/test_permission_engine.py` |
| Integration | Pending approval suspends only the requesting call; other children progress | Scheduler + policy engine | `tests/integration/test_permission_approval.py` |
| User-flow E2E | An `ask`-mode Rotaris session pauses on a mutating command, user approves once, run completes | Public product boundary → user-observable result | `apps/rotaris/tests/test_approval_flow.py` |

## Implementation notes

The blocking handshake is `ApprovalBarrier`
(`src/rotaris_core/permissions/approval.py`), keyed by request id so several agents
can wait independently — the shape `UserPromptBarrier` (SWR-2423) already proved
for `ask_questions`.

Hosts bind **late**: the engine is built per agent in three spawn paths, some of
them before a host finished wiring its callbacks, so `BrokeredApprovalResolver`
looks the `ApprovalHost` up from a session-keyed registry at resolve time
instead of taking it through `runtime_kwargs`. A session with no registered
host — TUI, headless CLI — takes the fail-safe path unchanged.

`approve for session` returns `PermissionDecision.session_scoped`; the engine
turns it into a narrow allow rule (`PermissionEngine.add_session_rule`) pinning
the tool plus the exact command line, or the exact arguments for tools that have
none. Session rules live beside the policy, so a mid-session mode change
(SWR-2503) neither drops nor widens them.

The audit-log and event-stream records this requirement mentions are deferred to
SWR-2506 and SWR-1828; until they exist, each request and its resolution is
visible in the transcript and in the session snapshot (`pending_approvals`).

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
