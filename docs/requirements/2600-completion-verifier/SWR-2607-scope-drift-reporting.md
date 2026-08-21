---
req-id: SWR-2607
status: draft
trace: required
test: required
title: "Scope-drift reporting for changes with no requirement"
epic: SWR-2600
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-2607 — Scope-drift reporting for changes with no requirement

The counterpart of SWR-2606. That requirement asks "did the requirements this change
touched get verified?"; this one asks the reverse — **did this change touch anything no
requirement asked for?**

Scope drift is the ordinary failure mode of an autonomous agent: asked to fix one thing, it
also refactors a neighbour, adds a helper, edits a config it happened to read. Each edit
may be reasonable in isolation; collectively they are work nobody requested, in a diff
nobody scoped, and they are invisible unless someone reads every changed file.

Requirement: after a code-modifying iteration, the runner reports production files the
iteration changed that carry no `@traces` reference to any requirement.

- The judgement reuses the reverse-enforcement rule ReqToCode already applies
  (SWR-2333 orphan code): a production file under an implementation root with no trace
  reference. Drift reporting must not invent a second, differently-behaving definition of
  "untraced" — one rule, one implementation.
- Files the orphan baseline excuses are **still reported as drift when this iteration
  changed them**. The baseline records pre-existing debt so the build can stay green; it
  is not a licence to keep editing untraced code unnoticed.
- Test files and non-implementation paths are excluded — a new test is accounted for by
  its `@verifies`, and drift is a statement about production code.
- The report names the files, not a count, and states the total so a large drift is
  visible at a glance.
- Runner-owned and stripped from LLM output, like SWR-2606's field.

Reporting only. A drifting change is not blocked; it is made visible. Whether drift should
gate is a policy question that needs the reporting data first.

## Acceptance criteria

- An iteration that changes a traced module and an untraced one reports exactly the
  untraced one.
- An iteration that changes only traced modules reports no drift — and reports it as
  "none", distinguishable from "not computed".
- A changed file that the orphan baseline excuses is still reported.
- Changed test files never appear as drift.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Traced vs untraced classification of a changed set; baselined file still reported; test paths excluded; empty vs not-computed distinction | The drift computation | `tests/unit/verifier/test_scope_drift.py` |
| Integration | A scripted iteration that edits an untraced helper alongside traced work reports the helper on its child report | Runner + report | `tests/integration/test_requirement_evidence.py` |
| User-flow E2E | Covered with SWR-2606: a user sees, on one report, which requirements the change served and what it touched that no requirement asked for | Public product boundary → user-observable result | `tests/integration/test_requirement_evidence.py` (shared with SWR-2606) |

Epic: [Deterministic Completion Verifier](../2600-completion-verifier.md)
