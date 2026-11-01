## The window's kill of a soft-paused command does nothing and reports success

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6, at `a7540444` (the
Windows ARM64 session's B7; a scratch case on the real `TerminalManager`, never committed); read from the code too, and nothing
in it is Windows-specific. A command that soft-paused (`node parent.cjs`, which starts a grandchild and waits) was killed
from the terminal window through `m.streams.kill(foregroundStreamId(…))`. The stream answered `{"ok":true}`; two seconds later
the shell, the command and its grandchild were all still running, and the next call queued behind the paused command ran
to its own 15 s hard cap (124) before that reset ended them.

`ForegroundSession.killActive` acts only while a call is `running`; a soft-paused command is not the session's active call,
so it returns false, and the manager's stream control (`kill: () => { session.killActive(); }`, `index.ts`) ignores the
answer, so the window is told the kill happened. A soft-paused command is still the command running in that terminal: the
window's header and the preview show it running, and Kill is offered.

~~Not repaired (record-only).~~ Repaired 2026-10-20 (plan loc1, branch `loc1-terminal-kill`); see the outcome below.

## Specs

REQ-SHELL-092 ("Declining leaves the process alone; confirming terminates it"): confirming did not terminate it. REQ-TOOLS-128
(the stream's controls act on the session's command).

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — `killActive` (`if (!a || this.state !== 'running') return false`).
- `packages/agent-tools/src/terminal/index.ts` — the foreground stream's `kill` control, which drops the answer.
- `packages/agent-tools/src/terminal/streams.ts` — `StreamRegistry.kill`, which answers ok.

## Outcome — repaired 2026-10-20

Confirming Kill on a soft-paused command terminates it. `ForegroundSession.killActive` acts on a call still running, as before,
and now also, when the session is idle with soft-paused calls open, on those: the same reset ends the shell and the command's
tree (`resetNow`), the line the shell was running is closed as `killed` and any queued behind it as never having run, and
PD-TOOLS-001's restore starts at once, with the session's queue holding the next call until it has answered (the reset task 1
of this bundle gave a running command's kill, `a-kill-from-the-terminal-window-resets-the-session-without-restoring-its-state.md`
in `fixed/`). The agent's next observation reports it: a poll's own subject reads exit −1, `kill_status` `session_reset`,
`session_reinitialized` true and "the paused command was killed from the terminal window, so it has no exit status of its own;
the terminal session was forcibly restarted … shell state … was lost. The working directory and N exported variables were
restored …"; one queued behind the command killed reads as never run, with no exit code; a call issued instead runs at once in
the restored shell and opens its detail with OQ-164's sentence for an earlier command ("… had ended N seconds before this command
was submitted, by a kill from the terminal window, with no exit code …") and the kill's loss and restore. A kill that terminated
nothing answers so: `killActive` is false when nothing runs and nothing is paused, the foreground stream's control returns that
answer (`terminal/index.ts`), and `TerminalStreams.kill` answers `ended` for a control that answers false (`streams.ts`), never
ok.

Pinned by the block "REQ-SHELL-092, REQ-TOOLS-098: the window's kill of a soft-paused command" in
`packages/agent-tools/src/terminal/terminal.test.ts`, four cases on the host's real shell (pwsh here, the POSIX shell elsewhere):
the note's `node parent.cjs` with a grandchild killed while paused, both pids gone within 5 s, a second kill answering `ended`,
the poll reading the kill and the restore and the next call the directory and the variable; the same with a call instead of a
poll, which runs at once (before: it queued behind the paused command and ran 16 s to its 15 s cap); a command queued behind the
one killed reading as never run; and a kill after the paused command ended on its own answering `ended` while the poll reports
its own exit 0. Beside the registry, "a kill whose control terminated nothing answers `ended`, never ok" in `streams.test.ts`.
All five were red on this branch before the change (Windows 11 ARM64, pwsh 7.6.6): `{ ok: true }`, both pids alive, 16,234 ms.

Not changed, and raised as [OQ-370](../../archive/architecture/open-questions/67-spikes-and-later-questions-34.md#oq-370): between the kill and the agent's next
observation the live stream still reads `running`, as it does for a paused command that ends on its own.

**The review's repair (2026-10-21).** One ordering was left on the running path: a timed call issued while the command is
soft-paused waits behind it as the session's running call, so a kill then took `killActive`'s running branch, which marked the
paused command as ended by the session's reset (not killed from the window) and returned the waiting call as killed with exit
−1, though the shell never reached its line. The running branch now closes the paused commands it ends as `killed`, and the
kill branch of `execute` returns a call whose line had not started as never run (no exit code, `killed: 'before'`, "the command
never ran, so it has no exit code: the soft-paused command ahead of it was killed from the terminal window …"), with the reset
and PD-TOOLS-001's restore as before. Pinned by "a kill while a timed call waits behind the soft-paused command ends the paused
one, which the call reports as killed from the window, and the call never ran (OQ-164)" in the same block of `terminal.test.ts`,
red before this repair (the call carried `exit_code` −1) on Windows 11 ARM64, pwsh 7.6.6. The queued-behind poll case above,
added after the first repair, was run red on the pre-repair code by the review too ([true, true] where both pids should be gone).
