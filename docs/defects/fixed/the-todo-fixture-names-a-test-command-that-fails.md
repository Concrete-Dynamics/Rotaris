## The todo-app fixture tells agents to run a test command that fails

The live run's fixture says in `src/todos.js`'s header comment that "`node --test src/` runs it". On Node 24 that command
fails with `MODULE_NOT_FOUND` (a directory argument is taken as a module path), so agents that follow the fixture's own
advice spend terminal calls finding a command that works.

Live-run finding: H2 (live runs of 2026-09-29)

## Specs

- None; harness fixture.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored): six wasted terminal calls — session `ccc662d9` (`edit`) #22, #23, #34; session `360c8ac1` (`requirements`)
  #34, #35, #57.

## Relevant files

- `apps/desktop/scripts/fixtures/todo-app/src/todos.js:3` — the header's command.

## Outcome

Repaired 2026-09-29 under R-067. `src/todos.js`'s header names `node --test`, run from the repository's root. That is
the command the fixture's `README.md` and `AGENTS.md` already named, and the one the live run itself runs. On Node
24.21, `node --test src/` fails ("✖ src … 'test failed'", measured in a copy of the fixture), and `node --test` passes
all six tests. Pinned by `apps/desktop/scripts/fixtures/todo-app.test.ts`, which runs every `node --test …` command that
the fixture's `src/todos.js`, `README.md` and `AGENTS.md` name, in a copy of the fixture, on the Node that runs the
tests, and requires each one to pass. With the old header restored, its `node --test src/` case fails.
