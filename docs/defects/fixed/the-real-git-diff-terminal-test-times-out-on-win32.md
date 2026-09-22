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

**Repaired 2026-09-22.** The pager guess in this note is the cause, and it was measured rather than
reasoned: the product's own spawn arguments driven through a real `node-pty` answered

```
__ROT_START__
WARNING: terminal is not fully functional
Press RETURN to continue
```

and then nothing. Git sets its pager up when `isatty(stdout)` is true, which a pseudo-terminal always is,
and `less` under `TERM=dumb` prints that line and waits for a keystroke no agent can send. The end marker
never arrives and the call dies at the hard timeout (REQ-TOOLS-099) whatever the command was going to say.

The repair is in the product, not the test: `NO_PAGER` (`GIT_PAGER=cat`, `PAGER=cat`) joins `TERM=dumb`
in the session's environment, so `git diff`, `git log` and `git show` answer in a session no one can press
RETURN in. `GIT_PAGER` covers git even where a user's `core.pager` names something else.

The test owed a second repair the note did not see: it never created `a` and `b`. Git's exit status for
`Could not access 'a'` is also **1**, so once the pager was gone the case would have passed without a diff
ever being taken. The files are written now and differ on one line, and the case asserts the hunk
(`-two`, `+TWO`) beside the status. Measured: the case passes in **1.84 s**, where it spent 15.7 s reaching
exit 124 before.
