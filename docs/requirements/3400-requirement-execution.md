---
req-id: SWR-3400
status: approved
trace: optional
test: optional
title: "Requirement Execution"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3400 — Requirement Execution

Turning a released requirement into implemented, verified, integrated code:
execution units and their dependency graph, the snapshot every run works
against, decomposition, one worktree and branch per unit, parallel execution,
the structured context the agent receives, the contract it must satisfy to
report complete, verification inside the unit's own workspace, integration of
several units, scheduling, and the execution history all of that leaves behind.

This epic is the engine side of the board. It reuses what already exists —
`GitWorktreeService` (SWR-2401), parallel session runs (SWR-2415), the
completion verifier (SWR-2602, SWR-2604) and agent-assisted worktree integration
— rather than building a second run machinery beside them.

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§2.2, §12–§19, §42–§43, §50.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3401](3400-requirement-execution/SWR-3401-execution-units.md) | Execution units are work artefacts, not requirements | approved |
| [SWR-3402](3400-requirement-execution/SWR-3402-requirement-snapshot.md) | Every run works against a requirement snapshot | approved |
| [SWR-3403](3400-requirement-execution/SWR-3403-specification-changed-during-execution.md) | A specification that changes during execution blocks automatic Done | approved |
| [SWR-3404](3400-requirement-execution/SWR-3404-requirement-decomposition.md) | Automatic requirement decomposition | approved |
| [SWR-3405](3400-requirement-execution/SWR-3405-worktree-per-execution-unit.md) | Each execution unit runs in its own worktree | approved |
| [SWR-3406](3400-requirement-execution/SWR-3406-parallel-unit-execution.md) | Independent units run in parallel | approved |
| [SWR-3407](3400-requirement-execution/SWR-3407-structured-agent-context.md) | Requirement agents receive a structured context | approved |
| [SWR-3408](3400-requirement-execution/SWR-3408-agent-completion-contract.md) | Agent completion contract | approved |
| [SWR-3409](3400-requirement-execution/SWR-3409-multi-unit-integration.md) | Multi-unit results are integrated before they reach the base | approved |
| [SWR-3410](3400-requirement-execution/SWR-3410-verification-inside-the-unit-run.md) | Requirement verification runs inside the unit's workspace | approved |
| [SWR-3411](3400-requirement-execution/SWR-3411-derived-technical-requirements.md) | Execution can derive technical requirements | approved |
| [SWR-3412](3400-requirement-execution/SWR-3412-delivery-queue-scheduling.md) | Requirement scheduling | approved |
| [SWR-3413](3400-requirement-execution/SWR-3413-ready-starts-the-flow.md) | Ready starts the agentic requirement flow | approved |
| [SWR-3414](3400-requirement-execution/SWR-3414-execution-history.md) | Execution history per requirement | approved |
| [SWR-3415](3400-requirement-execution/SWR-3415-unit-failure-and-retry.md) | Failed units are recoverable, never silent | approved |
| [SWR-3416](3400-requirement-execution/SWR-3416-headless-requirement-run-seam.md) | Requirement runs are launchable without the desktop | approved |
| [SWR-3417](3400-requirement-execution/SWR-3417-one-identity-per-delivery-cycle.md) | One identity per delivery cycle | approved |
| [SWR-3418](3400-requirement-execution/SWR-3418-worktree-path-limit-in-rotaris-words.md) | The Windows path limit is stated in Rotaris' words | approved |
| [SWR-3419](3400-requirement-execution/SWR-3419-requirement-target-branch.md) | The requirement's target branch is the user's to set | approved |
| [SWR-3420](3400-requirement-execution/SWR-3420-single-unit-landing.md) | A verified single unit lands too | approved |
| [SWR-3421](3400-requirement-execution/SWR-3421-one-check-suite-composition.md) | One composition decides what counts as verified (technical, from SWR-3410) | approved |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 4 of
  six; runs in parallel with epic [SWR-3300](3300-requirement-board-ui.md),
  which owns the desktop side and shares no file with it. Delivery plan and
  slice ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
