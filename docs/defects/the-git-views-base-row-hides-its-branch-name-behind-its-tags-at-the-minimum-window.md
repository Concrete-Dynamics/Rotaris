## The Git view's base row hides its branch name behind its tags at the minimum window

At 1000×680 the worktree table's Branch column has 9ch (68.7 px), and the base row's Branch cell spends it on its two
tags, `base` and `active`, which never shrink (`.git__cell-branch .tag { flex: 0 0 auto; }`): the branch name `main` is
left zero pixels, so not one character of it and no ellipsis is drawn; `base` is drawn whole (154.9 to 195.5 px in a cell
ending at 201.6) and `active` lies wholly past the cell's edge, so it is not drawn either. The
name is in the span's tooltip and the row's title carries the path, but on screen the row that is the workspace's own
checkout does not say which branch it is on. Measured 2026-10-04 by `pnpm git-proof` launch 3b
(`worktree-ahead-minimum.png`; `main` laid out at 146.9 to 175.7 px with its visible span 146.9 to 146.9) while fin14
repaired the State cell. A non-base row's name elides with its marker as UIR-002 intends; only a row carrying tags loses
its name whole. Not repaired: which gives way first at the minimum, the name or the tags, is a choice the design material
makes (it draws the name whole beside one tag and has no minimum-width rendering of this table), not a CSS nudge.

## Specs

- None directly: REQ-GIT-077 names the base and active markers and REQ-SHELL-022 states labels rendered in full at the
  minimum window only for the labels it lists. It is a craft defect against the adopted design language's elision, which
  shortens text with a marker and keeps the full text in the tooltip (`docs/design/README.md`; UIR-002 in shell.css).

## Relevant files

- `packages/ui/src/shell.css`: `.git__cell-branch` (a flex box), `.git__cell-branch .tag { flex: 0 0 auto; }` and the worktree table's minimum width.
- `packages/ui/src/GitView.tsx`: the Branch cell — the name span, then the `base` and `active` tags.
- `apps/desktop/scripts/git-proof.mjs`: launch 3b measures the table at 1000×680; Branch is an eliding column there, so a cut name is no finding.
