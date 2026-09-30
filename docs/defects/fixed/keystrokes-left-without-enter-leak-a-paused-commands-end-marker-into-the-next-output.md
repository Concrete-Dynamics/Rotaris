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
  (reasoned, not measured on this Linux host). What becomes of a partial line no one ended is stated nowhere, so the
  reading built is raised as [OQ-143](../../architecture/open-questions.md).
- **The paused call's end frame is its own.** `onData` matched only the active call's frame while a call was active,
  so a soft-paused command that ended behind the next call never read as finished, and the poll after it said "still
  running" with exit −1. Both frames are now matched, the paused one's first. The falsified reading is kept beside its
  replacement in `onData`. What a reset restores is unchanged: no snapshot is taken for a paused call's completion
  ([OQ-134](../../architecture/open-questions.md)).

Pinned by two cases in `packages/agent-tools/src/terminal/terminal.test.ts`: "REQ-TOOLS-096/097/127 (A10): …" (a real
shell: the next call reads only its own output, its live tap carries only that, and the poll after reads `done-later`
with exit 0; red on the unrepaired code, and red on the poll's exit alone with only the frame matching reverted), and
"REQ-TOOLS-096 (A10): …" (a PTY double: `^U` precedes the next line only after keystrokes left without a line end,
and never on PowerShell). ADR-0020 is reported back in place, with a row in
[`first-executions.md`](../../architecture/first-executions.md).

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
  - `onData` matches only the active call's end marker while a paused call's is also in the stream.
- `packages/agent-tools/src/terminal/terminal.test.ts`: "OQ-38 ruled 2026-09-11: …" leaves the keystrokes, and
  "REQ-TOOLS-097/099: the hard timeout kills the tree, …" is the next call.
