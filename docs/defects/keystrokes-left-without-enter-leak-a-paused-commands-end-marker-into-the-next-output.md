## Keystrokes left without Enter leak a paused command's end marker into the next output

Some keystrokes can reach the shell's input while a soft-paused command still runs and does not read them. This
happens when an agent's `is_input` text or a control-surface `send-keys` has no Enter. The line discipline holds those
keystrokes, and the next wrapped command line is appended to them. The wrapper's first word is then prefixed, so the
start marker's `printf` fails and is never printed. With no start marker, the capture keeps the whole screen. What the
agent reads for the next call then carries the previous command's late output and that command's own end frame,
`__rot_<nonce>_e:<code>`. The call's own command still runs, and its exit code is still right.

Noticed 2026-09-29 while repairing
[`a-hard-timeout-reset-can-lose-the-restored-variable-under-load`](fixed/a-hard-timeout-reset-can-lose-the-restored-variable-under-load.md)
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

## Specs

- `REQ-TOOLS-127`: every frame is faithful to what the command wrote, and the wrapper and its markers are the
  product's, not the command's. The sibling
  [`a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker`](fixed/a-command-sh-cannot-parse-shows-the-agent-the-wrappers-end-marker.md)
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
