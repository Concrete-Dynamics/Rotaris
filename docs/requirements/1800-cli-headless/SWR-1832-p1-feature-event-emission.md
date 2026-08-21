---
req-id: SWR-1832
status: draft
trace: required
test: required
title: "Emission of the P1-feature events, and the terminal event on the bus"
epic: SWR-1800
priority: P1
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-1832 — Emission of the P1-feature events, and the terminal event on the bus

SWR-1831 defined event types for hooks, checkpoints, gate decisions, repair decisions and
approval requests. Nothing publishes them: a consumer that upgrades sees the types in the
schema and never a single instance on the wire. This requirement wires each one into the
subsystem that owns that moment.

- **Hook execution** — the hook runner publishes start and finish for every hook it
  executes, including one skipped because its workspace list is untrusted (SWR-2815).
- **Checkpoints** — creating a checkpoint and restoring one publish their events,
  including a refused restore, which carries the blocking reason.
- **Completion gate and repair** — the gate decision and each repair decision publish
  where the loop applies them, so a consumer sees *what the runner decided*, not only what
  the checks reported.
- **Approval requests** — a pending approval publishes when it is raised. Its
  `request_id` MUST match the `request_id` on the `permission.decision` event that later
  resolves it; without the pairing a consumer cannot tell which request a decision
  answers, and a run blocked forever on an approval is indistinguishable from a slow one.

## The terminal event must reach the bus

`run_host._emit_result_event` writes the terminal `result` event **directly to the sink
object**, after `discard_event_sink` has removed that sink from the registry. Every other
event goes through `events.bus.publish`. A consumer attached at the bus therefore observes
a run that never ends: it sees the whole run and then silence.

The stdout stream is unaffected — the CLI holds the sink object itself — which is why the
gap survived: the documented surface looks complete while the programmatic one is
truncated.

Requirement: `result` is published through the bus like every other event, before the sink
is discarded. If the direct write is retained for ordering (so the terminal line is
genuinely last on stdout), a consumer MUST NOT receive the event twice.

## Acceptance criteria

- A run that executes a hook, takes a checkpoint, gates a completion and raises an
  approval emits each corresponding event exactly once, in the order those things
  happened.
- An approval request and its resolution share a `request_id`.
- A consumer attached only to the bus receives the terminal `result` event, and receives
  it once.
- Emission never breaks a run: a sink that raises degrades to a logged warning, matching
  the existing bus contract.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each emission site publishes the right type with the right payload; a raising sink does not propagate | The individual emission seams | `tests/unit/test_event_observer.py`, per-subsystem unit tests |
| Integration | A scripted run exercising hooks, checkpoints, the gate and an approval yields all of them on one bus subscriber, request ids paired | Bus + subsystems together | `tests/integration/test_event_emission.py` |
| User-flow E2E | A headless `--output-format stream-json` run shows the new events in its stdout stream and ends with exactly one `result` line | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py` |

Epic: [CLI & Headless Mode](../1800-cli-headless.md)
