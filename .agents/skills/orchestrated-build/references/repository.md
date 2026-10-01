# This repository's process, for agents of an orchestrated build

A one-page map. Each line points at the authority that governs it; read the authority for anything your work
touches. Where this page and an authority disagree, the authority governs and this page is wrong: fix it.

## Boundaries that bind every step

- `CLAUDE.md`'s hard boundary (the clean-room sources) binds every command, file and search. A task that seems to
  need a forbidden source does not; raise the gap as an open question.
- **Never edited in place:** `docs/spec/` (a directive governs over a requirement it names, and the requirement
  gains a back-pointer in the same commit; `pnpm symbols` enforces the identifiers); a shipped store migration;
  anything under `packages/kernel/src/generated/`.
- **The owner's alone:** ruling an open question or an escalation. **Not for workflow agents:** editing
  `docs/product/requests.md` (the orchestrator logs the owner's requests there, before a run) unless the
  orchestrator's notes authorize one named row. Also the owner's: downgrading or removing an implementation condition
  (`docs/architecture/implementation-conditions.md`: discharging one means recording its result where its entry
  says, pass or fail, and that is the work's to do); a Linux or macOS release artifact (IC-3), signing and release
  workflows; granting permissions or spending. Raise; never decide.
- A requirement found wrong while building is a **defect found by building**: record it, add its row to
  `docs/architecture/first-executions.md`, and raise it for the amendment round; never correct the requirement.
- Never undo a commit you did not make; never force, reset or rewrite a shared branch.

## Owner requests — `CLAUDE.md`, `docs/product/README.md`

A request that would change what the product does is classified before code and logged in
`docs/product/requests.md` (covered, OQ, ESC, defect found by building, or a directive). The orchestrator does this
for the owner's requests and rulings before a run, on a docs-only branch; agents cite the ids.

## Worktrees and branches — `docs/clean-room/agent-workflow.md`

One temporary branch in one temporary worktree per bundle (`<repo>-wt-<short>`), cut from `origin/main`. The
primary checkout is not a place to write; merges land through the plan's integration worktree
(`<repo>-wt-integ-<id>`, detached), and verification runs on the merged result. After the merge the worktree is
removed and the branch deleted (`git branch -d`). Stage paths by name, never `git add -A`; LF line endings.

## Before and after an edit — `CLAUDE.md`

Consult the architecture view the router in `docs/architecture/views/README.md` names before changing code, and
update it after. A change that draws or restyles a surface follows `docs/design/README.md` §7 (`pnpm mockup` before;
the `build-ui` and `debug-ui` skills). `docs/module-map.md` changes when a package appears, moves or changes what it
owns, or when an entry point it names moves.

## The gate

`pnpm check` (symbols, typecheck, lint, tests, and this skill's self-test) fully green under Node 24, in the worktree
before a merge and on the merged result before a push. `pnpm build` before any proof or live run. The proof index is
in `AGENTS.md`.

## Records

The same commits as the code carry:
- the affected architecture view and the "Last reconciled with the code" date in
  `docs/architecture/views/README.md`, when a view's content changed;
- a mechanism's first execution reported in place into the record that decided it, plus one row in
  `docs/architecture/first-executions.md`; a falsified claim corrected in place with the old reason kept beside it;
- a repaired defect note: its outcome written on it (what changed, which test or proof pins it), `git mv` to
  `docs/defects/fixed/`, every link to its old path repointed (`pnpm lint` runs `tools/check-record-links.mjs`);
- a defect noticed along the way recorded in `docs/defects/` (schema in `docs/defects/README.md`), fixed or not;
- a question the specification leaves open appended to `docs/architecture/open-questions.md` as the next free number;
- `docs/architecture/codebase.md`, `AGENTS.md` and `docs/architecture/first-release-plan.md` updated where they name
  the work.

## Commits

Small, one task's commits never mixed with another's, citing the requirement and directive ids in the subject
(`fix(area): what (REQ-…)`), the body saying why, ending with the session's trailer lines exactly.

## Boundaries the verifier checks — `docs/architecture/views/01-component-view.md`, `.claude/rules/`

No import across a package edge the component view forbids; `electron` imported only in the five roots under
`apps/desktop/src/`; engine code takes time from the clock ports; design-equivalent controls only in
`packages/ui/src/design-system/` and tokens by name; nothing hand-written under `packages/kernel/src/generated/`;
a store migration appended, never edited.

## Merge conflicts

- Numbering collisions (open questions, escalations, requests): `origin/main` keeps its number; the branch takes the
  next free one, says so in its own entry, and renumbers its citations. Defect notes are named: two notes with one
  name describing one defect become one note; describing two, the branch's is renamed and its links follow.
- `first-executions.md` rows: keep both, in date order. The views' reconciled date: the later one.
- Shared array or object literals: merge the entries. Store migrations: the branch's is renumbered after main's.
- Code: keep both sides' intent; the compiler and the tests decide.

## Live runs

`apps/desktop/scripts/live-run.mjs` (`--confirm` to spend, `--only=<scenarios>`, `--skip-build`); its header lists
the scenarios. `references/live-runs.md` covers authorization, permissions and long runs.
