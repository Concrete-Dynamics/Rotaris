---
req-id: SWR-3319
status: approved
trace: required
test: required
title: "The board says when it is analysing changes, and lets you stop"
type: technical
derived-from: SWR-3312
epic: SWR-3300
date: 2026-08-18
source: docs/plans/2026-08-17-requirements-refactors/01-evaluate-project-split.md
---

# SWR-3319 — The board says when it is analysing changes, and lets you stop

Every board refresh runs the propagation pass, and the pass contains two kinds
of work that a user experiences as nothing alike. The deterministic rules are
arithmetic over files: a card moves, and it is done before the click finishes.
The analyses — what a change costs (SWR-3503), the question a change raises
(SWR-3506), the migration a supersession needs (SWR-3507), what a removal leaves
behind (SWR-3509) — each wait on a language model, and on a store of any size
that is minutes.

The board has one word for both. `Evaluating requirements…` is what it says
while it reads three files, and it is also what it says while it waits on a
provider that may not answer — with no way to tell the two apart and no way to
stop the second. SWR-3312 asks for a board that follows the repository live and
"states when it last evaluated"; it does not follow that an unbounded wait may
hide inside that sentence.

SWR-3519 gave the engine the two things this needs: a pass states its depth, and
a pass can be stopped. This is the requirement that spends them.

Requirement: a refresh states what it is allowed to cost, and a refresh that may
consult a model is visible as itself and can be stopped.

- **Every refresh applies the deterministic rules.** A card that a rule moves
  moves, on every refresh, however cheap (SWR-3502). Cost is a choice about
  judgement, never about truth.
- **A refresh a user asks for consults no model.** The manual re-evaluation, the
  refresh after an accepted action, the refresh after a requirement is written
  and the first open of the view are all the cheap kind, and their controls say
  so in words that match what they do.
- **A refresh that may consult a model says so while it does**, in its own
  sentence rather than as the ordinary loading state, and states that it may
  take minutes. It offers a stop.
- **Stopping lands a complete board.** The rules already applied stand, the
  projection still runs, and what is left unjudged is picked up by the next full
  pass (SWR-3519). A stop is the difference between waiting and not waiting —
  never between a board and no board.
- **A requirement waiting for a judgement is named, and can be judged on
  request.** A cheap refresh leaves work behind by design; left unnamed, that
  work is indistinguishable from a card with nothing to do.
- **Where the workspace has the analysis switched off** —
  `requirements.change.analyze_changes` (SWR-3117) — the board says *that*
  instead of offering an action that would change nothing. The answer comes from
  the pass itself (SWR-3519), never from the board inferring a configuration
  from a pattern of results: an analysis that *failed* leaves the same evidence
  behind, and reporting a broken provider as a settings choice would send a user
  to fix the wrong thing.
- The repository events of SWR-3210 remain the declared moments at which
  judgement happens automatically. What changes is that they are now legible and
  interruptible, not that they stop.

## Acceptance criteria

- No model is reachable from the manual re-evaluation, an accepted action's
  refresh, a written requirement's refresh, or the first open of the view.
- A pass that may consult a model renders as its own state, distinct from
  loading, and offers a stop control.
- Stopping leaves the applied transitions applied and still produces a board.
- Requirements awaiting a judgement are counted on the surface, and asking for
  one starts a full pass.
- A workspace with the analysis switched off is told so, and is offered no
  control that would do nothing.
- Every control this adds carries an accessible name and fits at 1000×680
  (SWR-3314).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Each trigger produces its own refresh kind; the analysing signal fires for that kind alone; a stop still lands a board | Controller + bridge | `apps/rotaris/tests/test_requirements_board.py` |
| Integration | A cheap refresh leaves a named worklist, and asking for a judgement clears it | Engine → bridge → state | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user re-evaluates without waiting on a provider, then asks for the analysis, watches it say so, and stops it | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Derived from: [SWR-3312 — The board follows the repository live](SWR-3312-board-follows-repository-events.md)

Derived requirements: [SWR-3320 — A running pass says what it is doing and how far it has got](SWR-3320-a-running-pass-reports-its-progress.md)

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
