# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Second first execution — 2026-09-12, four defects a real 22-minute run found

Part 8 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Second first execution — 2026-09-12, four defects a real 22-minute run found

*Recorded under GD-10. `REQ-TOOLS-097`, `REQ-TOOLS-099`, `REQ-TOOLS-113`, `REQ-CONFIG-116`; `REQ-TOOLS-179`
for the exit status the amended wrapper has to keep carrying.*

**Found — defect A: `REQ-TOOLS-097`'s two bounds were written as alternatives, so the DEFAULT path had no
hard cap at all.** The requirement says a foreground command is bounded in two ways and whichever bound is
reached first governs the call. `execute()` read that as `if (timeout supplied) {hard} else {soft}`. An agent
that names no `timeout` — the ordinary case — therefore ran under the soft pause alone, and a command that
produced output steadily while getting nowhere had nothing to stop it: two sat wedged for 68 s and 49 s in the
run and had to be killed by hand from the terminal window, while the diagnostic beside them read
`"timeout_seconds":100,"timeout":false`. The 100 was real and the cap was not. `index.ts` had been passing
`hardMs` for precisely this since Part AL and NOTHING READ IT; an `as { timeoutMs; signal }` cast on the same
line is what stopped `tsc` failing the excess property. Both bounds are armed together now, first to fire
governing, and the cast is gone. **The lesson is the cast, not the branch**: a widening `as` on a call
argument turns a compiler error into a silent no-op, and this one hid a missing safety bound for six parts.

*Reached in the built application 2026-10-13 (fin42).* The repair was measured by a real-PTY unit test only
(`terminal.test.ts`, `commandTimeoutS: 1`): the live run's wedge prints nothing, so it soft-paused 70 s before the
default 100 s cap on every run and could never reach it
([`the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`](../../../defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md)).
`pnpm tool-shapes-proof`'s `hard-cap` launch saves `runtime.shell_command_timeout: 4` and sends a call with no `timeout`
that prints every 0.5 s: it ended at 4 s (4,232 ms at load 5.2), exit 124, `timeout_seconds` 4, `session_reset`, the
printed lines kept, a `terminal_timeout` issue filed. The live run asks the default 100 s cap since then with its `steady`
shape; that measurement is the next default live run's.

**Found — defect B: ConPTY SWALLOWS the newlines of a submitted line, so every multi-line command arrived
folded.** The wrapper interpolates the command into one written line. The PTY echo of a wedged call shows the
agent's here-string arriving as `@"VERIFICATION CHECKLIST FOR PROJECT_STRUCTURE.mdMUST DO REQUIREMENTS:…` —
every newline gone, nothing after `@"`, so it never terminated; another produced eight identical
`ParserError`s all reporting `Line | 1 |` for text from opposite ends of a 30-line script. Reproduced here
against the real shell: `Write-Output 'before'` + newline + `cmd /c exit 9` arrives as
`Write-Output 'before'cmd /c exit 9`, which PowerShell parses as **five arguments to `Write-Output`** and
reports **exit 0**. That is the worse half — not a hang but a silent wrong answer, with the agent's second
statement never run and success reported.

A multi-line command is now carried as base64 and rebuilt as a script block on the far side, where its
newlines are intact. **Three things about that shape were measured, and two of them falsified the shape as
proposed:**

- `& ([scriptblock]::Create(...))`, the obvious form, **runs the payload in a CHILD SCOPE**. `$rotVar = 42`
  set by one call read back empty in the next, which breaks the persistence this tool's own description
  promises. Dot-sourcing — `. ([scriptblock]::Create(...))` — keeps it: measured `[42]` against `&`'s `[]`.
  `Set-Location` survives either way, which is what makes this easy to miss.
- **Neither form propagates `$?`.** A failing cmdlet inside the payload reported **exit 0** where the
  single-line wrapper reports 1; only `$LASTEXITCODE`, the native status, came through. So the marker
  protocol's exit-status expression IS AMENDED for this path: the payload has `$global:<end-marker>_ok = $?`
  appended to it and the expression reads that flag instead of `$?`. The flag is named for the call's nonce,
  so consequence 1's forgery argument covers it unchanged. The single-line path keeps `$?` and today's
  wrapper byte for byte.
  *(2026-10-15, superseded: there is no single-line path any more; every command takes the guarded payload, and the
  command is parsed alone before it runs with the flag's line appended. See the next bullet's report-back.)*
- A **terminating error eats the end frame**. `throw` inside the payload aborted the statement list and the
  frame never printed, so the call wedged until the hard cap. Measured, this is NOT new and NOT the script
  block's doing: a single-line `Write-Output 'a'; throw 'boom'` wedges the same way today, and always has —
  the run's two wedged calls are as likely to have been this as the fold. The multi-line path now wraps the
  dot-source in `try`/`catch`, which returns exit 1 with the error text instead. **The single-line path still
  wedges on a terminating error**, now bounded by defect A's hard cap rather than unbounded; that is the
  narrower remainder and it is not repaired here.

  > **Held, measured and repaired — 2026-10-15, Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1
  > arm64, dev tree, pwsh 7.6.6 arm64 and Windows PowerShell 5.1.26100.9457, at `3c3f4478` (the Windows ARM64 session's
  > B3).** The remainder held exactly as written, on both shells, three runs each, every run alike: on one line
  > `Write-Output 'a'; throw 'boom'`, `throw 'boom'`, `Write-Error 'boom' -ErrorAction Stop` and a `Stop` preference's
  > `Get-Item` of a missing file each read **124 at about 5.5 s of a 5 s cap, `session_reset`**, the error text captured
  > and the end frame lost; at the product's default no-output window too. Measured beyond it: a line that does not parse
  > (`Write-Output 'x'; if (`, and `&&` or `||` under 5.1, which has neither) ran nothing and wedged the same way, and
  > 5.1's error text for a single line quoted the wrapper's exit expression. The two-line control returned exit 1 in
  > 108 to 186 ms. **Repaired**: `wrapCommand` sends every PowerShell command through the guarded payload, and parses the
  > command alone first (`$null = [scriptblock]::Create(<command>)`) so a parse error is caught naming the command, never
  > the flag's line. After, every one of those commands reads **exit 1, `shell_failure`, 125 to 233 ms, no reset, the
  > session's state kept**, on both shells; `exit 3` on one line or two still ends the shell (`execution_error`,
  > `session_reset`, about 1.5 s), so OQ-144's path is unchanged; a plain call costs about 30 ms more (62 to 93 ms under
  > pwsh) for the decode and the second parse
  > ([`a-single-line-powershell-command-that-throws-loses-its-end-frame.md`](../../../defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md)).
  > Left: 5.1 renders an error raised in the payload with the script block's text and the wrapper's line as its
  > position, the nonce included ([`windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md`](../../../defects/windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md),
  > recorded); pwsh's concise view does not.

`exit` inside a payload exits the shell itself, catchable by nothing, and is likewise left to the hard cap.
*(2026-10-15, Windows 11 ARM64, both shells: it exits the shell on one line and on two, and since OQ-144's repair the
call reads `execution_error` with `session_reset` at about 1.5 s, not the hard cap; the session's B6 measures the rest.)*
**The `posix` branch is UNCHANGED and unmeasured**: a real pty's line discipline passes a newline through as a
line terminator rather than swallowing it, so `sh` should read a multi-line command across lines as written —
but that is reasoning, no POSIX shell runs on the host this was built on, and `REQ-TOOLS-104` sends Windows to
PowerShell. It is owed on the first host that can run it.

**Paid, 2026-09-16, on Linux — and the reading above is FALSIFIED. It is kept, as the standing policy
requires, beside what replaced it.** The line discipline does pass the newlines through; that is the defect
and not the remedy. A multi-line command whose first physical line does not parse to completion puts `sh` on
its **continuation prompt**, and the pty then ECHOES every remaining line back onto the screen the capture is
read from. The line carrying the START marker is one of them, so the echo lands INSIDE the captured region.
Measured against `/bin/sh` at the session's own 240×50: the here-string equivalent
`t="LINE ONE\nLINE TWO"\nprintf '%s\n' "$t"` reached the agent as

```text
LINE TWO"
> __rot_904046598035310821ca0bc9_s
$ LINE ONE
LINE TWO
```

where `LINE ONE\nLINE TWO` is the whole of the output. The `>` is the continuation prompt and the `$` is the
echo of the third line; neither is anything the command wrote.

So **the posix branch now does what the PowerShell branch does, for the same reason**: a multi-line command is
carried across as ONE physical line and rebuilt on the far side, where its newlines are intact. The carrier is
`printf '%b'` — POSIX printf's own escape-expanding conversion, so nothing outside the shell is needed — and
the payload is run with `eval`, in THIS shell rather than a subshell, which is what keeps the persistence the
tool promises (the same property dot-sourcing buys on the PowerShell side). `$?` after `eval` is the payload's
own status, so the exit-status expression is unchanged and consequence 1's forgery argument is untouched. The
single-line path keeps today's wrapper byte for byte.

*Reported back 2026-09-29 (R-067), from the live runs' first POSIX terminal against a model
([`a-posix-command-that-fails-to-expand-loses-its-end-marker`](../../../defects/fixed/a-posix-command-that-fails-to-expand-loses-its-end-marker.md),
live-run finding L1): **the reading that neither path needed a guard is FALSIFIED, and kept here beside its
replacement.** "The single-line path keeps today's wrapper byte for byte" left the command UNGUARDED:
`printf <start>; <command>; printf <end>`. An interactive `sh` that meets an error in the line it is running
abandons the rest of that line. The errors seen were an expansion it cannot perform (`${PIPESTATUS[0]}` under dash,
`Bad substitution`), a syntax it lacks (`<(…)`, `Syntax error: "(" unexpected`) and an unterminated quote; a
trailing `# note` comments the end frame out as well. The end frame then never printed, and a command that
finished in 0.1 s read as a soft pause with exit −1 after 30 s — twice in one run, and once more under duress.
The same abandoned line put the echoed wrapper, marker included, into what the model read
([`a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker`](../../../defects/fixed/a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker.md)).
`eval` is no guard: an error inside a special built-in abandons the line the same way, measured under dash and
under bash in POSIX mode. **`command eval` is the guard.** POSIX's `command` removes a special built-in's special
properties, so the error becomes that utility's own nonzero status (2 under dash) and the shell goes on to the end
frame — the posix twin of the PowerShell `try` above. Both paths now run the command as
`command eval '<command>'`: a single line single-quoted, a multi-line command through the same `printf '%b'`
carrier. The command still runs in THIS shell, so what it sets persists. The tool description now names the
shell the host runs — `/bin/sh`, a POSIX shell that may not be bash — where it named only Windows' shell.
Pinned by "REQ-TOOLS-097/098/179 (live-run L1): …" in `terminal.test.ts`, red on the unguarded wrapper.*

*Reported back 2026-10-06, from the final default live run at `c2a9444`
([`a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole`](../../../defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md),
live-run finding M1): **"carried across as ONE physical line" is FALSIFIED for a long command, and kept here beside its
replacement.** The shell runs with its line editor off, so it reads the wrapper through the PTY's canonical-mode line
discipline, and that discipline caps a line: on Linux it keeps 4,095 characters and discards the rest up to the line end
(termios(3), "Canonical and noncanonical mode"); macOS's `MAX_CANON` is 1,024. A 3,700-character heredoc wrapped to about
4,304 bytes reached `sh` cut inside its `'%b'` quote; the shell stood on its continuation prompt, the command never ran,
and the call read as a soft pause, exit −1, with `>` for its output. Measured on this host through node-pty: a 5,069-byte
wrapper answered `>` under dash and under bash, at any wait. **The carrier now depends on the line's length.** A wrapper
of at most `POSIX_LINE_BYTES` (1,000 bytes, its CR included; under both caps) is written as before, byte for byte. A
longer one is never written: `ForegroundSession.carry` stages the command, as written, in a script of its own
(`<os temp>/rotaris-command-<random>/<n>.sh`, the directory only its user may read, the file mode 0600) and wraps
`. '<script>'` in the ordinary single-line wrapper, so the line the PTY carries is short and the command still runs in
THIS shell under `command eval`: what it sets persists, `$?` at the end frame is its own status, and an error in it is the
script's nonzero status (`dash: 3: …/1.sh: Bad substitution`, exit 2, measured). The script's first statement removes it
(the shell holds it open), so nothing is left once the shell has read it; one an interrupt discarded unread goes with the
session's directory at `dispose`. The script's name is a count, never the call's nonce, whose echo would read as the
marker printed. The same path carries a PD-TOOLS-001 restore line longer than one PTY line. Two consequences a reader meets
(the fin23 verifier's review): a shell error in a staged command names the script's temporary path where the one line
named `eval` (`/bin/sh: 2: /tmp/rotaris-command-…/5.sh: Syntax error`, harmless, the status the same); and a run host
killed before its shell read a staged script leaves that directory behind, the unredacted command in it at mode 0600, and
nothing reaps it at the next start, since another instance's session may own a directory of the same shape. A staging
that fails (an unwritable temporary directory, a full disk) writes nothing to the shell: the call is an `execution_error`
that never ran, and the session takes the next call as before (`STAGING_FAILED_ERROR`).
**Tried first and rejected, measured:** the payload cut across physical lines the shell joins (`'…'\<CR>'…'`, POSIX line
continuation). The shell rebuilt the command whole, but a long command queued behind a soft-paused one (A10) overran the
discipline's 4,096-byte input buffer while nothing read it, so its echo arrived in two parts on either side of the paused
command's own output, and neither part could be dropped as the wrapper's echo: the paused call's poll carried
`QQQ…done-later`. **PowerShell is unchanged and unmeasured:** its multi-line path is still one base64 line; whether ConPTY
or PSReadLine caps a submitted line is not measurable on a Linux host, and is owed to the first Windows run, as the rest
of the PowerShell branch is. *(2026-10-15: the suite's first Windows run since, on Windows 11 ARM64, sent no PowerShell
line over 4 KB, so this stays unmeasured; the session's B4 measures it. Since B3's repair the same day, a single-line
command is carried as base64 too, about a third longer on the line.)* *(Measured the same day, B4, under pwsh 7.6.6 and
Windows PowerShell 5.1: neither ConPTY nor the console host caps a submitted line short of about 87 KB. A raw line of 4, 8,
16, 32 and 64 KB, a multi-line here-string of the same sizes holding quotes, a backtick, `$`, `%`, `é` and `中` (written and
read back byte for byte), a long command's variable read by the next call, and a long multi-line command ending
`cmd /c exit 7` (which reported 7) each ended in its own status in 123 to 387 ms, with no `__rot_`, no `>>` prompt and no
parse error. One shell difference, not the product's: 5.1 refuses an environment value past 32,767 characters, exit 1, where
pwsh stored 64 KB. `pnpm terminal-proof`'s long command, 4,775 bytes, read `bytes=4699`, exit 0, in 120 ms, nothing of the
carrier on the grid. PowerShell keeps its one line; "REQ-TOOLS-096/098/179 (live-run M1): on PowerShell a command far
longer than a POSIX PTY's line reaches the shell whole" pins it.)* Pinned by "REQ-TOOLS-096/098/179 (live-run M1): …" in `terminal.test.ts` (dash, bash as
`sh`, and the 20-column floor; a soft-paused road included), red on the one-line carrier with exit 124 after its 15 s
timeout; "REQ-TOOLS-096 (live-run M1): a POSIX command too long for one PTY line is staged …" pins the line, the script
and PowerShell's line; and `pnpm terminal-proof`'s `live.longCommandReachesTheShellWhole` and
`live.longCommandGridShowsNoCarrier`, red on the one-line carrier with exit 124 and `>`.*

*Shown live, 2026-10-06 and 2026-10-07: the staged carrier held against a real model, first in the terminal-only live run
at `a74887d` (4,667 bytes, exit 0 in 90 ms) and then twice in the final default pack at `a68f121` (`#6` and `#32`, exit 0 in
146 ms and 107 ms, printing `4648`). Nothing found against this passage; the account is in
[`a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole`](../../../defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md).*

**A second defect, from the same first execution, in the CLEANING rather than the wrapper.** `cleanLines`
found the start of the captured region by looking for a row that was **exactly** the marker. The marker's row
can carry the shell's PROMPT in front of it: the line discipline echoes what we write as soon as it arrives,
and the shell prints its prompt when it reads, so when the write lands first the screen reads `<echo>` on one
row and `$ <marker>` on the next. No row was then exactly the marker, the whole screen was kept, and the agent
was handed `$ __rot_…_s` as though the command had printed it. Load-dependent — about one call in six with a
second suite running beside it, and never once on an idle machine, which is why 24 proofs passed before it was
seen. The echoed wrapper is now dropped **before** the marker is looked for rather than only after it, and a
row that ENDS with the marker is the marker's row whatever stands in front of it. The marker is a per-call
nonce, so consequence 1's forgery argument is unchanged: no command can spell one to cut its own capture short.

**What the same first execution found nothing in**, all measured against `/bin/sh` through a real pty: the
marker protocol and its cleaning, the emulated-screen capture (the tab stop, the screen clear, the empty write
between two non-empty ones), stderr in the merged stream, the soft pause and its poll, the hard timeout's tree
kill and session reset, `runtime.shell_command_timeout` bounding a call that names no timeout of its own, the
background session's start/query/list/kill and its cap, and state persisting across calls. Twenty-four proofs,
two defects.

*Reported back 2026-09-29 (R-067), from the first live run's `terminal` scenario
([`an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed`](../../../defects/fixed/an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md),
live-run finding L2): "the soft pause and its poll" held as a mechanism, and **what the poll SAID was wrong**. An empty
poll returns at once, and its empty answer repeated the soft pause's sentence, "No output for 30 seconds", after under
a millisecond. The model counted thirty seconds a poll and polled five times in 21.6 s. The poll now states what it
measured on the monotonic clock: the time since the previous observation of the command, the time since the command
last wrote anything, and that a poll does not wait. How long a poll should wait is not stated anywhere:
[OQ-136](../../open-questions.md), raised with this reading built.*

*Reported back 2026-09-29 (R-067), from acceptance finding A10
([`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output`](../../../defects/fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md)):
the wrapper assumed it was the whole of the line the shell reads, and **keystrokes can stand in front of it**. An
agent's `is_input` or a control surface's send-keys with no Enter waits in the shell's input as a partial line under a
command that does not read it, and the next wrapped line was appended: `xyprintf: not found`, no start marker, the
whole screen kept — the paused call's late output and its own end frame with it — and, since L9, an empty live stream.
On the POSIX backend a line the product submits after keystrokes left without a line end is now preceded by the line
discipline's kill character, `^U`, which erases the partial line; the PowerShell wrapper's first statement already
takes a prefix without losing the start marker (reasoned, not measured). What becomes of such a line is stated
nowhere: [OQ-146](../../open-questions.md) (OQ-143 on its branch), raised with this reading built. **A second reading is falsified and kept
beside its replacement in `onData`:** "the active call's end marker, else the paused call's; a match closes both".
~~While a call was active, the paused call's frame ahead of it was never matched, so a paused command that ended
behind the next call never read as finished and the poll after it said "still running" with exit −1. Both frames are
matched now, the paused one's first.~~ **That account, written by the first repair, is itself falsified** (A10's
verification, 2026-09-30): the old form did close the paused call when the active call's frame arrived. What it got
wrong was the status and the collection. The paused call took the **active** call's exit status, so a paused
`sleep 3; …; false` behind an `echo` read 0; and its listener stayed attached, so when the paused line never printed a
frame — an interrupt (`C-c`, REQ-TOOLS-098's advice) makes an interactive `sh` abandon the rest of the line — its
poll read everything after: the later calls' marker frames and 582 of the PD-TOOLS-001 snapshot's `__rot_b64__` lines,
which encode the shell's whole environment. The first repair's replacement, "the paused call closes
on its own frame only", fixed the status and broke the interrupt: that call then read "still running" on every poll.
~~Now the paused call closes on its own frame with its own status, or else on the next call's frame with none, reported
as −1 with the reason, and what it collected ends at the next call's printed start marker; its listener goes with it.~~
**Falsified in turn by the second verification** (2026-09-30): that listener fed the paused screen until the next
call's END frame, and the cut at the start marker was made on that screen, so a next call longer than the screen keeps
(`seq 1 20000`, beyond `FOREGROUND_SCREEN_LINES`) scrolled the marker off and the poll read that call's output, its
end frame and a false `output_truncated`. And the echo of the next call's wrapper, which the line discipline writes
onto the paused screen, lost only its first row when it wrapped: a wrapper wider than 240 columns left the command's
text and `printf '__rot_…_e:%s\n' "$?"` in the poll on both roads — the second, a paused command ending on its own
behind the next call, on `origin/main` too. **Now** the paused call is fed by `onData` its share of each chunk
(`pausedShare`), which ends at its own end frame or at the next call's PRINTED start marker — which the shell writes
only once the paused line is done — and it closes there: on its own frame with its own status, or at the marker with
none, reported as −1 with the reason ([OQ-147](../../open-questions.md), OQ-144 on its branch, raised with that reading built). Nothing after
either boundary reaches its screen. Every row an echoed POSIX wrapper occupies is dropped from any capture
(`withoutEchoedWrappers`), and the paused call's `until` cut takes the first row carrying the next call's start marker
in any form. Pinned by eight "(A10)" cases in `terminal.test.ts`: the first repair's two; two red on the old
`onData` — the paused call's own status behind the next call, and the interrupted paused call closed by the next call
with nothing of the later calls in its poll, which is red on the first repair too; and four for the second
verification — `C-c` then `seq 1 20000`, a 300-character next call on both roads, and two pure cases over
`pausedShare` and the echo's removal. ~~A poll made after the `C-c` but before any next call still reads "still running"; that is
recorded, not repaired~~ (repaired 2026-10-01, the report-back below)
([`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](../../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md)).*

*Reported back 2026-10-01, the repair of
[`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](../../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md):
**the marker protocol has no frame for a line the shell abandoned, so a poll alone cannot see it end.** After `C-c` an
interactive `sh` drops the rest of the paused line, and the next call's printed start marker was the only boundary the
session could read; every poll before that call read −1, `soft_pause`, "The process may still be running", over a process
that had died (dash through a real PTY, the note's scratch case: `^C`, `#`, −1, `soft_pause`). Keystrokes carrying `C-c`
written while a command is soft-paused — the agent's `is_input`, the terminal window's interrupt or send-keys — now mark
the paused call, and a poll of a marked call submits one no-op line of the product's own, OQ-144's handshake by another
road, once the shell holds its terminal again (`/proc/<pid>/stat`'s `tpgid` against the shell's `pgrp`; measured under dash
and bash: the job's group while `sleep` runs, the shell's own within 20 ms of the interrupt). Its printed start marker
closes the paused call as a next call's does, and the poll hands it over with OQ-147's reading. A program that survived
the interrupt and holds the terminal is written nothing. The line's echo and frames are cut from the capture and
withheld from the live stream (`CommandRegion.withholdRowsWith`): with the withholding removed, the live tap carried
`# printf '%s\n' '__rot_…'`. Whether the product may write that line is
[OQ-168](../../open-questions.md), raised with it built. Pinned by three "(OQ-147)" cases in `terminal.test.ts`; the first is
red on the unrepaired code (a soft pause), and red again with the terminal window's interrupt left unmarked; the second
is red with the terminal-holder check removed (the line went to the surviving `read`). Off Linux nothing says who holds
the terminal and the line is submitted at the poll; PowerShell's `$null` no-op is reasoned, not measured. The live run's
`terminal` scenario carries the interrupt now (`interrupt` in `lib/terminal-shapes.mjs`), and its first run (2026-10-01,
the self-hosted endpoint) read the poll 1,346 ms after the model's `C-c` as −1, `execution_error`, OQ-147's reason.*

*Reported back 2026-10-01, the same repair's first verification: **~~an interrupt written while a command is soft-paused —
the agent's `is_input`, the terminal window's interrupt or send-keys — marks the paused call~~, read as covering the window's
interrupt, covered one ordering only** (kept beside its replacement). The window's interrupt (REQ-SHELL-093) can arrive while
the call still runs, and the shell abandons the line just the same. Unmarked, the call soft-paused over a dead process and
every poll read "still running"; given `timeout: 8`, it waited 8,017 ms and reset the session for a process that died at
1 s (the verifier, dash through a real PTY). Now a `C-c` written while a foreground call runs marks that call
(`ActiveCall.onInterrupt`). The call watches for its shell holding the terminal again (`INTERRUPT_WATCH_MS`, Linux) and
then submits the same no-op line (`submitCloser`), whose printed marker (`printsMarker`) ends it with −1, `execution_error`,
no reset. A call that soft-pauses first carries the mark into the paused call. A poll made at once after the `C-c` waits up
to `INTERRUPT_SETTLE_MS` for the shell before it decides. Pinned by three more "(OQ-147)" cases in `terminal.test.ts`, the
three red before the change. Off Linux a running call writes nothing, and a timed call still runs out its cap
([OQ-168](../../open-questions.md)).*
