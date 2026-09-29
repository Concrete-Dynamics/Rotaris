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
