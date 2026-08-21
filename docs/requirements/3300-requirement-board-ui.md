---
req-id: SWR-3300
status: approved
trace: optional
test: optional
title: "Requirement Board UI"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3300 — Requirement Board UI

The Requirements area of the Rotaris desktop app: a seventh primary view holding
a Kanban board over the delivery states, requirement cards with a traceability
ring, an evidence view, a requirement detail view with relations, execution,
traceability, verification and history, epic cards, filtering, and a graph
presentation of requirement-to-code-to-test.

This epic is presentation only. It reads the board projection (SWR-3216) and
renders it; it computes no health of its own and parses no command output
(SWR-3311). The workflow actions that write back — drag-and-drop, review,
editing, scheduling — are epic [SWR-3600](3600-requirement-board-workflow.md).

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§20, §22–§23, §28–§29, §31–§32, §36–§37, §48–§49.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3301](3300-requirement-board-ui/SWR-3301-requirements-navigation-entry.md) | Requirements is a primary view | approved |
| [SWR-3302](3300-requirement-board-ui/SWR-3302-kanban-board.md) | Kanban board over delivery states | approved |
| [SWR-3303](3300-requirement-board-ui/SWR-3303-blocked-presentation.md) | Blocked requirements are unmissable | approved |
| [SWR-3304](3300-requirement-board-ui/SWR-3304-requirement-card.md) | Requirement card | approved |
| [SWR-3305](3300-requirement-board-ui/SWR-3305-traceability-ring.md) | Traceability ring on the card | approved |
| [SWR-3306](3300-requirement-board-ui/SWR-3306-evidence-detail-view.md) | Evidence details open from the ring | approved |
| [SWR-3307](3300-requirement-board-ui/SWR-3307-requirement-detail-view.md) | Requirement detail view | approved |
| [SWR-3308](3300-requirement-board-ui/SWR-3308-epic-cards.md) | Epics on the board | approved |
| [SWR-3309](3300-requirement-board-ui/SWR-3309-board-sorting-and-filtering.md) | Board sorting and filtering | approved |
| [SWR-3310](3300-requirement-board-ui/SWR-3310-traceability-graph-view.md) | Requirement-to-code-to-test graph | approved |
| [SWR-3311](3300-requirement-board-ui/SWR-3311-board-consumes-structured-data.md) | The board consumes structured data, never command output | approved |
| [SWR-3312](3300-requirement-board-ui/SWR-3312-board-follows-repository-events.md) | The board follows the repository live | approved |
| [SWR-3313](3300-requirement-board-ui/SWR-3313-revision-history-panel.md) | Revision history panel | approved |
| [SWR-3314](3300-requirement-board-ui/SWR-3314-board-accessibility.md) | The board is fully operable without a mouse | approved |
| [SWR-3315](3300-requirement-board-ui/SWR-3315-requirements-ui-seam.md) | Requirements UI service seam | approved |
| [SWR-3316](3300-requirement-board-ui/SWR-3316-requirements-area-composition.md) | The requirements area composes its own surfaces | approved |
| [SWR-3317](3300-requirement-board-ui/SWR-3317-board-scales-to-a-large-store.md) | The board scales to a repository-sized requirement store | approved |
| [SWR-3318](3300-requirement-board-ui/SWR-3318-board-grouping-axis.md) | The board groups by a chosen axis | approved |
| [SWR-3319](3300-requirement-board-ui/SWR-3319-analysing-changes-is-visible-and-stoppable.md) | The board says when it is analysing changes, and lets you stop | approved |
| [SWR-3320](3300-requirement-board-ui/SWR-3320-a-running-pass-reports-its-progress.md) | A running pass says what it is doing and how far it has got | approved |
| [SWR-3321](3300-requirement-board-ui/SWR-3321-collapsible-columns.md) | Columns fold to a rail, and stay how the user left them | approved |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 3 of
  six; runs in parallel with epic [SWR-3400](3400-requirement-execution.md),
  which owns the engine side and shares no file with it. Adding a seventh
  primary view amends `apps/rotaris/AGENTS.md` § Product scope and the
  accessibility sweep, both owned by this slice. Delivery plan and slice
  ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
- 2026-08-19 — Adoption and verification passes gained a progress surface
  ([SWR-3320](3300-requirement-board-ui/SWR-3320-a-running-pass-reports-its-progress.md)),
  spending the engine seam authored as
  [SWR-3620](3600-requirement-board-workflow.md). The board deliberately states a
  phase and a per-phase position rather than one percentage: the check suite
  dominates the pass and its duration is unknown until it ends.
