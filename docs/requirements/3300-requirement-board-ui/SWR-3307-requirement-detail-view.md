---
req-id: SWR-3307
status: approved
trace: required
test: required
title: "Requirement detail view"
epic: SWR-3300
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3307 — Requirement detail view

The card is a summary; everything else about a requirement needs one place that
holds it, or the information ends up scattered across dialogs.

Requirement: activating a card opens a detail view with five sections —
**Requirement** (id, title, description, source, source path, current hash,
lifecycle, delivery state), **Relations** (parent epic, children, derived,
supersedes, superseded by, dependencies), **Execution** (execution units, active
and past runs, worktrees, branches, commits), **Traceability** (implementation
sites, test sites, missing evidence, stale evidence) and **Verification** (test
results, build results, ReqToCode result, last successful verification). Every
related requirement navigates to its own detail view.

## Acceptance criteria

- All five sections render for a fully populated requirement and degrade to
  stated empty states individually.
- Relations navigate; a dangling relation is shown as unresolved with its
  target id rather than being hidden.
- The description is rendered from the source, never from a Rotaris copy
  (SWR-3114).
- The view is fully keyboard operable and closes with Escape.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Section rendering and per-section empty states from crafted projections | Detail view | `apps/rotaris/tests/test_requirements_detail.py` |
| Integration | The detail view over a real projection shows the source path and hash the engine reports | Projection → detail view | `apps/rotaris/tests/test_requirements_board.py` |
| User-flow E2E | A user opens a requirement and reaches its epic, its implementation and its last run from one place | Public product boundary → user-observable result | `apps/rotaris/tests/test_requirements_board.py` |

Epic: [Requirement Board UI](../3300-requirement-board-ui.md)
