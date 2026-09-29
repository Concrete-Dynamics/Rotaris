## A POSIX command that fails to expand loses its end marker and reads as still running

On a POSIX host the terminal tool wraps a command as `printf start; <command>; printf end:$?` with nothing guarding
the command itself. When `/bin/sh` (dash on this host) meets an expansion it cannot perform — `${PIPESTATUS[0]}`, a
bash-ism — it aborts the whole line with `Bad substitution`, the end marker is never printed, and a command that
finished in about 0.1 s is reported after the 30 s no-output window as a soft pause, "The command is still running…",
exit code `-1`. The PowerShell branch of the same wrapper already guards against exactly this (a `try` that "keeps a
terminating error from eating the end frame"). The tool description names only Windows' shell and never says the POSIX
shell is `/bin/sh`, so a model writes bash.

Live-run finding: L1 (live runs of 2026-09-29)

## Specs

- `REQ-TOOLS-097` / `REQ-TOOLS-098`: a soft pause is for a process that keeps running; this one had exited.
- `REQ-TOOLS-179`: the observation carries the command's own exit code, not `-1`.

## Evidence

- Pack `.live-run/runs/2026-09-29T02-41-56-779Z/` (the sweep worktree; git-ignored), session `ccc662d9` (`edit`), tool call #36: `… node --test src/todos.test.js 2>&1 | tail -45; echo
  "EXIT=${PIPESTATUS[0]}"` — 30,155.9 ms, `outcome_kind` `soft_pause`, `exit_code` -1; the captured output ends
  `ℹ duration_ms 95.9`, `/bin/sh: 5: Bad substitution`. Session `360c8ac1` (`requirements`) #59 the same shape, 30,167 ms,
  `/bin/sh: 11: Bad substitution`. 60.3 s of dead wait for two commands of about 0.1 s.
- Recurred in the duress run, pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`, tool call #88 (child `b`): `echo "EXIT=${PIPESTATUS[0]}"`,
  30,279 ms, soft pause, exit code -1.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts:205` — `wrapCommand`'s POSIX branch, no guard; the PowerShell twin's
  guard at `:176-184`.
- `packages/agent-tools/src/terminal/index.ts:58` — the POSIX shell is `/bin/sh` when it exists.
- `packages/agent-tools/src/terminal/index.ts:257` — the tool description, which names only Windows' shell.

## Repaired — 2026-09-29 under R-067

The POSIX wrapper now runs the command as `command eval '<command>'` (`wrapCommand` in
`packages/agent-tools/src/terminal/foreground.ts`; a multi-line command through the same `printf '%b'` carrier as
before). Plain `eval` is no guard: an error inside a special built-in abandons the line the same way, measured under
dash and under bash in POSIX mode. POSIX's `command` removes a special built-in's special properties, so an expansion
error, a syntax error or an unterminated quote becomes that utility's own nonzero status (2 under dash), and the shell
goes on to print the end frame. It is the posix twin of the PowerShell branch's `try`. A trailing `# note` no longer
comments the end frame out either. The command still runs in the session's own shell, so what it sets persists. The
tool description names the shell the host runs (`terminalDescription`, `packages/agent-tools/src/terminal/index.ts`):
`/bin/sh`, a POSIX shell that may not be bash, with the bash-isms that may be missing — where it named only Windows'.
ADR-0020's reading that the single-line path needed no guard is falsified and kept in place beside its replacement.

**Pinned by** `terminal.test.ts`: "REQ-TOOLS-097/098/179 (live-run L1): a command sh cannot expand or parse ends with
its own exit status, never a soft pause", against the host's real `/bin/sh` (dash) through a real PTY. It failed
before the change with `soft_pause` for `echo "EXIT=${PIPESTATUS[0]}"`; it covers the process substitution and the
unterminated quote too, and that the line's `export` before its error persists. "REQ-TOOLS-104 (live-run L1): the
description names the shell the host runs …" pins the description. The live run's `terminal` scenario gained the
shape `unexpandable` (POSIX only), the recorded bash-ism itself. On the built branch against `katalyst` (pack
`.live-run/runs/2026-09-29T21-26-58-720Z` of the `fix-terminal-output` worktree; git-ignored) it ended in 14 ms as
`shell_failure`, exit 2, its output `ran` and `/bin/sh: 1: eval: Bad substitution`; no end marker reached the model;
the `edit` scenario's six terminal calls all ended with their own status, none soft-paused. 42 checks passed, none
failed. Repaired 2026-09-29 under R-067.
