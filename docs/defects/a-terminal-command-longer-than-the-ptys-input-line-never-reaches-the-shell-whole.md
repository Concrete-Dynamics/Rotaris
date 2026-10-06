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
