---
req-id: SWR-1642
status: draft
trace: required
test: required
title: "CLI surface for improvement history and rollback"
epic: SWR-1600
priority: P2
date: 2026-08-09
source: docs/plans/2026-08-09-marktanalyse-offene-punkte.md
---

# SWR-1642 — CLI surface for improvement history and rollback

History (SWR-1640) and rollback (SWR-1641) are worthless if the only way to reach them is
a Python API. The checkpoint feature set the precedent: `rotaris-cli checkpoints list` /
`restore` (SWR-2437) made session rollback usable without any UI work, and Rotaris views
followed later.

Requirement: an `improvements` command group mirrors that shape.

- `list` shows the workspace's improvement artifacts newest first: id, generation time,
  proposal count by status, and whether a rollback point exists.
- `show <artifact-id>` prints one artifact's proposals and its version history (version,
  timestamp, cause).
- `rollback <artifact-id>` previews the file changes and requires confirmation before
  restoring; `--yes` skips the prompt for scripted use, `--force` overrides the
  dirty-workspace refusal, and the reason is printed when a rollback is refused.
- Every command works against an explicit `--workspace` and defaults to the current
  directory, matching the checkpoints command group.
- Exit codes follow the CLI convention: 0 success, non-zero on a refused or failed
  rollback, so CI can branch on it.

## Acceptance criteria

- `rollback` without `--yes` never modifies the workspace when the confirmation is
  declined.
- A refused rollback prints the blocking paths and exits non-zero.
- The command group appears in `rotaris-cli --help` and its registration follows the
  existing `cli/commands/` pattern (a `register(app)` entry point).

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Argument parsing, confirmation handling, exit codes for success / refusal / missing artifact | Command callbacks | `tests/unit/improvement/test_improvement_cli.py` |
| Integration | `list` → `show` → `rollback --yes` against a real temp workspace changes the files and reports the versions | CLI over the real services | `tests/integration/test_improvement_rollback_flow.py` (shared with SWR-1641) |
| User-flow E2E | Covered by the SWR-1641 flow, driven through the CLI rather than the API | Public product boundary → user-observable result | `tests/integration/test_improvement_rollback_flow.py` |

Epic: [Post-Run Improvement Loop](../1600-improvement-loop.md)
