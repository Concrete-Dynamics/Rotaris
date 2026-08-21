---
req-id: SWR-1831
status: draft
trace: required
test: required
title: "Event coverage for hooks, checkpoints, gate decisions and approval requests"
epic: SWR-1800
priority: P1
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-1831 — Event coverage for hooks, checkpoints, gate decisions and approval requests

The event schema (SWR-1829) was specified before the P1 market-readiness features
existed. Four capabilities that shipped afterwards emit diagnostics-timeline entries but
are **invisible on the wire**: an SDK or CI consumer watching a headless run cannot see
that a hook ran, that a checkpoint was taken or rolled back, that the completion gate
overruled the model's "done", or that the run is blocked waiting for a human approval.

The last one is the sharpest: `permission.decision` reports a decision *after* it was
resolved, so an automated consumer cannot distinguish "still running" from "stalled at an
approval prompt nobody will answer".

The stream MUST additionally cover:

- **Hook execution** (SWR-2701–2704) — start and finish of each configured hook: the
  lifecycle point, the hook's configured name, its scope (`global`/`workspace`), exit
  code, duration, and whether the exit code blocked the action. A hook skipped because
  its workspace list is untrusted (SWR-2815) is reported as skipped with that reason;
  hook output is redacted with the same redactor the schema already applies elsewhere.
- **Checkpoints** (SWR-2436/2437) — a checkpoint created (session id, sequence, ref,
  kind, number of changed paths) and a checkpoint restored (sequence restored, the safety
  checkpoint taken first, number of paths changed, or the reason the restore was
  refused).
- **Completion gate and repair** (SWR-2604/2605) — the gate decision for an iteration
  (`gated`/`passed`/`exempt`, the overruled LLM verdict when it was overruled, the
  blocking checks that failed) and each repair decision (attempt number, remaining
  budget, `retry` or `escalate`). `verifier.result` reports what the checks did; these
  report what the runner *decided because of it*, which is the part a consumer gates on.
- **Approval requests** (SWR-2504) — a pending approval was raised (tool, redacted
  summary, the resolver in effect) and, when it was decided without a human being asked
  at all, why. The matching resolution keeps being reported by the existing
  `permission.decision` event.
  - The event MUST identify **which agent is blocked**: the agent's canonical name and
    its persona, taken from the binding of the permission engine that raised the request.
    Rotaris runs a delegation DAG with a fan-out of up to eight, so "a terminal command is
    waiting" without "waiting for whom" cannot be routed to the work it belongs to — and
    routing it is the entire reason a machine-readable pending-approval event exists.
    Both fields are optional in the schema, because a request raised outside a delegation
    (the root run's own engine) genuinely has no child identity to report; a producer that
    *has* the identity MUST fill it in rather than leave it blank.
  - The "decided without a human" reason covers the headless policy only. It is not a
    timeout: the event is raised **before** the wait begins, so a request that later times
    out is reported as raised and then resolved through `permission.decision`. An earlier
    draft of this requirement listed `timeout` as a reason; that value was unreachable by
    construction and is removed rather than left as a field no producer can set.

Scope boundary: this requirement adds **event types and their payloads only**. Wiring
each emission into the subsystems that own those moments is separate work; a type that
nothing emits yet is a valid intermediate state and must not break any consumer.

## Acceptance criteria

- Every new type carries the SWR-1829 envelope (`schema_version`, `event`, `timestamp`,
  `session_id`), appears in the discriminated union, and round-trips through
  `parse_event`.
- Adding these types does not change `EVENT_SCHEMA_VERSION`: they are additive within
  version 1, and a consumer pinned to the current version keeps parsing the events it
  already knows.
- No hook output, command line or approval summary reaches a serialized event unredacted;
  redaction is enforced by validators, not by callers remembering to call the redactor.
- The event-type set assertion in `tests/unit/test_event_schema.py` names the new types
  explicitly — the set stays exhaustive, so a future type cannot be added unnoticed.
- When a delegated child blocks on an approval, the emitted event names that child's agent
  and persona — proven by a test that raises a request from a child engine and reads the
  identity back off the serialized line, not off the model in memory.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each new type validates, stamps the envelope, redacts its sensitive field, and round-trips through one JSONL line | Event model definitions | `tests/unit/test_event_schema.py` |
| Integration | A stream carrying the new types is consumed without the producer's models being re-imported | Serialization + `parse_event` | `tests/integration/test_event_emission.py` |
| User-flow E2E | Covered by the SWR-1828 flow: a headless `--output-format stream-json` run stays parseable line-by-line with the extended union in place | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py` (shared with SWR-1828/1829) |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)
