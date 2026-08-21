---
req-id: SWR-3418
status: approved
trace: required
test: required
type: technical
derived-from: SWR-3405
title: "The Windows path limit is stated in Rotaris' words"
epic: SWR-3400
date: 2026-08-15
source: docs/plans/2026-08-15-requirements-board-open-items.md
---

# SWR-3418 — The Windows path limit is stated in Rotaris' words

Creating a unit's worktree (SWR-3405) runs `git worktree add`, and when it fails
Rotaris raises with git's stderr verbatim. That text then travels unchanged into
the run's `failure_reason` and onto the board. On Windows a requirement whose
files sit deep in the tree pushes a path past the 260-character limit, and the
user reads `error: unable to create file …: Filename too long` — a sentence about
git, in git's vocabulary, that sends them to git's issue tracker rather than to
the two things that actually fix it. It is also, on a fresh Windows checkout, one
of the first failures a user meets.

Requirement: Rotaris detects a worktree creation that failed on the Windows path
limit and states it in its own words — that the path a file in the new worktree
needs is longer than Windows allows, and the two ways out: enabling long paths in
git (`git config --global core.longpaths true`), or putting the workspace
somewhere shorter. Git's original text is kept as the detail underneath; only the
headline is replaced. Rotaris does **not** change the setting itself: silently
rewriting a global git configuration in someone's environment is not a fix
Rotaris is entitled to apply on its own, and the message says so.

## Acceptance criteria

- A worktree creation that git refused with a path-length error reports Rotaris'
  own sentence, naming the limit, both remedies, and the workspace it is on.
- Git's original text is still present in the message, as detail rather than as
  the headline.
- No Rotaris code path writes `core.longpaths` — or any other git setting — into
  the user's configuration.
- Every other git failure is reported exactly as before; only the path-limit case
  is translated.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A path-length refusal is translated, an unrelated failure is not, and no configuration is written | `GitWorktreeService` over a scripted git | `tests/unit/requirements/test_worktree_path_limits.py` |
| Integration | The translated sentence reaches a run's stated failure reason instead of git's | Run seam + isolation provider | `tests/integration/test_requirement_cycles.py` |
| User-flow E2E | `N/A — a failure message on the surface SWR-3405's own user flow already covers; the same worktree creation, refused` | — | — |

Derived from: [SWR-3405 — Each execution unit runs in its own worktree](SWR-3405-worktree-per-execution-unit.md)

Epic: [Requirement Execution](../3400-requirement-execution.md)
