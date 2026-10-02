## The session browser's table pushes each row's Open out of its dialog under a long workspace path

The Sessions dialog (`SessionBrowser`) lays its table out at its content's width and scrolls it sideways inside the
dialog. The Session column carries the workspace path, which wraps only at its hyphens (never at a slash), so the longest
unbroken run in the path sets that column's least width. With a long enough run the Branch and Updated columns are
pushed right and the Actions column (`Open`, `Actions`) leaves the dialog's visible width: in the 1440 × 900 window the
proofs open, the Open button stood at the dialog's right edge with none of its face showing.

Measured 2026-10-01, built app as root under Xvfb, `checkpoint-proof`'s profile, the four sessions of its scenario 9:

- From `/home/user/Rotaris-crw-wt-fin2-harnessdoubl/…` (the unbroken run `harnessdoubl/.proof/checkpoint-` is 31
  characters), each row's Open is fully clipped: only its left border shows at the dialog's edge. The proof's capture
  clicks the centre of the row's first button, which lands on nothing, so the session is never loaded, the run is
  never started, and scenario 9 fails with "the loaded session's run never ended with its lock released" — three runs
  out of three.
- From `/home/user/Rotaris-crw-wt-fin2-hd-baseline1/…` (the run `baseline1/.proof/checkpoint-`, 28 characters), the
  same build of `origin/main` 1a58b94 shows the button's first letter, the click loads the session, and the proof
  passes; it also passed from `/home/user/Rotaris-crw-wt-fin2-hd-base/…`.

So whether the button can be pressed depends on how the workspace's directory is named. A person can still scroll the
table sideways; the defect is that the dialog's one primary row action starts out of view, and a path a little longer
again hides it from a user too. The proof's own click is part of the shape: it presses a button's centre without
checking that the centre is inside the scrolled table's visible box.

Noticed 2026-10-01 under the fin2 harness bundle, while running `checkpoint-proof` as a neighbour of the scripted
client's repair ([`the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`](the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md)),
whose worktree had the longer name. Not repaired here.

## Outcome — repaired 2026-10-02

Classified as fixable within the specification: REQ-SHELL-022 asks for every control reachable, and the specification fixes
nothing about how the browser's cells wrap, so the adopted design language decides (docs/design/README.md §2, §7). The
mockup draws no Sessions dialog; its nearest table (the Library sessions drawing) is `.table` at `width: 100%` with the
workspace in the mono face, and the dialog keeps both. No ruling was needed.

Confirmed on `fin4-late-notes` before the change, in the built app at 1440 × 900 under Xvfb:

- `checkpoint-proof` from a scratch worktree at `/home/user/Rotaris-crw-wt-fin4-sessionbrowserlongpath` (the run
  `sessionbrowserlongpath/.proof/checkpoint-` is 41 characters), on `origin/main` 22fbe5e: scenario 9 failed with "the
  loaded session's run never ended with its lock released", as the note describes; every scenario before it passed.
- Driven (`pnpm app:drive`) on a workspace whose path holds a 111-character run, one stored session: the table 1123 px
  wide in the 878 px scroll box, the row's Open at x 1279–1328 against the box's right edge at 1160 — wholly out of view.

Measuring found a second column with the same shape: the Branch cell was `white-space: nowrap`, and a worktree session's
branch is `rotaris/session/<uuid> · <status>`. With only the path made breakable, that cell kept 477 px and squeezed the
Session column to 88 px. So the repair (`packages/ui/src/shell.css`) makes every cell that carries a path or a branch
break anywhere: `.session-browser__name` and `.session-browser__detail` gain `overflow-wrap: anywhere` (the property the
row's own `.session-browser__unreadable` already used), and the Branch cell's `white-space: nowrap` becomes
`overflow-wrap: anywhere`. A break still falls at a hyphen, a space or a slash where one is close enough; only a run
longer than its column breaks inside itself. No literal value was added; the table stays the design system's `.table`.
A short branch (`main · completed`) beside a long path now takes two lines where it took one: that is the price of a
column whose floor is no longer its text's length.

After, same 111-character workspace: the table 878 px in the 878 px box, no horizontal scroll, Open at x 1033–1083
(also at the 1000 × 680 minimum: Open at 813–863 in a box ending at 940); with the long branch planted in the row, Session
389 px and Branch 176 px, Open unmoved.

Pinned by `packages/ui/src/layout-regression.test.ts` — "keeps each session row's Open inside the Sessions dialog under
a long workspace path": it fails on the unrepaired `shell.css` and passes on the repaired one.

Shown by `checkpoint-proof` run whole from the same long-path worktree on the repaired build (`fin4-late-notes` 2f9bbdc
plus this change, `--skip-build` after `pnpm build`, as root under Xvfb, Node 24, the other plan's agents on the host):
exit 0, scenario 9 (`loaded-restore`) green — the session row found, the restore refused under the planted holder, the
hand edit untouched, the planted lock kept.

Not changed: `ROTARIS_CAPTURE_RESUME` still clicks the centre of the row's first button without asking whether that
point is inside the scrolled table's visible box. With the table bounded the point is inside it; a seam that refused an
invisible target would have named this failure rather than reporting a run that never ended, and is left as it stands.

- `REQ-SHELL-022` — every control reachable and fully labelled at the minimum window size; here the row's Open is not
  even visible at the default size, depending on the path's spelling.
- `REQ-SHELL-126` and `REQ-SESSION-118` — the browser and its Open, which is the user's route to a stored session.

## Relevant files

- `packages/ui/src/SessionBrowser.tsx` — the table, the Session cell with the workspace path, the Actions cell.
- `packages/ui/src/shell.css` — the browser's dialog and table widths.
- `apps/desktop/src/main/capture/seams.ts` — `ROTARIS_CAPTURE_RESUME`, which clicks the centre of the row's first
  button (`centreWhen`, `clickAt`) without asking whether that point is visible.
- `apps/desktop/scripts/checkpoint-proof.mjs` — scenario 9 (`loaded-restore`), where it surfaces; any proof that resumes
  through the browser (`plan-gate-proof`, `resilience-proof`, `part-j-proof`) can meet it from a long enough path.
