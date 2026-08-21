# Requirements Area — Refactor Plans

**Date:** 2026-08-17 · **Source:** the architecture review at
[`docs/code-review/2026-08-17-requirements-area-architecture-review.md`](../../code-review/2026-08-17-requirements-area-architecture-review.md)
(§ 6, "Recommended refactors, prioritized")

Six sliced plans, one per recommended refactor. Each plan is self-contained:
problem with evidence, target design with alternatives, implementation waves
that each end green and mergeable, specification impact, test strategy, risks,
and acceptance criteria. A developer (or an agent) should be able to pick one
up cold and implement it without the review in hand.

## The plans

| # | Plan | Review item | Size | Risk | Depends on |
|---|------|-------------|------|------|------------|
| 01 | [Split evaluate from project on the board seam](01-evaluate-project-split.md) | F1 (High) | L | Medium | 03 (substrate) |
| 02 | [Harden the generated-parser admission check](02-parser-admission-hardening.md) | F3 (Medium) | S | Low | SWR-3123 merge |
| 03 | [Atomic snapshot for `WorkspaceBoard`](03-workspace-board-snapshot.md) | F2 (Medium) | S | Low | — |
| 04 | [Type the view contract; test the board vocabulary](04-view-contract-and-vocabulary.md) | F4 + F7 | S–M | Low | — |
| 05 | [Relocate `RequirementEditing`; creation preview as adapter capability](05-editing-service-relocation.md) | F5 | M | Low | — |
| 06 | [The board pass at scale](06-board-pass-at-scale.md) | F6 + SWR-3123 revision note | M–L | Medium | 01, 03 (waves 3–4); SWR-3123 merge (wave 2) |

**Numbering follows the review's priority order.** The recommended **merge
order** differs slightly, for mechanical reasons:

> **03 → 02 → 01 → 04 → 05 → 06**

- **03 first**: it is three files' worth of change, it removes the only real
  data race, and its snapshot tuple is the substrate plan 01 builds its
  evaluate/project split on. Doing 01 first would force 03's shape anyway.
- **02 second**: engine-only, self-contained, and it should land before the
  generated-parser path is offered to real foreign repositories.
- **01 third**: the largest plan; it touches the bridge, the engine's
  propagation entry point, and the board UI.
- **04 and 05 any time**: both are independent of everything else. 05 should
  land before SWR-3122 / SWR-3118 implementation starts, so the editor does not
  accrete more `store_path` probes.
- **06 last, and gated**: waves 1–2 are cheap and can land opportunistically;
  waves 3–4 are deliberately deferred until a measured store size demands them.

## Conventions these plans assume

Everything workflow-shaped lives in **AGENTS.md** and is not restated here —
worktrees, quality gates, what must be green before a merge. Read
[AGENTS.md § Workflow](../../../AGENTS.md) before starting any plan. Points the
plans repeatedly rely on:

- **One wave, one mergeable slice.** Every wave ends with the full test suite
  green (`-n auto` for full passes) and `reqtocode check` passing. Waves within
  a plan are ordered; plans are independent unless the table above says
  otherwise.
- **Requirements first.** Where a wave changes user-visible behaviour, it
  starts by drafting the specification (status `draft`), implements against it,
  and flips it to `approved` in the same slice. The plans never pin new SWR
  ids — parallel sessions renumber, so **allocate the next free id at
  implementation time** and write it into the plan file as you start.
- **Traces move with code.** `@traces(SWR.…)` markers are build-breaking; when
  a plan moves code between modules, the markers move verbatim with it. Note
  that touching an epic index file makes `reqtocode diff --strict` report
  drift for every id in the epic — `reqtocode check` is the gate that counts.
- **Line references** in these plans were verified against master `df886971`
  (2026-08-17). SWR-3123 references were taken pre-merge from the
  `feat/swr-3123-generated-parser-runtime` worktree; verify them against the
  merged tree before relying on exact numbers.
- The AST guard sweep in `apps/rotaris/tests/test_requirements_board.py`
  (no process launches, no verdict re-derivation under `apps/rotaris/src`)
  constrains every plan that touches the desktop side. It is a feature, not an
  obstacle: if a wave trips it, the wave is wrong.

## Status tracking

Each plan carries a **Status** line (`Proposed` → `In progress (wave N)` →
`Done`). Update it in the plan file itself as work proceeds, and record the
allocated SWR ids there. When a plan completes, its findings entry in the
review document does not need editing — the review describes 2026-08-17 and
stays a historical record.
