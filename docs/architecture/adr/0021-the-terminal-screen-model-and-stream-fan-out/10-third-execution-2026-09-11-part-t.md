# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — Third execution — 2026-09-11 (Part T″)

Part 10 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## Third execution — 2026-09-11 (Part T″)

*This record's own obligations measured rather than described. REQ-MONITOR-306 with one session in TWO windows, which
the two executions before this left at one; "The cap is load-bearing" obligation 2 priced across a ladder of stream
counts; REQ-SHELL-102 sampled while a stream was moving rather than only at rest; `runtime.terminal_stream_enabled:
false` in the PACKAGED application. Proven by `pnpm terminal-stream-proof` and `pnpm terminal-proof`, twice each; the
machine's state when each figure was taken is in the handoff, because two other agents were building beside it.*

**Found — defect T2-1: the delivery bound was one budget PER WINDOW, and the requirement states one for all of them
together.** `main/terminal.ts` kept the sliding second on each window's own state and its own reading beside it: *"the
bound is enforced HERE, per window, over a one-second sliding window on the monotonic clock"*, under a quotation of
REQ-MONITOR-306 that took its counting rule — "a stream shown in more than one window counts once per window" — and
left out the clause that rule counts INTO: the rate "is bounded in aggregate — across every live stream, of every
session, delivered to every window, **taken together**". The falsified reason is kept beside its replacement in the
file. What it cost is not an argument: forty streams at the coalescing floor, one session followed by two main
windows (REQ-MONITOR-243, REQ-STARTUP-163), through the real flush and the real limiter — **offered 2,080 frames/s,
delivered 2,000 frames/s in aggregate**, exactly twice the bound, while each window's own ledger read a compliant
1,000. Obligation 3 of this record had named the direction and not the number: "the harness modelled one window …
which multiplies main's per-message relay cost by the window count". It multiplies the *delivered rate* too. The
ledger is now one list of delivery instants the windows share, and the drain goes round them one segment at a time so
a window saturating on forty streams cannot starve the window beside it. The same measurement after the repair:
**offered 2,080 frames/s, delivered 1,000 frames/s in aggregate, 500 at each window, 9,080 merges, nothing dropped,
nothing reordered, nothing left pending.** Unseen in wave 1 and wave 2 because no measurement had ever attached a
second window, and the unit test that did attach one asserted the bound "at either window" rather than across both.

**Obligation 2, priced.** The obligation says the aggregate must be bounded by something the product enforces and that
the concurrent stream count is not, `runtime.shell_max_background_sessions` having "default 20, minimum 1, and no
maximum stated", so "the licensed aggregate is `stream count × 50 frames/s`, and only one of those two factors is
bounded". Part AL closed the delivered half at the limiter and left the produced half open; this is what the open half
costs. Each rung feeds the limiter at exactly the licensed rate — one frame per stream per 20 ms floor — and the lag
is measured per byte, from the instant it was offered to the instant it reached a surface, never assumed.

| streams | windows | offered deliveries/s | delivered peak/s | merges | max pending | max lag | median lag |
|---|---|---|---|---|---|---|---|
| 20 | 1 | 1,000 | 1,000 | 0 | 0 | 0 ms | 0 ms |
| 40 | 1 | 2,000 | 1,000 | 2,960 | 40 | 520 ms | 20 ms |
| 40 | 2 | 4,000 | 1,000 | 8,920 | 80 | 780 ms | 280 ms |
| 100 | 1 | 5,000 | 1,000 | 11,900 | 100 | 820 ms | 320 ms |
| 400 | 1 | 20,000 | 1,000 | 56,600 | 400 | 980 ms | 480 ms |
| 400 | 2 | 40,000 | 1,000 | 116,200 | 800 | 1,000 ms | 500 ms |
| 1,000 | 1 | 50,000 | 1,000 | 146,000 | 1,000 | 1,000 ms | 500 ms |
| 3,000 | 1 | 150,000 | 1,000 | 444,000 | 3,000 | 3,000 ms | 1,500 ms |

Three things follow, and they are figures rather than positions. **First: the key's DEFAULT alone spends the whole
bound.** Twenty background sessions at the licensed rate offer exactly 1,000 deliveries a second — the bound entire,
with nothing merged — before one of `REQ-MONITOR-285`'s twenty agent foreground streams is counted. This record's own
"around 40 rather than 20" is therefore twice the bound at the shipped defaults, which the row above it measures:
2,000 offered, 1,000 delivered, 2,960 frames merged over three seconds. **Second: nothing is ever dropped, at any
rung**, which is the cap working as ADR-0021 and REQ-SHELL-103 intend; what the stream count buys is staleness.
**Third, and this is the answer "Revisit if" asks for: the staleness has a law now.** Below the crossing — while
`streams × windows ≤ 1,000` — it is bounded by the drain's own one-second period, at most 1,000 ms and about 500 ms in
the median. At and above the crossing a sweep of the pending streams no longer fits inside a second, and the
staleness becomes `streams × windows ÷ 1,000` seconds: three thousand streams read 3,000 ms at the worst and 1,500 ms
in the median, the figure the assertion in `terminal-load.test.ts` pins. So a stated maximum M on the key would let
the surface's worst-case staleness be **computed** — `(agents + M) × windows ÷ 1,000` seconds — which is exactly what
this record said a ceiling would buy and why obligation 2 remains open at the key's range and closed everywhere else.
Obligation 1 is honoured unchanged: the 20 ms floor is a named constant the flush never crosses.

**REQ-SHELL-102 in motion.** Consequence 3 of this record promises "a golden-stream equality test as the evidence for
REQ-SHELL-102", and the two executions before this one took it with the stream at rest. Taken while a real command was
writing — 36 simultaneous samples, 33 of them running, 21 distinct screens — the window's grid, the transcript row's
preview and the persona card's preview held identical cells, state, truncation and exit at every sample, with no
divergence at any instant. The display side is ADR-0047's note of this date; what it settles for this record is that
the authoritative emulator's frames produce the same screen in three display instances of two different
implementations, which is UI's objection in "The conflict" answered by measurement rather than by argument.

**OQ-5 and OQ-38 — the two readings, after three executions, restated for the owner and still the owner's.**

*OQ-5, the closing frame.* Unchanged and now exercised three ways: the frame is a `screen` carrying `closing: true`
and the observation's final plain text, `closingEqualsObservation` holds byte for byte against a real 10,000-line
command, and in the motion samples above the three displays reset and wrote that text together, agreeing at the
instant they did it. What the executions add to the question is only this: the alternative reading — plain text
throughout — is no longer only argued against, because the same proof renders cursor addressing and an alternate
screen from the VT deltas that precede the closing frame, which plain text cannot carry (REQ-SHELL-095/098). The
record's reading is therefore consistent with everything measured; it is still a reading of `REQ-TOOLS-127` and not a
fact, and the choice is the owner's.

*OQ-38, the sampling period.* The ceiling-plus-flush reading has now been measured at every level. Headless against a
real pseudo-terminal with the interval configured to 2,000 ms, a keystroke's echo was framed in **16.2 ms** (first
execution), **15.0 and 15.2 ms** (its addendum) and **12.8 ms** (this one); through the window, key press to painted
frame, **12.4–25.0 ms** (second execution) and **6.8–21.2 ms** (this one). Under a strict fixed-period reading the
same keystroke waits up to the configured 2,000 ms. **This execution adds the price of the reading, which the record
asked for and could not previously state.** "One coupling to OQ-38" says the ceiling-plus-flush reading "is what
produces the ≤ 50 frames/s per stream that has to be capped", and the ladder measures what that costs: at the shipped
`runtime.shell_max_background_sessions` of 20, those streams alone offer **1,000 deliveries a second — REQ-MONITOR-306's
entire aggregate** — where the strict fixed-period reading at `REQ-TOOLS-126`'s own 100 ms default would offer 200.
So the two readings differ by a factor of five in transport pressure as well as by 2,000 ms in echo, and the trade the
owner faces is now numbered on both sides. Recorded, not resolved.

**Not executed here, and owed rather than hidden.** (1) **Obligation 2 stays open at the key's range.** It is met at
delivery, met at the key's configured value, and open at the ceiling the key does not have; the ladder makes the
missing ceiling computable and does not supply it, which is not an agent's to supply (OQ-55). (2) **The ladder is
synthetic at the licensed rate through the real limiter.** The fidelity half — gapless `seq`, deltas equal to the PTY
bytes, the background stream, the armed echo, the resize, streaming off — is measured against a real PowerShell in
`agent-tools/.../streams.test.ts`, and forty real shells at full tilt on one host still do not fit a test budget and
would contend for the CPU the limiter is being measured on. What the ladder measures is the limiter's behaviour at a
rate the real flush is separately shown to produce. (3) **`REQ-SHELL-166`'s full-screen program** — a curses-style
process repainting to a new size with no corrupted cells — is still absent from the harness, so that limb of the
requirement is unmeasured; every other limb is measured against a real pseudo-terminal. (4) **Defect AL2-3 is
unchanged by this Part** and remains ADR-0020's to repair or the owner's to rule on; its evidence is still produced by
the runs the branch rests on. (5) **The terminal WINDOW under a packaged launch** is not opened: the packaged section
below drives the Workspace and reads its toolbar, and opening the window in a packaged build needs a chord step and a
second window's DOM, which is a larger harness than this wave built.

**`runtime.terminal_stream_enabled: false` in the PACKAGED application.** `REQ-TOOLS-126` states the key's cost
exactly — "the live view, never the command" — and `REQ-TOOLS-127` states that streaming changes nothing the agent
sees "whether or not publishing succeeds", so the measurement is a DIFFERENCE between two launches of one executable
that differ in one line of workspace configuration, and it is evidence only if both halves are read. The executable is
the real one: `ROTARIS_PACKAGE_DIR_ONLY=1 ROTARIS_PACKAGE_SKIP_APP=1 pnpm package` built `release/win-unpacked/
Rotaris.exe` (233.9 MB) in 399 s — the code-intelligence bundle 25 s, its manifest cross-check 20 s, `electron-vite
build` 6 s, `electron-builder --win --dir` 348 s, every step `ok`. Each launch is given its own `LOCALAPPDATA`, so the
store it is read from is the only one it could have written (the sixty-eighth defect was a proof that read another
workspace's store), and each is driven on the product's own path: the scripted dialect takes one `terminal` step
through the real gate into a real pseudo-terminal.

| | `terminal_stream_enabled: true` | `terminal_stream_enabled: false` |
|---|---|---|
| The toolbar's session total (REQ-SHELL-108) | **1** | **0** |
| Its description | "1 terminal this session, 0 running. Opens the terminal window." | "A terminal appears when an agent runs a command. Opens the terminal window, which is empty until then." |
| Live preview blocks on screen | 0 (the command had already ended) | 0 |
| The recorded `terminal` call | `ok`, not an error | `ok`, not an error |
| The observation the agent read | identical, byte for byte | identical, byte for byte |
| Painted, exit code | yes, 0 | yes, 0 |

**The signal was chosen so that the measurement could fail, which is worth stating because the obvious signal could
not.** A proof that looked for the live preview block would have found none in EITHER launch — the row's preview is
drawn only while the command runs, and `git status` ends long before a capture fires — so it would have passed whatever
the key did. The toolbar's total is `REQ-SHELL-108`'s "the total count only ever climbs within a session", so it
survives the command's end and reads 1 against 0. With the key off nothing was published: no stream was ever counted
and the renderer's registry never saw a frame. With it on, one was, and the agent's observation is the same text
either way. Read through the product's own verification seam (`ROTARIS_CAPTURE_EVAL_AT`, Part Z) and the store each
launch wrote; the section is `pnpm terminal-stream-proof --packaged`, which refuses with a stated reason rather than
passing if the packaged executable is absent.

*Reported back 2026-10-15 (fin47): **the reading above, through `ROTARIS_CAPTURE_EVAL_AT` and the scripted dialect, is
falsified for every package built since fin43 to fin46, and is kept here beside its replacement.** ADR-0056 compiles the
verification seams out of a packaged build: `_EVAL_AT` since fin43, the dialect switch and `ROTARIS_SCRIPT` since fin45, and
since fin46 the scripted model client itself (OQ-312). The section therefore drove a model and a reading a package no longer
had, and measured nothing on any package `pnpm package` could produce
([`terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out`](../../../defects/fixed/terminal-proofs-packaged-launch-drives-seams-a-packaged-build-compiles-out.md)).
Each launch now names an OpenAI-compatible model at a loopback stub the section starts for it (`scripts/lib/stub-model-endpoint.mjs`,
the one rule 4 (b) runs against since OQ-312), which the shipped model client reaches and which answers with the one `git status`
call. The launch is given the packaged probe's three variables and nothing else of the product's own. The surface is read
through REQ-SHELL-109: the scratch profile's `interface/terminalPopout` preference is on, so a running stream's first frame opens
the terminal window and main logs "terminal window auto-opening for <stream> (REQ-SHELL-109)". That line is the live view
reaching main and its window, and with the key off no frame is published and no line is written. This also answers (5) above
in part: the window is now opened under the launch, though its DOM is still not read. The toolbar's session total and the
preview blocks are no longer read in the packaged section, because a packaged renderer has no reading but its photograph. They
remain read in the development build by the proof's Electron half. A sixth check, that each terminal call came from the stub
through the shipped client, joins the five. **Measured 2026-10-15 on Linux** against a `ROTARIS_BUILD=package` bundle whose seam
check passed, under Electron (`--app=`, the section's new option for a host without the Windows package, which waits on a Windows x64 host deferred with
the release pipeline under R-071 (IC-3 binds Linux and macOS artifacts, and this bundle is none); it refuses a build the seam
check fails). Load was 2.16 to 1.71 on 4 CPUs. With the key on, the terminal window auto-opened for `fg:orchestrator`;
with it off, nothing opened. Both `terminal` calls were `ok`, not errors, with byte-identical observations. Both launches painted
and exited 0, and the stub served each 2 tools requests and 1 terminal call. All six checks were true. **Not measured:** the
Windows package itself (no Windows host in this session).*
