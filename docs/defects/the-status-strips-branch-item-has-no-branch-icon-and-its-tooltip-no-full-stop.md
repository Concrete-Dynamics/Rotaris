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

## Specs

- REQ-SHELL-042, REQ-WORKSPACE-020: the branch icon in the accent colour, re-rendered on a theme change; the tooltip's exact
  sentences.
- REQ-GIT-122, REQ-GIT-161 against REQ-WORKSPACE-020: what the item shows on a detached HEAD or outside a repository — a
  disagreement for an open question when the item is repaired.

## Relevant files

- `packages/ui/src/GitView.tsx`: `branchStripItem`, the item's text, tooltip and state.
- `packages/ui/src/composer.ts`: `stripItems` places it (`strip-branch`); `packages/ui/src/AppShell.tsx` draws it.
- `apps/desktop/scripts/git-proof.mjs`: reads `strip-branch`'s text (`main ↑1`).
