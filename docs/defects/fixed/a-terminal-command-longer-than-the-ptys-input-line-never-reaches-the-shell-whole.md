## A terminal command longer than the PTY's input line never reaches the shell whole, and reads as still running

On a POSIX host the terminal tool carries every command to the session's shell as ONE physical line (ADR-0020's
one-physical-line carrier): `printf '%s\n' '<start>'; command eval "$(printf '%b' '<escaped command>')"; printf
'<end>:%s\n' "$?"`, written with a trailing CR. The shell runs with its line editor off, so it reads that line through
the pseudo-terminal's canonical-mode line discipline, and that discipline caps one input line: on Linux, after 4,095
characters "any input data … up to (but not including) any terminating newline is discarded" (termios(3), "Canonical and
noncanonical mode"); on macOS the cap (`MAX_CANON`) is 1,024. A wrapped command past the cap reaches the shell cut, with
the `'%b'` argument's quote still open, so the shell stands on its continuation prompt (`>`) waiting for the rest of a line
that never comes. The command never runs, the end marker never prints, and after the no-output window the call is
reported as a soft pause, exit −1, "The command is still running".

Live-run finding: M1 (the final default live run at `c2a9444`, 2026-10-06).

## Specs

- `REQ-TOOLS-096`: `command` is the command to run; this one was never run.
- `REQ-TOOLS-098`: a soft-paused call's process keeps running; here no process ever started, and the agent was told one
  had.
- `REQ-TOOLS-179`: −1 means a soft pause of a running command, not a command the shell never received.

## Evidence

Pack `.live-run/runs/2026-10-06T17-41-48-175Z/` (the live-run worktree; git-ignored), session `63f26919` (`requirements`),
child `Verify-REQ-104-acceptance`:

- Tool call #67 (`requirements/transcript.md` § 120): a 3,700-character, multi-line `cat > /tmp/rotaris-verify-req104.mjs
  <<'EOF' … EOF` followed by `echo …; node …; echo …`. It came back `soft_pause`, exit −1, after 30,016 ms, its output
  only `>`. Rebuilt with the same escaping, its wrapped line is about 4,304 bytes.
- #68 (a poll) was again a soft pause; #69 sent `C-c`; #70's own `ls -l /tmp/rotaris-verify-req104.mjs` printed "No such
  file or directory": `cat` never ran.
- Every other terminal command of the pack's 8 sessions wrapped to at most 2,591 bytes, and every one of them completed.
- The agent spent 61.2 s and 5 calls (#67 to #71) on the run's critical path and rewrote its script as two `printf`
  chunks (`requirements/transcript.md` § 127: "Actually the issue may be that the terminal tool sends the command
  differently").

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `wrapCommand` (the POSIX branch builds the one physical line, of any
  length) and `ForegroundSession.submit` (writes it with one CR).
- `docs/architecture/adr/0020-terminal-execution.md` — the one-physical-line carrier.
- The PowerShell branch of `wrapCommand` carries a multi-line command as one base64 line too; whether ConPTY's input caps
  a line is not measurable on a Linux host.

## Repaired — 2026-10-06 (fin23)

The mechanism was confirmed on this host through node-pty before the repair: a 5,069-byte one-line wrapper answered `>`
under dash and under bash as `sh`, and the three real-PTY cases below came back exit 124 at their 15 s timeout.

A POSIX wrapper of at most `POSIX_LINE_BYTES` (1,000 bytes, its CR included, under both the Linux and the macOS cap) is
written as before, byte for byte. A longer one is never written to the PTY: `ForegroundSession.carry`
(`packages/agent-tools/src/terminal/foreground.ts`) stages the command, as written, in a script of its own
(`<os temp>/rotaris-command-<random>/<n>.sh`; the directory only its user may read, the file mode 0600) and wraps
`. '<script>'` in the ordinary one-line wrapper. The command still runs in the session's own shell under `command eval`:
what it sets persists, `$?` at the end frame is its own status, and an error in it is the script's nonzero status. The
script's first statement removes it (`stagedScript`), and a script the shell never read goes with the session's directory
at `dispose`. A PD-TOOLS-001 restore line too long for one PTY line takes the same path.

A first repair, the payload cut across physical lines the shell joins with POSIX line continuations, rebuilt the command
whole but was rejected on its own test: a long command queued behind a soft-paused one overran the line discipline's
4,096-byte input buffer while nothing read it, so its echo arrived on both sides of the paused command's output and reached
that command's poll (`QQQ…done-later`). ADR-0020 is reported back in place, the one-physical-line reading kept beside its
replacement, with a row in `docs/architecture/first-executions.md`.

**Pinned by** `packages/agent-tools/src/terminal/terminal.test.ts`:
- "REQ-TOOLS-096/098/179 (live-run M1): a command whose wrapper is longer than the PTY's input line reaches the shell
  whole", its bash-as-`sh` twin and its 20-column twin. Each sends a 90-line heredoc (quotes, backslashes, `$`, `%`, `é`,
  `中`; the wrapper over 4,096 bytes) and reads the file back byte for byte; it also sends a 5,000-character single-line
  command, a long command whose variable must persist and a long command whose status must be 7, and runs the A10 roads
  with a 6,000-character next call. All three were red on the one-line carrier (exit 124, `timeout`).
- "REQ-TOOLS-096 (live-run M1): a POSIX command too long for one PTY line is staged …" pins the line under the cap, the
  script's content and mode, the nonce kept out of its name, a short command's unchanged line, and PowerShell's
  unchanged base64 line.
- "REQ-TOOLS-096 (live-run M1): a long command that cannot be staged is an execution_error and leaves the session usable"
  (the verifier's review, 2026-10-06): with the temporary directory missing, the call is an `execution_error` that never
  ran and the next short and long calls succeed. Red before: the `mkdtemp` error was thrown out of the call after its
  state was set. A run host killed before its shell read a staged script leaves its directory behind, unreaped (ADR-0020,
  the process view).

**Shown by** `pnpm terminal-proof`: `live.longCommandReachesTheShellWhole` (a 4,796-byte heredoc through the real terminal
manager: exit 0 in 135 ms, `bytes=4700`) and `live.longCommandGridShowsNoCarrier`. Both were red on the one-line carrier:
exit 124 after 20,025 ms, output `>`.

**Not shown:** macOS's cap is reasoned, not measured (no macOS host). PowerShell is unchanged: whether ConPTY or PSReadLine
caps a submitted line is not measurable on a Linux host and is owed to the first Windows run. ~~A live run should show a
long heredoc or one-line command through the terminal tool ending on its own status with its output, never a soft pause
with `>`.~~ Shown live on 2026-10-06 (below).

## Shown live — 2026-10-06 (finacc3, acceptance round 1)

Final acceptance finding F03 found this note's repair landed (`43dd8ef`, `9789070`, `54bae3a`) but never shown by a live
run, since the requirements scenario's long heredoc was the model's own choice and no scenario asked for one again. The
`terminal` scenario of `apps/desktop/scripts/live-run.mjs` now replays the shape off Windows: `long-command` in
`apps/desktop/scripts/lib/terminal-shapes.mjs`, a 56-row here-document read by `wc -c`, 4,667 bytes before any wrapper.
`longCommandReading` credits the carrier only where the command the model sent was itself past 4,096 bytes (a shorter copy
is a NOTE), fails M1's signature (a soft pause, exit −1, or the whole no-output window), and passes only exit 0 with the
byte count of the here-document the command carried; `terminal-shapes.test.ts` pins the shape's length, the count a real
`/bin/sh` prints for it, and the reading of the signature.

`timeout 1800 xvfb-run -a -s "-screen 0 1600x1000x24" /opt/node24/bin/node <worktree>/apps/desktop/scripts/live-run.mjs
--confirm --skip-build --only=terminal` against the registered self-hosted endpoint `katalyst`, on `a74887d` (pack
`.live-run/runs/2026-10-06T21-22-49-851Z/`, git-ignored): the model sent the command whole, 4,667 bytes; it ended at exit
0 in 90 ms, `outcome success`, printing `4648`, the here-document's own count. Every other check of the scenario passed,
and `live-run PASSED`. The same day, at a load of 2.4 to 2.9 on four CPUs, `pnpm terminal-proof` passed 122 of 122 with
`live.longCommand` at 4,796 bytes, exit 0 in 50 ms, `bytes=4700`.
