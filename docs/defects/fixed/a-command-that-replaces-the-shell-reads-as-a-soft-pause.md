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
[OQ-143](../../architecture/open-questions.md), and the build proceeds under the reading recorded there.**
- `ForegroundSession` (`foreground.ts`) keeps the identity of its shell — the executable and argument vector of the
  process behind its pid, read from `/proc` (`processIdentity`) each time the shell answers one of the product's own
  lines. A fresh shell answers one no-op line before its first command, so there is always one to compare with.
- While a call runs, the session compares the process behind the pid with that identity every 200 ms. A different
  process ends the call: the program is ended with its tree, and the session restarts on its shell with PD-TOOLS-001's
  snapshot re-applied, as after a hard-timeout reset.
- The call is REQ-TOOLS-103's failure before completion (`index.ts`): `execution_error` at `error`, `ExecutionError`, no
  exit code, `kill_status` `session_reset`. The detail says the command replaced the session's shell, that the session
  was restarted with the shell this tool runs commands in, what was restored, and to run the program without `exec`.
  `exec` with redirections alone keeps the process and is an ordinary command.
- The POSIX tool description now says not to replace the shell with `exec <program>`, and what such a call meets.
- Not reached: macOS, which has no `/proc` (the watch is off there, IC-3), and an `exec` of exactly the shell's own
  executable and arguments.

**Pinned by** `terminal.test.ts`, "REQ-TOOLS-097/098/103/104 (OQ-143, acceptance A9): a command that replaces the
session's shell ends at once as an execution_error …", red before the change (the soft pause above). It now ends in
about 215 ms, the next call reads `/bin/sh -i` again, and an exported variable set before the `exec` survives. It also
pins that `exec 3>/dev/null` stays an ordinary success. "OQ-143: a process's identity …" pins `processIdentity`, and the
description case pins the new sentence.

**Shown live.** The `terminal` scenario now replays the live run's own `exec bash` (shape `replaces-shell`, ahead of
`unexpandable`, `replacedShellReading` in `apps/desktop/scripts/lib/terminal-shapes.mjs`, pinned in
`terminal-shapes.test.ts`). On the built branch against `katalyst` (pack `.live-run/runs/2026-09-30T16-26-00-575Z` of the
`fix-accept1-8` worktree, git-ignored) the model ran it as asked. The call ended in 242 ms as `execution_error`, no exit
code, `kill_status` `session_reset`. The bash-ism that followed was refused by `/bin/sh` (`shell_failure`, exit 2,
`Bad substitution`, 153 ms), where the verifier's run had seen bash expand it. All the scenario's checks passed. Repaired
2026-09-30 under R-067.
