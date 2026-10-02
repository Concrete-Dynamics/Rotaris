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
client's repair ([`fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md`](fixed/the-scripted-client-places-a-root-resumed-before-its-first-reply-as-a-fresh-agent.md)),
whose worktree had the longer name. Not repaired here.

## Specs

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
