# This repository's process, for agents of an orchestrated build

A one-page map. Each line points at the authority that governs it; read the authority for anything your work
touches. Where this page and an authority disagree, the authority governs and this page is wrong: fix it.

## Boundaries that bind every step

- `CLAUDE.md`'s hard boundary (the clean-room sources) binds every command, file and search. A task that seems to
  need a forbidden source does not; raise the gap as an open question.
- **Never edited in place:** `docs/spec/` (a directive governs over a requirement it names, and the requirement
  gains a back-pointer in the same commit; `pnpm symbols` enforces the identifiers); a shipped store migration;
  anything under `packages/kernel/src/generated/`.
- **The owner's alone:** ruling an escalation, or reversing a clause the owner ruled personally (R-048's and R-071's
  child ceiling, for one). **An open question** that would wait on the owner is ruled, since 2026-10-07, by the orchestrator's
  consortium under the owner's standing delegation (`docs/product/requests.md` R-072; SKILL.md §1.2): never by a
  workflow's builder or reviewer, which raise it at the number the brief assigns and leave it open. *(This read "ruling
  an open question or an escalation"; R-072 delegates open questions only, `docs/architecture/open-questions.md`
  OQ-214.)* **Not for workflow agents:** editing
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
for the owner's requests and rulings before a run, on a docs-only branch; agents cite the ids. A row is appended at
the next free `R-NNN`, and the log's `## Count` line is advanced to it **in the same commit**: `pnpm lint` runs
`tools/check-request-log.mjs`, which refuses a declared count that is not the count ("the Count section declares
R-001 to R-067, but the highest row is R-068", 2026-10-02).

## Another writer on main

The owner or another session may land on `main` while a plan runs (2026-10-02: the owner's Codex-built branch,
head `d367280`, landed request R-069 with code, test and record edits while fin4 and fin5 ran). At each check-in, list
what landed since the last head this session pushed, with the session trailer, since every Claude session authors
as "Claude" and a trailer-less commit by the owner is theirs:

```bash
git log --format='%h %an %(trailers:key=Claude-Session,valueonly,separator=%x2C) %s' <that head>..origin/main
```

When another author or session appears, run `node tools/check-request-log.mjs` and `node tools/check-record-links.mjs`
(no install needed; seconds) in a short-lived detached worktree at origin/main beside the checkout, removed straight
after (`git -C <repo> worktree add --detach <repo>-wt-maincheck-<id> origin/main`, then
`git -C <repo> worktree remove <repo>-wt-maincheck-<id>`), so a red base is known before a bundle's gate blames the
bundle. Never refresh a running plan's reference worktree for it: that plan's agents read `references/*` there under
prompts rendered from the older copy (SKILL.md §4 refreshes it between runs only). Judge their head commit, never an
intermediate merge of theirs (`a46180d`, before they merged this session's work, read like a lost row). A red base is
reported to the owner and recorded as a defect note (`docs/defects/README.md`). When a docs-only change repairs it (a
count line, a link a moved note left behind), the orchestrator repairs it forward on its own branch in its own
worktree from origin/main, the note moved to `fixed/` in the same commit, landed with the gate green before the next
bundle's merge gate meets it; a red that needs code goes to the owner or into a plan. Their commit is never reverted
(`docs/clean-room/agent-workflow.md`: surface a collision with the owner's commit, never reset it).

## Worktrees and branches — `docs/clean-room/agent-workflow.md`

One temporary branch in one temporary worktree per bundle (`<repo>-wt-<short>`), cut from `origin/main`. The primary
checkout is not a place to write. **Main's history is linear**: a reviewed bundle lands by a rebase onto `origin/main`
in its own worktree, the gate on that exact head checked out detached in the bundle's own landing worktree
(`<repo>-wt-integ-<id>-<short>`, a tree other than the one it was built in), and a fast-forward push of it from there;
never a merge commit, never a force (the owner, 2026-10-04: "please always use rebase instead of a merge commit for
main."). A push rejected because main moved is rebased, gated and pushed again. Merging `origin/main` into a bundle
branch while it is built and repaired is fine: the rule is about main, and the rebase at landing drops those merges.
After the landing the bundle and landing worktrees are removed and the branch deleted (`git branch -d`). Stage paths
by name, never `git add -A`; LF line endings.

**Never `git stash`**: `refs/stash` lives in the common git directory, one stash for every worktree, so a `pop` takes
whatever entry is on top, another agent's included. On 2026-10-03 at about 07:04 UTC the builders of finacc's
`accept1-5` and `accept1-6` each received the other's uncommitted edits that way
(`docs/defects/fixed/parallel-worktree-agents-swap-uncommitted-edits-through-the-shared-git-stash.md`). Set a change
aside with a patch file outside the checkout (`git diff -- <files> > <scratchpad>/<name>.patch`,
`git checkout -- <files>`, then `git apply <scratchpad>/<name>.patch`), or read the base in a throwaway detached worktree
(`git worktree add --detach <path> origin/main`, removed after).

## Before and after an edit — `CLAUDE.md`

Consult the architecture view the router in `docs/architecture/views/README.md` names before changing code, and
update it after. A change that draws or restyles a surface follows `docs/design/README.md` §7 (`pnpm mockup` before;
the `build-ui` and `debug-ui` skills). `docs/module-map.md` changes when a package appears, moves or changes what it
owns, or when an entry point it names moves.

## The gate

`pnpm check` (symbols, typecheck, lint, tests, and this skill's self-test) fully green under Node 24 on the rebased
head before every push: the reviewer runs it once per landing. Before handing over, a builder runs the quick checks
(`pnpm symbols && pnpm typecheck && pnpm lint`) and the tests beside every unit it changed (`pnpm vitest run <paths>`).
`pnpm build` before any proof or live run. The proof registry — which entry measures what, its neighbours, what it
needs and its flags — is `docs/proofs/README.md`, rendered from `tools/proof-registry/registry.mjs`.

## Records

The same commits as the code carry:
- the affected architecture view and the "Last reconciled with the code" date in
  `docs/architecture/views/README.md`, when a view's content changed, with the change's entry at the top of
  `docs/architecture/views/reconciliation-log.md` (never in the README, since 2026-10-13);
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

## Boundaries the reviewer checks — `docs/architecture/views/01-component-view.md`, `.claude/rules/`

No import across a package edge the component view forbids; `electron` imported only in the five roots under
`apps/desktop/src/`; engine code takes time from the clock ports; design-equivalent controls only in
`packages/ui/src/design-system/` and tokens by name; nothing hand-written under `packages/kernel/src/generated/`;
a store migration appended, never edited.

## Merge conflicts

The same shapes hold for a merge of `origin/main` into a bundle branch and for each commit a rebase replays.

- Numbering collisions (open questions, escalations, requests): `origin/main` keeps its number; the branch takes the
  next free one, says so in its own entry, and renumbers its citations. Defect notes are named: two notes with one
  name describing one defect become one note; describing two, the branch's is renamed and its links follow.
- `first-executions.md` rows: keep both, in date order. The views' reconciled date: the later one.
- `docs/architecture/views/reconciliation-log.md`: keep both entries, newest first (the file's own rule). R-072's row in
  `docs/product/requests.md`: keep every ruling clause either side appended, in date order.
  `docs/product/directives.md`'s Count: recompute it from the entries below it, never take either side's. The proof
  registry: keep both sides' entries in `tools/proof-registry/registry.mjs` and both `docs/proofs/<id>.md` records;
  never merge the generated `docs/proofs/README.md` by hand, regenerate it (`pnpm proofs:index`).
- Shared array or object literals: merge the entries. Store migrations: the branch's is renumbered after main's.
- Code: keep both sides' intent; the compiler and the tests decide.

## Live runs

`apps/desktop/scripts/live-run.mjs` (`--confirm` to spend, `--only=<scenarios>`, `--skip-build`); its header lists
the scenarios. `references/live-runs.md` covers authorization, permissions and long runs.
