---
req-id: SWR-3421
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3410
title: "One composition decides what counts as verified"
epic: SWR-3400
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-landing.md
---

# SWR-3421 — One composition decides what counts as verified

SWR-3410 says a unit is verified by running the workspace's own check suite in
the unit's worktree, and deliberately takes the runner as an injected callable
so the decision logic stays testable without a subprocess. What it does not say
is who builds that callable — and by the time SWR-3409's integrator needed one,
the same four steps (`resolve_check_suite` → `run_check_suite` →
`SuiteRun.from_verifier_run`, with the not-run reason for a workspace that
declares nothing) had been written out identically in the headless host and in
the desktop host, differing only in where the configuration came from.

Two copies of "what counts as verified" is two chances for them to stop
agreeing, and the thing they decide is precisely the thing a verdict exists to
settle. A third copy for the integrator would have made it three.

Derived from: [SWR-3410](SWR-3410-verification-inside-the-unit-run.md)

Requirement: one builder produces the `WorkspaceChecks` callable, and every
consumer calls it rather than repeating it.

- The builder lives beside the other composition roots
  (`execution/cli_host.py`, with `decomposition_for`), not inside
  `execution/verification.py` — that module states its own purity, and a
  subprocess launcher inside it would end that.
- A workspace that declares no check suite yields a not-run result with the
  reason stated, never a vacuous pass.
- Callers may state *why* the suite is running — a committed run, a merged
  integration — without re-deriving the pipeline to say so.

## Acceptance criteria

- The headless run host, the desktop run host and the integrator obtain their
  check suite from the one builder.
- A workspace with no configured checks yields `SuiteRun.not_run` with the
  stated reason from every one of them.
- The change signal records the caller's reason, so a run's checks and an
  integration's checks are distinguishable in the verifier's log.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The builder's not-run answer, and that its result is the injected `WorkspaceChecks` shape | The builder | `tests/unit/requirements/test_cli_host.py` |
| Integration | A run and an integration over the same fixture workspace resolve the same suite | Composition + the completion verifier | `tests/integration/test_requirement_integration.py` |
| User-flow E2E | N/A — a technical requirement; its product flow is SWR-3410's and SWR-3409's | — | — |

Epic: [Requirement Execution](../3400-requirement-execution.md)
