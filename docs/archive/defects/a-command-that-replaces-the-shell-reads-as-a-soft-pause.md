## A command that replaces the session's shell reads as a soft pause, and the shell stays replaced

A foreground `terminal` call whose command replaces the shell (`exec bash`, `exec zsh`, any `exec <program>` that
does not return) never prints the wrapper's end frame: the rest of the wrapped line belonged to the process that
`exec` replaced. The call therefore waits out the no-output window and returns a soft pause, exit −1, "The command is
still running", for a command that finished at once. The replacement then stands for every later call in the session:
they run under the new program, not under the shell the tool description names (REQ-TOOLS-104 on Windows; on other
hosts, the POSIX shell the description has named since live-run L1's repair). This is the same class as L1 (a line
the shell abandons loses its end frame) by another road, and it predates that repair.

Noticed 2026-09-29 in the verifier's live run of the `fix-terminal-output` branch (pack
`.live-run/runs/2026-09-29T22-08-13-005Z` of that worktree, git-ignored; session `ca68aeb1`, `terminal` scenario). The
new POSIX description ("the shell is /bin/sh … may not be bash") led the model to check `$0` (call #4) and then send
`exec bash` with `reset: true` (call #5). It returned after 30,027 ms with `outcome_kind` `soft_pause`, exit −1 and
`session_reinitialized` true. Calls #6 onward ran under bash, and the recorded bash-ism (call #8) expanded there.
Recorded, not repaired.

## Specs

- `REQ-TOOLS-097` / `REQ-TOOLS-098`: a soft pause is for a command still running with no output for 30 seconds; here
  the command had already ended and the observation says it may still be running.
- `REQ-TOOLS-104`: the description states the shell commands run in. After an `exec` it no longer does, and nothing
  tells the agent so. Whether the tool should refuse or warn about a command that replaces the shell, or the
  description should say the shell must not be replaced, is not stated anywhere.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`: `wrapCommand`'s POSIX branch (`command eval` then the end
  frame's `printf`), which an `exec` never returns to.
- `packages/agent-tools/src/terminal/index.ts`: `terminalDescription`, the text that names the host's shell.

## Repaired — 2026-09-30 under R-067

**Confirmed first on the branch** (`fix-accept1-8`, from `origin/main` 7ae9d9e), through a real PTY against `/bin/sh`
(dash) with a 3 s no-output window: `exec sh` returned after 3,013 ms as `soft_pause`, exit −1, and the next call's
`/proc/$$/cmdline` read `sh` where the session's shell reads `/bin/sh -i`.

**Whether a command may replace the shell, and what the call then answers, is not stated anywhere, so it is
[OQ-144](../../architecture/open-questions.md), and the build proceeds under the reading recorded there.**
- `ForegroundSession` (`foreground.ts`) keeps the identity of its shell — the executable and argument vector of the
  process behind its pid, read from `/proc` (`processIdentity`) each time the shell answers one of the product's own
  lines. A fresh shell answers one no-op line before its first command, so that there is one to compare with. A shell
  that does not answer that line within 15 s, a shell busy with a soft-paused command, and a host without `/proc`
  leave the call unwatched.
- While a call runs, the session compares the process behind the pid with that identity every 200 ms. A different
  process ends the call: the program is ended with its tree, and the session restarts on its shell with PD-TOOLS-001's
  snapshot re-applied, as after a hard-timeout reset.
- The call is REQ-TOOLS-103's failure before completion (`index.ts`): `execution_error` at `error`, `ExecutionError`, no
  exit code, `kill_status` `session_reset`. The detail says the command replaced the session's shell, that the session
  was restarted with the shell this tool runs commands in, what was restored, and to run the program without `exec`.
  `exec` with redirections alone keeps the process and is an ordinary command.
- The POSIX tool description now says not to replace the shell with `exec <program>`, and what such a call meets on
  the host: on Linux that it fails and the shell is restarted, elsewhere that it reads as still running.
- Not reached: macOS, which has no `/proc` (the watch is off there, IC-3), an `exec` of exactly the shell's own
  executable and arguments, and an `exec` inside a command that has already soft-paused.
  *Added 2026-10-14 by fin46 (`fin46-accept1-15`):* also a program in the shell's place that runs with an empty argument
  vector of its own (an `execve` with argc 0, which a program the command `exec`s may make) on a Linux kernel before 5.18,
  where its `cmdline` reads empty and, since fin45's exiting-shell rule, reads as no identity; from 5.18 the kernel gives it
  one empty argument and the watch sees it
  ([`processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched`](processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched.md)).

**Pinned by** `terminal.test.ts`, "REQ-TOOLS-097/098/103/104 (OQ-144, acceptance A9): a command that replaces the
session's shell ends at once as an execution_error …", red before the change (the soft pause above). It now ends in
about 215 ms, the next call reads `/bin/sh -i` again, and an exported variable set before the `exec` survives. It also
pins that `exec 3>/dev/null` stays an ordinary success. "OQ-144: a process's identity …" pins `processIdentity`, and the
description case pins the new sentence.

**Shown live.** The `terminal` scenario now replays the live run's own `exec bash` (shape `replaces-shell`, ahead of
`unexpandable`, `replacedShellReading` in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned in
`terminal-shapes.test.ts`). On the built branch against `katalyst` (pack `.live-run/runs/2026-09-30T16-26-00-575Z` of the
`fix-accept1-8` worktree, git-ignored) the model ran it as asked. The call ended in 242 ms as `execution_error`, no exit
code, `kill_status` `session_reset`. The bash-ism that followed was refused by `/bin/sh` (`shell_failure`, exit 2,
`Bad substitution`, 153 ms), where the verifier's run had seen bash expand it. All the scenario's checks passed. Repaired
2026-09-30 under R-067.

**Fix round 1 (acceptance round 1's verifier).** The first form of this repair lost a cancel and a kill that landed
during the fresh shell's no-op line, because that line is awaited before the call's own abort listener and kill
handler existed: the cancel never fired (an `AbortSignal` already aborted does not deliver `abort` to a listener added
later) and the command ran to its end, and after a kill the command was written to the PTY the kill had just ended.
The round trip now carries the call's signal and reports a kill; a cancel or a kill on it ends the call before its
command is written, as a cancelled call (124, `session_reset`) or a killed one (−1, `session_reset`), and the PTY is
re-taken after the round trip. Pinned by the two cases "… (OQ-144, acceptance round 1): …" in `terminal.test.ts`,
over a real PTY whose fresh shell takes a second to start: red before (5,097 ms and 6,330 ms, the command having run
or waited out its timeout), green after (each under 1.5 s, the command never run). The description's consequence is
now stated per host, since only Linux has the watch.

**Fix round 2 (acceptance round 1's second verifier).** The cancel case's fresh shell now takes three seconds to
start, not one: with one, the check made after the handshake also ended the call inside the 1.5 s bound, so the case
passed with the signal taken off the handshake (measured: 3,027 ms and red with it off, green with it on). The Linux
sentence of the description says such a call *normally* fails, since the watch is off where the handshake went
unanswered or a soft-paused command holds the shell. The live-run `terminal` scenario credits the restart only when
the bash-ism after `exec bash` came from the same agent (each agent has its own foreground session, REQ-TOOLS-187); in
the pack `2026-09-30T16-57-00-416Z` they came from two agents and the check had passed without observing a restart,
which is now a NOTE. `AGENTS.md`'s `terminal` row names the shape and its checks.
