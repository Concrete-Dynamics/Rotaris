---
req-id: SWR-3516
status: approved
trace: required
test: required
title: "An open decision is an artefact, and it survives a restart"
type: technical
derived-from: SWR-3512
epic: SWR-3500
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-propagation.md
---

# SWR-3516 — An open decision is an artefact, and it survives a restart

SWR-3512 asks that a decision with product meaning reach the user with its
options and their consequences named, and that the decision and its actor be
recorded. `HumanDecisions` does both: it moves the requirement to `Blocked`
through the transition function and appends an audit event.

The audit trail is *history*. It records that somebody was asked; it is not a
place to answer from. Nothing in it carries the option list, and reconstructing
one from a reason sentence would be a board inventing the choices — the exact
failure SWR-3512's "the options and their consequences are named" exists to
prevent. So a board reopened after a restart finds a blocked requirement with
nothing to choose from, which is the state SWR-3607 abolishes and SWR-3611 says
must not survive a restart.

`DecisionLog` was written for this and is a value: nothing persists it.

Requirement: the question a requirement waits on is stored, and so is every
answer it has already had.

- One artefact per requirement, holding the open `PendingDecision` and the log of
  answers. Both, because they are one thread: the log alone cannot say what is
  still open, and the open question alone cannot say what was decided the last
  time the same trigger fired.
- Answering closes the open question and appends the answer in one write. A
  stored question that outlived its answer would offer an option list for
  something already decided.
- Asking again keeps the previous log. A requirement asked a second question
  still carries the record of the first answer, which is what makes "we decided
  the opposite in March" readable (SWR-3213).
- Reading never raises. An artefact this build cannot read costs that
  requirement's answer path and nothing else, and is reported as a named
  degradation rather than as an exception on a board read (SWR-3205's rule).
- An artefact holding neither an open question nor a log is unreadable rather
  than empty: something was written there, and reading it as "nothing was ever
  asked" would silently drop a question somebody is waiting on.

## Acceptance criteria

- A raised decision is readable after a restart with its question, its options
  and each option's consequence intact.
- Answering clears the open question and appends the answer; asking again keeps
  the log.
- A corrupt or future-version artefact yields no open decision and a named
  notice, and no other requirement is affected.
- A requirement nobody was asked about has no file.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Round-trip, the answer that closes it, the second question, and the degradations | The decision store | `tests/unit/requirements/test_decision_store.py` |
| Integration | A contradictory change blocks a requirement, and the question is answerable in a fresh process | Analysis + decision store + delivery store | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | `N/A — mechanism; its product flow is SWR-3506's question and SWR-3607's answer path` | — | — |

Derived from: [SWR-3512 — Decisions with product meaning reach the user](SWR-3512-human-in-the-loop.md)

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
