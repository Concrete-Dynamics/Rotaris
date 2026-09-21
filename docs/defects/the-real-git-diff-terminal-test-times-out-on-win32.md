## The real `git diff` terminal test times out instead of exiting 1

`packages/agent-tools/src/terminal/terminal.test.ts` — "a real diff-with-differences reads success, not
shell_failure, end to end" — drives `git diff --no-index -- a b || true; git diff --no-index -- a b`
through a real PTY with a 15-second tool timeout and asserts `exit_code === 1`. On this machine it reads
**124**, the timeout code: the command never returns within its window.

```
AssertionError: expected 124 to be 1
 ❯ packages/agent-tools/src/terminal/terminal.test.ts:309:39
```

Reproduced on `main` at `1c985f7` and on the `feat-instructions-toggle` branch, with the file run alone
rather than under full-suite parallelism, so it is not the load flake the other real-PTY reds belong to.
The likely cause is the pager: `git diff` with differences and no `--no-pager`/`GIT_PAGER=cat` opens
`less` in an interactive terminal, and a PTY is interactive, so the command waits for a keystroke that
never comes. That is consistent with the exit code, with the second half of the test (`findstr`/`grep`,
which pages nothing) never being reached, and with the test having passed when it was written against
whatever git configuration the author's machine carried.

What this does **not** call into question is the behaviour the test was written for: `classify.ts`'s
`successExitOne` carve-out is asserted purely elsewhere in the same file and those assertions pass. What
is unverified is the end-to-end half — that a real shell's exit 1 arrives at the classifier at all.

## Specs

`REQ-TOOLS-112` test 4, under the ESC-41 carve-out recorded in
[`git-diff-with-differences-read-as-a-failure.md`](git-diff-with-differences-read-as-a-failure.md). The
requirement is not contradicted; its end-to-end evidence is. `REQ-TOOLS-099`'s timeout behaviour is what
the test is accidentally measuring instead.

## Relevant files

- `packages/agent-tools/src/terminal/terminal.test.ts` — the failing case, around line 305.
- `packages/agent-tools/src/terminal/classify.ts` — `successExitOne`, the behaviour under test.
- `packages/agent-tools/src/terminal/foreground.ts` — the PTY the command runs in, and the environment it
  is given; a repair probably belongs here or in the test's command rather than in the classifier.

Noticed 2026-09-22 while running `pnpm check` for `PD-WORKSPACE-002`; pre-existing on `main`, not
repaired here.
