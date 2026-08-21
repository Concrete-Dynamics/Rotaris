---
req-id: SWR-2613
status: approved
trace: required
test: required
title: "Calibration probe before a check binds"
epic: SWR-2600
priority: P0
date: 2026-08-12
---

# SWR-2613 — Calibration probe before a check binds

A check MUST NOT become part of the gate on filesystem inference alone. Before a
detected or authored check binds, it MUST be probed against the workspace, so
the gate is a statement about commands that actually run here rather than about
markers that happen to exist.

- A **probe** is the cheapest invocation that proves the command resolves on
  this host and finds work to do — `pytest --collect-only -q`,
  `npm run <script> --dry-run`, `make -n <target>`, `cargo test --no-run`, a
  tool's `--version` where no dry form exists. A probe MUST NOT run the real
  suite.
- Probes execute through `HardenedTerminalExecutor`, so the SWR-2501 permission
  policy and SWR-2507 sandboxing apply unchanged: a denied probe is never read
  as a pass, and it is never read as a demotion either — it yields `undecidable`
  carrying the violated rule, so the check binds at its detected severity. What
  a policy forbids is the *probe*, which says nothing about the check, and a
  policy able to quietly turn a blocking check advisory would be a way to weaken
  a gate without anybody deciding to. A probe that fails for reasons of its own —
  a collection error, an output nobody can interpret — is `undecidable` for the
  same reason. Each probe carries a short
  timeout (default 30s), independent of `verifier.suite_timeout`, which governs
  real suite runs only.
- A probe yields one of four verdicts:
  - `verified` — the command resolves and reports work to do.
  - `empty` — the command resolves but finds nothing. Produced **only for a
    `test` role**, and only on a positively recognised zero-collection signal:
    "zero tests collected" is a checkable statement about a test runner, and
    there is no equivalent for a type checker or a linter, whose work is the
    tree itself. An output shape the prober does not recognise stays `verified`,
    because demoting on a guess is the one direction that silently weakens a
    gate.
  - `unavailable` — the command or its tool does not resolve here.
  - `undecidable` — no cheap probe form is known for this command.
- Binding follows the verdict: `verified` binds at its detected severity;
  `undecidable` binds at its detected severity, because refusing to gate on a
  command we merely cannot cheaply pre-check would weaken the gate for the
  common custom-script case; `empty` binds as `advisory` with the reason
  recorded, so a suite that collects nothing can never report as passing
  verification; `unavailable` does not bind at all and is reported as a
  detection outcome.
- An `empty` check is promoted back to its detected severity by a later probe
  that finds work — the demotion is a fact about the workspace at a fingerprint,
  not a permanent judgement. That works because the *detected* severity is
  recorded beside the verdict and survives the demotion.
- `unavailable` is the same predicate SWR-2620's fallback already rests on:
  "did this command run at all". One definition, two consumers.
- Taking new verdicts executes commands, so it is the caller that owns the
  gate's lifecycle which pays for it — the loop, once per fingerprint. Every
  other caller applies the recorded verdicts, which costs a file read.
- Probe results are cached in the SWR-2612 state file, keyed by fingerprint and
  command. A `calibrated` state MUST NOT re-probe: probing happens on first
  binding, on a fingerprint change, and when a check's command changes.
- Probing MUST NOT block a run. If the probe pass itself fails or exceeds its
  budget, the previously bound suite stays bound, the state becomes `stale`, and
  the failure is emitted as a timeline event — an unprobeable workspace keeps
  the gate it had.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each verdict maps to its binding rule; an `empty` test check binds advisory and is promoted on a later `verified` probe; an `unavailable` check never binds | Calibration API | `tests/unit/verifier/test_gate_calibration.py` |
| Unit | Probe commands are the cheap forms, carry the probe timeout, and a denied probe is `skipped` rather than passed | Calibration → terminal executor seam | `tests/unit/verifier/test_gate_calibration.py`, `tests/unit/test_verifier_runner.py` |
| Integration | A workspace is probed once and the cached verdicts are reused across sessions until the fingerprint moves; a failing probe pass leaves the bound suite intact and marks the state `stale` | Calibration → state file → session | `tests/integration/test_verifier_gate_lifecycle.py` |
| User-flow E2E | A workspace whose detected test command does not exist on the host does not bind that check, and the user sees why | Public product boundary → user-observable result | `tests/integration/test_verifier_gate_lifecycle.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
