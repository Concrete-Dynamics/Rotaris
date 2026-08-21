# Implementation Plan: Execute Button for Improvement Proposals

**Requirement:** New `SWR-<n>` under `docs/requirements/2000-rotaris-desktop/` (does not exist yet — see Phase 0).
**Also relevant:** `docs/requirements/2000-rotaris-desktop/SWR-2123-improvement-proposals-library-tab.md` (approve/reject/defer/edit/delete only — explicitly does NOT execute workspace changes).
**Planned:** 2026-07-22
**Status:** Draft — not started

---

## Summary

Add an "Execute" action to improvement proposals, available both on the Dashboard
(Overview) proposal rows and in the Library tab's Improvement Proposals list. Unlike
Approve/Reject/Defer (pure status bookkeeping, per SWR-2123's confirm-dialog text:
"This records a review decision; it does not execute workspace changes."), Execute
actually runs the proposal's `recommended_action` against the workspace.

### Current state (why nothing runs today)

- `src/rotaris_core/improvement/approval.py::approved_proposals()` filters an artifact's
  proposals to `APPROVED` ones. Only caller: `improver.py::prepare_improvement_run()`.
- `src/rotaris_core/improvement/improver.py::prepare_improvement_run()` builds a
  `TodoList` (one task per approved proposal) + has a dedicated `IMPROVER_SYSTEM_PROMPT`
  for a `RunType.IMPROVEMENT_RUN` agent role. Fully built, fully unused — **zero
  callers** exist in CLI, TUI, or Rotaris.
- Rotaris's `apps/rotaris/src/rotaris/services/run_bridge.py::RunBridge.start()`
  hardcodes `RunType.TASK_RUN` via `rotaris_core.cli.background._run_task`. No path
  triggers `RunType.IMPROVEMENT_RUN`.

So "Execute" requires wiring a **new kind of background run** end-to-end, not a small
backend mutation like the existing proposal actions.

---

## Phases

### Phase 0 — Requirement

- Author `docs/requirements/2000-rotaris-desktop/SWR-2XXX-execute-improvement-proposal.md`
  (ReqToCode: no orphan code — ties `@traces`/`@verifies` for all new code below).
  - Acceptance criteria should cover: gating (Execute only enabled once a proposal is
    Approved — reuses the existing approve gate so this is additive, not a new status),
    one-proposal-at-a-time execution (no batch-execute-all in v1), confirmation dialog
    text (must warn this performs real workspace changes, unlike delete/status-change
    dialogs), and where execution progress/result surfaces (new session vs. inline).
  - Mirror the `Derived requirements:` link back onto SWR-2123 if this is filed as a
    derived/technical requirement rather than standalone.

### Phase 1 — Backend: wire the Improver run

- `src/rotaris_core/improvement/improver.py`: no changes expected — `prepare_improvement_run`
  already returns `(artifact, approved, todo)`, but it currently uses `approved_proposals`
  (whole-artifact filter). Add a variant (or optional `proposal_ids` filter param) so a
  single selected proposal can be executed without also re-running every other approved
  proposal in the same artifact.
- New async entry point analogous to `cli/background.py::_run_task`, but constructing
  `RalphLoop(run_type=RunType.IMPROVEMENT_RUN, ...)` with `improver.py`'s system prompt
  and the single-proposal todo, instead of the task-classification path. Likely lives
  in `improvement/improver.py` or a new `improvement/runner.py` to keep `cli/background.py`
  task-run-focused.
- Decide session model: a fresh `SessionManager` session per execution (own transcript,
  own evidence dir), tagged so the Dashboard/session list can identify it as an
  improvement-execution run rather than a task run.

### Phase 2 — Rotaris: RunBridge support

- `apps/rotaris/src/rotaris/services/run_bridge.py`: add
  `RunBridge.start_improvement(artifact_id: str, proposal_id: str) -> bool`, mirroring
  `start()`'s worker-thread pattern but invoking the Phase 1 entry point instead of
  `_run_task`. Reuse `_RunWorker`/`_SessionObserver` plumbing as much as possible
  (transcript streaming, session persistence, poller) rather than duplicating it.
- Guard against starting an improvement execution while a regular run (`self.running`)
  is already active on the same bridge — one worker thread per bridge today.

### Phase 3 — Rotaris: UI wiring

- `apps/rotaris/src/rotaris/views/library.py`: add an "Execute" button next to
  Approve/Reject/Defer, enabled only when `proposal.status == "approved"`. Emits a new
  `proposal_execute_requested = Signal(str, str)` (artifact_id, proposal_id).
- `apps/rotaris/src/rotaris/views/dashboard.py`: add an "Execute" action in
  `_proposal_row()` alongside the existing inline Approve/Reject/Defer buttons, same
  gating (only when Approved). Emits the same kind of signal (or reuse one shared
  signal name across both views for `MainWindow` to wire once).
- `apps/rotaris/src/rotaris/views/main_window.py`: new handler `_execute_proposal`,
  connected from both views' signals. Shows a `QMessageBox.question` confirm dialog
  whose text explicitly states this WILL modify the workspace (contrast with the
  existing approve/reject/defer dialog's "does not execute workspace changes" text).
  On confirm, calls `RunBridge.start_improvement(artifact_id, proposal_id)`.
- Decide UX for while execution is running: likely disable the Execute button for that
  proposal (or all proposals) until `run_finished`/`run_failed`, and surface the run in
  the normal running-session UI (Dashboard/Workspace views already show active runs).

### Phase 4 — Tests

- `apps/rotaris/tests/test_services.py`: `RunBridge.start_improvement` unit tests
  (mirroring existing `start()` coverage patterns).
- `apps/rotaris/tests/test_views.py` (or equivalent): button enablement gating
  (disabled unless Approved), signal emission on click, confirm-dialog wiring.
- Backend: unit test for the new single-proposal execution entry point (Phase 1),
  and for the `proposal_ids`-filtered variant of `prepare_improvement_run`.
- `make test-rotaris` (pytest-qt) for the new interactive workflow.

### Phase 5 — Validation

- `python -m rotaris_core.reqtocode check --fix` — confirm no orphan code, all new
  functions/tests carry `@traces`/`@verifies` against the Phase 0 requirement.
- `make lint`, `make typecheck`, `make test`.
- Bump `pyproject.toml` version (feature addition).
- Set the Phase 0 requirement's `status: approved` once merged; update the
  `2000-rotaris-desktop` epic index table.

---

## Open questions for scoping check-in before implementation

1. Execute only when Approved (recommended, reuses existing gate) — or should clicking
   Execute implicitly approve too?
2. Should the confirm dialog block until Approve has happened first if it hasn't
   (i.e. is Execute ever shown/enabled for a Pending/Deferred/Rejected proposal)?
3. Batch execute (all Approved proposals in an artifact at once, via
   `prepare_improvement_run`'s existing whole-artifact `approved_proposals` path) —
   in scope for v1, or strictly single-proposal only?
4. Where should the resulting run be visible — a new entry in the session list /
   Dashboard "active runs", or something more lightweight since it's a single-task run?
