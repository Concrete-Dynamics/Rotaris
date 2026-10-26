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
into one pipe, stdin piped, its own process group on POSIX and inside the Job Object on Windows *(measured 2026-10-20, the Windows ARM64 session's C1: there is no Job Object of the product's; the background command ended with the run host when the run host was killed alone, at an orderly quit and when main was killed, consistent with libuv's kill-on-close job — ADR-0002, "First execution — 2026-10-20")*. It
never touches a terminal session, so the concurrency statement holds by construction. Termination is
SIGTERM, grace-until-exit capped at 5 s, then SIGKILL; on Windows, where signals do not exist, this
maps onto graceful-close-then-terminate and the specification supplies no mapping (open question
OQ-10) *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the foreground scope confirmed as built,
beside R-044's ruling for background pipe sessions)*.

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
(`taskkill /T`, then `/F` after the 5 s grace; *measured 2026-10-20, the Windows ARM64 session's B8: a pipe session's PowerShell and a node grandchild gone 5,157-5,250 ms after each of the four signals, `kill` and the stream interrupt, so the ask is never answered and the 5 s is always spent; the foreground's forced `killTree` ends a PowerShell and its node at once, `terminal.test.ts`*); `SIGINT` writes `C-c` to a foreground PTY and is refused with
`invalid_request` for a background pipe; `SIGHUP` likewise. `node-pty`'s ignored signal argument is exactly
what made the tree kill the only kill. *(OQ-10 ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the foreground scope
confirmed as built, beside R-044's ruling for background pipe sessions.)*

**Consequence 2 as met today:** under ConPTY the capture is VT-stripped, the echoed wrapper and both marker
frames removed; the headless screen emulator of ADR-0021 is not built and lands with streaming. The
`FAILED ` marker of `REQ-TOOLS-113` fires on a test-runner banner's own `failed ` — conformant, and now
stated in the test rather than argued about.

> **Superseded 2026-09-12 — the capture is the emulated screen now.** "Lands with streaming" is what did not
> happen: ADR-0021 landed, `streams.ts` runs `xtermEmulatorFactory`, and the AGENT's capture was left on the
> strip. Defect C below is that debt coming due, and what it cost is recorded there. The sentence above is
> kept because the schedule it states — the emulator arriving with streaming — is exactly the assumption that
> failed silently: streaming arrived and nobody moved the capture.

> **Narrowed 2026-09-27 — [`PD-TOOLS-003`](../../product/directives/pd-tools-003.md#pd-tools-003).** "The `FAILED ` marker of
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

*Reached in the built application 2026-10-13 (fin42).* The repair was measured by a real-PTY unit test only
(`terminal.test.ts`, `commandTimeoutS: 1`): the live run's wedge prints nothing, so it soft-paused 70 s before the
default 100 s cap on every run and could never reach it
([`the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md`](../../defects/fixed/the-live-runs-terminal-wedge-can-never-reach-the-default-hard-cap.md)).
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
  > ([`a-single-line-powershell-command-that-throws-loses-its-end-frame.md`](../../defects/fixed/a-single-line-powershell-command-that-throws-loses-its-end-frame.md)).
  > Left: 5.1 renders an error raised in the payload with the script block's text and the wrapper's line as its
  > position, the nonce included ([`windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md`](../../defects/windows-powershell-5-1s-error-text-quotes-the-terminals-wrapper.md),
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
([`a-posix-command-that-fails-to-expand-loses-its-end-marker`](../../defects/fixed/a-posix-command-that-fails-to-expand-loses-its-end-marker.md),
live-run finding L1): **the reading that neither path needed a guard is FALSIFIED, and kept here beside its
replacement.** "The single-line path keeps today's wrapper byte for byte" left the command UNGUARDED:
`printf <start>; <command>; printf <end>`. An interactive `sh` that meets an error in the line it is running
abandons the rest of that line. The errors seen were an expansion it cannot perform (`${PIPESTATUS[0]}` under dash,
`Bad substitution`), a syntax it lacks (`<(…)`, `Syntax error: "(" unexpected`) and an unterminated quote; a
trailing `# note` comments the end frame out as well. The end frame then never printed, and a command that
finished in 0.1 s read as a soft pause with exit −1 after 30 s — twice in one run, and once more under duress.
The same abandoned line put the echoed wrapper, marker included, into what the model read
([`a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker`](../../defects/fixed/a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker.md)).
`eval` is no guard: an error inside a special built-in abandons the line the same way, measured under dash and
under bash in POSIX mode. **`command eval` is the guard.** POSIX's `command` removes a special built-in's special
properties, so the error becomes that utility's own nonzero status (2 under dash) and the shell goes on to the end
frame — the posix twin of the PowerShell `try` above. Both paths now run the command as
`command eval '<command>'`: a single line single-quoted, a multi-line command through the same `printf '%b'`
carrier. The command still runs in THIS shell, so what it sets persists. The tool description now names the
shell the host runs — `/bin/sh`, a POSIX shell that may not be bash — where it named only Windows' shell.
Pinned by "REQ-TOOLS-097/098/179 (live-run L1): …" in `terminal.test.ts`, red on the unguarded wrapper.*

*Reported back 2026-10-06, from the final default live run at `c2a9444`
([`a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole`](../../defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md),
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
[`a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole`](../../defects/fixed/a-terminal-command-longer-than-the-ptys-input-line-never-reaches-the-shell-whole.md).*

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
([`an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed`](../../defects/fixed/an-empty-poll-after-a-soft-pause-says-thirty-seconds-passed.md),
live-run finding L2): "the soft pause and its poll" held as a mechanism, and **what the poll SAID was wrong**. An empty
poll returns at once, and its empty answer repeated the soft pause's sentence, "No output for 30 seconds", after under
a millisecond. The model counted thirty seconds a poll and polled five times in 21.6 s. The poll now states what it
measured on the monotonic clock: the time since the previous observation of the command, the time since the command
last wrote anything, and that a poll does not wait. How long a poll should wait is not stated anywhere:
[OQ-136](../open-questions.md), raised with this reading built.*

*Reported back 2026-09-29 (R-067), from acceptance finding A10
([`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output`](../../defects/fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md)):
the wrapper assumed it was the whole of the line the shell reads, and **keystrokes can stand in front of it**. An
agent's `is_input` or a control surface's send-keys with no Enter waits in the shell's input as a partial line under a
command that does not read it, and the next wrapped line was appended: `xyprintf: not found`, no start marker, the
whole screen kept — the paused call's late output and its own end frame with it — and, since L9, an empty live stream.
On the POSIX backend a line the product submits after keystrokes left without a line end is now preceded by the line
discipline's kill character, `^U`, which erases the partial line; the PowerShell wrapper's first statement already
takes a prefix without losing the start marker (reasoned, not measured). What becomes of such a line is stated
nowhere: [OQ-146](../open-questions.md) (OQ-143 on its branch), raised with this reading built. **A second reading is falsified and kept
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
none, reported as −1 with the reason ([OQ-147](../open-questions.md), OQ-144 on its branch, raised with that reading built). Nothing after
either boundary reaches its screen. Every row an echoed POSIX wrapper occupies is dropped from any capture
(`withoutEchoedWrappers`), and the paused call's `until` cut takes the first row carrying the next call's start marker
in any form. Pinned by eight "(A10)" cases in `terminal.test.ts`: the first repair's two; two red on the old
`onData` — the paused call's own status behind the next call, and the interrupted paused call closed by the next call
with nothing of the later calls in its poll, which is red on the first repair too; and four for the second
verification — `C-c` then `seq 1 20000`, a 300-character next call on both roads, and two pure cases over
`pausedShare` and the echo's removal. ~~A poll made after the `C-c` but before any next call still reads "still running"; that is
recorded, not repaired~~ (repaired 2026-10-01, the report-back below)
([`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md)).*

*Reported back 2026-10-01, the repair of
[`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md):
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
[OQ-168](../open-questions.md), raised with it built. Pinned by three "(OQ-147)" cases in `terminal.test.ts`; the first is
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
([OQ-168](../open-questions.md)).*

*Reported back 2026-10-06, OQ-168 ruled by the owner ([R-071](../../product/requests.md#r-071)) as recommended: **"off
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
[`output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll`](../../defects/fixed/output-a-command-writes-as-it-soft-pauses-is-lost-to-its-poll.md)
(reasoned when it was recorded, measured now with a PTY double): **the soft pause handed its call over across an await.**
`execute` removed the call's listener, awaited the emulator's write of what it held, and only then opened the paused call
`onData` feeds, so a chunk delivered inside that write reached neither: no poll returned it, and its end frame resolved the
call already settled, leaving the paused call "still running" until a later call closed it with no status. The paused
call is now opened in the same turn as the pause, before the listener goes and the write is awaited. Pinned by
"REQ-TOOLS-098/179: output and the end frame a command writes while its soft pause is handed over …" in
`terminal.test.ts`, red on the old order in both its halves.*

*Reported back 2026-10-01, the partial repair of
[`a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced`](../../defects/fixed/a-call-made-while-a-command-is-soft-paused-waits-behind-it-unannounced.md)
(live-run finding a71-8, [OQ-164](../open-questions.md)): **the queue of one held one paused call, and a second pause
replaced it.** A call issued while a command is soft-paused is queued by the shell behind it. The session treated the
paused call as the poll's alone: the new call reported only its own exit, and a soft pause of the new call disposed of
the paused one, whose end was then never reported. Measured with dash through a real PTY: an `echo` behind a paused
`sleep 3` waited about 1.9 s and said only "The command exited with code 0.". The session now keeps every open paused
call in line order (`pausedAhead`, then `pausedCommand`). Each is fed its share of the stream up to its own end frame or
the next line's printed start marker (`pausedShare`, as A10 built it), and is closed there. Every observation hands
over, beside its own subject, each paused call that ended unreported and each still running ahead of it
(`drainEarlier`, `ForegroundResult.earlier`). A reset under them reports the one the shell was running as ended by the
reset. The old line "a pause nobody ever polled is replaced here" is struck in `execute` and kept beside its
replacement. Whether such a call should wait at all is OQ-164's, not ruled. *(Ruled 2026-10-06 by the owner, [R-071](../../product/requests.md#r-071): the current behaviour is the rule — the call waits behind the paused command and reports its end.)* Pinned by two "(OQ-164)" cases in
`terminal.test.ts`, both red before the change. Five A10 cases now read the hand-over from the next call and keep their
assertions.*

*Corrected 2026-10-01, before its merge, by its verification: **the line assumed that every line written after a paused
one reaches the shell.** An interrupt (`C-c`) makes the terminal discard every line the shell has not read, so a line
queued behind the interrupted one never runs and its start marker never prints. Three readings of the first build were
false. Each is kept struck beside its replacement in `foreground.ts` and in [OQ-164](../open-questions.md):
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
[`a-command-that-exits-the-session-shell-reads-as-a-soft-pause`](../../defects/fixed/a-command-that-exits-the-session-shell-reads-as-a-soft-pause.md)
(OQ-144's sibling case): **the marker protocol also assumed that the shell outlives the command.** A command that ends
the shell (`exit 3`, `kill -9 $$`) loses the end frame as a replacement does, because the shell that would print it is
gone. The PTY's exit only made the session forget the PTY, so the call soft-paused after the whole window, and the next
call ran in a fresh shell with the directory and variables gone while it reported `session_reinitialized` false. The
shell's exit is now an event of the session (`shellExited`): a running call ends at once as an `execution_error` with no
exit code, a soft-paused call is closed for its poll to hand over the same way, and the shell is respawned with
PD-TOOLS-001's snapshot re-applied by the first of them to meet it, or by the next call when the shell ended between calls.
That call says so. Measured with dash through a real PTY: `exit 3` ended the call in 16 to 37 ms and `kill -9 $$` in 12 to
18 ms (three runs each), where both had taken the case's whole 3 s window. The reading is OQ-144's, extended in place
([OQ-144](../open-questions.md)). It is pinned by two "(OQ-144)" cases in `terminal.test.ts` beside A9's, both red on the
unrepaired code. Unlike the replacement watch it needs no `/proc`, so it holds off Linux too, but no other host has run
it.*

*Reported back 2026-09-30 (R-067), from the verifier's live run of the `fix-terminal-output` branch
([`a-command-that-replaces-the-shell-reads-as-a-soft-pause`](../../defects/fixed/a-command-that-replaces-the-shell-reads-as-a-soft-pause.md),
acceptance finding A9): **the marker protocol's premise — that the shell which printed the start frame is the one left
to print the end frame — does not hold for a command that replaces the shell.** `exec bash` keeps the pid and never
returns to the rest of the wrapped line; the call soft-paused after 30,027 ms and every later call ran under bash. It
is L1's class by another road, and `command eval` is no guard against it, because `exec` succeeds. The session now
watches the process behind its pid while a call runs, against the identity its shell had when it last answered one of
the product's own lines (`/proc`'s executable and argument vector; a fresh shell answers one no-op line first). A
different process ends the call within 200 ms as an `execution_error` with no exit code, and the session restarts on
its shell with PD-TOOLS-001's snapshot re-applied. The POSIX description says not to replace the shell. Neither the
answer nor the restart is stated anywhere: [OQ-144](../open-questions.md), raised with this reading built. Off on
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
([`a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load`](../../defects/fixed/a-call-waiting-behind-a-soft-paused-command-that-ends-the-shell-can-read-as-replacing-the-shell-under-load.md);
`terminal.test.ts`, "OQ-144 / OQ-164: a process on its way out reads no identity, never another program's"). The same
rule reads as no identity a program in the shell's place that runs with an empty argument vector of its own (an `execve`
with argc 0) on a Linux kernel before 5.18, which therefore goes unwatched; from 5.18 the kernel gives such an `execve` one
empty argument, which reads as an identity (measured on 6.18; fin46, 2026-10-14,
[`processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched`](../../defects/fixed/processidentitys-comment-does-not-say-an-exec-with-an-empty-argument-vector-goes-unwatched.md)).*

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

## Fourth first execution — 2026-09-29, a SIGINT the shell discarded, sent again (OQ-135, R-067)

The background session's signal delivery (REQ-TOOLS-110, REQ-TOOLS-128; OQ-10 as ruled in R-044) had been executed as
delivery once to the session's group. Acceptance finding A8 graded its known exposure a product defect. Where
`/bin/sh` is `dash`, a SIGINT landing between `dash`'s `vfork` and its command's `exec` is discarded by the command,
and the session runs on until the command ends. Measured through `BackgroundManager` on the branch before the repair,
45 of 200 `sleep 30` sessions signalled the instant they started were still running 3 s later under six CPU burners.
**Found: delivery reached every process, as decided, and did not stop the session, which R-044 rules it must.** The
repair keeps delivery to the group and adds a check ~~on Linux, the one host whose `/bin/sh` has the window~~ *on Linux,
where the session's shell is `dash` (corrected 2026-09-30, fix round 3; below)*. ~~At 250 ms and
1.5 s, while the session runs, the process table (`linuxProcessTable`, `@rotaris/platform`) is read for members that
never received the signal: alive at SIGINT's default, created within one second before it. Each is sent SIGINT once
more, alone (`missedSigint`), and the re-delivery is logged. After it, 0 of 200 ran on, with and without the burners.
A command that catches SIGINT is never sent a second.~~ *Falsified 2026-09-30 by the verifier, kept beside its
replacement: "alive at the default, created within a second before the signal" is also how a command stands whose
one-shot handler (`process.once('SIGINT')`) restored the default as it ran, so such a command signalled the instant it
was up was sent a second SIGINT that cut its shutdown off.* The group is now read the instant before the signal
(`ProcessTable.tree`, a walk of the shell's descendants, so the reading does not push the signal past the window), and
again at 250 ms and 1.5 s while the session runs. ~~A member is sent SIGINT once more, alone (`missedSigint`), only when
the first reading found it still the shell, holding SIGINT off (the aimed reading found `dash` and its `vfork`ed child
both `blocked`), and the later one finds it running another image at SIGINT's default. A process the first reading
found running the command is never sent a second. With that predicate 0 of 200 ran on under six burners (twice) and
without them; with re-delivery disabled, 8 of 200 still ran on under the burners.~~ *Falsified 2026-09-30 by the
verifier's second round, kept beside its replacement: "at SIGINT's default" and "its name changed" miss what a dev server
or a watcher is. Node catches SIGINT as it starts (as Python and a shell do), and a shell `exec`ing a shell keeps the
name `sh`; 27 of 150 Node sessions and 39 of 200 `sh -c 'sleep 30; echo x'` sessions still ran on under six burners,
with `sleep 30` alone passing.* A member the first reading found still the shell and not ignoring SIGINT is now sent it
again, alone, when it runs another image, told by its name **or its arguments** (`/proc/<pid>/cmdline`), whatever it now
does with SIGINT; where it had started nothing and is still the shell, what it started since is sent it; and with each,
its descendants the first reading did not hold. A process the first reading found running the command is never sent a
second, nor what it starts on receiving it. With that predicate 0 ran on of 150 Node, 200 `sh -c`, 200 `sh x.sh` and 200
`sleep 30` sessions under six burners, against 15, 18, 28 and 5 with the check disabled. *Falsified 2026-09-30 by the
verifier's third round, kept beside its replacement: "on Linux, the one host whose `/bin/sh` has the window" and "nor
what it starts on receiving it" hold of `dash` alone. Where `/bin/sh` is `bash` (Fedora, RHEL, Arch), `bash` absorbs a
SIGINT its command handled, goes on when that command exits 0, and `exec`s the last command of its `-c` list in place,
so that clean-up — a shell replaced after the signal, by name and arguments — was sent a second SIGINT that killed it,
under a false "vfork window" warning (measured through the manager with a `sh` link to `/bin/bash` 5.2, signalled 1 s
and 5 s after the start, with `;` and `&&`).* The check is now armed only where the session's shell is `dash`, told
once per manager by the shell file's real path (`hasVforkWindow`); any other shell is signalled once, and the same
command under `bash` completes with its clean-up and no warning. Aimed at `dash`'s window without burners, 0 of 900 ran
on either side of that correction. OQ-135 records the reading,
its residue (an `exec` inside the reading's step; a script that traps SIGINT overridden; a shell other than `dash` not
read), and stays open *(ruled 2026-10-06, [R-071](../../product/requests.md#r-071): the narrow re-delivery accepted
as built where the session's shell is `dash` on Linux, with that residue; `PD-TOOLS-010`)*
([the note](../../defects/fixed/a-sigint-that-reaches-a-command-as-sh-starts-it-does-not-stop-the-session.md)).

## Fifth first execution — 2026-10-04, the session's shell is `bash` (`/bin/sh` on Fedora, RHEL, Arch)

Every real-PTY case above was measured where `/bin/sh` is `dash`. Another author's Linux machine ran the file on an
unmodified `main` and two cases failed there, alone and in the full suite
([the note](../../defects/fixed/two-terminal-pty-tests-fail-on-main-in-this-environment.md)). Varied one at a time on
this host, through a real PTY, at load averages 0.6 to 3.6 on four CPUs: `dash` at 240, 80 and 1,000 columns, with
`LANG=C.UTF-8`, with an `$ENV` startup file that sets `PS1` and `set -o emacs`, and under six CPU burners, passed both;
a `sh` link to `/usr/bin/bash` 5.2 (POSIX mode) failed both, at 240 and 80 columns and with `LANG=C.UTF-8`, as did
`/usr/bin/bash` itself; at 1,000 columns, where the wrapper fits on one row, only the first failed. **Found two defects,
one the product's and one the test's.**

**The product's: A10's echo removal held only where the echo is the line discipline's.** "A wrapper wider than the
screen wraps" (`withoutEchoedWrappers`) is how the kernel echoes. `bash -i` reads its input through readline, which on
the session's `dumb` terminal does not wrap a line wider than the screen: it scrolls it sideways on ONE row, its head
replaced by `<`, redrawn in place. The joined-rows match never met that row, and the next call's wrapper
(`<QQQ…'; printf '__rot_…_e:%s\n' "$?"`) reached the interrupted call's poll. The POSIX shell now starts with its
line editor off, `+o emacs +o vi -i`, where it takes those options (asked once per shell file with the same arguments,
`posixShellArgs`; `dash` has no editor and takes them as a no-op; a shell that refuses them starts with `-i` as before),
so the echo is the line discipline's again. A row an editor still draws — a startup file that turns one back on, or a
shell that refused the options — is dropped by the end statement it carries (`ECHOED_POSIX_END`), which the printed end
frame, never quoted, cannot spell. Each half alone made the case green under bash; the `$ENV` variant needs the
second.

**The test's: the L1 case read dash's error as every shell's.** `${PIPESTATUS[0]}` is a bash-ism `dash` cannot expand;
`bash` expands it, so the call ended with exit 0, which is right. The line now ends on `${a b}`, which no POSIX shell
expands. No product change: `command eval` guards the line under `bash` as under `dash` (measured: `bash -i` printed
the end frame with status 1 after `bad substitution`).

Pinned by the two cases' twins "… under bash as `/bin/sh` …" in `terminal.test.ts`, which run wherever bash is
installed through a `sh` link to it (red without the repair: the line editor read `on`), by "the echo a shell's own
line editor draws of a wrapper wider than the screen …" (red without `ECHOED_POSIX_END`) and by "the POSIX shell is
started interactive with its own line editor off …". The whole file passed with the host's `dash` and, run once more
with the session's shell overridden to the `bash` link, 82 passed and 1 skipped. **Could not show:** macOS, whose `/bin/sh` is a
`bash` 3.2 (or a `zsh` or `dash` it is pointed at) and where no host has run it; Windows is untouched (PowerShell).

**Corrected at its verification, the same day: no width was safe below the frames' own, nor the editor's row below
about 50 columns.** FALSIFIED, kept above beside its replacement: "a row an editor still draws … is dropped by the end
statement it carries (`ECHOED_POSIX_END`)". The display resizes the foreground PTY (REQ-TOOLS-128), down to
REQ-SHELL-100's 20 columns, and readline's sideways window then shows only a TAIL of that statement, its nonce cut
(`<74a244a85f47_e:%s\n' "$?"` at 40 columns, `<:%s\n' "$?"` at 20). Measured through a real PTY with a `sh` link to bash
5.2 and an `$ENV` file that turns emacs editing back on: the row reached the interrupted call's poll at 40 and 50 columns,
not at 80 or 240. Varying the width under `dash` found a second, older leak that no shell choice avoids: every capture
read its frames row by row (a row that ends with the start marker, a row that carries a later marker, the end frame
within one line), and a frame is 32 columns or more, so at 20 and 30 columns each call's capture began with its own
wrapped start frame and ended with its wrapped end frame and the prompt, and a paused call's poll carried its own end
frame or the next call's start frame; at 34 columns and wider nothing leaked. The capture now reads every marker across
row breaks (`joinedRows`, `firstRowEnd`, the end frame matched with a break allowed between any two characters), and a
row that is `<` followed by any tail of the end statement, matched against its template with a hex digit where the nonce
stands, is dropped like the wider row (`scrolledEcho`). Re-measured after the repair: `dash` at 10, 20, 30, 33 and 40
columns and the bash link with the editor on at 10, 20, 30, 40, 50 and 80 columns, both roads, nothing leaked. Pinned by
"the sideways-scrolled row is dropped at any width …" and "a frame the screen wraps … is found across its rows …" (pure,
red without the repair), "at the display's 20-column floor a call's capture and a paused call's poll carry no frame and
no echo" (real PTY, the host's shell) and "under bash as `/bin/sh` with its line editor turned back on by `$ENV`, no width
lets the echo of a next call reach the paused call's poll" (real PTY at 20, 40 and 240 columns), both red without it.
Found on the way and recorded, not repaired here: PD-TOOLS-001's snapshot reads its `__rot_b64__:` rows one screen row
at a time, so below 76 columns it decodes a corrupted environment
([the note](../../defects/fixed/the-shell-state-snapshot-is-corrupted-on-a-screen-narrower-than-its-rows.md)).

*Reported back 2026-10-06 (finacc2's acceptance finding A4), when that note was repaired:* the third first execution's
snapshot is now read across the screen's row breaks. The capture's rows are joined with nothing between them, as the
frames already were, and each `__rot_b64__:` opens one 64-character row of base64, which holds no newline of its own;
a capture whose rows are not 64 characters but the last, is not padded base64, or does not decode to NUL-terminated
entries is refused and the previous one kept (`encodedSnapshot`). The encoder's own line breaks are taken out before the
fold, so the 64 holds on every host. Measured under `dash` through a real PTY before the change, a capture at 75, 40, 30,
20 and 10 columns lost `PATH` or the directory or parsed to nothing, and a reset at 20 columns said its restore failed;
after it, every width from 10 to 240 read the 240-column capture, and a reset at 20 and 40 columns restored the
directory and the variables whole. The PowerShell capture is left as it was, its wrap recorded open
([the PowerShell note](../../defects/fixed/the-powershell-shell-state-snapshot-joins-a-wrapped-row-with-a-newline.md)).

*Reported back 2026-10-06 (fin21, bundle `fin21-leftover-notes`), when the PowerShell note was repaired:* the PowerShell
capture now prints the same encoded rows, spelled in PowerShell — a `__rot_ps__` tag field, the directory and every
`NAME=value`, NUL-terminated, UTF-8, base64, 64 characters a row behind `__rot_b64__:` — and `parseSnapshot` reads both
backends through `encodedSnapshot`; the tag stands in for POSIX's leading `/` in refusing a capture that lost its top
rows. Pinned on Linux over the parse through the `@xterm/headless` emulator at 20 to 240 columns, from the rows the
command's loop prints. **Not executed:** no Windows host and no `pwsh` here, so the PowerShell capture's first execution
is still owed, and it reports back here.

*Reported back 2026-10-15, the PowerShell capture's first execution on a real PTY (Windows 11 ARM64 (build 26200.9457),
Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell 5.1, at `fbbc3d23`; the Windows ARM64 session's B2;
windows-arm64 only, OQ-400).* **Held from 34 columns up.** A new case, three runs under each shell, read the capture whole
off the screen and restored the directory (170 characters) and every variable byte for byte across a hard-timeout reset at
34, 40, 64, 75, 76, 77, 120 and 240 columns: a `Path` with 24 extra entries, a 600-character value, a non-ASCII one, one
PowerShell would read as code; a spawn variable the command removed stayed removed; with one exclusion under 5.1 only, the
product's own empty `PSModuleAnalysisCachePath`, lost across the reset
([recorded](../../defects/windows-powershell-5-1-loses-the-spawn-environments-empty-psmoduleanalysiscachepath-across-a-reset.md)).
The capture took 139 to 220 ms of its 15 s; the restore line was 3,009 to 3,165 characters, which bears on M1's
unmeasured line cap. **Not reached below 34 columns:** there no PowerShell call ends at all. ConPTY writes a wrapped row as
a hard `\r\n`, a cursor move back to the row it left and that column's character again, and the frame match over the
VT-stripped stream (`${end}:(-?\d+)`) never meets a 34-character frame split that way
([`below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md`](../../defects/fixed/below-34-columns-every-powershell-call-runs-to-its-hard-timeout.md),
recorded, not repaired). *(Repaired the same day on the owner's ruling: ConPTY's wrapped rows are rejoined in the text the
frame match reads (`rejoinConptyWraps`), and the sweep now restores byte for byte at 20 and 33 columns too, under both
shells. The live tap's own raw scan is not rejoined and is unmeasured at those widths.)* And a restore line whose `Set-Item` fails still exits 0, so a partial restore reads "were
restored" ([recorded](../../defects/a-powershell-restore-whose-set-item-fails-is-still-reported-restored.md)).
*(2026-10-15, Windows 11 ARM64 (build 26200.9457), pwsh 7.6.6 and Windows PowerShell 5.1, the session's B1: one real
PowerShell capture and restore ran, in "PD-TOOLS-001 (OQ-134): a reset restores the snapshot of the last command the
product saw complete", green in every run under both shells (about 17 s); the emulated-screen parse cases ran too. The
width sweep over a real PTY ("at 20 and 40 columns a hard-timeout reset restores …") is POSIX-only and skipped here; the
session's B2 owes it.)*

## The suite on Windows 11 ARM64 — 2026-10-15, the PowerShell branch's first counted Windows run since 2026-10-02

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, at `b9e30052`; the full suite four
times ([first-executions](../first-executions.md), the row of that date). It measures windows-arm64 only (OQ-400).*

**The shell the branch took was not the one installed.** `winget install Microsoft.PowerShell` gave this host pwsh 7.6.7 as
its MSIX package, reached through an App Execution Alias on `PATH`. `findShell` accepts a candidate only when
`existsSync(f) && statSync(f).isFile()`; on the alias Node answers `EACCES` and `false`, though spawning it runs pwsh. So
`findShell` passed over it and every real-PTY case of the first two runs ran under Windows PowerShell 5.1:
[`the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md`](../../defects/fixed/the-terminal-never-finds-a-pwsh-installed-as-an-app-execution-alias.md),
recorded, not repaired. "`pwsh` else `powershell`, presence-only availability" (the first execution above) holds only for a
pwsh that is a plain file on `PATH`. *(Repaired the same day on the owner's ruling: `findShell` and `findExecutable` take a
candidate through `presentExecutable` (`@rotaris/platform`), which accepts an alias — `stat` refused with `EACCES`, `lstat`
reading a link — and a real call through the MSIX pwsh's alias answered `Core`, exit 0.)*

**Under pwsh 7.6.6 arm64 (a zip install, first on `PATH`), `terminal.test.ts` passed 64 and skipped 45, `streams.test.ts`
15 and 6, `background.test.ts` 8 and 13**, every skip POSIX-only (`it.skipIf(PS)`, a `dash` or `bash` `/bin/sh`) or a proof
directory not given. Two cases were spelled for one host and were repaired in that change
([`seven-unit-cases-…`](../../defects/fixed/seven-unit-cases-pin-a-posix-or-case-sensitive-host-and-go-red-on-windows.md),
item 7): the pure M1 case matched the staged script's path with `/`, and "the capture is the emulated screen" pinned pwsh 7's
`Format-List` padding, which 5.1 prints narrower. **Under 5.1, one more case went red: "a real diff-with-differences reads
success".** Its command is `git diff --no-index -- a b || true; git diff --no-index -- a b`; 5.1 cannot parse `||`, and the
call did not fail at once with the parse error but ran to its 15 s cap and reported `124`. That is the shape of the
single-line terminating-error bullet above, now seen on a parse error; the session's B3 measures it. Three cases the record
names for Windows never run on a Windows host: the OQ-168 cases "on win32 a poll after C-c writes nothing" (and its darwin
twin) and "on Windows a poll after C-c writes nothing into a program that survived the interrupt" act Windows out through
a POSIX shell and are skipped where `PS` holds.

## A10 on PowerShell — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6 and Windows PowerShell 5.1, three runs each, at
`f9076e70`; the Windows ARM64 session's B5.* A10's report-backs above were reasoned for PowerShell and measured on POSIX only.
On PowerShell: keystrokes left without Enter under a soft-paused command, by `is_input` and by send-keys, leak nothing into
the next call (its output, its live tap and its status its own; the paused command's late output handed over as earlier
output), and a native `cmd /c exit 3` before it leaves no stale status (the next call reads 0, or 1 where it fails). A paused
command that ends behind the next call reports its own status, 1. After C-c, a poll at once is OQ-168's soft pause, and the
next calls report the paused command's end once, with no status of its own, each with its own output; nothing of the later
calls or the snapshot reaches it. **Found:** PowerShell discards a line written in the same tick as the C-c, so the POSIX
case that writes its next command at once stays POSIX-only
([`on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md`](../../defects/on-windows-a-command-written-in-the-same-tick-as-a-c-c-is-swallowed.md)).
**Not run:** a long call after C-c (`1..20000`) and the wide echo on both roads.

## First live execution on Windows — 2026-10-20

The win32 terminal shapes ran against a real model for the first time (the Windows ARM64 session's live run; Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, pwsh 7.6.6, at `00957641`; pack `2026-10-20T07-55-35-723Z`; [`live-00957641-windows-terminal-frictions-crlf-autopsy.md`](../live-runs/live-00957641-windows-terminal-frictions-crlf-autopsy.md)). All 11 shapes were attempted and every check passed: the here-string's five lines and both of its output lines, all 40 long-output lines, the wedge's soft pause, `steady` capped at 100 s (exit 124, `session_reset`, the restored state named), an honest poll, OQ-164's paused end reported behind a new command, `git diff`'s exit 1 and a lower-case `failed` left `success`, the pipe-to-shell denied by the starter rule, no `__rot_` marker in any result. The interrupt shape did not go red as expected: the wedge had ended 3,609 ms before the model's interrupt arrived, so it reached nothing and was a NOTE; OQ-168's Windows C-c is still unread by a live model. `frictions`' SIGINT was not taken either (OQ-10's entry).
