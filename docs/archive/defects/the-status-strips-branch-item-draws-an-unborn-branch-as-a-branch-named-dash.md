## The status strip's branch item draws an unborn or unreadable branch as a branch named `—`

In a repository whose branch has no commit yet (a fresh `git init`), or whose branch read fails for another reason, the
status strip's branch item draws the branch icon, the text `—`, and the tooltip and accessible description "Branch this
workspace is on: —.", as if `—` were the name of a branch.

How it gets there: the Git view's snapshot reads the branch with `git rev-parse --abbrev-ref HEAD`
(`packages/workspace/src/git/view.ts`), which exits 128 on an unborn branch ("ambiguous argument 'HEAD': unknown
revision", checked 2026-10-06 in a fresh `git init`), so the snapshot carries `branch: null` with `detached: false` and
`isRepository: true`. `branchStripItem` (`packages/ui/src/GitView.tsx`) then falls through to `named(state.branch ?? '—',
state.ahead)`, which returns `{ text: '—', state: 'branch', title: 'Branch this workspace is on: —.', description: 'Branch
this workspace is on: —.' }` (a throwaway probe test, removed afterwards, received exactly that), and `stripItems`
(`packages/ui/src/composer.ts`) adds the `ph-git-branch` icon for state `branch`. A failed branch read in a repository on a
named branch takes the same path. Nothing in the test suite pins this state: `ui.test.ts` covers the detached,
non-repository, no-git and unread items, and a branch name, but not `branch: null` with `detached: false`.

Noticed 2026-10-06 by the verifier of fin20's confirm-as-built round (OQ-193), and recorded by its repair. Not repaired
there: the round changes no product code, and OQ-193's ruling (the owner kept the visible words and tooltips as built for
the detached, non-repository, no-git and unread states) does not name this state.

## Specs

- REQ-WORKSPACE-020: the item "SHALL render as empty text — no icon, no arrow, no tooltip — exactly when the snapshot's
  branch name is empty, which per REQ-WORKSPACE-029 covers … an unborn branch". `PD-WORKSPACE-008` narrows that clause for a
  detached HEAD, a non-repository, Git unavailable and the state before the first read only, and says every other clause
  still governs and that the branch icon "stands before a branch name only"; the unborn branch is still governed by the
  empty-item clause, and the build draws an icon, a placeholder and a tooltip there.
- REQ-WORKSPACE-029: the snapshot's branch name is empty for an unborn branch; the build's snapshot agrees (`null`), the
  departure is the strip's.
- REQ-GIT-161 and REQ-GIT-122: the tooltip's sentence presents `—` as a branch name, which none of them gives.

## Relevant files

- `packages/ui/src/GitView.tsx`: `branchStripItem`, its last line (`named(state.branch ?? '—', state.ahead)`).
- `packages/ui/src/composer.ts`: `stripItems`, the icon for state `branch`.
- `packages/workspace/src/git/view.ts`: the branch read (`rev-parse --abbrev-ref HEAD`), `branch` null on a failed read.
- `packages/ui/src/ui.test.ts`: the branch item's cases, none for this state.
- `docs/product/directives.md` (`PD-WORKSPACE-008`), `docs/architecture/open-questions.md` (OQ-193's ruling).

## Outcome

Repaired 2026-10-06 (fin22, bundle `fin22-window-strip-config`). The words come from REQ-WORKSPACE-020 and REQ-GIT-161, and
OQ-193's ruling (`PD-WORKSPACE-008`) names neither state, so no question was left open: an unborn branch (REQ-WORKSPACE-029's
empty branch name) and a branch that could not be read (REQ-GIT-161's "empty value of REQ-GIT-112") are REQ-WORKSPACE-020's
empty item. `branchStripItem` (`packages/ui/src/GitView.tsx`) answers state `empty` with no text, no tooltip and no
description where a repository's snapshot carries no branch name and no detached HEAD; `stripItems` draws the branch icon
for state `branch` only, so none is drawn; and `StatusStripItem` (`packages/ui/src/StatusStripItem.tsx`) draws no `title`
and no `aria-description` for an empty string, rather than empty attributes. The item keeps its accessible name, "Checked-out
branch". The detached, non-repository, no-git and unread states are unchanged.

Pinned by `packages/ui/src/ui.test.ts` ("an unborn branch, or a branch that could not be read, is the empty item") and
`packages/ui/src/StatusStripItem.test.ts` ("the empty item … draws no text, no icon, no tooltip and no description"), both
failing on the previous code. Shown by `pnpm git-proof`'s new launch 6c (`unborn-branch`): a fresh `git init` outside the
repository, whose strip item is `[data-branch-state="empty"]` with empty text, no `ph-git-branch` icon, and no `title` or
`aria-description` (`results.unbornBranch`; the photograph `unborn-branch.png` shows the strip with the path and no branch
item text).
