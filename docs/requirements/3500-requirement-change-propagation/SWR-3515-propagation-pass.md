---
req-id: SWR-3515
status: approved
trace: required
test: required
title: "One evaluation runs every propagation rule, in one order, without the desktop"
type: technical
derived-from: SWR-3210
epic: SWR-3500
date: 2026-08-16
source: docs/plans/2026-08-16-requirements-propagation.md
---

# SWR-3515 — One evaluation runs every propagation rule, in one order, without the desktop

SWR-3210 says an evaluation re-runs on the events that can change a requirement,
debounced to one pass. It does not say what a pass *contains*, and this epic's
rules arrived one at a time: the specification comparison, the impact analysis
and the superseding worklist were each composed where they were first needed,
which was the desktop's board-read path. Four hundred lines of engine
composition ended up in a Qt package, and change propagation became something
only the desktop can do.

That is a defect in two directions. A headless caller — CI, a cron job, another
harness — cannot evaluate a workspace at all. And every rule this epic still owes
would be composed in the same place, each choosing its own transition writer,
until "what a board read does" is four hundred more lines nobody can run.

Requirement: one pass, in the engine, that runs every propagation rule over one
workspace in a stated order, and is reachable without a display.

- The pass is a function of a workspace and the reader's own inputs, and returns
  what it did — one sentence per requirement it moved, per analysis it ran and per
  worklist it planned. A caller renders them; the pass composes none.
- The **order is part of the requirement**, because the rules are not
  independent: the specification comparison runs before the analysis, because it
  is what tells the analysis which requirements diverge from what was delivered,
  and an unedited board therefore costs no model call (SWR-3519 states why the
  analysis reads that comparison's whole answer rather than only what it moved);
  evidence propagation runs before the relation rules, because a
  requirement knocked out of `Done` is not schedulable whatever else holds it.
- A delivery state moves through **one** writer, built once and shared by every
  rule in the pass — the guarded, gated writer of SWR-3403 and SWR-3215. A rule
  that composed its own would eventually be one that forgot the completion gate.
- The pass is callable in a process that imports neither the desktop package nor
  a Qt binding, and `rotaris-cli requirements evaluate` is the consumer that
  proves it — the same shape SWR-3416 licensed for runs and SWR-3221 for
  verification.
- A pass that finds nothing writes nothing: no transition, no audit line, no
  analysis record. That is what makes it safe to run on every evaluation rather
  than only when somebody remembers.
- A store that cannot be read is an error the caller sees, not a silence. A board
  that quietly stopped noticing edits is the one failure this pass exists to
  prevent.

## Acceptance criteria

- One call runs every rule the epic has wired, in the stated order, over one
  workspace. That is the pass at full depth, which is the default and what the
  headless entry point takes; a caller may ask for the deterministic rules alone,
  and SWR-3519 states what such a pass owes.
- Every delivery transition the pass causes goes through the single writer it
  built, and that writer carries the specification guard and the completion gate.
- The pass runs in an interpreter with no `rotaris` package and no Qt binding.
- An evaluation of a workspace nothing has changed writes no file and returns
  nothing to say.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | The step order, the shared writer, the quiet pass, and the report's shape | The propagation pass | `tests/unit/requirements/test_change_host.py` |
| Integration | A workspace with an edited requirement, a lost covering test and a supersession is evaluated once and each rule reports its own | Pass + delivery, audit and analysis stores | `tests/integration/test_requirement_change.py` |
| User-flow E2E | `N/A — mechanism; its product flows are SWR-3502's move and SWR-3616's offer` | — | — |

Derived requirements: [SWR-3519 — An evaluation states its depth, can be stopped, and strands no requirement](SWR-3519-evaluation-depth-and-catch-up.md)

Derived from: [SWR-3210 — Continuous requirement evaluation](../3200-requirement-delivery-state/SWR-3210-continuous-evaluation-triggers.md)

Epic: [Requirement Change Propagation](../3500-requirement-change-propagation.md)
