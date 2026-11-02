## Keystrokes left without Enter leak a paused command's end marker into the next output

Some keystrokes can reach the shell's input while a soft-paused command still runs and does not read them. This
happens when an agent's `is_input` text or a control-surface `send-keys` has no Enter. The line discipline holds those
keystrokes, and the next wrapped command line is appended to them. The wrapper's first word is then prefixed, so the
start marker's `printf` fails and is never printed. With no start marker, the capture keeps the whole screen. What the
agent reads for the next call then carries the previous command's late output and that command's own end frame,
`__rot_<nonce>_e:<code>`. The call's own command still runs, and its exit code is still right.

Noticed 2026-09-29 while repairing
[`a-hard-timeout-reset-can-lose-the-restored-variable-under-load`](a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md)
under R-067. In `terminal.test.ts` the OQ-38 case types `x` (`is_input`) and `y` (`sendKeys`) while its `sleep 3`
runs. The next case's `export ROTARIS_GONE='set'` then read back, verbatim:
- `done-later`
- `__rot_8313a2e32028327cb6b56dd9_e:0`
- `# /bin/sh: 2: xyprintf: not found`

The detail was `exit_code` 0 and `success`. Recorded, not repaired.

Since live-run L9's repair (2026-09-29) the same road also blanks the live preview. The foreground tap passes bytes
only after the printed start marker (`CommandRegion`), and here that marker is never printed, so the region never
opens and the call's live stream carries nothing until its closing frame. Before that repair the preview showed
everything the PTY carried.

## Outcome

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067), as acceptance finding A10. Confirmed first on the
branch: the case below, run against `/bin/sh` (dash) through a real PTY on the unrepaired code, read back
`done-later`, `__rot_…_e:0` and `# /bin/sh: 4: xyprintf: not found` above the call's own output.

- **The partial line is cleared, not prefixed.** `ForegroundSession` remembers whether the last keystrokes it wrote
  (`sendInput`, the road of both an agent's `is_input` and a control surface's send-keys) ended without a line end.
  On the POSIX backend the next line it submits — a command, or its own snapshot or restore (`submit`) — is then
  preceded by the line discipline's kill character, `^U`, which node-pty sets as `VKILL`. The start marker prints
  again, so the capture starts after it and the live stream's `CommandRegion` opens on it. Keystrokes that end their
  own line clear nothing. PowerShell is unchanged: its first statement takes the prefix, not the start marker
  (reasoned, not measured on this Linux host; *measured 2026-10-15 on Windows 11 ARM64 under pwsh 7.6.6 and 5.1, three runs
  each: `x` typed with no Enter and `y` through send-keys under a soft-paused command leaked nothing into the next call — its
  output its own, no `__rot_`, nothing "not recognized", the live tap its own line, the paused command's `done-later`
  handed over as earlier output — and after a native `cmd /c exit 3` the next call's status was its own, 0 or 1*). What becomes of a partial line no one ended is stated nowhere, so the
  reading built is raised as [OQ-146](../../architecture/open-questions.md) (OQ-143 on its branch).
- **The paused call's end frame is its own.** ~~`onData` matched only the active call's frame while a call was
  active, so a soft-paused command that ended behind the next call never read as finished, and the poll after it said
  "still running" with exit −1. Both frames are now matched, the paused one's first.~~ **That account was falsified by
  the repair's verification (2026-09-30)**: the old `onData` did close the paused call when the next call's frame
  arrived, and with it restored the case below still passed. What it got wrong was the status and the collection. The
  paused call took the next call's exit status, so a paused `sleep 3; …; false` behind an `echo` read 0. And a paused
  call interrupted with `C-c` (REQ-TOOLS-098's advice), whose line an interactive `sh` abandons before its frame, was
  closed with the next call's 0 while its listener stayed: its poll read 8 marker frames and 582 `__rot_b64__` lines of
  the PD-TOOLS-001 snapshot, which encode the shell's environment. The first repair's form — close on the paused frame
  only — read that interrupted call "still running" on every poll. ~~Now the paused call closes on its own frame with
  its own status, or else on the next call's frame with none: its poll reports −1 with the reason, not a soft pause,
  its output stops at the next call's printed start marker, and its listener goes with it.~~ **That account was
  falsified in turn by the second verification (2026-09-30)**: the listener fed the paused screen until the next
  call's END frame, and the cut at the start marker ran over that screen, so a next call longer than the screen keeps
  (`seq 1 20000`, beyond `FOREGROUND_SCREEN_LINES`) scrolled the marker off, nothing was cut, and the poll read 72,527
  characters of that call's output, its end frame, the prompt and a false `output_truncated`. Now the paused call is no
  listener at all: `onData` gives it its share of each chunk (`pausedShare`), which ends at its own end frame, or at the
  next call's PRINTED start marker, which the shell writes only once the paused line is done. It closes there — on its
  own frame with its own status, or at that marker with none: its poll reports −1 with the reason, not a soft pause
  ([OQ-147](../../architecture/open-questions.md), OQ-144 on its branch) — and nothing after either boundary reaches its screen, however long
  the next call runs. The next call's end frame still closes it, with no status, should the marker not be seen on the
  raw stream. All three falsified readings are kept beside the replacement in `onData`. What a reset restores is
  unchanged: no snapshot is taken for a paused call's completion ([OQ-134](../../architecture/open-questions.md)). A
  poll made after the `C-c` but before any next call still reads −1; that is recorded, not repaired
  ([`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](a-poll-after-c-c-says-the-interrupted-command-is-still-running.md)).
- **The echo of the next call's wrapper is dropped whole.** Found by the second verification (2026-09-30): the line
  discipline echoes the next call's wrapper onto the paused call's screen as it is written, and a wrapper wider than
  the screen (240 columns) wraps. `cleanLines` dropped only the row that begins the echo (`printf '%s`), so its
  continuation rows — the command's text and `printf '__rot_…_e:%s\n' "$?"` — reached the paused call's poll on both
  roads: interrupted, and ended on its own behind the next call, where the poll read them above `done-later` with exit 0.
  The second road was present on `origin/main` too (measured by the verifier with its `foreground.ts` swapped in). Every
  row a POSIX wrapper's echo occupies is now matched on the rows joined without separators, whatever the breaks, and
  dropped whole (`withoutEchoedWrappers`); the paused call's `until` cut takes the first row that carries the next
  call's start marker in any form, printed or echoed.

Pinned by eight cases in `packages/agent-tools/src/terminal/terminal.test.ts`:
- "REQ-TOOLS-096/097/127 (A10): …" (a real shell): the next call reads only its own output, its live tap carries only
  that, and the poll after reads `done-later` with exit 0. Red on the unrepaired code through the `^U` half. ~~Red on the
  poll's exit alone with only the frame matching reverted~~ — falsified: that "revert" was a form that never shipped,
  and this case passes on the old `onData`.
- "REQ-TOOLS-096 (A10): …" (a PTY double): `^U` precedes the next line only after keystrokes left without a line end,
  and never on PowerShell.
- "REQ-TOOLS-098/179 (A10): …" (a real shell): a paused `sleep 3; …; false` that ends behind the next call reports 1,
  `shell_failure`. Red on the old `onData`, which reported 0.
- "REQ-TOOLS-098/127/179 (A10): …" (a real shell): a paused `sleep 20; …` interrupted with `C-c`, then two calls, then
  a poll that reads −1 and `execution_error` with the reason, and nothing of the later calls, their frames or the
  snapshot; a second poll finds nothing to poll. Red on the old `onData` (exit 0, frames and snapshot lines) and on the
  first repair ("still running").
- "REQ-TOOLS-098/127 (A10): after C-c, a next call longer than …" (a real shell): `C-c`, then `seq 1 20000`, then a
  poll with no `__rot_`, no number line of that call and no `output_truncated`. Red on the first repair (the frame and
  the truncation), and red again with only the close at the start marker removed.
- "REQ-TOOLS-127 (A10): the echo of a next call wider than the screen …" (a real shell): a 300-character `printf` as
  the next call, on both roads; neither poll carries `QQQ`, `"$?"` or `__rot_`. Red on the first repair (the first road
  read the echo's rows above `done-later`), and red again with only `withoutEchoedWrappers` removed.
- "REQ-TOOLS-098/127 (A10): a soft-paused call collects up to …" (pure): `pausedShare` over every two-way split of the
  stream, the echo quoting the next marker told from the printed one.
- "REQ-TOOLS-127 (A10): the echo of a POSIX wrapper wider than the screen …" (pure): the echo broken at 40, 80, 239, 240
  and 241 columns, each row's trailing space trimmed as the emulator trims it.

ADR-0020 is reported back in place, with a row in [`first-executions.md`](../../architecture/first-executions.md).

## Specs

- `REQ-TOOLS-127`: every frame is faithful to what the command wrote, and the wrapper and its markers are the
  product's, not the command's. The sibling
  [`a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker`](a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker.md)
  records the same leak by another road.
- `REQ-TOOLS-096`: keystrokes are written as is. The prefixing follows from that, so the leak, not the prefix, is the
  defect. Whether the product should clear a pending partial line before it writes a command is not stated.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts`:
  - `sendInput` writes the keystrokes;
  - `execute` writes the wrapped line after whatever the shell's input holds;
  - `cleanLines` keeps the whole screen when no row ends with the start marker, and cuts only the call's own end frame;
  - `onData` matches only the active call's end marker while a paused call's is also in the stream;
  - `cleanLines` drops only the first row of an echoed wrapper (found by the second verification).
- `packages/agent-tools/src/terminal/terminal.test.ts`: "OQ-38 ruled 2026-09-11: …" leaves the keystrokes, and
  "REQ-TOOLS-097/099: the hard timeout kills the tree, …" is the next call.
