---
req-id: SWR-3408
status: approved
trace: required
test: required
title: "Agent completion contract"
epic: SWR-3400
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3408 — Agent completion contract

An agent that writes code has not delivered a requirement. Without an explicit
contract, "done" degrades to "the model stopped", which is exactly the failure
the completion verifier exists to prevent (SWR-2604) — and requirement work adds
obligations the generic gate does not know about.

Requirement: an execution unit is reported complete only against a structured
result stating that the intended change is implemented, the relevant tests are
updated, the tests were executed, the requirement's traceability is established,
ReqToCode is up to date, the worktree is clean, the change is attributable, and
no requirement drift is known. The result is runner-owned: the fields that
assert execution and verification are written by Rotaris, not by the model, and
a summarising agent cannot author them.

One consequence is worth naming, because the model cannot report it and therefore
nothing else can: an agent whose tool calls were refused by the permission policy
has no way to know that this is unusual, and summarises the nothing it was allowed
to do as a finished job. The runner reads the session's own permission trail and
answers for it.

## Acceptance criteria

- A unit whose tests did not run cannot report complete.
- A dirty worktree cannot report complete.
- Model-authored values in runner-owned fields are stripped, and the stripping
  is asserted.
- A run whose tool calls were denied by the permission policy and which produced
  no commits is reported failed, naming the tools that were refused — never
  succeeded. A run that was denied something and committed anyway still stands.
- An incomplete result names each unmet condition.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each condition blocks completion and is named; runner-owned fields survive a hostile model payload | The completion contract | `tests/unit/requirements/test_completion_contract.py` |
| Unit | A run whose tools were denied and which committed nothing is reported failed with the tools named; one that committed anyway still succeeds | The run host's report | `tests/unit/requirements/test_cli_host.py::test_an_agent_denied_its_tools_and_committing_nothing_is_not_a_success`, `::test_an_agent_that_was_denied_something_and_committed_anyway_still_succeeds` |
| Integration | A scripted unit run that skips its tests reports incomplete with the unmet condition named | Runner + contract | `tests/integration/test_requirement_execution.py` |
| User-flow E2E | A user whose agent wrote code but ran no tests sees the unit reported incomplete, not done | Public product boundary → user-observable result | `tests/integration/test_requirement_execution.py` |

Epic: [Requirement Execution](../3400-requirement-execution.md)
