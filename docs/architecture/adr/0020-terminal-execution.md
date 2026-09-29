# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions

- **Status:** proposed
- **Date:** 2026-08-31
- **Origin:** EXEC (ADR-EXEC-06)
- **Depends on:** ADR-0002, ADR-0017, ADR-0022
- **Contains an escalation.**

## Context

`REQ-TOOLS-095` and `REQ-TOOLS-096` fix the tool name `terminal` and its action schema, including the
special-key vocabulary for `is_input=true`, the session-action vocabulary, the signal vocabulary and
the `ts_XXXXXXXX` id format.

`REQ-TOOLS-097`, `REQ-TOOLS-098` and `REQ-CONFIG-116`: foreground bounds are two and the first reached
governs. A hard wall-clock timeout — the call's `timeout`, else `runtime.shell_command_timeout`,
default 100 s — terminates **the entire process tree**, restarts the terminal session, and returns an
observation stating shell state was lost. A soft pause fires only when the call supplied **no**
`timeout` and 30 seconds pass with no output, returning exit code -1 while the process keeps running.

`REQ-TOOLS-097` also fixes the reason a persistent shell is unavoidable: shell state — working
directory, exported variables, aliases, background jobs — **persists across foreground calls** in a
session and is *observably* lost on a hard timeout.

`REQ-TOOLS-187`, `REQ-TOOLS-108` and `REQ-SANDBOX-089`: each terminal session runs at most one
foreground command at a time and a second foreground call against a busy session **waits**; sessions
belonging to different agents run concurrently; background sessions never occupy a terminal session
and are fully concurrent up to `runtime.shell_max_background_sessions` (default 20, minimum 1).

`REQ-TOOLS-107` and `REQ-TOOLS-109`: background sessions spawn in their own OS subprocess,
shell-interpreted, stdout and stderr merged to a pipe, stdin piped, cwd the tool's working directory,
own process group on POSIX; the spawn returns immediately with a fixed text; termination is SIGTERM,
then up to 5 s grace returning as soon as the process exits, then SIGKILL.

`REQ-TOOLS-104`: on Windows the terminal runs commands through PowerShell, and backend availability is
decided **solely** by the presence of `pwsh` or `powershell` on the host — never by how quickly
anything responds. `REQ-TOOLS-106`: the tool must load and register however the application process was
started and whatever its own standard streams are attached to, and the agent must observe an identical
tool surface in every case; encoding of captured output is a property of the child, never of the
host's own streams.

`REQ-TOOLS-179` and `REQ-SANDBOX-083` make the exit codes a cross-surface contract: 124 hard timeout
(foreground and background), 126 sandbox unavailable and never ran, -1 soft pause or killed, otherwise
the command's real outcome. `REQ-TOOLS-100` and `REQ-TOOLS-112` close `failure_kind`, `outcome_kind`
and `outcome_severity` and fix a six-test ordered classification cascade. `REQ-TOOLS-098` and
`REQ-TOOLS-100` require every observation to carry a `[terminal_diagnostic]` block with sorted keys and
null-valued keys dropped, and to render an output section — never omitted. `REQ-TOOLS-103` requires a
backend failure never to surface as a partial or malformed observation.

`REQ-SHELL-166` and `REQ-SHELL-100` require interactive input and resize to be demonstrated against a
**real pseudo-terminal**: keystroke-to-frame inside 100 ms; keystrokes reaching the process in order,
none dropped, duplicated or reordered; interrupt and end-input acting within 500 ms; and **the size the
process itself reports for its terminal equal to the columns and rows the grid last reported**, no
later than the process's first output after the resize.

`REQ-TOOLS-099`, `REQ-TOOLS-100` and `REQ-TOOLS-103` stamp `backend` on every observation as
`single-session` or `tmux-pool`, fix `kill_status` values two of which only a pane-based pool can
produce, and specify pooled-recovery behaviour in detail — **and the specification never states how a
backend is selected or when `tmux-pool` is used.**

## Alternatives considered

**A — A fresh child process per foreground call, pipes only.** Simple, exact exit codes, clean stream
separation, trivially correct truncation. Fatal against `REQ-TOOLS-097` — working directory and
exported variables must persist across calls and must be observably lost on a hard timeout — and
against `REQ-SHELL-166`, which requires a real pseudo-terminal whose reported size follows the grid.

**B — One PTY per call.** Keeps the PTY requirement and gives a clean exit status per child. Still
fails the persistence rule, and re-pays PTY setup on every call.

**C — One long-lived PTY-hosted interactive shell per terminal session with an out-of-band completion
protocol; background commands spawned separately with merged pipes.** Chosen.

## Decision

**Foreground.** Each terminal session owns one pseudo-terminal running the platform's interactive
shell — `/bin/sh` or the user's login shell on POSIX, `pwsh` else `powershell` on Windows. A command is
submitted as a line; completion and exit status are recovered by an **out-of-band marker protocol**:
write the command, then a delimiter-emitting echo of the shell's exit-status variable, and scan the
byte stream for a nonce that cannot appear in ordinary output. This is the price of `REQ-TOOLS-097`: a
persistent shell has no per-command wait, so the exit status of `REQ-TOOLS-179` must be manufactured
from the stream. **The nonce must be unguessable, per session and per call.**

The session is a small state machine — idle, running, resetting — with a queue of one, so a second
foreground call waits. The hard timeout kills the process tree (POSIX: signal the foreground process
group of the PTY; Windows: the Job Object of ADR-0002) and then **restarts the session**, which is where
`kill_status: session_reset` and `reset_failed` come from.

**Background.** A background call is a plain subprocess, shell-interpreted, stdout and stderr merged
into one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows. It
never touches a terminal session, so the concurrency statement holds by construction. Termination is
SIGTERM, grace-until-exit capped at 5 s, then SIGKILL; on Windows, where signals do not exist, this
maps onto graceful-close-then-terminate and the specification supplies no mapping (open question
OQ-10).

**Library.** `node-pty` for the PTY, checked against its current documentation: Linux, macOS and
Windows support, Windows through the ConPTY API requiring Windows 10 1809 or later with winpty support
removed; `spawn(file, args, { cols, rows, cwd, env })`, data and exit callbacks, `resize(cols, rows)`
and `kill(signal?)` where the signal argument is **ignored on Windows**. `resize` is what satisfies
`REQ-SHELL-100`'s reported-size rule; the ignored-signal note is a direct input to OQ-10.

**Backend name.** Ship `single-session` and stamp it on every observation.

## Escalation — does `tmux-pool` ship?

`REQ-TOOLS-100` fixes the closed `backend` vocabulary `{single-session, tmux-pool}`, `REQ-TOOLS-099`
fixes `kill_status` values (`pane_replaced`, `replace_failed`) that only a pane-based pool can produce,
and `REQ-TOOLS-103` specifies pooled-recovery behaviour in detail — at most 3 recoveries in a
10-second window, a fourth yielding an `execution_error`, a completed command clearing the count.
Nothing states when a pooled backend is used, whether it is required to exist, or what selects it. If
both must ship, a POSIX-only pooled backend cannot exist on Windows, where `REQ-TOOLS-104` mandates
PowerShell, and `REQ-TOOLS-187` requires the two backends to be observationally identical apart from
the name.

Options: **(a)** ship one backend and withdraw `tmux-pool`, `pane_replaced` and `replace_failed`,
keeping the field for forward compatibility; **(b)** ship both, accepting the cost, the external
dependency and the platform asymmetry; **(c)** keep both names and define the pooled one as a future
backend, leaving a specified behaviour with no implementation. This changes what a conformance claim
can say, so it is the product owner's call.

## Consequences accepted

1. The exit status of a foreground command is **derived from a marker protocol rather than from a
   wait**. A pathological command could therefore forge one. The nonce must be unguessable per call,
   and the protocol must be tested against a command that echoes attacker-chosen text.
2. Under a PTY, stdout and stderr are **merged** and the shell echoes the submitted line. The capture
   handed to the agent must strip the echoed command and the marker frames; `REQ-TOOLS-113`'s
   output-derived warning checks then run over the cleaned text, or they will match the command line
   itself. Under the accepted OQ-13 amendment (2026-09-07), `REQ-TOOLS-098`'s empty
   soft-pause advisory states that stdout and stderr share the captured stream and offers polling
   or interruption. Redirection advice is reserved for a backend that excludes stderr from capture.
3. `background=true` gives pipes, not a PTY, so a background session's terminal tab has no real
   terminal to resize. `REQ-TOOLS-128` and `REQ-SHELL-106` already anticipate this: a resize always
   resizes the emulated screen, even when the backend is gone, and then the real terminal when
   possible.
4. `node-pty` is a native module, so ADR-0002's rebuild-and-unpack obligation is load-bearing, and the
   ConPTY floor of Windows 10 1809 becomes a platform requirement ADR-0054 must state.
5. Foreground output is capped at 100,000 characters per call truncated from the **oldest** end, and
   background output buffered to 1 MB per session truncated the same direction with the read cursor
   adjusted (`REQ-TOOLS-097`, `REQ-TOOLS-100`, `REQ-TOOLS-108`).

## Revisit if

The escalation is decided; or a requirement arrives that needs a true per-command exit status, which
would push toward alternative B and force `REQ-TOOLS-097` to be re-read; or `node-pty` stops being
maintained, in which case the PTY port defined here is the seam to replace.

## First execution — 2026-09-03, against a real PowerShell through a real PTY

*Recorded under GD-10.*

**Built and run:** `packages/agent-tools/src/terminal/` — one `node-pty` shell per agent (`pwsh` else
`powershell`, presence-only availability per `REQ-TOOLS-104`), the command bracketed by a start marker and
an end marker carrying the exit status, each a 24-hex nonce per session and per call; the idle/running/
resetting machine with a queue of one; the hard timeout killing the tree (`taskkill /T /F`) and restarting
the session (`session_reset` / `reset_failed`); the soft pause at the no-output window returning −1 with
the process kept and a later empty command collecting what it produced; the 100,000-character oldest-end cap;
background sessions as plain subprocesses with the merged pipe, the 1 MB ring, the query/kill/send_input/
send_signal/list actions and the termination protocol; the six-test classification and the three output
checks. **`node-pty` 1.1.0 loads from its shipped prebuilds under Node 24 and under Electron 44 (ABI 149)
with no rebuild** — consequence 4's rebuild-and-unpack obligation is real for the packaged app and was not
exercised here; the package is externalised beside `better-sqlite3`.

**Found — the SEVENTH first-execution defect: the marker protocol's detection read the echo before the
frame.** A PTY echoes the submitted line, and the submitted line *contains the end-marker text* (`Write-Output
('__rot_…_e:' + …)`). Detection written as "find the first occurrence of `<marker>:`" found the echo, saw no
digits after it, and waited — forever, or until the soft pause — while the shell's own frame sat further down
the stream. Every command therefore returned −1 on the first run against the real shell. The corrected
detection matches **the marker followed by digits on the VT-stripped stream**, which only the shell's own
`Write-Output` produces, and the capture is cut at that same line. Consequence 1's forgery test holds as
stated: a command that prints `__rot_deadbeef…_e:0` and then exits 7 reports 7, because it cannot know the
nonce. The reading a reviewer would reach — "the marker is unguessable, so the first occurrence is the frame"
— is exactly wrong, because the shell repeats the unguessable thing back before honouring it.

> The sibling of this defect, on the REMOVAL side rather than the detection side, was found on 2026-09-12 and
> is defect D of the second first execution below. "The capture is cut at that same line" above is the clause
> that was wrong: it cut whole LINES that began with the frame, while detection matched the frame anywhere.

**The escalation is moot as the specification now stands.** `REQ-TOOLS-100` as amended withdraws
`tmux-pool` and its two kill statuses; `single-session` ships and is the only value stamped.

**OQ-10, read rather than answered:** on Windows `SIGTERM` and `SIGKILL` both terminate the process tree
(`taskkill /T`, then `/F` after the 5 s grace); `SIGINT` writes `C-c` to a foreground PTY and is refused with
`invalid_request` for a background pipe; `SIGHUP` likewise. `node-pty`'s ignored signal argument is exactly
what made the tree kill the only kill.

**Consequence 2 as met today:** under ConPTY the capture is VT-stripped, the echoed wrapper and both marker
frames removed; the headless screen emulator of ADR-0021 is not built and lands with streaming. The
`FAILED ` marker of `REQ-TOOLS-113` fires on a test-runner banner's own `failed ` — conformant, and now
stated in the test rather than argued about.

> **Superseded 2026-09-12 — the capture is the emulated screen now.** "Lands with streaming" is what did not
> happen: ADR-0021 landed, `streams.ts` runs `xtermEmulatorFactory`, and the AGENT's capture was left on the
> strip. Defect C below is that debt coming due, and what it cost is recorded there. The sentence above is
> kept because the schedule it states — the emulator arriving with streaming — is exactly the assumption that
> failed silently: streaming arrived and nobody moved the capture.

> **Narrowed 2026-09-27 — [`PD-TOOLS-003`](../../product/directives.md#pd-tools-003).** "The `FAILED ` marker of
> `REQ-TOOLS-113` fires on a test-runner banner's own `failed `" no longer holds: the directive matches that
> marker in capitals only, so a banner's lower-case `failed ` warns through the banner check alone. The assertion
> that stated the old reading now uses a capital `==== 1 FAILED ====` banner, which still raises both warnings,
> and a new `PD-TOOLS-003` case pins a lower-case banner raising the banner warning alone. The sentence is kept as
> it was written.

**Not built:** confinement (ADR-0022; no backend exists on this platform and `sandbox_mode` is fixed
`off`), live streaming and the terminal window (ADR-0021, `REQ-TOOLS-126` onward — with streaming off the
command still runs), the persisted `runtime.shell_*` keys (an environment stopgap, `codebase.md`).

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
- A **terminating error eats the end frame**. `throw` inside the payload aborted the statement list and the
  frame never printed, so the call wedged until the hard cap. Measured, this is NOT new and NOT the script
  block's doing: a single-line `Write-Output 'a'; throw 'boom'` wedges the same way today, and always has —
  the run's two wedged calls are as likely to have been this as the fold. The multi-line path now wraps the
  dot-source in `try`/`catch`, which returns exit 1 with the error text instead. **The single-line path still
  wedges on a terminating error**, now bounded by defect A's hard cap rather than unbounded; that is the
  narrower remainder and it is not repaired here.

`exit` inside a payload exits the shell itself, catchable by nothing, and is likewise left to the hard cap.
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

## Third first execution — 2026-09-18, what a real completed run did with the reset and the exit code

Run `cc6191a2` (logged as R-039) completed and its autopsy found two things this record had decided on paper
but never executed against a real run.

**The reset kept the REQ-TOOLS-099 contract and lost the shell around it.** A command that hung on an
unbalanced quote hit the hard timeout, the session respawned at the default directory with a default
environment, and the agent spent the next turns re-discovering where it had been. The tree must go and the
session must restart — that stands — and what happens *after* the restart is new, under PD-TOOLS-001: the
snapshot after each completed command (the cwd plus the exported variables, captured on the idle shell through
the session''s own marker scan rather than a private poll, which wedged the first draft), re-applied to the
fresh shell, the observation naming both the loss and the restore. The refresh is awaited, not
fired-and-forgotten: it rides the same scan a concurrent next command would overwrite. An explicit reset
clears the snapshot — the user asked for a clean shell. Aliases, functions and background jobs are not
restored and the detail says so. The timeout test now asserts the variable survives the respawn.

*Reported back 2026-09-29 (R-067), when the timeout test's intermittent `[]` was traced
([`a-hard-timeout-reset-can-lose-the-restored-variable-under-load`](../../defects/fixed/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md)):
"the snapshot after each completed command" means each command the session **sees** complete. A command that
soft-paused (REQ-TOOLS-098) and finished while the next call waited behind it is never seen. Its effects are then
missing from the snapshot a later reset re-applies, although they happened before the respawn PD-TOOLS-001 names.
The test had run into that, and now names its own timeout. Whether the directive asks for more is
[OQ-134](../open-questions.md).*

**The exit-1 map is narrowed, not widened.** The run''s `git diff --no-index` with differences exited 1
carrying the payload and read as `shell_failure`, which the agent had to explain away. REQ-TOOLS-112 test 4
stands; the carve-out is the commands whose exit 1 IS the convention — `git diff`/`diff`, `grep` and its kin
plus `findstr` on Windows — matched on the command''s own leading tokens, with a real failure kind still
outranking it. Recorded as ESC-41; the amendment round writes the carve-out into the requirement. The e2e
proof spells the search portably (`findstr` on Windows, `grep` on POSIX) because the suite runs on both.
