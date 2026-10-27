# ADR-0021 — The terminal screen model and the fan-out of one stream to three views — First execution — 2026-09-09 (Part AL)

Part 8 of 13 of [ADR-0021](../0021-the-terminal-screen-model-and-stream-fan-out.md), which indexes every part.

## First execution — 2026-09-09 (Part AL)

*Built against a real PowerShell through a real pseudo-terminal, headless, on the node clocks; the
aggregate-rate half against synthetic sources through the real flush and the real limiter. Proven by
`pnpm terminal-stream-proof`.*

**Built and run.** The run host holds one headless emulator per live stream behind a port
(`packages/agent-tools/src/terminal/emulator.ts`, an `@xterm/headless` + `@xterm/addon-serialize`
adapter), a streams registry (`streams.ts`) that opens a stream per agent foreground command
(`fg:<agent>`) and per background session (`bg:<ts_id>`), frames it `delta`/`screen`/`meta` with a
per-stream monotonic `seq`, and publishes on channel 3. The sampling period is the ceiling and a
keystroke arms an immediate flush coalesced at the 20 ms floor; the closing frame is a `screen` carrying
the observation's final plain text with `closing: true`, then a `meta` with the exit code. Main enforces
`REQ-MONITOR-306` per window at the point of delivery (`apps/desktop/src/main/terminal.ts`), merging a
stream's frames into a larger step rather than dropping any. The seven `terminal.*` commands are the
control surface; `REQ-SHELL-107`'s audit line is worded and redacted by the run host through the session
writer. A foreground `terminal` tool row carries its live stream id while the command runs and loses it
on settle, the id kept out of the recorded `transcript.row` event.

**Found — the FIFTIETH first-execution defect: a resize gated on the running flag never reached a
foreground shell between commands.** The first draft only forwarded a grid resize to the real terminal
`if (s.meta.running)`. But a foreground PTY session outlives each command — it is idle between them — so
a resize made while no command ran resized the emulated screen and stopped there, and the next command
reported the old size. Against a real PowerShell the first resized command printed `cols=240 rows=50`
after a resize to 80×24. The rule is `REQ-SHELL-106`'s literally: the emulated screen always, and the
real terminal *whenever one is registered*, which for a foreground stream is its whole life, not just
while a command runs. A pipe-backed background stream registers no resize and so takes only the emulated
one, exactly as `REQ-TOOLS-128` and ADR-0020 consequence 3 anticipate.

**Found — the FIFTY-FIRST first-execution defect: a retained-stream cap that evicted live streams.**
Retention was written as a single per-session cap that, when reached, evicted the oldest stream — and
with no ended stream to take, it took the oldest *live* one, whose emulator was still consuming. Opening
the shipped concurrent count of forty streams in one session (this record's own obligation 2: twenty
agents plus twenty background sessions) silently dropped the first eight. Retention is about keeping
*ended* streams queryable (`REQ-SHELL-085/104`); a live stream is bounded elsewhere (the agent count,
`runtime.shell_max_background_sessions`) and must never be evicted. The cap now counts only ended
streams and trims them oldest-first as each one ends.

**OQ-5, recorded as a reading, not resolved.** The closing frame is emitted as a `screen` frame whose
payload is the observation's final plain text (100,000-char capped, oldest-first truncated) with an
explicit `closing: true` marker that it is a literal replacement — every earlier frame stays VT-faithful.
The proof confirms the closing frame's text equals the observation's output byte for byte
(`closingEqualsObservation`). The alternative reading — plain text throughout — would contradict
`REQ-SHELL-095/098/166`, so it is not taken; the choice remains the owner's (OQ-5).

**OQ-38, recorded as a reading, not resolved.** The period is a ceiling and a keystroke arms a flush at
the 20 ms floor. Measured against a real PTY at the configured interval of 2000 ms, a keystroke's echo
was framed in **16.2 ms** — two orders inside `REQ-SHELL-166`'s 100 ms budget and far under the 2000 ms
a strict fixed-period reading would impose. That the interval is a ceiling is observable to a user who
sets that key; the trade the owner faces is unchanged (OQ-38).

**Measurements (this run; `pnpm terminal-stream-proof`).**

| What | Figure |
|---|---|
| 10,000-line command | 30 delta frames, gapless `seq`, deltas byte-equal to the PTY output, closing frame = observation |
| Background session | own `bg:<id>` stream, gapless `seq`, distinct from the foreground stream |
| Keystroke echo at interval 2000 ms | framed in **16.2 ms** (floor 20 ms; budget 100 ms) |
| 40 streams at the floor | **2,080** frames/s offered, **1,000** frames/s delivered per window, 3,040 merges, nothing dropped or reordered |
| `terminal_stream_enabled: false` | 0 frames published, same exit code (3) and same output as the enabled run |
| Grid resize | the process reports `cols=80 rows=24`, the observation stays clean of the marker wrapper |

**Two obligations touched, neither discharged here.** Obligation 1 (the 20 ms floor may not be relaxed
without re-measuring) is honoured: the floor is a named constant (`TERMINAL_COALESCE_FLOOR_MS`) the flush
never crosses, and the 40-stream measurement shows the aggregate held at 1,000/s where 2,080/s was
offered. Obligation 2 (the aggregate must be bounded by something the product enforces) is now met at
*delivery* by the per-window limiter, but the *concurrent-stream count itself* still has no stated
ceiling — `runtime.shell_max_background_sessions` has a default of 20 and no maximum, so the offered rate
is still `stream count × 50 frames/s` with only the delivered rate capped. The limiter absorbs it by
merging, but that is relief at the surface, not a bound on production; a stated ceiling on the key
remains the owner's to add (this record's "Revisit if").

**Found on the same execution — the FIFTY-SECOND defect: two registered keys nothing read.**
`runtime.shell_max_background_sessions` and `runtime.shell_background_timeout` have been validated and
defaulted by the configuration loader since Part I (`REQ-CONFIG-116`, `REQ-TOOLS-108`), and no code read
either: the terminal manager took `TERMINAL_DEFAULTS` (20 / 3600 s) whatever the workspace configured,
so a user who set the cap set nothing. `run-host/tools.ts` now hands both to the manager from the run's
loaded configuration at each port creation, applied to every background manager already open. That is as
far as the key allows: it has a minimum of 1 and **no stated maximum**, so the produced frame rate is
still `stream count × 50 frames/s` with the count bounded only by what a user chooses to configure. The
delivered rate is capped per window (above); the ceiling on the key itself is the owner's — raised as an
open-question entry by handoff, not resolved here. Obligation 2 is therefore met at delivery and at the
key's configured value, and open at the key's range.

**Found at the merge — the FIFTY-NINTH defect: a default import that vitest tolerated and the bundler refused.** `emulator.ts` imported `@xterm/headless` and `@xterm/addon-serialize` as defaults and destructured `Terminal` and `SerializeAddon` from them, on the reading that both packages are CommonJS. Both ship an ESM `module` entry beside the CommonJS `main`; vitest resolved the latter and the interop supplied a default, so every test and the proof passed, while `electron-vite build` resolved the former, found no default export, and failed the run-host bundle on the merged main (2026-09-09). The gate's check 2 runs `pnpm check` and the proof, and a vitest-driven proof never builds the desktop, so the branch was green everywhere it was measured. Named imports now; the reading is corrected in the file. A gate that admits a Part touching a composition root must also build.
