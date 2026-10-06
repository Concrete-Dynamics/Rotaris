## The status strip's branch item has no branch icon, and its tooltip no full stop

The strip's branch item (`branchStripItem`, `packages/ui/src/GitView.tsx:120`) draws the branch name and its `↑{n}` marker
as plain text: no branch icon in the accent colour (REQ-SHELL-042; REQ-WORKSPACE-020 "SHALL render a branch icon followed by
the branch name"). Its tooltip reads `Branch this workspace is on: main` with no closing full stop, where REQ-WORKSPACE-020
fixes "Branch this workspace is on: {branch}." (and "…, 1 commit ahead." / "…, {n} commits ahead."); REQ-GIT-122 gives the
same sentence without the stop. For a detached HEAD or a folder that is no repository the item reads `detached HEAD` or
`no git repository` with a tooltip, as REQ-GIT-161 requires it to convey those states, while REQ-WORKSPACE-020 renders it as
empty text with no tooltip "exactly when the snapshot's branch name is empty", which covers both: the two requirements
disagree, and the build follows REQ-GIT-161 without a recorded reading. Noticed 2026-10-02 while rebuilding the strip
around it (fin10); not repaired there.

**Amended 2026-10-03 (the seventh triage, fin11): the worktree branch is drawn without its ahead marker.** While the active
run executes in an isolated worktree the item shows that worktree's branch (`branchStripItem`'s first line, from the focused
session's `worktreeBranch`), but with no ` ↑{n}` at all: REQ-WORKSPACE-020 requires the ahead count and the suffix "computed
against that branch's upstream rather than the base checkout's", and the renderer holds no such count — the session record
carries the branch name alone, and the Git view's snapshot is the base checkout's. The same line's tooltip and description
are one string, "Branch this session's worktree is on: {branch}", where REQ-WORKSPACE-020 gives the worktree branch the
base checkout's sentences ("rendered exactly as any other branch name is") and lets only the accessible description add
that the branch is the isolated worktree's. Size M (the worktree's ahead count has to be read and carried to the renderer);
found by reading, not driven; not repaired by fin11, which repairs the icon and the base checkout's sentences.

## Status (2026-10-03, acceptance repair F8) — the worktree finding fixed; open on OQ-193 alone

- **Fixed: the worktree branch's ahead marker and sentences** (REQ-WORKSPACE-020, REQ-SHELL-042, REQ-GIT-122). The workspace
  service reads each local branch's tracking summary once per Git-view refresh (`git for-each-ref
  --format=%(refname)%00%(upstream:track) refs/heads`, `parseUpstreamAhead`, `packages/workspace/src/git/view.ts`) and
  every worktree row carries `upstreamAhead` — its branch's commits ahead of THAT branch's own upstream, 0 with no
  branch, no upstream, a gone one or a failed read (REQ-WORKSPACE-029's zero), and never the row's base-branch `ahead`
  (REQ-GIT-085) (`GitWorktreeRowSchema`, `packages/contracts/src/repository.ts`). `branchStripItem`
  (`packages/ui/src/GitView.tsx`) finds the focused session's worktree branch among the rows and draws it exactly as a
  base branch is drawn: ` ↑{n}` from that count, and the tooltip "Branch this workspace is on: {branch}." / "…, 1 commit
  ahead." / "…, {n} commits ahead."; only its accessible description adds "It belongs to the isolated worktree the active
  run is using, not to the folder this window is open on." (`WORKTREE_BRANCH_NOTE`), carried as the strip item's new
  `description` (`packages/ui/src/composer.ts`, drawn by `packages/ui/src/StatusStripItem.tsx`). Before the first read, or
  with the tree not listed, the count is 0. The base checkout's tooltip and description stay one string.
- Pinned by `ui.test.ts` (the worktree branch's marker at 1 and 2, none with no upstream though the base is ahead, the base
  sentences, the description with the worktree clause, the base item's description equal to its title), `composer.test.ts`
  and `StatusStripItem.test.ts` (the tooltip and the description drawn apart only for the worktree branch), each failing
  without the change, and `view.test.ts` (a worktree branch pushed with an upstream and two commits reads `upstreamAhead` 2,
  one with no upstream 0 though 1 ahead of main, a detached tree 0; the parser over every tracking form). Shown by `pnpm
  git-proof`: launch 3 (the isolated run) draws `rotaris/session/<sid>` with no marker, the base sentence as its title and the
  worktree in its description, where the base checkout is 1 ahead of its own upstream; the new launch 3b (`worktree-ahead`)
  pushes the session branch with an upstream, commits in the worktree, reopens the session through the browser, and reads
  `rotaris/session/<sid> ↑1` with the title "Branch this workspace is on: rotaris/session/<sid>, 1 commit ahead." and that
  sentence plus the worktree clause as `aria-description`.
- **Still open on the owner:** [OQ-193](../../architecture/open-questions.md) ("What does the status strip's branch item show
  on a detached HEAD, outside a repository and before the first read"), unchanged by this repair.

## Status (2026-10-03, fin11) — partly fixed; open on OQ-193 and on the worktree finding

- **Fixed: the icon.** The item draws Phosphor's `ph-git-branch` before the branch name (`icon` on `StripItem`,
  `packages/ui/src/composer.ts`; drawn by `packages/ui/src/StatusStripItem.tsx`), coloured by the `--rt-accent` token
  (`.status-strip__icon`, `shell.css`), so a theme change re-renders it with every other token (REQ-SHELL-042,
  REQ-WORKSPACE-020). Only where the item shows a branch name: the detached, non-repository and unread states carry words
  and no icon. The mockup draws the glyph in tertiary there; the specification's accent governs.
- **Fixed: the full stop.** The base checkout's three sentences end with REQ-WORKSPACE-020's stop: "Branch this workspace is
  on: main.", "…, 1 commit ahead.", "…, {n} commits ahead." (`branchStripItem`, `packages/ui/src/GitView.tsx`). The reading:
  REQ-SHELL-042, which owns the item, leaves the wording to the implementation, and REQ-GIT-122's backticked form with
  `commit(s)` is a template (REQ-SHELL-044 forbids rendering `(s)` as written); both are recorded in OQ-193.
- Pinned by `composer.test.ts` (the icon on a branch name only), `ui.test.ts` (each sentence with its stop) and
  `layout-regression.test.ts` (the accent token), each failing without the change; shown by `pnpm git-proof` (the item reads
  `main ↑1`, one `i.ph-git-branch.status-strip__icon`, title and description "Branch this workspace is on: main, 1 commit
  ahead."; no icon with no git or in a plain folder) and `pnpm layout-proof` section 7 (the icon's computed colour equals
  `--rt-accent`'s, `oklch(0.59 0.16 292)`, and it stands before the label). Since fin11 the branch name is also shortened
  from the middle (`docs/defects/fixed/the-status-strips-workspace-path-elides-at-its-end-not-its-middle.md`), only while
  the item shows a branch name and only once the path beside it has given up its width; the state words are never cut.
- **Open on the owner:** [OQ-193](../../architecture/open-questions.md) ("What does the status strip's branch item show on a
  detached HEAD, outside a repository and before the first read"). The build proceeds under REQ-GIT-161's words; that text
  is untouched.
- **Open, recorded above:** the worktree branch's ahead marker and sentence (size M, not repaired in fin11; fixed by the
  acceptance repair F8, status above).

## Specs

- REQ-SHELL-042, REQ-WORKSPACE-020: the branch icon in the accent colour, re-rendered on a theme change; the tooltip's exact
  sentences.
- REQ-GIT-122, REQ-GIT-161 against REQ-WORKSPACE-020: what the item shows on a detached HEAD or outside a repository — a
  disagreement for an open question when the item is repaired.

## Relevant files

- `packages/ui/src/GitView.tsx`: `branchStripItem`, the item's text, tooltip and state.
- `packages/ui/src/composer.ts`: `stripItems` places it (`strip-branch`); `packages/ui/src/AppShell.tsx` draws it.
- `apps/desktop/scripts/git-proof.mjs`: reads `strip-branch`'s text (`main ↑1`; the worktree branch in launches 3 and 3b).
- `packages/workspace/src/git/view.ts`: `parseUpstreamAhead`, each worktree row's `upstreamAhead`.

## Ruled as built — 2026-10-06 ([R-071](../../product/requests.md#r-071)); closed

The owner kept the visible words and tooltips as built and amended REQ-WORKSPACE-020 to match them, keeping the tooltip's full stop and the singular or plural commit wording (OQ-193, ruled in [`open-questions.md`](../../architecture/open-questions.md); [`PD-WORKSPACE-007`](../../product/directives.md#pd-workspace-007) narrows REQ-WORKSPACE-020 and REQ-GIT-122). The icon, the full stop and the worktree branch were repaired as recorded above; the detached, non-repository, no-git and unread states are now the rule. Nothing is changed in the code.
