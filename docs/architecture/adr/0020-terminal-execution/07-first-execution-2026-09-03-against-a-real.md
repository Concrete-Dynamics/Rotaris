# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — First execution — 2026-09-03, against a real PowerShell through a real PTY

Part 7 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

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
what made the tree kill the only kill. *(OQ-10 ruled 2026-10-06, [R-071](../../../product/requests.md#r-071): the foreground scope
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

> **Narrowed 2026-09-27 — [`PD-TOOLS-003`](../../../product/directives/pd-tools-003.md#pd-tools-003).** "The `FAILED ` marker of
> `REQ-TOOLS-113` fires on a test-runner banner's own `failed `" no longer holds: the directive matches that
> marker in capitals only, so a banner's lower-case `failed ` warns through the banner check alone. The assertion
> that stated the old reading now uses a capital `==== 1 FAILED ====` banner, which still raises both warnings,
> and a new `PD-TOOLS-003` case pins a lower-case banner raising the banner warning alone. The sentence is kept as
> it was written.

**Not built:** confinement (ADR-0022; no backend exists on this platform and `sandbox_mode` is fixed
`off`), live streaming and the terminal window (ADR-0021, `REQ-TOOLS-126` onward — with streaming off the
command still runs), the persisted `runtime.shell_*` keys (an environment stopgap, `codebase.md`).
