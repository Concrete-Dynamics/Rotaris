---
req-id: SWR-2623
status: approved
trace: required
test: required
title: "An adapter is authored for a runner Rotaris has never seen"
epic: SWR-2600
priority: P1
date: 2026-08-20
---

# SWR-2623 — An adapter is authored for a runner Rotaris has never seen

SWR-2622 reads the report formats runners already emit. Two gaps remain, and both
are the same gap:

- most runners *can* emit a machine-readable report and do not by default, so the
  artefact SWR-2622 looks for is simply not there;
- a project's declared command (SWR-2620) frequently wraps its runner — `make
  test`, `just check`, a shell script — and no flag can be injected into it from
  outside, because the flag would go to the wrapper.

We cannot enumerate how projects run their tests. SWR-3121 already settled the
same argument for the sibling port, in its own words: *"We cannot enumerate how
projects organise requirements, and a heuristic per layout is a losing race."*
Reading an unfamiliar runner and saying how to get results out of it is a
judgement, and judgement is what an analyst seam is for.

Requirement: where no built-in reader finds a report, Rotaris **proposes** how to
obtain one — deterministically first, and by asking an agent only where
determinism produced nothing adoptable — and the proposal is bound only after it
has been run and checked.

This mirrors SWR-3106 / SWR-3121 deliberately, down to the vocabulary. It is the
same pattern applied to a second port, not a second pattern.

- **The escalation ladder.** A deterministic analyst goes first and costs
  nothing: it tries a small table of known report-emitting arguments for the
  runner it recognises. An agent is consulted **only** when that produced nothing
  adoptable, and never for a check that produced no output at all — there is
  nothing there to read, and a model could only invent an answer.
- **A proposal is data the user accepts.** Discovery writes nothing. Persisting
  is a separate, explicit step.
- **A proposal is validated by running it.** The proposed configuration is
  executed once and must:
  1. produce an artefact that parses into at least one case;
  2. resolve every reported file to a real repository path;
  3. **agree with the check's own exit status** — a passing check must yield no
     failures, a failing check at least one. This is what makes a fabricated
     adapter structurally unbindable rather than merely discouraged;
  4. account for the selection it was given, or be marked incomplete and
     restricted to narrowing (SWR-2622).
- **Declarative before programmatic.** A proposal that can be expressed as
  configuration — a report format, the argument that produces it, where it lands
  — must be. A programmatic adapter (a workspace-local command reading the raw
  output and emitting port JSON) is rejected by its own validator unless it
  carries the stated reason that configuration cannot express this runner, the
  same rule SWR-3106 applies to a programmatic requirement source.
- **Once bound, no analysis runs.** The adapter is configuration from then on and
  the model never sits in the evidence path: it is asked once per workspace per
  runner change, produces a parser, and that parser runs deterministically.
- An adapter can only ever say which tests a run observed. It cannot overrule the
  suite's verdict (SWR-2604), and SWR-2622's invariants hold whatever produced
  the report.

## Acceptance criteria

- A runner with a known report flag is handled deterministically, with no model
  consulted.
- An agent is not asked about a check that produced no output.
- A proposal whose artefact does not parse is rejected, naming why.
- A proposal reporting no failures for a *failing* check is rejected, and one
  reporting failures for a *passing* check is rejected.
- A programmatic proposal with no stated reason that configuration cannot express
  the runner is rejected without being run.
- A bound adapter is used on subsequent runs without any analysis.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The ladder: deterministic candidate accepted without a model; the model consulted only when it produced nothing; never consulted for an empty check | Adapter discovery API | `tests/unit/verifier/test_report_adapters.py` |
| Unit | Validation rejects an unparseable artefact, a disagreement with the check's exit status, and an unjustified programmatic proposal | Proposal validation | `tests/unit/verifier/test_report_adapters.py` |
| Unit | A scripted analyst's answer re-enters the ordinary path and binds only after validating — no model runs | Analyst seam | `tests/unit/verifier/test_report_adapters.py` |
| Integration | A workspace whose runner emits nothing gains per-test truth after an adapter binds, and keeps it without re-analysing | Discovery → config → runner → evidence | `tests/integration/test_requirement_evidence.py` |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
