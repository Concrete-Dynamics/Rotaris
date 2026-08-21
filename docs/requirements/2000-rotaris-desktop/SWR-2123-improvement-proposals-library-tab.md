---
req-id: SWR-2123
status: approved
trace: required
test: required
title: "Improvement proposals as a Library tab with edit/delete/status actions"
epic: SWR-2000
date: 2026-07-22
---

# Improvement proposals as a Library tab with edit/delete/status actions

The Rotaris Library view shall include an "Improvement proposals" tab listing every
workspace improvement proposal (summary, category, risk, status, created). Clicking a
proposal's summary on the Overview screen, or the "Open in Library" link on its card,
shall navigate to the Library view with that tab active; a specific proposal shall be
selected and scrolled into view when navigated from a row. From the Library tab, the
user shall be able to approve, reject, or defer a proposal (existing approval-gated
status transitions), edit a proposal's summary and recommended action, and delete a
proposal outright — all persisted atomically to the on-disk artifact and reflected back
through the store to both the Library tab and the Overview card.

## Acceptance criteria

- `LibraryView` exposes a named-tab API (`set_active_tab`) so callers do not depend on
  positional tab indices, and gains an "Improvement proposals" tab backed by
  `WorkspaceStore.improvement_proposals`.
- `DashboardView`'s proposal rows and card header are clickable and emit the artifact id
  and (when applicable) proposal id needed to open Library at the correct tab and row.
- Editing a proposal's summary/recommended action and deleting a proposal are persisted
  through `rotaris_core.improvement.approval` (`update_proposal`, `delete_proposal`) with
  the same atomic-write/validate guarantees as existing status transitions, and surface
  errors (missing proposal, blank text) as notifications rather than crashing.
- Deleting a proposal is confirmed before it is applied, consistent with other
  irreversible actions in `MainWindow`.
