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
  **Narrowed by the owner's ruling of 2026-09-11 (OQ-38), and the narrowing is the whole of it:** "user
  keystrokes" means exactly that — input a person has directed at a stream whose control they have taken.
  `REQ-CONFIG-117` now states that an agent's own `is_input` call does not arm, because the licence exists for
  `REQ-SHELL-166`'s gesture budget and an agent waits on the observation, not on a painted frame. See the
  ruling section at the end of this record for what the first execution's wider reading cost.
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

## Open question carried, not decided — decided 2026-09-11; kept as written, see the ruling section below

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

**Two of the limbs below are spent.** OQ-5 and OQ-38 were ruled on 2026-09-11, and neither resolved the way
this clause anticipated — both ratified this record's reading, one of them narrowed (see the ruling section at
the end). What remains live here is the scrollback limb, the headless-emulator limb and the message-port limb.
The original text stands unaltered:

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

## Second execution — 2026-09-09 (Part AL′)

*The mechanism's first execution THROUGH A WINDOW: the run host's stream reaching a real terminal window, a real
transcript preview and a persona card, with real keystrokes going back. Proven by `pnpm terminal-proof`'s REQ-SHELL-166
section — the product's own modules in the product's own arrangement minus Electron's main (`harness.mjs`: the real
terminal manager over a real PowerShell pseudo-terminal, the real `createTerminalHost`, the real `FrameDeliveryLimiter`
over a real `UpdateRelay`; the page: the real window component, the real preview, the real registries; the keys: real
input events) — and by the unit suites. Two consecutive green runs; the figures are in the handoff.*

**Built and run.** The terminal window exists (`main/windows.ts` `TerminalWindows`; `renderer/main.tsx` `role=terminal`):
one per main window, 900×620, titled by the renderer (`terminalWindowTitle`), shown without focus when it opens
automatically under `terminal/autoOpen`, destroyed on close and rebuilt on the next open, closed and reopened without
focus when the followed session changes, closed and discarded when a session starts from none, gone with its main
window (REQ-SHELL-080/081/086/109/110/111). It subscribes to the followed session for itself and asks the run host for
the resync (REQ-SHELL-104). The main window and each persona window hold one `TerminalStreamSet` over the headless
emulator, read by the transcript pane and the persona card through one terminal host (REQ-SHELL-079, REQ-SHELL-075 b),
and the Workspace toolbar's control carries the running count (REQ-SHELL-108). `terminal.sendKeys` consumes AM's
`EncodedKey` through the one table; REQ-SHELL-107's entries were read back from the run host's writer in the proof and
have spec 12's shape (`user-input`, `user`, `terminal`, the reason sentence, `terminal fg:live-1: typed "abc123XYZ"
(in: node …)`, `sent C-d`, `sent C-c`, `took control of the terminal`).

**REQ-SHELL-166, measured against the real pseudo-terminal through the window.** The figures are the two consecutive
green runs this note rests on (112 assertions each), both taken with four other agents building on the same machine.
Echo latency, take-control armed, key press to the painted frame: **12.4 / 23.1 / 18.1 ms** over three keystrokes on
the first run and **21.5 / 25.0 / 16.0 ms** on the second (key to the frame's arrival 3.9–16.1 ms and 12.0–15.9 ms;
the budget is 100 ms, and the worst of the six readings is 25.0 ms). Order and fidelity: a burst of nine keys with
`F5` and `Insert` inside it reached the process as exactly `abc123XYZ` — nothing dropped, duplicated, reordered or
invented, and the two unmapped keys transmitted nothing. Interrupt: **69 ms** and **73 ms** from the control to the
command's end (exit 130, the process's own `INTERRUPTED`); end input: **69 ms** and **64 ms** (exit 0, `EOF`). Resize:
the proof shrinks the window's box from 620 px to 460 px **while the first command runs**, the grid re-measures and
reports 118×26 → 118×16, the run host resizes the pseudo-terminal, and the size the process reports (`cols=118
rows=16`) equals the grid's last report — an assertion of its own (`live.midCommandResizeReachedProcess`) and the
trigger for the repaint below. Throughput: a 10,000-line command finished with the same 10,000 lines and the same
exit status (3) with the window's delivery off and on — 3.4 s against 2.7 s on the first run and 3.3 s against 2.7 s
on the second. Three surfaces — the grid, the row preview, the persona card's preview — held identical cells, running
state, truncation and exit code at rest (REQ-SHELL-102). The limiter delivered every frame unmerged at these rates
(59 delivered, 0 merged, on both runs).

**Found — defect AL2-1: the delivery limiter re-ordered a stream's metadata under saturation.** The first draft kept
ONE concatenated delta and ONE latest meta per stream and drained delta-then-meta, so a `meta` that arrived between two
deltas went out after the merged delta with a LOWER `seq`, and every display refused it as already applied
(REQ-SHELL-104's own rule): under saturation a running→closed transition or a resize could be lost. Owed by Part AL's
handoff as a regression test; the pending state is an ordered list of segments now (adjacent deltas merge, a screen
supersedes what precedes it except the metas, a meta after a meta supersedes it), and the test pins the order.

**Found — defect AL2-2: a late attacher's resync frames carried no metadata.** A display created from a bare `screen`
frame took the unknown-stream defaults — "Terminal", running, 80×24, no command — and an ENDED stream was shown as
running for ever, since no later meta was coming. The resync frame carries the stream's meta (any frame may; the display
applies it idempotently, REQ-SHELL-105). Unseen in wave 1 because nothing attached late.

**Found — defect AL2-3, measured and NOT repaired: a resize during a command repaints into the observation.** A grid
resize while a command runs resizes the pseudo-terminal (REQ-SHELL-166 requires it), and ConPTY answers a resize by
repainting its viewport — the visible text again, with cursor addressing. The observation the agent reads is
ADR-0020's VT-strip over the raw bytes, so the repainted text appears in it a second time. **The commonest trigger is
removed**: a banner appearing or leaving in the terminal window changed the grid's host, so every banner cost the
process a resize (AM's handoff §9 named it); the banner slot now reserves the notice's own height, so a banner costs
no resize, and the throughput criterion holds with the window open. What is left in the product is a **user resizing
the window** — and since nothing else on the proof's path resizes mid-command any more, the proof performs that resize
itself (the window's box from 620 px to 460 px, 26 rows to 16, in the middle of the first command), so the defect is
measured by the runs this note rests on and not by a trigger that has since gone. Both runs observe the same thing:
the echo program printed five lines and the agent read sixteen — `READY`, the start marker `__rot_…_s`, `READY`
again, ten blank lines, then `qwe`, `abc123XYZ`, a blank and `EOF` (`results.json`: `live.resizeRepaint` =
`{ readyLines: 2, markerInBody: true, lines: 16 }`, and `live.endInput.output` is the whole observation). The repair
is an observation derived from the screen model rather than from the bytes — a revision of ADR-0020's capture, not
this record's — and it is raised, not made.

**Found — defect AL2-4: the display closed a stream for good, but the registry re-opens it.** ADR-0047's display read
REQ-SHELL-105's "running → closed exactly once" over the stream's whole life; this record's registry (Part AL) re-opens
an agent's one `fg:<agent>` stream in place for each next command. Through the window: "exit 0" over a running command,
every control disabled, the toolbar counting nothing, and the interrupt of the proof's second command never sent. The
reading is now per command — a later `meta` with `running: true` and a higher `seq` is the next command opening the same
stream, the exit code going with it; an older frame still cannot reopen anything. Recorded in ADR-0047's note too.

**Readings.** (1) REQ-SHELL-110/111 at their meeting point: a change of the followed session to NONE closes the window
and leaves it closed; from one session to ANOTHER closes and reopens without focus when it had been open; from NONE to
a session closes and does NOT reopen — an open window on no session can only have been on its empty state, so nothing
was being watched and 111's discard is the rule taken (`TerminalWindows.onSessionChange`). (2) REQ-SHELL-109 names no
surface for the preference; it is drawn in the terminal window itself, in a slim bar under the content, since the window
the preference is about is where a user looks for it. (3) The resync is requested after the first whole-session update
of a newly followed session — the subscribe's attach delivers it, so channel 3 reaches the window by then.

**Not executed here.** REQ-MONITOR-306 across two windows (T″); the full-screen program repainting to a new size with
no corrupted cells (no such program is in the harness; the size round trip and the emulated screen's resize are
measured); the packaged application's terminal window (the proof drives the components, the renderer boot branch and
main's registry are covered by the unit suite, not by a launch). OQ-5 and OQ-38 stand as wave 1 recorded them; the
echo figures above are the ceiling-plus-flush reading measured end to end.

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

## The owner's ruling — 2026-09-11: OQ-5, OQ-38 and OQ-55 closed, and one reading of this record narrowed

Three questions this record raised and carried three executions have been ruled, and the specification now states
what this record could only read. Nothing below is a new decision of this record. What follows is which of its
readings became the requirement, which one was narrowed in becoming it, and what stops being owed.

**OQ-5 — ratified as read, and widened to background streams.** `REQ-TOOLS-127` now states that the closing frame is
a literal replacement of the displayed text carrying an explicit marker that it is one, that its text is plain on the
terms the requirement already fixed, and that it is the only frame of a stream of which any of that is true. It also
states the reason the conflict was never real, which this record argued and could not settle: `REQ-SHELL-095` and
`REQ-SHELL-098` govern the stream **while the process is running**, and this frame is emitted after it has exited —
when there is no cursor to paint, no alternate screen left to be in, and no further output to attribute to a cell.
The two bind different instants. One thing the amendment fixes that this record had not noticed: the requirement's
closing sentence bound a **foreground** stream only, while all three executions emitted a closing frame for `bg:`
streams as well and a proof asserted it. That was the code ahead of the requirement rather than outside it, and the
amendment now covers both. **No code changes for this one.**

**OQ-38 — the ceiling-plus-flush reading is ratified, and the licence is narrowed to the person who took control.**
`REQ-CONFIG-117` now states that `terminal_stream_interval_ms` is a ceiling on batching and not a fixed cadence, that
input the user has directed at a stream whose control they have taken arms that stream's next frame, that **output
alone never arms and neither does an agent's own `is_input` call**, and that the 20 ms floor and `REQ-MONITOR-306`
are the two bounds on the licence that no configuration may relax. `REQ-TOOLS-126` cites all of it rather than
restating it, and now cites `REQ-MONITOR-306` — which incidentally discharges the half of ESC-22 that domain 05 was
recorded as owing, that "an implementer reading `REQ-TOOLS-126` alone would build per-stream sampling with no
aggregate".

*What the ruling costs this record, stated rather than repaired quietly.* The Decision's bullet said "writing user
keystrokes", and the first execution read that as including the agent's own, with a comment in
`agent-tools/src/terminal/index.ts` saying so in terms: *the agent's own keystroke arms the stream's next flush too,
the same as the user's*. **That reading is falsified and is kept beside its replacement.** It was not wrong about the
mechanism; it was wrong about whom the mechanism is for. Its price is the one this record's own third execution
measured without being able to attribute it: the licence is 50 frames/s per stream, and spending it on every stream
an agent types into is what made twenty background sessions alone offer `REQ-MONITOR-306`'s entire aggregate. Under
the ruling it is spent on at most one stream per window — the one a person is watching for their own echo — and a
background session frames at the configured period, **ten frames a second at the default rather than fifty**. The
code now carries the ruling and a regression pin asserts both halves together, because either half alone would pass
a build that had lost the other.

**OQ-55 — closed, and this record's own obligation 2 is discharged with it.** `REQ-CONFIG-116` gives
`runtime.shell_max_background_sessions` a range of **1–64**, taking `REQ-TRACE-481`'s ceiling and its reason — an
input needs some upper bound, and a figure no machine could actually service is of no use to anyone. "The cap is
load-bearing" obligation 2 asked for the unbounded background count to be measured and reported; the third execution
measured it and reported that the missing ceiling was not an agent's to supply. It now exists, and the staleness law
that execution established has both of its terms. At the maximum, `(20 agents + 64) × windows` stays under the
thousand-stream crossing for any window count a user can produce, so the worst case a **configuration** can reach is
the flat regime bounded by the drain's own one-second period, rather than the `streams × windows ÷ 1,000` seconds
that applies above it. That is what this record said a ceiling would buy, and it is what the ceiling buys.

**What is no longer owed.** The two readings carried through three executions are the specification's. Obligation 2
is discharged. Nothing in "The cap is load-bearing" is now open: obligation 1 was honoured at every execution by the
20 ms floor, and obligation 2's ceiling exists. What this record still owes is unchanged and unrelated — the
packaged-app limb and the synthetic-ladder limb noted in the third execution.
