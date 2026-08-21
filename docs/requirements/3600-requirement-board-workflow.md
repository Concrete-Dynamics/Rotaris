---
req-id: SWR-3600
status: approved
trace: optional
test: optional
title: "Requirement Board Workflow and Review"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3600 — Requirement Board Workflow and Review

The write half of the Requirements area: moving a card is an instruction,
reviewing a result is a decision with consequences, and requirements can be
edited and created without leaving the product. It also holds the guarantees
that keep those affordances honest — the user interface cannot force `Done`,
every action is attributed, and requirement work survives a restart.

Two boundaries define this epic. It is **not a task tracker**: every field on
this board resolves to code, tests, runs or git, and planning belongs here only
where it steers implementation. And it **owns no state of its own**: every
action goes through the engine's transition function, and every surface that
already exists — transcript, agent tree, worktree list — is navigated to rather
than rebuilt.

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§30, §33–§34, §38, §44–§45, §49–§50, §52, §56.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3601](3600-requirement-board-workflow/SWR-3601-drag-and-drop-workflow-actions.md) | Moving a card is a workflow action | approved |
| [SWR-3602](3600-requirement-board-workflow/SWR-3602-refused-drops-explain.md) | A refused move says why | approved |
| [SWR-3603](3600-requirement-board-workflow/SWR-3603-review-view.md) | Review view | approved |
| [SWR-3604](3600-requirement-board-workflow/SWR-3604-review-decisions.md) | Review decisions | approved |
| [SWR-3605](3600-requirement-board-workflow/SWR-3605-requirement-editing.md) | Requirements are editable where the source allows it | approved |
| [SWR-3606](3600-requirement-board-workflow/SWR-3606-requirement-creation-ui.md) | Requirements can be created in Rotaris | approved |
| [SWR-3607](3600-requirement-board-workflow/SWR-3607-blocker-resolution.md) | Blockers and decisions are resolved from the board | approved |
| [SWR-3608](3600-requirement-board-workflow/SWR-3608-scheduling-controls.md) | Scheduling is visible and controllable | approved |
| [SWR-3609](3600-requirement-board-workflow/SWR-3609-ui-cannot-force-done.md) | The user interface cannot force Done | approved |
| [SWR-3610](3600-requirement-board-workflow/SWR-3610-board-actions-are-attributed.md) | Board actions are attributed and auditable | approved |
| [SWR-3611](3600-requirement-board-workflow/SWR-3611-requirement-work-survives-restart.md) | Requirement work survives a restart | approved |
| [SWR-3612](3600-requirement-board-workflow/SWR-3612-run-activity-reaches-existing-surfaces.md) | Requirement runs reach the existing run surfaces | approved |
| [SWR-3613](3600-requirement-board-workflow/SWR-3613-derived-requirements-are-offered.md) | A derived technical requirement is offered, never written silently | approved |
| [SWR-3614](3600-requirement-board-workflow/SWR-3614-adoption-is-offered.md) | The board offers adoption and never performs it unasked | approved |
| [SWR-3615](3600-requirement-board-workflow/SWR-3615-verification-is-offered.md) | A user can verify without delivering | approved |
| [SWR-3616](3600-requirement-board-workflow/SWR-3616-change-work-is-offered.md) | The work a change asks for is offered, never started | approved |
| [SWR-3620](3600-requirement-board-workflow/SWR-3620-a-pass-reports-progress-to-its-host.md) | Adoption and verification report progress to whoever started them | approved |
| [SWR-3622](3600-requirement-board-workflow/SWR-3622-releasing-a-blocked-requirement-asks.md) | Releasing a requirement with unmet dependencies asks first | approved |
| [SWR-3623](3600-requirement-board-workflow/SWR-3623-handle-the-root-blocker-first.md) | The board resolves the blocker chain and starts at its root | approved |
| [SWR-3624](3600-requirement-board-workflow/SWR-3624-a-released-requirement-runs-as-an-interactive-session.md) | A released requirement runs as an interactive session | approved |
| [SWR-3625](3600-requirement-board-workflow/SWR-3625-a-run-waiting-on-a-person-says-so.md) | A run waiting on a person says so where the requirement is shown | approved |
| [SWR-3707](3600-requirement-board-workflow/SWR-3707-requirement-runs-use-full-permissions.md) | A released requirement runs with full permissions, and Rotaris says so | approved |
| [SWR-3710](3600-requirement-board-workflow/SWR-3710-clearing-a-blocker-restarts-the-work.md) | Clearing a blocker restarts the work it stopped | approved |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 6 of
  six, the last one. Depends on epics [SWR-3300](3300-requirement-board-ui.md),
  [SWR-3400](3400-requirement-execution.md) and
  [SWR-3500](3500-requirement-change-propagation.md). Delivery plan and slice
  ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
- 2026-08-19 — The adoption and verification passes learned to report their
  phases to whoever started them
  ([SWR-3620](3600-requirement-board-workflow/SWR-3620-a-pass-reports-progress-to-its-host.md)).
  The suite runner's own progress seam (SWR-2609) already existed and was simply
  never passed by the two callers that run a suite for a requirement pass.

- 2026-08-21 — A requirement released from the board now runs with the
  permissive preset and the unsandboxed opt-in together, disclosed once per
  launch
  ([SWR-3707](3600-requirement-board-workflow/SWR-3707-requirement-runs-use-full-permissions.md)).
  Without both halves an unattended release was downgraded to `ask` by SWR-2508
  and denied on the first tool that needed approval.

- 2026-08-21 — Clearing a blocker that returns a requirement to `Ready` now
  restarts its work in that one gesture
  ([SWR-3710](3600-requirement-board-workflow/SWR-3710-clearing-a-blocker-restarts-the-work.md)).
  The matrix has no `Ready → Ready` edge, so a card cleared back into `Ready` was
  one no board gesture could start; the only way out was a round trip through
  `Backlog`.

- 2026-08-21 — A released requirement's work became a session a user can take
  part in
  ([SWR-3624](3600-requirement-board-workflow/SWR-3624-a-released-requirement-runs-as-an-interactive-session.md)),
  and a run waiting on a person now says so on every surface that shows the
  requirement
  ([SWR-3625](3600-requirement-board-workflow/SWR-3625-a-run-waiting-on-a-person-says-so.md)).
  SWR-3612 had filed the session where the workspace lists it, but the run held
  no coordinator handle, so stop, pause, steer and answer were all inert for it
  — and a background run blocked on an approval said nothing anywhere, because
  only the focused session's pending prompts were ever published.

- 2026-08-21 — A drop on `Ready` now consults the dependency gate before it
  dispatches anything
  ([SWR-3622](3600-requirement-board-workflow/SWR-3622-releasing-a-blocked-requirement-asks.md)),
  and resolves the chain above the requirement so the user can start at its root
  ([SWR-3623](3600-requirement-board-workflow/SWR-3623-handle-the-root-blocker-first.md)).
  SWR-3510's gate was pure, tested and constructed nowhere: a held requirement
  carried no blocker on the board at all, and the wait first became visible as a
  scheduler hold on a unit, after the run had already been dispatched.
