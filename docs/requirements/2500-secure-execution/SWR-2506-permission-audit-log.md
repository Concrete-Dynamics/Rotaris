---
req-id: SWR-2506
status: approved
trace: required
test: required
title: "Permission decision audit log"
epic: SWR-2500
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2506 — Permission decision audit log

Every policy decision (SWR-2501) and approval resolution (SWR-2504) MUST be
recorded in a per-session, append-only audit log.

- Entry fields: timestamp, persona/child id, tool name, decision
  (`allow`/`ask`/`deny`), matched rule or preset, resolution source
  (rule/user-once/user-session/headless-policy), and redacted call summary.
- The log lives under the session directory
  (`<workspace>/.rotaris/sessions/<session_id>/`), is written atomically in
  line with existing persistence guarantees, and never contains secret values
  (structural redaction, consistent with the `SecretStr` policy).
- Audit entries are exposed as events on the headless event stream (SWR-1828)
  and inspectable in the session diagnostics.

The log lives at `<session_id>/evidence/permissions.jsonl`, beside the other
evidence files. Every decision is recorded, `allow` included, capped by the same
ring buffer the tool-call log uses. Each `deny` is additionally raised as a
`permission_denied` issue pointing at the log, and each human approval as a
`permission_approved` timeline event; the run metrics count both. The headless
event-stream clause waits on SWR-1828, which is still `draft`.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Entry serialization, redaction, append-only ordering | Audit log writer | `tests/unit/test_permission_audit.py`, `tests/unit/test_permission_engine.py::test_each_decision_carries_the_source_that_produced_it`, `::test_a_session_approval_is_distinguishable_from_a_policy_rule`, `::test_an_unresolvable_policy_is_audited_as_fail_closed` |
| Integration | Allow/deny/approval decisions during a run appear in the session's audit file | Policy engine → session persistence | `tests/integration/test_permission_audit_log.py`, `tests/integration/test_permission_approval.py::test_the_audit_trail_tells_apart_who_decided_an_ask`, `::test_a_headless_deny_is_audited_as_the_policy_that_produced_it` |
| User-flow E2E | After a run with one denied call, the audit log lists the denial with its matched rule | Public product boundary → user-observable result | `tests/integration/test_permission_denial_e2e.py::test_a_denied_call_is_recoverable_from_the_session_audit_log` |

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
