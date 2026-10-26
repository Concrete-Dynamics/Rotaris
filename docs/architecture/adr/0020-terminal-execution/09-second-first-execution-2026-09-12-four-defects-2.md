# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Second first execution — 2026-09-12, four defects a real 22-minute run found (continued)

Part 9 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

*Reported back 2026-10-06, OQ-168 ruled by the owner ([R-071](../../../product/requests.md#r-071)) as recommended: **"off
Linux nothing says who holds the terminal and the line is submitted at the poll" no longer holds** (kept above beside its
replacement). The no-op line is written only once the host says the shell holds its terminal again — Linux's `/proc`, as
before. On Windows and macOS a poll after an interrupt writes nothing: a line written there could become the input of a
program that survived the interrupt, and how PowerShell treats `C-c` mid-line is unmeasured. The poll stays the soft pause
and leads its detail with the ruling's sentence — the command may have ended, and the next command run in the session
reports how (`INTERRUPT_UNSEEN_NOTE`, `ForegroundResult.interruptUnseen`), OQ-164's report of a paused command's end doing
the reporting. A Linux whose `/proc` does not answer is read the same way. The host is a session dependency
(`SessionDeps.platform`, `TerminalManagerDeps.platform`), so the branch is pinned on this Linux host by three
"(OQ-168, ruled)" cases in `terminal.test.ts` over a real PTY told it runs on `win32` or `darwin`, each red under the
write-anyway reading. Still unmeasured on a Windows or macOS host.* *(2026-10-15: still unmeasured on Windows. On
Windows 11 ARM64 those three cases are skipped where the shell is PowerShell (`it.skipIf(PS)`), so the suite never runs
them on a Windows host; the session's B5 and B7 owe the reading.)* *(B7, the same day: measured on a real PowerShell and
ConPTY, pwsh 7.6.6 and 5.1, three runs a shell, and held as ruled — nothing written after an interrupt, the soft pause led by
`INTERRUPT_UNSEEN_NOTE`, the next command reporting the end; PowerShell abandons its line on `C-c`; a running call's
interrupt ends the program at once and the call still runs out its cap. OQ-168's entry carries the detail.)*

*Reported back 2026-10-01, the repair of
[`output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll`](../../../defects/fixed/output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md)
(reasoned when it was recorded, measured now with a PTY double): **the soft pause handed its call over across an await.**
`execute` removed the call's listener, awaited the emulator's write of what it held, and only then opened the paused call
`onData` feeds, so a chunk delivered inside that write reached neither: no poll returned it, and its end frame resolved the
call already settled, leaving the paused call "still running" until a later call closed it with no status. The paused
call is now opened in the same turn as the pause, before the listener goes and the write is awaited. Pinned by
"REQ-TOOLS-098/179: output and the end frame a command writes while its soft pause is handed over …" in
`terminal.test.ts`, red on the old order in both its halves.*

*Reported back 2026-10-01, the partial repair of
[`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced`](../../../defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md)
(live-run finding a71-8, [OQ-164](../../open-questions.md)): **the queue of one held one paused call, and a second pause
replaced it.** A call issued while a command is soft-paused is queued by the shell behind it. The session treated the
paused call as the poll's alone: the new call reported only its own exit, and a soft pause of the new call disposed of
the paused one, whose end was then never reported. Measured with dash through a real PTY: an `echo` behind a paused
`sleep 3` waited about 1.9 s and said only "The command exited with code 0.". The session now keeps every open paused
call in line order (`pausedAhead`, then `pausedCommand`). Each is fed its share of the stream up to its own end frame or
the next line's printed start marker (`pausedShare`, as A10 built it), and is closed there. Every observation hands
over, beside its own subject, each paused call that ended unreported and each still running ahead of it
(`drainEarlier`, `ForegroundResult.earlier`). A reset under them reports the one the shell was running as ended by the
reset. The old line "a pause nobody ever polled is replaced here" is struck in `execute` and kept beside its
replacement. Whether such a call should wait at all is OQ-164's, not ruled. *(Ruled 2026-10-06 by the owner, [R-071](../../../product/requests.md#r-071): the current behaviour is the rule — the call waits behind the paused command and reports its end.)* Pinned by two "(OQ-164)" cases in
`terminal.test.ts`, both red before the change. Five A10 cases now read the hand-over from the next call and keep their
assertions.*

*Corrected 2026-10-01, before its merge, by its verification: **the line assumed that every line written after a paused
one reaches the shell.** An interrupt (`C-c`) makes the terminal discard every line the shell has not read, so a line
queued behind the interrupted one never runs and its start marker never prints. Three readings of the first build were
false. Each is kept struck beside its replacement in `foreground.ts` and in [OQ-164](../../open-questions.md):
- "the next line's start marker" closes a paused call. It is now ANY later line's, whichever prints first (`pausedShare`).
  The interrupted call had been cut at a marker that never appeared, and the next call carried its own marker, output and
  end frame as that call's.
- A poll after the interrupt looked for the end only of the polled call, queued behind the interrupted one. It wrote no
  no-op line and read "still running" over a dead command, which re-opened OQ-147's defect. It now looks at every open
  paused call, and its no-op line closes them all.
- A queued call "carries none of the earlier command's output as its own". That held for its pause only; its poll handed
  the earlier output over as its own. A call the shell has not started now takes nothing before its own printed start
  marker (`unstartedShare`, `PausedCall.started`, `CommandRegion.started`).
A line whose marker never printed when a later one did is reported as never run, with no exit code, and so is a call
discarded while it waited (the window's interrupt, REQ-SHELL-093). Measured with dash through a real PTY: the four
cases named in OQ-164 were red on the first build and are green on the correction.*

*Corrected again 2026-10-01, before its merge, by its second verification: **the interrupt was taken to reach the
interrupted line alone.** It discards every line queued behind that one too, but only the oldest open paused call was
marked. A command that survives the interrupt (`trap '' INT`, a SIGINT handler) ends on its own frame, its call closes
with its own status, and the queued call was left open and unmarked: no poll wrote the no-op line, and every poll read it
"still running" over an idle prompt, so "its no-op line closes them all" above was still false. The interrupt now marks
every open paused call (`noteInterrupt`, the old reading kept struck beside it). The same verification found that a queued
call closed by the session's reset before its line ran was reported as "still running" and as having lost its shell; it is
reported in the never-ran form now, naming the reset (`reset-before`). Both cases named in OQ-164 for this correction were
red before it and are green on it, with dash through a real PTY.*

*Reported back 2026-10-01, the repair of
[`a-command-that-exits-the-session-shell-reads-as-a-soft-pause`](../../../defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md)
(OQ-144's sibling case): **the marker protocol also assumed that the shell outlives the command.** A command that ends
the shell (`exit 3`, `kill -9 $$`) loses the end frame as a replacement does, because the shell that would print it is
gone. The PTY's exit only made the session forget the PTY, so the call soft-paused after the whole window, and the next
call ran in a fresh shell with the directory and variables gone while it reported `session_reinitialized` false. The
shell's exit is now an event of the session (`shellExited`): a running call ends at once as an `execution_error` with no
exit code, a soft-paused call is closed for its poll to hand over the same way, and the shell is respawned with
PD-TOOLS-001's snapshot re-applied by the first of them to meet it, or by the next call when the shell ended between calls.
That call says so. Measured with dash through a real PTY: `exit 3` ended the call in 16 to 37 ms and `kill -9 $$` in 12 to
18 ms (three runs each), where both had taken the case's whole 3 s window. The reading is OQ-144's, extended in place
([OQ-144](../../open-questions.md)). It is pinned by two "(OQ-144)" cases in `terminal.test.ts` beside A9's, both red on the
unrepaired code. Unlike the replacement watch it needs no `/proc`, so it holds off Linux too, but no other host has run
it.*

*Reported back 2026-09-30 (R-067), from the verifier's live run of the `fix-terminal-output` branch
([`a-command-that-replaces-the-shell-reads-as-a-soft-pause`](../../../defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md),
acceptance finding A9): **the marker protocol's premise — that the shell which printed the start frame is the one left
to print the end frame — does not hold for a command that replaces the shell.** `exec bash` keeps the pid and never
returns to the rest of the wrapped line; the call soft-paused after 30,027 ms and every later call ran under bash. It
is L1's class by another road, and `command eval` is no guard against it, because `exec` succeeds. The session now
watches the process behind its pid while a call runs, against the identity its shell had when it last answered one of
the product's own lines (`/proc`'s executable and argument vector; a fresh shell answers one no-op line first). A
different process ends the call within 200 ms as an `execution_error` with no exit code, and the session restarts on
its shell with PD-TOOLS-001's snapshot re-applied. The POSIX description says not to replace the shell. Neither the
answer nor the restart is stated anywhere: [OQ-144](../../open-questions.md), raised with this reading built. Off on
macOS, where `/proc` does not exist. Pinned by "REQ-TOOLS-097/098/103/104 (OQ-144, acceptance A9): …" in
`terminal.test.ts`, red on the unwatched session (a soft pause after the whole window, and `sh` in place of
`/bin/sh -i` for the next call). The no-op line is awaited before the call writes its command, so it carries the
call's cancel and reports a kill from the terminal window: the first form lost both (acceptance round 1's verifier),
and the call now ends on either before its command is written.*

*Reported back 2026-10-14 (fin45, `fin45-config-and-terminal`; a falsified reading kept beside its replacement): **the
reading above, that an identity other than the shell's is "a different process", was false for one process — the shell
itself while it exits.** Between the kernel releasing an exiting process's memory and its reaping, `/proc/<pid>/exe` can
still be read while `/proc/<pid>/cmdline` reads empty, and the pair read as another program; a watch reading inside that
window ended the call as `replaced` before the shell's exit reached it, so an `exit 4` a soft-paused command ran told the
call waiting behind it that it had replaced the shell (measured on Linux: in 122 of 300 exits read in a tight loop, the
first reading not the process's own was that pair). An empty argument vector now reads as no identity, as a process that
has gone does, so the watch keeps waiting and the exit reaches the call as OQ-144's shell-exit case
([`a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load`](../../../defects/fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md);
`terminal.test.ts`, "OQ-144 / OQ-164: a process on its way out reads no identity, never another program's"). The same
rule reads as no identity a program in the shell's place that runs with an empty argument vector of its own (an `execve`
with argc 0) on a Linux kernel before 5.18, which therefore goes unwatched; from 5.18 the kernel gives such an `execve` one
empty argument, which reads as an identity (measured on 6.18; fin46, 2026-10-14,
[`processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched`](../../../defects/fixed/processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched.md)).*

**Found — defect C: the agent's capture was VT-STRIPPED where every other surface was EMULATED.** Deleting a
control sequence is not applying it. Measured against the real shell at the session's own 240×50: ConPTY
expresses a tab stop as `ESC[7C`, and `Write-Host ('a' + [char]9 + 'b')` reached the agent as **`ab`** where
the screen reads `a       b` — 8 runs out of 8. `Clear-Host` between two lines reached the agent as the
cleared rows left behind as **fifty blank lines** instead of a cleared screen. The capture is read off a
`ScreenEmulator` from the same `EmulatorFactory` `streams.ts` uses now; `stripVt` stays, for the marker scan
on the raw stream, which is what it was always right for.

**Two things here contradict the brief this was built from, and both are measurements, so both are recorded.**
First, the case the brief named, `Select-String … | Measure-Object`, does NOT distinguish the two: it passed
before and after, and it is kept as a guard rather than presented as a proof.

Second — and **this is a falsified reading kept beside its replacement, per the standing policy.** The reading
first recorded here was that the concatenation the run showed, `Total Endpoints: 0Resource Sections: 0File
Size: 58 KB` from three `Write-Host` calls, **could not be reproduced from VT stripping**: across 60 real-PTY
runs at 240×50, 120×30, 80×24 and 60×10, over tables, delayed writes and `Measure-Object`, ConPTY emitted
plain `\r\n` and the strip and the screen agreed every time. The conclusion drawn was that those strings were
"exactly what defect B's fold produces from a here-string", so the evidence was most likely defect B's.

**That conclusion is wrong, and the store says so without needing a shell at all: the two commands whose
output concatenated carry no newline.** Ordinals 193 and 200 of session `d314627f` are 503 and 385 characters
on ONE line, so B's fold cannot reach them. What the 60 runs missed is the trigger, and it is narrow: an
**empty write between two non-empty ones** — `Write-Host ""`, `echo ""` — which is present in both production
commands and in none of the sixty. Reproduced afterwards against the unfixed strip, the first shape returns
`"Total Endpoints: 0Resource Sections: 0File Size: 58 KB"` and the second
`"VERIFICATION: created successfully" + "File exists:"` joined — the production strings byte for byte. Both
are now assertions in `terminal.test.ts` beside the tab and the clear, and both are red on the strip.

The lesson is the one this register keeps relearning, in a new place: sixty negative runs are not a negative
result when none of them carries the input that failed. The reproduction was owed to the *recorded command*,
not to a plausible family of commands resembling it.

**The budget, decided by measurement, and the residue that is a `REQ-TOOLS-097` question.** A screen retains
LINES; the cap counts CHARACTERS. `pnpm terminal-proof`'s flood is 10,000 lines and 98,893 characters, sized
deliberately just inside the 100,000 cap. A first budget of 1,000 lines looked ample on paper — 242,318
characters at full width — and **delivered the last 999 lines of that flood**; the proof is what caught it,
not the reading. 10,000 delivers 9,999. **12,500 delivers all 10,000**, for 35–43 ms of parsing and 16–28 MB
held for the call. So the cap is reachable whenever the retained lines average 8 characters or more. **Shorter
lines meet the line budget first** — 12,500 one-character lines deliver 24,997 characters where `REQ-TOOLS-097`
allows 100,000 — and closing that needs 100,000 retained lines, measured at **249.5 MB and 1.1 s per call**,
which is not a price to pay per concurrent agent. That is a narrowing of `REQ-TOOLS-097` and it is **flagged,
not taken**: the 100,000-character slice still runs, and the cap in the specification is untouched.

**And a defect in the repair itself, which only the proof found.** Feeding the screen as the bytes arrived —
`writes = writes.then(() => screen.write(chunk))` — cost a whole `@xterm/headless` write-buffer turn per
chunk: the stream proof's 10,000-line flood went from **2,965 ms to over 30,000 ms** and timed the proof out.
The chunks are held and given to the screen in one write when the call ends: **3,911 ms**, a 32% overhead over
the strip it replaces. Nothing watches that screen while the call runs — the live stream is a separate tap and
is still incremental (`REQ-TOOLS-127`) — so there was never anything to buy with that per-chunk turn. Holding
them has to keep the bound the raw capture had, though, or a command that prints without stopping grows
without stopping: the held bytes are capped at what a screen of `FOREGROUND_SCREEN_LINES` rows can hold at the
session's width and dropped from the OLDEST end, which sets `output_truncated` whatever the screen reports.

**Found — defect D: the two marker regexes disagreed, and the sentinel reached the model.** Detection in
`onData` matched the frame ANYWHERE; removal in `clean` and in `poll` stripped only whole LINES that BEGAN
with it. When the command's last write had no trailing newline the frame landed mid-line, so the exit code was
read and the marker was not removed. Verbatim from the run, in what the model saw:
`Property          : __rot_809d1f3b8730b817f14c5cc7_e:0`. Reproduced exactly by
`Write-Host -NoNewline 'Property          : '`. The body is cut at the FIRST occurrence of the frame wherever
it sits now, in both places. This is the seventh defect's sibling — same protocol, removal side — and the
paragraph above carries the pointer back.

**What this cost, and the shape of it.** Four defects, and three of the four had been sitting behind a green
suite: `hardMs` written and unread, the emulator promised "with streaming" and never wired to the capture, the
removal regex anchored where the detection regex was not. None is a hard fault; each is a *pair that stopped
agreeing* and nothing was checking the pair. The proofs found two more that reading did not — the line budget
and the per-chunk write — which is the ratio this policy exists for.

**Proofs.** All four are in `packages/agent-tools/src/terminal/terminal.test.ts`, against a real shell through
a real PTY, and every one was red first: defect A as an unbounded call (the test timed out at 25 s), B as
`exit_code −1` on a here-string that never terminated, C as `ab` for `a       b`, D as the marker verbatim in
the observation. `pnpm terminal-proof` (116/116) and `pnpm terminal-stream-proof` cover the grid and the live
stream and were re-run to show they did not move — the first of them caught the budget, the second the write.
