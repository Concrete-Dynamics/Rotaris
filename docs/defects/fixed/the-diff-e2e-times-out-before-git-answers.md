## The `git diff` end-to-end case times out before git answers on this machine

`packages/agent-tools/src/terminal/terminal.test.ts` — "a real diff-with-differences reads success,
not shell_failure, end to end" — fails with `expected 124 to be 1`: the tool's own hard timeout
killed `git diff --no-index -- a b` at the case's `timeout: 15`, so the classification the case
exists to assert (exit 1 carries the payload → `success`, ESC-41's carve-out) is never reached.

Reproduced in isolation (`vitest run terminal.test.ts -t "diff-with-differences reads success"`,
19.5 s to the 124), and reproduced identically on clean `main` (`5ba937a`, detached worktree, no
changes from this branch), so this branch did not introduce it. The neighbouring multi-line case
failed once under the full suite (a `DOSKEY` notice from shell init leaking into the capture) and
passed in isolation — that one is load flakiness; this one is not, it fails alone.

**The cause is not established, and this note does not guess at one.** Candidates: process spawn
inside conpty is slow on this machine (other git cases in the same suite take 5–21 s), so 15 s
may simply be short here; or the first `git diff --no-index` in a fresh PTY session pays a cost
a warm shell does not. What is NOT a candidate is the ESC-41 carve-out itself — the run never got
far enough to classify anything.

## Specs

`REQ-TOOLS-112` test 4 under ESC-41 (the carve-out this case proves); `REQ-TOOLS-097/099` (the
hard timeout that fired). No requirement fixes the case's 15 s budget — it is a test constant,
not a product figure.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the case (line ~305), its `timeout: 15`.
- `packages/agent-tools/src/terminal/classify.ts` — `successExitOne`; unreached in this failure.

Noticed 2026-09-18 while verifying the `plan_cycles` cascade branch (`pnpm check` red in
`terminal.test.ts` alongside the one genuine pin this branch owed in
`packages/workspace/src/improvements/handles.test.ts`). Not repaired here: the terminal is not
this branch's area, and raising the budget without knowing which side is slow would be guessing.

**Repaired 2026-09-22**, with
[`the-real-git-diff-terminal-test-times-out-on-win32.md`](fixed/the-real-git-diff-terminal-test-times-out-on-win32.md),
which is the same failure seen twice. Of the two candidates this note refused to choose between — a slow
spawn inside conpty, or a cost the first `git diff` pays in a fresh PTY — neither was it. The cause is the
pager: git starts one because a pseudo-terminal is a tty, and `less` under `TERM=dumb` waits for RETURN.
The 15 s budget was never short; the command was never going to return. `NO_PAGER` in
`packages/agent-tools/src/terminal/foreground.ts` is the repair, and the budget is left as it stands.
