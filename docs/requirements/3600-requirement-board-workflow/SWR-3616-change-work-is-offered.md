---
req-id: SWR-3616
status: approved
trace: required
test: required
title: "The work a change asks for is offered, never started"
epic: SWR-3600
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-propagation.md
---

# SWR-3616 — The work a change asks for is offered, never started

Six rules in epic 3500 want to move a delivery state, and most of them run where
the board is read. SWR-3502 already moves a card there and is right to: comparing
two hashes costs nothing and the move is Rotaris giving up a claim. But an impact
analysis concluding `implementation and tests affected` asks for *agent runs*,
and a `no behavioural impact` outcome asks for a *suite run*. A board that acted
on either would spend a user's money because they opened a tab.

So the question "may this happen while somebody is only looking?" is answered
once, for every rule in the epic:

> **Taking a claim away is automatic. Granting one is offered.**

A pass may move a requirement *out of* `Done` and *into* `Blocked`: both are
Rotaris admitting it no longer knows something, and both cost a comparison. It
may never move one *into* `Done` or *into* `Ready`: both are claims, and both
cost either minutes of suite or money of model.

This is the fourth in the line SWR-3613, SWR-3614 and SWR-3615 established —
what Rotaris concludes is offered, and acceptance is what acts.

Requirement: where a change has been analysed, the board states what it would
cost and offers the work; nothing runs until a user accepts.

- The offer names the analyst's verdict and what accepting would create — the
  units by name, or that it would verify instead of implement, or that it would
  plan a split first. Never a bare invitation.
- Accepting is one action through the board's single write path, attributed to
  the person who took it (SWR-3610), and it is the only path that creates units
  or releases the requirement.
- An offer whose analysis no longer matches the requirement is **refused** with
  the reason stated, not carried out. A requirement edited between the read and
  the click would otherwise get units scoped to a version nobody has.
- A workspace that declared `requirements.scheduling.mode: automatic` has the
  offer accepted for it. That is the user's own declaration, it defaults to
  `manual`, and nothing changes for a project that did not ask.
- A clarification is not an offer: it is Rotaris giving up, so it blocks the
  requirement immediately and the user's act is the answer (SWR-3506).
- Rendering an offer, dismissing it or switching board axes writes nothing.

## Acceptance criteria

- A board read over a workspace with pending offers creates no unit and moves no
  requirement into `Ready` or `Done`.
- The offer states the verdict and names what accepting would create.
- Accepting creates exactly the units the analysis named and releases the
  requirement, attributed to the person who accepted.
- An offer accepted after the requirement changed again is refused, naming that
  the analysis no longer describes the requirement.
- With `scheduling.mode: automatic`, the same offer is accepted without a user
  action; with the default `manual`, it is not.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The offer's content, the stale refusal, the three outcome shapes, and that a read writes nothing | The offer and its acceptance | `tests/unit/requirements/test_change_offer.py` |
| Integration | A reworded requirement over a real store is analysed, offered, accepted, and the units it named are on disk | Pass + analysis, unit and delivery stores | `tests/integration/test_requirement_impact.py` |
| User-flow E2E | A user edits a delivered requirement, is told what it costs, accepts, and Rotaris starts exactly that work | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_change_offer.py` |

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
