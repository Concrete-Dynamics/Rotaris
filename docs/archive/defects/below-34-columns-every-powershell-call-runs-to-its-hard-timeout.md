## Below 34 columns every PowerShell call runs to its hard timeout

**Repaired 2026-10-15** (the owner's ruling that day: repair it). `rejoinConptyWraps` (`classify.ts`) puts ConPTY's wrapped
rows back together in the raw text the frame match reads (`foreground.ts`, before `stripVt`): a character, the line end, a
cursor move, and the same character again, any control sequence allowed between (a colour; under Windows PowerShell 5.1
the cursor hidden, `<ESC>[?25l`, before the line end), the repainted character kept once. The emulator is still given the
bytes as they came. Red before on this host: PD-TOOLS-001's PowerShell sweep put back at 20 and 33 columns ("setup at 20:
expected 124") and a pure case over the two recorded raw shapes; green after, in three runs each of `terminal.test.ts`,
`streams.test.ts` and `background.test.ts` under pwsh 7.6.6 and under 5.1 (90 passed, 64 skipped), the sweep restoring the
directory and environment byte for byte at all ten widths from 20 to 240. **Not measured:** the live stream's
`CommandRegion` and the paused calls' shares read raw chunks for the markers the same way, without the rejoin, so at
these widths the live preview may still carry the wrapper or nothing; no case narrows a live tap.

Measured 2026-10-15 on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, dev tree, pwsh 7.6.6 arm64, at `fbbc3d23`,
and on `3c3f4478` (before the B3 repair) the same (the Windows ARM64 session's B2). A session whose PTY the display resized
to 33 columns or fewer never sees a call's end frame: every command, `Write-Output` of 50 characters included, prints its
output and then runs to its hard cap, exit 124, `timeout`, `session_reset`. At 34 columns and wider every command ended in
about 0.1 s (a scratch probe at 240, 120, 76, 40, 34, 33 and 20 columns, commands of 50 to 2,000 characters, a fresh
`TerminalManager` each). At 33 the capture also carries the tail of the echoed wrapper (`…XITCODE } else { 1 } }))`) and
the start marker.

The end frame `__rot_<24 hex>_e:<status>` is 34 characters, so below 34 columns it wraps. ConPTY does not soft-wrap it in the
byte stream: it writes the row, a hard `\r\n`, a cursor move back to the last column of the row it left (`ESC[49;33H`), that
column's character again, and the rest. The product's raw stream at 33 columns ended
`…_e:\r\nESC[49;33H:0\r\nPS>`, which stripped of escapes reads `…_e:` / `:0`, and the frame detection
(`new RegExp(\`${end}:(-?\\d+)\`)` over `stripVt(pendingText)`) never matches. The POSIX backend's frame is found across
the screen's rows (`joinedRows`, live-run A10 and fin15's repairs); the PowerShell stream is read before the emulator.

REQ-TOOLS-128 lets the display narrow the PTY to 20 columns (the terminal window's pane), so a person who narrows the pane
on Windows makes every agent command that follows wait out its whole timeout and lose its session state to a reset.

Not repaired (record-only; B2 of the session measures and does not repair).

## Specs

REQ-TOOLS-128 (the PTY follows the display's size, down to 20 columns), with REQ-TOOLS-097/099 (124 and a reset belong to a
command that ran past its hard timeout) and REQ-TOOLS-179 (a command's own exit status). PD-TOOLS-001's capture is read at
those widths too, and cannot be reached while every call wedges.

## Relevant files

- `packages/agent-tools/src/terminal/foreground.ts` — the active and paused calls' frame match over `stripVt(this.pendingText)`
  (`frame`), and `stripVt`, which removes the cursor move and keeps the `\r\n` ConPTY wrote.
- `packages/agent-tools/src/terminal/classify.ts` — `stripVt`.
- `packages/agent-tools/src/terminal/terminal.test.ts` — the PD-TOOLS-001 PowerShell sweep, which runs from 34 columns for this
  reason.
