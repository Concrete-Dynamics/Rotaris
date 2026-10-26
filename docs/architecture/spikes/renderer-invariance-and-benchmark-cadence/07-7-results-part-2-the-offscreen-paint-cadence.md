# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 7. Results — Part 2: the offscreen paint cadence

Part 7 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 7. Results — Part 2: the offscreen paint cadence

ADR-0053 chooses the platform's offscreen rendering mode because it "emits a paint event per frame, which
is exactly the 'the interface has finished showing this' signal the phase timing needs, and it is a real
signal rather than a proxy". The signal was measured directly.

### 7.1 The paint event fires at the requested rate — but only where there is damage

Offscreen window, hardware acceleration disabled, `setFrameRate(60)`, `backgroundThrottling` false;
`isPainting()` true, `getFrameRate()` 60, `isOffscreen()` true. Each row is a 5,000 ms window during which
the stated action was repeated; paints were counted in the main process.

| what the renderer was doing for 5 s | ticks | paint events | paints/s | paint interval p50 |
|---|---|---|---|---|
| nothing at all | 90 | **1** | **0.2** | — |
| changing a **visible** row every `requestAnimationFrame` | 300 | 297 | **59.4** | 16.64 ms |
| changing a visible row **and** calling `invalidate()` every rAF | 296 | 591 | 118.2 | 4.55 ms |
| `invalidate()` only, every 16 ms, no DOM change | 287 | 287 | 57.4 | 17.44 ms |
| after `startPainting()`, visible row change every rAF | 296 | 294 | 58.8 | 16.67 ms |

Repeating the whole set with the offscreen window additionally shown (`showInactive()`) changed nothing
material: 1, 282, 562, 274, 292 paints for the same five windows.

So offscreen rendering is not slow and is not throttled: **with damage it delivers 59.4 frames per second,
matching the 60 requested.** With no damage it delivers about one frame every five seconds. That is
correct engine behaviour and it is precisely what breaks a settle built on "wait for the next paint".

### 7.2 Driven through the seven phases, the settle times out — on exactly the phases with no damage

Offscreen, 1,200 rows, settle = wait for the next `paint` event, bound 30 s per `REQ-UIBENCH-119`:

**Top variant** (`P2-phases-top-paint`), total run 426.6 s, **15 paint events in the whole run**:

| phase | `wall_ms` | `cpu_ms` | settle via paint | `settle_timed_out` | paints during the wait |
|---|---|---|---|---|---|
| `construct_window` | 3876.8 | 63 | **3871.085 ms** | false | 1 |
| `apply_fixture` | 96.3 | 109 | 24.164 ms | false | 1 |
| `ordered_appends` | 529.4 | 578 | 18.316 ms | false | 1 |
| `streaming_updates` | 795.5 | 952 | 14.889 ms | false | 1 |
| `tail_replacements_1000` | **360,438.7** | 3922 | — | **true** | **0** |
| `unchanged_state` | **30,016.1** | 313 | — | **true** | **0** |
| `resize_sequence` | **30,419.1** | 625 | — | **true** | **0** |

**Follow variant** (`P2-phases-follow-paint`), total run 41.5 s, 28 paint events:

| phase | `wall_ms` | settle via paint | `settle_timed_out` |
|---|---|---|---|
| `construct_window` | 3806.1 | **3797.063 ms** | false |
| `apply_fixture` | 163.3 | 38.834 ms | false |
| `ordered_appends` | 2135.4 | 19.101 ms | false |
| `streaming_updates` | 3852.3 | 15.925 ms | false |
| `tail_replacements_1000` | **30,781.7** | — | **true** |
| `unchanged_state` | 27.8 | 14.937 ms | false |
| `resize_sequence` | 257.3 | 16.727 ms | false |

Read together these are not two results but one:

- **Where the phase's work changes something inside the viewport, the paint event is an excellent settle
  signal**: 14.9–38.8 ms, never late, one paint per wait. Inside the resize sweep, each of the five
  individual resizes settled on a paint in 7.3–46.6 ms in both variants.
- **Where the phase's work changes nothing inside the viewport, no paint ever arrives** and the 30 s bound
  expires with zero paints observed across the entire 30 s. This is not an arming race: the counter shows
  0 paints over the whole bounded wait, not one that landed early.
- **Which phases those are depends on where the reader is scrolled, not on the phase.**
  `tail_replacements_1000` replaces the last row; in the top variant that row is outside the viewport, so
  every one of its settles expires, and in the follow variant only the phase-end settle does, because by
  then the last damage has already been painted. Only the phase-end settle is recorded individually; that
  all twelve expired in the top variant and exactly one in the follow variant follows from the phase wall
  times — 360,438.7 ms against twelve 30 s bounds, and 30,781.7 ms against one — and is arithmetic on
  measured values rather than a separate measurement. `unchanged_state` times out in the top variant and
  resolves in 27.8 ms in the follow variant for the same reason. In the top variant `resize_sequence`'s
  five per-step settles each resolved on a paint (46.6, 12.5, 29.7, 13.9, 41.4 ms) and only the
  phase-end settle expired.
- **`construct_window` is a coin toss.** Its paint settle resolved in 3871.085 ms and 3797.063 ms in the
  two 1,200-row offscreen paint runs, and in 12.969 ms in the 40-row development run — the phase itself
  does no work, so the difference is whether the window's very first frame had already been emitted when
  the wait was armed. Interpreting the ~3.8 s figures as the wait falling through to the ~0.2 Hz idle
  paint rate of §7.1 is an inference; the three timings themselves are measurements.

### 7.3 `invalidate()` forces a paint, and that paint carries the previous frame

Because `invalidate()` produced a paint in every no-damage case, the obvious repair is "invalidate, then
wait for the paint". It was tested against the pixels rather than assumed. Forty trials each: set a
60 px overlay to a known colour, change its height, force a layout flush, then either call `invalidate()`
or not, wait for the paint event, and read the pixel at (10,10) out of the `NativeImage` the paint
delivers.

| strategy | trials | pixel matched the colour just set | stale or wrong pixel | timed out | latency p50 | latency max |
|---|---|---|---|---|---|---|
| change, then `invalidate()`, then await paint | 40 | **0** | **40** | 0 | 0.189 ms | 0.908 ms |
| change, then await the damage-driven paint | 40 | **40** | 0 | 0 | 3.381 ms | 22.708 ms |

Every invalidate-driven paint carried the **previous** frame. The pattern is exactly one frame stale:
trial 1 expected `rgb(0,255,0)` and received the colour set in the immediately preceding trial. The
damage-driven paint was correct in 40 of 40 trials.

So `invalidate()` is not a repair. It converts a settle that times out honestly into a settle that
returns in 0.2 ms **reporting that the interface has finished showing work it has not yet shown** — which
is a worse failure than the timeout, because `settle_timed_out` would read false and nothing in the record
would mark the figure as wrong.

### 7.4 What does work offscreen: `requestAnimationFrame`

In every offscreen run, the renderer's double-`requestAnimationFrame` settle resolved: **5.7–30.9 ms**
across all phases of the two offscreen rAF runs, and **2.6–23.2 ms** across all phases of the two
offscreen paint runs, where it was recorded alongside the paint settle including in the phases whose
paint settle expired. **Not one rAF settle timed out anywhere.** The complete seven-phase run finished in
2.17 s (top) and 5.97 s (follow) against 426.6 s and 41.5 s for the same work with the paint settle. The
widget counts, operation counters and tail-growth figures produced by the offscreen rAF runs match the
onscreen runs exactly. Offscreen rendering itself is not the problem; the choice of settle signal is.

A double rAF is a proxy — it says a frame boundary has passed after the change was committed, not that a
frame containing the change was presented — which is the property ADR-0053 explicitly wanted to avoid. The
measurements say only which of the two available signals completes; they do not establish that a rAF-based
settle measures the same thing a paint-based settle measures where both resolve. Comparing them where both
resolve is the obvious follow-on and was not done here.

### 7.5 Control: the paint event does not exist for an onscreen window

The identical probe against an ordinary onscreen window recorded **0 paint events** in 57 s across ten
armed 5 s waits, while its rAF settle resolved in 1.9–20.0 ms in all ten. `paint` is an offscreen-only
signal, so ADR-0053's alternatives A and B would need a different settle mechanism entirely, not the same
one on a different window.

---
