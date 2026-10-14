## A call waiting behind a soft-paused command that ends the shell can read as replacing the shell under load

**Outcome: cause found, repaired 2026-10-14 by fin45 (`fin45-config-and-terminal`).** The diagnosis the waiting call reached
was `replaced`, and `replaced` needs `processIdentity(shell pid)` to read non-null and differ from the shell's identity — which
a shell that only exits can give in one place: its exit. Between the kernel releasing an exiting process's memory and the
process's reaping, `/proc/<pid>/exe` can still be read while `/proc/<pid>/cmdline` reads empty (the argument vector lived in
the released memory), and `processIdentity` joined the two into `"/usr/bin/dash\0"`, a "program" other than the shell. The
waiting call's replacement watch (`REPLACED_WATCH_MS`, every 200 ms) reads the shell's identity while the call is active; when
one of its readings fell inside that window — rare when idle, more likely when a loaded host preempts the reader between its
two reads — the call resolved `replaced` before node-pty reported the shell's exit, the session was reset as for an `exec`,
and the paused command ahead was closed by that reset ("when the terminal session was reset, with no exit code"), which is
the note's pair of contradicting sentences. Measured on this host (load about 1): reading 300 exiting `bash -c` children in a
tight loop, the first reading that was not the process's own was "executable readable, argument vector empty" in 122 and
"gone" in 178. The same window was open to any call whose own command ends the shell (`exit 3` without a soft pause): its
watch is armed too, and it could be told it replaced the shell rather than ended it.

The repair (`packages/agent-tools/src/terminal/foreground.ts`, `processIdentity`): an empty argument vector reads as no
identity, as a process that has gone does. The shell is started with an argument vector (`posixShellArgs`), so an empty one is
the exiting shell's, never another program. Nothing else changed: `null` already meant "keep watching", and the shell's exit
then reaches the call through node-pty (`shellExited`), which gives OQ-144's and OQ-164's readings.

Pinned by `packages/agent-tools/src/terminal/terminal.test.ts`, "OQ-144 / OQ-164: a process on its way out reads no
identity, never another program's" (60 `/bin/sh` children, each read from its start to its end with the event loop held so
none is reaped early; red before the repair with dozens of `"/usr/bin/dash\u0000"` readings in one run, green after). The
note's own case ("a soft-paused command that ends the shell ends a call waiting behind it as never run …") passed five times
in a row under four busy loops beside it (load average 4.7 on four CPUs at the end), and all 151 terminal cases pass. No
proof drives a soft-paused command that ends the shell; the live run's `ends-shell` shape (an `exit 3` the model runs) now
reads a detail saying the shell was REPLACED as its own kind, `replaced`, and fails on it
(`apps/desktop/scripts/lib/terminal-shapes.mjs`, `endedShellReading`; the live run's check "a command that ended the shell
did not read as replacing it"), where it was a NOTE ("met neither a respawn nor a pause"). ADR-0020's report-back of 2026-09-30, which read any identity other than the shell's as a different
process, carries the falsified reading beside its replacement since 2026-10-14 (the fin45 reviewer).

A terminal call made while a soft-paused command is still running waits behind it (OQ-164). When that command ends the
session's shell, the waiting call never ran — the shell that would have read it is gone — and the tool reports it so: "the
session's shell ended before the command ran (a soft-paused command ahead of it ended the shell), so the command never ran"
(OQ-144's shell-exit case). Under load the same call was once told the opposite: that it had itself replaced the shell. In
`pnpm check` on `d42bbac` (fin44's landing gate, load average about 5 on four CPUs, a sibling plan's gate beside it),
`terminal.test.ts`'s "REQ-TOOLS-098/100/103 (OQ-144, OQ-164): a soft-paused command that ends the shell ends a call waiting
behind it as never run, …" received, for the call behind `sleep 2; exit 4`: "This command was submitted while the soft-paused
command `sleep 2; exit 4` was still running, and waited behind it: that command ended 1.0 seconds after this command was
submitted, when the terminal session was reset, with no exit code. Terminal execution failed before completion: the command
replaced the session's shell (as `exec <program>` does), so the command never returned and has no exit code. …" — the waiting
call blamed for an `exec` it never made, and its own words contradicting the sentence before them. The same case passed alone
at once (2 passed, load about 5). Not reproduced on demand; the cause — which of the two diagnoses `foreground.ts` reaches when
the shell's exit and the queued call's dispatch fall close together — is not identified. Noticed 2026-10-14 by fin44's reviewer
(`fin44-supervision-and-match`) at its landing gate; recorded, not repaired (outside the bundle's tasks).

## Specs

REQ-TOOLS-098, REQ-TOOLS-100 and REQ-TOOLS-103, with OQ-144 (a command that ends the session's shell) and OQ-164 (a call that
waits behind a soft-paused command), as the case's own title cites them: a line the shell never read is reported as never run.
An agent told it replaced the shell may drop `exec` from a command that had none, or retry a command that never ran under a
different belief about why.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the diagnosis of a call that waited behind a soft-paused command: the
  "shell ended before the command ran" sentence and the "replaced the session's shell" sentence.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the case that met it under load (about line 1889).
- `docs/defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md`,
  `docs/defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md` — the repairs this case pins.
