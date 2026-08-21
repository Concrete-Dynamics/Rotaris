---
req-id: SWR-2806
status: approved
trace: required
test: required
type: technical
derived-from: SWR-2802
title: "Initialization config sections & atomic state writer"
epic: SWR-2800
date: 2026-08-06
---

# SWR-2806 — Initialization config sections & atomic state writer

SWR-2802 requires the workspace config to record which initialization tasks
have been completed or skipped, and SWR-2804 requires the source-extension list
used for non-code classification to be overridable per workspace. Neither
requirement describes the config plumbing itself. This technical requirement
covers that seam: the two workspace config sections and the read/modify/write
helper the initialization flow uses to persist its outcome.

The workspace config file is `<workspace>/.rotaris/agents.yaml` — the only
workspace-scope config file the loader reads (alongside `models.yml`). Earlier
drafts of `2800-project-initialization.md` named a `config.yaml`; that file does
not exist in this codebase and is not introduced. The epic prose was corrected
when the epic was approved.

## Acceptance criteria

- `RotarisConfig` carries an `initialization: InitializationState` section
  (`completed`, `skipped`, `last_run`, `classification`) and a
  `project_init: ProjectInitConfig` section (`source_extensions`).
- `ProjectInitConfig.source_extensions` defaults to the 23 extensions listed in
  SWR-2804. A workspace override **replaces** the list rather than extending
  it, consistent with the config convention that list fields replace.
- Both sections participate in the global → workspace field-wise merge, so an
  override of one field does not drop the others.
- "Never initialized" is distinguishable from "resolved with nothing pending".
  `InitializationState.never_initialized` is the single documented predicate:
  it is true exactly when `last_run is None` and both task lists are empty.
  Writers stamp `last_run` on every recorded outcome, so a workspace where no
  task was applicable is still marked initialized.
- Writing the `initialization:` section is atomic (via `rotaris_core.fs.atomic_write`,
  which carries the Windows `ERROR_ACCESS_DENIED` replace retry) and
  **preserves every other top-level key** in the file — notably the `rotaris:`
  key written by the desktop app and any user-authored persona or model
  overrides. A partially written or truncated `agents.yaml` would take the
  user's whole configuration down, not just initialization state.
- The writer bootstraps a minimal `agents.yaml` when the workspace has none, so
  recording an initialization outcome never fails on a fresh workspace.

## Test coverage

Unit coverage in `tests/unit/test_project_init_state.py`: an absent
`initialization:` section reads as never-initialized; a written state round-trips
through the real file; unrelated top-level keys (`rotaris:`, `personas:`) survive
a write; `mark_task` records the outcome, stamps `last_run`, and moves a task
between the skipped and completed lists without duplicating it.

Integration-level coverage in the same file exercises the public
`load_config(workspace)` seam: an `initialization:` section and a
`project_init.source_extensions` override written into a workspace `agents.yaml`
reach the returned `RotarisConfig`, and global/workspace scopes merge field-wise.

No separate user-flow E2E test: this seam has no product surface of its own. The
originating flow — a user opening a fresh workspace, being prompted, and the
outcome sticking across restarts — is covered by SWR-2802's E2E test.

Derived from: [SWR-2802 — Extensible project initialization prompt](../2800-project-initialization.md)

Epic: [Project Initialization & Serena MCP Integration](../2800-project-initialization.md)
