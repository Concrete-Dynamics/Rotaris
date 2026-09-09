# ADR-0021 — The terminal screen model and the fan-out of one stream to three views

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01, to carry the `ipc-hop-latency` spike. **This record's frame-rate cap has
  become load-bearing for `REQ-MONITOR-222` and is no longer a display concern**, because the mechanism
  ADR-0044 relied on for the same protection was measured and does not work. Nothing about the screen
  model, the placement of the authoritative emulator, or the frame vocabulary changes.
- **Origin:** EXEC (ADR-EXEC-07), UI (ADR-UI-10)
- **Depends on:** ADR-0002, ADR-0010, ADR-0020, ADR-0044
- **Depended on by `REQ-MONITOR-222`** — see *The cap is load-bearing*. ADR-0044 is owned elsewhere and
  is cited here, not amended here.
- **Contains an unresolved conflict between slices — the two proposals put the authoritative screen in
  different processes.** The spike does not bear on that conflict either way.
- **Names a conflict between two live requirements** — `REQ-TOOLS-126`'s 100 ms default sampling period
  against `REQ-SHELL-166`'s 100 ms key-press-to-painted-frame echo budget (OQ-38).

## Context

`REQ-TOOLS-127` fixes stream names as `fg:<scope>` and `bg:<session_id>`, frame types as `delta`,
`screen` or `meta`, a completed foreground stream ending with a `screen` frame **whose text equals the
observation's final output text** before the stream is closed carrying the exit code, and — crucially —
that streaming changes nothing the agent sees: with or without a consumer, and whether or not
publishing succeeds, the command still runs to completion and the observation is identical.

`REQ-SHELL-103` and `REQ-SHELL-166` reinforce it from the shell side: a command's completion time and
output are the same whether the terminal window is open, closed, hidden or visible, and **no output is
dropped or reordered when repaints cannot keep up**.

`REQ-SHELL-095` and `REQ-SHELL-098` require a **character grid, not an append-only log**, checkable by
behaviour: cursor addressing overwrites addressed cells, entering the alternate screen replaces
visible content and leaving it restores what was there, a self-rewriting progress line updates in
place; per-cell bold, italic, underline and reverse video, and the 16 ANSI colours as theme tokens.

`REQ-SHELL-102`, `REQ-SHELL-079` and `REQ-SHELL-075` require the same stream to be shown in **three
places at once** — the transcript preview in the main window, the persona window's transcript card,
and the pop-out grid — with identical visible cells, identical running/exited state and identical
truncation indication at the same time, the persona card lagging by at most one refresh interval, and
only the pop-out accepting input.

`REQ-SHELL-104` and `REQ-SHELL-105`: delivery is ordered frames with a **monotonically increasing
sequence number**; metadata frames are idempotent; a late-attaching viewer receives everything
accumulated so far; an already-applied sequence number is never applied twice, so no line is ever shown
twice even while retained and fresh output are both arriving.

`REQ-SHELL-085` and `REQ-SHELL-104`: bringing a stream forward creates its tab **only if retained
screen state still exists**; when nothing is retained the window stays on its empty state rather than
fabricating a terminal, and a session read back from storage produces no terminal tabs at all.
Retained screen state is therefore a first-class, queryable, **non-persisted** object.

`REQ-SHELL-151`, `REQ-SHELL-084` and `REQ-SHELL-086`: an off-screen surface performs zero repaints and
runs zero refresh timers, yet shows fully current content the instant it becomes visible.

`REQ-TOOLS-126` fixes the streaming configuration: `runtime.terminal_stream_enabled` (default true,
disabling costs the live view never the command), `runtime.terminal_stream_interval_ms` (default 100,
range 20–2000, the **output sampling period**), `runtime.terminal_stream_buffer_kb` (default 256, range
0–8192, the per-stream replay buffer, `0` disabling replay).

## The conflict

**EXEC's position.** The run host holds the authoritative headless emulator per stream — the current
screen, the retained scrollback, the running flag, the exit code and a `truncated` flag. Frames carry
**VT byte payloads**; each view runs a *display* emulator fed the same frame sequence from the same
subscription point. Its argument: `REQ-SHELL-085` asks whether retained screen state **exists** before
any view is built, which only the run host can answer; `REQ-TOOLS-127` requires the observation to be
identical whether or not anyone is attached, so retention must be independent of viewers; and with
`terminal_stream_buffer_kb: 0` replay is disabled entirely, so a view-side-only design can show
nothing on attach while `REQ-SHELL-102` still demands the preview and the window agree.

**UI's position.** One screen model per stream **in the renderer that owns the main window**, fed by
the ordered frames; the persona window — a separate renderer — receives a *serialised snapshot of the
visible cells plus metadata flags*, not raw bytes, "so there is one parser and `REQ-SHELL-102`'s
identical-cells claim holds by construction rather than by hoping two parsers agree".

**Recommendation: EXEC's placement, with UI's concern answered rather than dismissed.**

The run host must hold the authority, because `REQ-SHELL-085`'s existence question and
`REQ-TOOLS-127`'s viewer-independence are both unanswerable from a renderer that may not exist. UI's
objection — that two parser instances may disagree — is real but is a **testable equality of inputs**
rather than a structural risk: the run host and every view run the same emulator implementation over
the same byte sequence from the same subscription point, and a golden byte stream must produce the
same serialised screen in both. That test is cheap and it is the evidence `REQ-SHELL-102` wants.

UI's serialise-the-cells idea is retained where it is genuinely better: a **`screen` frame is emitted
on attach and on resync**, so a late attacher receives one `screen` followed by `delta`s and can never
show a line twice regardless of the replay-buffer size — which is what makes
`terminal_stream_buffer_kb: 0` survivable.

## Decision

- **The run host holds one headless emulator per live stream.** It consumes PTY output at the
  configured sampling period and maintains the current screen, the retained scrollback, the running
  flag, the exit code and the `truncated` flag. It is **not persisted**, which is why a session read
  back from storage produces no tabs — satisfied by doing nothing, the correct amount of work.
- **Frames carry VT bytes and a monotonic sequence number.** A `delta` frame is the bytes appended
  since the previous frame; a `screen` frame is a serialisation of the current screen; `meta` frames
  are idempotent. The frame kind vocabulary is `REQ-TOOLS-127`'s; the sequence number is
  `REQ-SHELL-104`'s. Both are required and neither replaces the other.
- **Views run a display emulator over the same frames.** The transcript preview, the persona card and
  the pop-out grid subscribe at one point. The emulator library is a **port**, not the decision;
  xterm.js used as a *screen* with the product owning input entirely is the expected fit — see
  ADR-0047 for why the library's own input, wheel and link handling must all be replaced.
- **Control traffic** — send-keys, resize, interrupt, kill (`REQ-TOOLS-128`) — travels the opposite
  direction on the same channel. `REQ-SHELL-166`'s ordering criterion requires only that keystrokes reach
  the **process** in order, which the run host guarantees by writing them to the PTY in receipt order.
- **The sampling period is a ceiling on batching, not a metronome.** `REQ-TOOLS-126`'s
  `runtime.terminal_stream_interval_ms` bounds how long output may be withheld from a frame; it does not
  bound how soon one may be emitted. Writing user keystrokes to the PTY therefore **arms an immediate
  flush** of that stream's next available output, so an echoed character is not held for the next tick.
  Flush-triggered frames are coalesced so the emitted frame rate never exceeds what the bottom of
  `REQ-TOOLS-126`'s own range — 20 ms — already licenses, and the flush changes only *when* bytes are
  framed, never which bytes or in what order, leaving `REQ-SHELL-103`'s no-drop-no-reorder rule and
  `REQ-SHELL-104`'s monotonic sequence untouched. This is a choice between two mechanisms, and the other
  two candidates are rejected for stated reasons: **lowering the interval for armed streams** overrides a
  value the user set, so a configured 2000 silently means 20 and the setting stops describing the
  product; **local echo painted by the grid** meets the budget by fabricating a character the process may
  never produce — `REQ-SHELL-166` measures "the character a keystroke produces", and a password prompt
  produces none, so local echo would both miss the requirement and display what the user typed into a
  prompt that deliberately hides it. See consequence 2 and OQ-38.
- **Execution is never throttled by display.** Frames are consumed by the run host's model, not by a
  renderer, so a slow or absent view cannot apply back-pressure. This is the same shape as
  `REQ-MONITOR-232`'s rule for the transcript and is implemented the same way.

## The cap is load-bearing

This section is new and it is the reason this record was revised. **The coalescing cap stated in the
Decision above is now the architecture's whole protection for `REQ-MONITOR-222`, and it acquired that
role by measurement rather than by design.**

**What the channel separation was taken to buy, and what was measured.** ADR-0044 gives terminal frames
their own named channel (`terminal:frames`, channel 3) separate from `transcript:increment` and
`session:snapshot`, and the spike records that the separation was read as meaning "a high-volume stream
cannot delay a transcript row". ADR-0044 as it now stands is a record another agent owns and it is cited
here rather than amended here; what follows is a measurement of the mechanism, not a reading of that
record's current wording. The `ipc-hop-latency` spike put the separation on a real four-process
arrangement matching ADR-0002 and
found that **a distinct Electron IPC channel name is not a distinct transport**: every
`webContents.send` for one `webContents` is multiplexed onto one pipe and dispatched by one
main-process event loop and one renderer main thread. Against a no-load baseline of transcript-increment
p95 **1.291 ms** at 10,000 resident rows, terminal load on the separate *name* moved transcript p95 to
1.514 ms at 999 frames/s, **7.733 ms** at 65.5 MB/s in 1,000 frames/s, and **126.207 ms** at 49.1 MB/s
delivered in 11,994 frames/s — a rise of **97.8×** over no load, against `REQ-MONITOR-222`'s 250 ms
budget. The relay's cost is **per message, not per byte**: 33.0–37.4 µs in `webContents.send` per 4 KiB
frame against 163.0–195.0 µs per 64 KiB frame, so 12,000 frames/s spends about 0.40 s of every wall
second in `send` alone. A genuinely separate transport — terminal frames on their own transferred
`MessagePort` — held transcript p95 at 1.119 ms at the same 12,000 frames/s, which is what shows the
effect is the shared lane and not the frames themselves.

**Why the outcome nevertheless holds.** At the rate this record's own coalescing licenses, no topology
showed a problem. The arithmetic is this record's: the flush is coalesced so the emitted frame rate per
stream never exceeds what the **20 ms** bottom of `REQ-TOOLS-126`'s range licenses, which is **≤ 50
frames per second per stream**. The spike chose its ladder around that number and measured the relay at
999 frames/s × 4 KiB at **p95 1.514 ms** — inside budget by two orders of magnitude. **So ADR-0044 is
wrong about the mechanism and right about the outcome, and what makes it right is the cap stated here.**

**Three obligations follow, and they are obligations rather than observations.**

1. **The 20 ms coalescing floor may not be relaxed without re-measuring.** It was written as a bound on
   how often a keystroke-armed flush may fire — a display concern. It is now also the input to a
   transport budget. Anything that raises the per-stream emitted rate raises the aggregate rate the
   relay must absorb, and the relay's degradation is steep and non-linear between 4,000 and 12,000
   frames/s.
2. **The aggregate rate must be bounded by something the product actually enforces, and today it is
   not.** The spike bounded its ladder by `REQ-MONITOR-285`'s maximum of 20 agents and flagged in terms
   that it "counts one foreground stream per agent" and that "whether background terminal sessions
   (`REQ-TOOLS-107`) can push the concurrent stream count materially above 20 was not established". It
   is not bounded. `REQ-TOOLS-108` caps concurrent background sessions at
   `runtime.shell_max_background_sessions`, **default 20, minimum 1, and no maximum stated**, and each
   publishes its own `bg:<session_id>` stream (`REQ-TOOLS-127`). At the shipped defaults the concurrent
   stream count is therefore around 40 rather than 20, and it is **user-configurable upward with no
   stated ceiling**. The licensed aggregate is `stream count × 50 frames/s`, and only one of those two
   factors is bounded. **This is a real gap, it is now on the path of a latency requirement, and it is
   raised rather than closed here** — the remedies (a stated maximum on the key, an aggregate rate
   budget across streams, or a genuinely separate transport) are not all architecture's to choose.
3. **The margin is smaller than the figures look, in two directions the spike states.** The harness's
   frame handler "does almost nothing" — it stores the payload in a ring buffer, where a real frame
   drives a VT emulator and a grid paint (this record, ADR-0047) — so the renderer would saturate at a
   *lower* frame rate than measured. And the harness modelled **one window**, while `REQ-MONITOR-243`
   and `REQ-STARTUP-163` allow one session in several windows, which multiplies main's per-message relay
   cost by the window count. The measured pass at the licensed rate is therefore a floor on the cost,
   not a margin to spend.

**What this does not change.** The cap is a property of the product's own rendering path, not of the
benchmark or of any measurement harness. `runtime.terminal_stream_enabled: false` remains the user's
relief valve and `REQ-TOOLS-126` states its cost exactly — the live view, never the command. And
`REQ-TOOLS-127`'s guarantee that streaming changes nothing the agent sees is untouched: the run host
consumes at the sampling period whether or not anyone is attached, and the cap governs what is
*published*, not what is consumed.

**One coupling to OQ-38 that is now worth stating.** The ceiling-plus-flush reading of
`REQ-TOOLS-126` is what produces the ≤ 50 frames/s per stream that has to be capped; under the strict
fixed-period reading the emitted rate would be *lower* at every configured value. So this record's own
reading of that key is what creates the transport pressure, and the flush's coalescing floor is what
contains it. If OQ-38 resolves toward the fixed-period reading, the transport question relaxes and the
echo budget breaks — the trade runs the other way from how it reads in the Decision.

## Open question carried, not decided

`REQ-TOOLS-127`'s closing frame must carry "text equal to the observation's final output text", which
is plain, 100,000-character-capped, oldest-first-truncated text — **not VT**. EXEC proposed emitting
the closing frame as a `screen` frame whose payload is that plain text with an explicit marker that it
is a literal replacement, so a display resets its screen and writes it verbatim. That satisfies the
letter of `REQ-TOOLS-127` while keeping every earlier frame VT-faithful, and it is harmless because the
process has ended. **It is a reading, not a fact.** The alternative reading is that the specification
intends plain text throughout, which would contradict `REQ-SHELL-095` and `REQ-SHELL-166`. See OQ-5.

## Consequences accepted

1. The run host pays for one emulator per live stream, and it keeps consuming while nobody watches,
   because `REQ-TOOLS-127` requires the observation to be identical whether or not anyone is attached.
   `REQ-SHELL-151`'s zero-work rule applies to **surfaces**, not to retention.
2. **A conflict between two live requirements, settled above by re-reading a configured key.**
   `REQ-TOOLS-126` calls `runtime.terminal_stream_interval_ms` the output sampling period and defaults it
   to 100 ms. `REQ-SHELL-166` requires the character a keystroke produces to be visible within
   `REQ-SHELL-150`'s 100 ms gesture budget, measured key press to painted frame, and the path crosses two
   process hops and a paint. Read as a fixed period, the default alone spends the entire budget in the
   worst case and half of it on average, before either hop is counted; the budget is unmeetable at the
   specified default and at every larger value the specified range permits. Neither requirement notices
   the other. **The ceiling-plus-flush reading is a reading of `REQ-TOOLS-126`, not a fact**, and it is
   observable to a user who sets that key — under a strict fixed-period reading a configured 2000 would
   withhold that user's own echo for two seconds, and under this one it does not. Raised as a
   specification question (OQ-38) rather than absorbed here.
3. Two emulator instances per visible stream — one authoritative, one displaying — with a golden-stream
   equality test as the evidence for `REQ-SHELL-102`.
4. **This record now owes a budget to another domain.** A change to the coalescing floor, or to how many
   streams may publish at once, is a change to whether `REQ-MONITOR-222` holds — which is not a fact a
   reader of a terminal-rendering record would expect and is why it is stated in its own section rather
   than in a bullet. The dependency runs the wrong way round the record's own subject matter and should
   be read as a symptom of the relay topology, not as a property of terminals.
5. **A degradation that no counter catches.** The spike's collapse case delivered every one of 586,960
   frames with nothing dropped and nothing reordered; the relay fails into unbounded latency, not into
   loss. So the sequence discipline of `REQ-SHELL-104` and `REQ-SHELL-105` stays perfectly satisfied
   while the surface goes stale, and a gap counter would never fire. Whatever diagnostics watches this
   must watch a **rate and a queue depth**, not a gap (ADR-0052).

## Revisit if

OQ-5 resolves toward plain text throughout; or OQ-38 resolves toward a strict fixed-period reading of
`runtime.terminal_stream_interval_ms`, which makes `REQ-SHELL-166`'s echo budget unmeetable at
`REQ-TOOLS-126`'s own default and turns the conflict into an escalation about which of the two published
figures moves; or a requirement asks for terminal scrollback to survive a restart, which would make the
emulator's state persistent and change everything above; or the shell slice chooses a renderer whose
emulator cannot be run headless, in which case UI's placement returns as the fallback with its
two-parser risk accepted explicitly. **Or the update channels move to a direct message port**, which
would restore the isolation ADR-0044 claims for one more `MessageChannelMain` and demote this record's
cap back to the display concern it was written as — the spike measured that arrangement holding
transcript p95 at 1.119 ms under 12,000 frames/s. **Or the concurrent-stream count gains a stated
ceiling**, which would let the aggregate rate be computed rather than assumed.

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

**Found — the FORTY-SIXTH first-execution defect: a resize gated on the running flag never reached a
foreground shell between commands.** The first draft only forwarded a grid resize to the real terminal
`if (s.meta.running)`. But a foreground PTY session outlives each command — it is idle between them — so
a resize made while no command ran resized the emulated screen and stopped there, and the next command
reported the old size. Against a real PowerShell the first resized command printed `cols=240 rows=50`
after a resize to 80×24. The rule is `REQ-SHELL-106`'s literally: the emulated screen always, and the
real terminal *whenever one is registered*, which for a foreground stream is its whole life, not just
while a command runs. A pipe-backed background stream registers no resize and so takes only the emulated
one, exactly as `REQ-TOOLS-128` and ADR-0020 consequence 3 anticipate.

**Found — the FORTY-SEVENTH first-execution defect: a retained-stream cap that evicted live streams.**
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
