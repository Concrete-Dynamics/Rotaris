# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase

- **Date:** 2026-08-31
- **Questions:**
  1. ADR-0045 paints the transcript from a fixed pool of recycled row slots allocated at window
     construction, because `REQ-UIBENCH-054` requires the count of live paintable elements to be
     invariant after construction. Does the count actually hold through the seven phases of
     `REQ-UIBENCH-053` — under **both** of the counting rules OQ-28 leaves open? Does the tail-phase
     memory tripwire of `REQ-UIBENCH-087` hold? Is update cost independent of total row count against
     `REQ-CHAT-055`'s budget? And is "the largest viewport the window can reach" knowable at
     construction time on Windows?
  2. ADR-0053 drives an **offscreen** window through those seven phases and closes each phase's timing
     on a paint event (`REQ-UIBENCH-051`, `REQ-UIBENCH-119`). Does that paint event correspond to
     layout settling, or does the settle time out?
- **Scope:** measurement only. No product code was written and none is authorised. Everything below was
  produced by a throwaway harness in the session scratchpad; nothing was written into this repository
  except this document.
- **Bearing on OQ-28:** this spike reports the two counts **separately and does not choose between
  them.** Section 3 gives what each reading costs. The choice remains the product owner's.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200` |
| CPU arch | x64 |
| Node (host) | v24.11.0 · npm 11.12.1 |
| Electron | 44.1.0 (reused from `spike-base`, not reinstalled) |
| Chromium / Node / V8 in Electron | 152.0.7977.65 / 24.19.0 / 15.2.124.18-electron.0 |
| Markdown renderer | `marked@4.3.0` (CommonJS build, `marked.parse`) |
| Displays present throughout | two, both 1920×1080, `workArea` 1920×1032, `scaleFactor` 1, `rotation` 0; primary internal at (0,0), second at (−1920,191) labelled `F3-L` |
| Renderer `devicePixelRatio` | 1 |
| Shell | Git Bash (POSIX `sh`) |

This is the same machine and OS build as ADR-0004's DATA spike and as the `spike-base` toolchain
verification, so figures here are comparable with those.

**Display refresh rate was not read from the operating system.** The onscreen apply-to-paint floor
measured below (13.8–13.9 ms, section 5) is reported as measured; no refresh figure is inferred from it.

---

## 2. Method

### 2.1 What the harness is

A single Electron application with an ordinary `BrowserWindow` and a hand-written recycled-slot
transcript, driven through the seven phases of `REQ-UIBENCH-053` in phase order. It is a measuring
instrument shaped like ADR-0045's decision, not a prototype of the product. It contains:

- **A mock shell** with the structural elements ADR-0045 names: title bar, a seven-item navigation rail,
  the transcript pane, fixed slot pools for the agents / todo / artifact surfaces and a three-column
  board, a composer with chips, and a status strip. Every element the application's own layout owns
  carries a `data-s` attribute; content produced by Markdown rendering does not.
- **A fixed-capacity recycled row pool.** Capacity is `ceil(H_max ÷ 30 px) + 2 × overscan` with
  `H_max = 2160`, minimum row height 30 px (`REQ-CHAT-057`) and overscan 4 — **80 slots**, allocated once
  at construction and never added to or removed from. The slot index is the binding key (`i % POOL`), so
  the framework never unmounts a slot. A slot showing nothing is emptied, not unmounted.
- **Row layout metrics from `REQ-CHAT-057`**: 52 px timestamp column, 112 px role column, 30 px minimum
  row height, 10 px horizontal and 5 px vertical margins.
- **A Fenwick (binary indexed) offset table** over measured row heights, so a scroll position resolves to
  a row index in `O(log n)` and a height correction costs `O(log n)`. Heights are measured after binding,
  never assumed; unmeasured rows carry an estimate until first measured.
- **A rendered-body cache** keyed on `(row id, FNV-1a hash of text, text length, laid-out width,
  expansion state)`, bounded at 256 entries and 2,000,000 source characters exactly as `REQ-UIBENCH-063`
  fixes, with least-recently-used eviction and running hit/miss totals.
- **An apply pipeline** that classifies each whole-transcript assignment into the six counters of
  `REQ-UIBENCH-064` and then repaints only the slots whose bound content changed.
- **An event-loop lag probe** on a 10 ms interval, reporting the largest lateness in the interval since
  the previous record, per `REQ-UIBENCH-049`.

### 2.2 Fixture

Deterministic, seeded (`20260831`), 1,200 transcript events with **real Markdown bodies** in six shapes —
plain paragraph; paragraph with inline code and a link; bullet list; heading plus paragraph plus a fenced
`js` code block; paragraph plus block quote plus ordered list; bold lead plus two long paragraphs — so the
number of elements a body produces genuinely varies from row to row. The same seed is used in every run,
which is why the operation counters agree exactly across runs (section 3.3).

### 2.3 The seven phases, implemented from the requirement text

`construct_window` (window at the opening canonical size 1440×900, `REQ-UIBENCH-048` / `REQ-SHELL-022`);
`apply_fixture` (bulk assignment); `ordered_appends` (clear, then add every event back individually);
`streaming_updates` (clear, then reveal each event's text as prefixes of length 0, 256, 512, … each step a
full transcript assignment); `tail_replacements_1000` (1000 replacements of the last entry's text, zero
padded to 8 digits, extended with `x` to length L and truncated to L, RSS sampled at indices
0,100,…,900,999 after the interface has finished showing each sampled replacement);
`unchanged_state` (the fixture applied again); `resize_sequence`
(1000×680 → 1440×900 → 1180×760 → 1000×680 → 1440×900, settling after each).

### 2.4 The two element counts, measured separately

Taken at every phase boundary after the settle, and additionally at intra-phase probe points:

- **Rule 1 — application-owned structural elements.** `document.querySelectorAll('[data-s]').length`.
  This is ADR-0045's reading 1: the shell's own layout elements plus the fixed slot pools.
- **Rule 2 — every element that occupies layout space and can be painted.** A walk of every element in
  the document, counting those whose computed `display` is not `none`, whose computed `visibility` is not
  `hidden`, and whose border box has **both** width and height greater than zero. This is OQ-28's
  reading 2 applied literally, rendered-Markdown descendants included.
- **A third count, `ui_objects`-analogous**, is also reported: every element in the document regardless of
  paintability.

The rule-2 walk forces a layout flush and is therefore taken **outside** the timed region of each phase.

### 2.5 Two scroll variants, because the two give different answers

Every phase run was done twice:

- **`top`** — the transcript stays anchored at the first row. The rows a phase changes at the tail are
  outside the viewport.
- **`follow`** — the transcript follows the bottom, which is what a live transcript does while streaming.
  The rows a phase changes are inside the viewport.

This distinction turned out to be load-bearing for both halves of the spike and is not a detail.

### 2.6 Runs actually taken

Twelve complete seven-phase runs at 1,200 rows, each in a **fresh process**:

| runs | window | variant | settle signal | driver yields between updates |
|---|---|---|---|---|
| `A-top-1..3` | onscreen | top | double `requestAnimationFrame` | no |
| `B-follow-1..3` | onscreen | follow | double `requestAnimationFrame` | no |
| `Y-yield1-top`, `Y-yield1-follow` | onscreen | both | double rAF | yes, after every update |
| `P2-phases-top-raf`, `P2-phases-follow-raf` | **offscreen** | both | double rAF | no |
| `P2-phases-top-paint`, `P2-phases-follow-paint` | **offscreen** | both | **`webContents` `paint` event**, 30 s bound | no |

The ten runs other than the two `Y-yield1-*` ones additionally carried the intra-phase element probe of
§2.4. Two further seven-phase runs at 40 rows (`smoke`, `P2-smoke`) were taken while developing the
harness; they are quoted only where explicitly identified as 40-row runs and are excluded from every
aggregate figure below.

Plus four focused probes: a cost sweep at six total-row counts in both variants (`D-cost-*`), a
window-geometry probe (`E-viewport`), an offscreen paint-cadence probe (`P2-osr2-*`), and an
offscreen paint-content probe (`P2-osr3`).

---

## 3. Results — Part 1a: is the element count invariant?

### 3.1 Rule 1 — invariant, in every run, at every point measured

**`widgets` under rule 1 was 629 in every one of the 84 phase records across all twelve complete runs.**
It was also 629 at all 130 intra-phase probe points (13 per run in the ten runs that carried the probe),
at all 110 intra-phase samples taken inside the tail-replacement loops, and at all 60 steps of the twelve
resize sweeps. Across 384 observations, not one departed from 629.

`A-top-1`, representative (onscreen, top variant, 1,200 rows):

| phase | rule 1 | rule 2 | rule 2, transcript pane only | all elements | rows displayed |
|---|---|---|---|---|---|
| `construct_window` | **629** | 630 | 320 | 637 | 0 |
| `apply_fixture` | **629** | 777 | 467 | 783 | 1200 |
| `ordered_appends` | **629** | 777 | 467 | 783 | 1200 |
| `streaming_updates` | **629** | 777 | 467 | 783 | 1200 |
| `tail_replacements_1000` | **629** | 777 | 467 | 783 | 1200 |
| `unchanged_state` | **629** | 777 | 467 | 783 | 1200 |
| `resize_sequence` | **629** | 777 | 467 | 783 | 1200 |

`B-follow-1`, representative (onscreen, follow variant):

| phase | rule 1 | rule 2 | rule 2, transcript pane only | all elements |
|---|---|---|---|---|
| `construct_window` | **629** | 630 | 320 | 637 |
| `apply_fixture` | **629** | **715** | 405 | 721 |
| `ordered_appends` | **629** | **668** | 358 | 674 |
| `streaming_updates` | **629** | **668** | 358 | 674 |
| `tail_replacements_1000` | **629** | **669** | 359 | 675 |
| `unchanged_state` | **629** | **668** | 358 | 674 |
| `resize_sequence` | **629** | **668** | 358 | 674 |

The clear-and-refill phases (`REQ-UIBENCH-056`, `REQ-UIBENCH-057`) and the resize sweep
(`REQ-UIBENCH-060`) — the three cases that break a mount-and-unmount virtualiser — leave rule 1 untouched.
Intra-phase probes taken while the transcript held 0, 1, 601 and 1,200 rows all read 629, including the
moment immediately after the transcript is cleared. Rule 1 is invariant **by construction**, not by
accident of where the phases happen to end.

### 3.2 Rule 2 — not invariant, in any run, under either variant

Distinct rule-2 values observed across the seven phase records of a run:

| runs | rule-2 values over all 7 records | over the 6 non-construction records |
|---|---|---|
| `A-top-1..3` (3 runs) | 630, 777 | 777 |
| `B-follow-1..3` (3 runs) | 630, 715, 668, 669 | **715, 668, 669** |
| `P2-phases-top-raf`, `P2-phases-top-paint` | 630, 777 | 777 |
| `P2-phases-follow-raf`, `P2-phases-follow-paint` | 630, 715, 668, 669 | **715, 668, 669** |
| `Y-yield1-top` | 630, 777 | 777 |
| `Y-yield1-follow` | 630, 715, 668, 669 | **715, 668, 669** |

Two separate failures, and they are not the same failure:

1. **`REQ-UIBENCH-054`'s stated rule is broken in every run, including the top variant.** The requirement
   is "from the moment this phase's record is taken until the iteration ends, the `widgets` value must not
   change". The `construct_window` record reports 630; the very next record reports 777 (top) or 715
   (follow). The count changes by **+147** or **+85** the moment content is applied. Padding cannot repair
   this: a zero-size element is excluded from the count by the definition itself.
2. **`REQ-UIBENCH-085`'s boolean is additionally false in the follow variant.** That invariant is weaker —
   it compares only the non-construction records — and the top variant survives it (all six report 777)
   only because every one of those six phases happens to end with the transcript scrolled to the same
   place showing the same rows. In the follow variant, where the changed rows are the visible ones,
   three distinct values (715, 668, 669) appear among the six non-construction records, so
   `widgets_stable_after_warmup` is **false**.

Rule 2 also moves *within* a phase and within the resize sweep. Intra-phase probes, `A-top-1`:

| probe point | rows | rule 1 | rule 2 |
|---|---|---|---|
| `construct/end` | 0 | 629 | 630 |
| `apply_fixture/after` | 1200 | 629 | 777 |
| `ordered_appends/cleared` | 0 | 629 | **631** |
| `ordered_appends/i=0` | 1 | 629 | **638** |
| `ordered_appends/i=600` | 601 | 629 | 777 |
| `streaming_updates/cleared` | 0 | 629 | **631** |
| `streaming_updates/i=0` | 1 | 629 | **638** |

Resize sweep, `A-top-1` (`REQ-UIBENCH-060`), each step after settle:

| size | transcript viewport height | rule 1 | rule 2 |
|---|---|---|---|
| 1000×680 | 548 | 629 | **747** |
| 1440×900 | 768 | 629 | 777 |
| 1180×760 | 628 | 629 | **754** |
| 1000×680 | 548 | 629 | **747** |
| 1440×900 | 768 | 629 | 777 |

The sweep returns rule 2 to 777 only because it ends at the size it started from. A benchmark that took a
record at any intermediate size would see the count move.

### 3.3 What each reading costs — stated, not resolved

This is OQ-28's empirical answer and nothing more.

- **The conflict OQ-28 names is real in a running window, not only on paper.** Under reading 2, a
  document-model transcript whose rows contain rendered Markdown cannot hold `REQ-UIBENCH-054`, and the
  fixed slot pool does not help: the failure is inside the row, and the first violation happens at the
  `construct_window` → `apply_fixture` boundary, before any of the phases OQ-28 discusses. ADR-0045's own
  prediction — that under reading 2 option C fails for the same reason option A does — is confirmed
  against a running window.
- **Under reading 1 the invariant holds, and holds strictly.** 629 at all 384 observations listed in §3.1,
  across two scroll variants, onscreen and offscreen, yielding and non-yielding. The recycler is not
  merely passing the benchmark's sampling points; the count does not move at all.
- **The gap between the readings is the content of the visible rows.** Confining both counts to the
  transcript pane, rule 2 moves from 320 at construction to 467 once the fixture is applied — **+147
  elements across the 34 bound slots, an average of 4.3 Markdown content elements per visible row on this
  fixture**. Over the whole document the two counts differ by 1 at construction (629 against 630) and by
  148 thereafter (629 against 777). The two are not nested: rule 2 counts `html` and `body`, which the
  application's layout does not own, and excludes any application-owned element whose box is degenerate at
  the moment of counting.
- **Reading 2 is also the reading under which the number stops being a property of the transcript and
  becomes a property of the fixture and of where the reader is scrolled.** 777 with the reader at the
  top, 668 with the reader at the bottom, 747 at the minimum window size — same product, same fixture,
  same iteration.

One harness choice makes rule 2 **more** stable than a plausible implementation would: empty slots here
keep a non-zero box (a 52 px timestamp column, a 112 px role column and a minimum height), so each of the
80 slots contributes 4 paintable elements whether bound or not. An implementation that collapsed an empty
slot to zero height would remove 4 elements per unbound slot from the rule-2 count, and the swing would be
larger than the one measured. The rule-2 figures above are therefore a **best case** for reading 2.

### 3.4 Incidental: determinism and cache bounds

Every one of the twelve complete runs — onscreen and offscreen, both variants, yielding and not — ended
with byte-identical operation counters:

```
{"noop":1,"insert":2398,"remove":0,"update":2853,"refused":0,"reset":5}
```

so `REQ-UIBENCH-083`'s `operation_counts_identical` would be true across fresh processes. Rendered-body
cache occupancy stayed inside `REQ-UIBENCH-063`'s capacities in all 84 records: at most **256 entries**
(the cap, reached in the follow variant) and at most **78,592 source characters** against the 2,000,000
limit, so `REQ-UIBENCH-086` would be true.

One observation about `unchanged_state` that the spike did not go looking for. `REQ-UIBENCH-059` describes
it as "the fixture's complete state … applied a second time, **identical to the state already
displayed**". After `tail_replacements_1000` has replaced the last entry's text 1,000 times, it is not
identical: re-applying the fixture restores that entry. The measured counters show it as one `update`, not
one `noop` — the single `noop` in every run comes from the end of `streaming_updates`, not from
`unchanged_state`. This is a reading question about the requirement, not a finding about ADR-0045, and is
recorded only because an implementer will hit it.

---

## 4. Results — Part 1b: the tail-phase memory tripwire

`REQ-UIBENCH-087` requires every `rss_second_half_growth_bytes` to be strictly less than 64 MiB
(67,108,864 bytes), where `REQ-UIBENCH-058` defines that value as RSS sampled after replacement 999 minus
RSS sampled after replacement 500, each read once the interface has finished showing its replacement.

Measured, one value per run, no forced garbage collection at any point:

| run | window | variant | `rss_second_half_growth_bytes` | against 67,108,864 |
|---|---|---|---|---|
| `A-top-1` | onscreen | top | 6,303,744 | PASS |
| `A-top-2` | onscreen | top | 7,172,096 | PASS |
| `A-top-3` | onscreen | top | 6,320,128 | PASS |
| `B-follow-1` | onscreen | follow | 212,992 | PASS |
| `B-follow-2` | onscreen | follow | 176,128 | PASS |
| `B-follow-3` | onscreen | follow | 118,784 | PASS |
| `P2-phases-top-raf` | offscreen | top | 184,320 | PASS |
| `P2-phases-follow-raf` | offscreen | follow | 643,072 | PASS |
| `P2-phases-follow-paint` | offscreen | follow | 106,496 | PASS |
| `Y-yield1-top` | onscreen | top | −614,400 | PASS |
| `Y-yield1-follow` | onscreen | follow | 110,592 | PASS |
| `P2-phases-top-paint` | offscreen | top | **−109,273,088** | see below |

The eleven full 11-sample series are in the raw files. `A-top-1`'s, in bytes:

```
168222720, 169922560, 171962368, 173436928, 174882816, 176250880,
177713152, 179093504, 179699712, 181096448, 182554624
```

The largest observed second-half growth over the whole spike, 7,172,096 bytes, is **10.7 %** of the
tripwire. The margin is comfortable, and two things about it are worth stating rather than leaving to be
discovered:

- **RSS grows monotonically through the tail phase in the top variant** — about 14.3 MB across all 1,000
  replacements, roughly 14 KB per replacement, of which 6.3 MB falls in the second half. The tripwire
  reads only 500 replacements' worth. A phase ten times longer, on this harness, would trip it. Nothing
  here establishes that the growth is a leak rather than allocation the collector had not yet reclaimed;
  no forced collection was performed, because the requirement measures RSS as it stands.
- **On Windows `rss` is the process working set, and the operating system trims it.** The one anomalous
  row above is the reason it matters. In `P2-phases-top-paint` the phase's eleven settles each waited the
  full 30 s bound (section 6), so the process sat idle for five and a half minutes inside a single phase;
  its RSS series fell from 129,765,376 bytes at sample 0 to 3,813,376 at sample 600 before recovering to
  21,037,056 at sample 999. The resulting −109,273,088 "passes" the tripwire while measuring nothing about
  the transcript. A settle that times out does not merely inflate `wall_ms`; it destroys the meaning of
  the memory sample taken beside it.

---

## 5. Results — Part 1c: update cost at 1,000-plus rows with real Markdown bodies

`REQ-CHAT-055` requires that "the work of painting and measuring MUST depend on how many rows are visible
and how many rows changed, not on how many rows the transcript holds in total", that with 1,000 or more
rows scrolling, expanding a row and running a search each stay inside `REQ-CHAT-157`'s **200 ms** budget,
and that appending a row cost no more than it does on an empty transcript. `REQ-CHAT-154` requires update
cost proportional to what changed, not to the transcript's length.

Method: at each total-row count, 60 repetitions of each operation. Two times are taken per repetition —
**sync**, from the state assignment to the return of a forced layout flush, and **to paint**, from the
state assignment to the second `requestAnimationFrame` callback after it. Pool 80 slots throughout.
A fifth operation, *identical re-apply*, assigns the same state again and changes nothing visible; it
isolates the cost that depends on total rows alone.

Top variant (reader at the first row), p50 of 60 repetitions, milliseconds:

| total rows | slots bound | append sync | tail replace sync | scroll one page sync | expand row sync | identical re-apply sync | worst to-paint over all ops |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 1.2 | — | — | — | — | 26.9 |
| 100 | 34 | 0.4 | 0.3 | 5.4 | 1.1 | 0.2 | 19.9 |
| 1,000 | 34 | 0.7 | 0.3 | 6.3 | 2.0 | 0.15 | 21.0 |
| 2,000 | 34 | 0.75 | 0.4 | 7.7 | 1.1 | 0.1 | 20.6 |
| 5,000 | 34 | 0.8 | 0.4 | 8.0 | 1.1 | 0.1 | 21.8 |
| 10,000 | 34 | 0.8 | 0.7 | 8.15 | 1.0 | 0.2 | **34.2** |

Follow variant (reader at the last row, so the changed row is visible):

| total rows | slots bound | append sync | tail replace sync | scroll one page sync | expand row sync | identical re-apply sync | worst to-paint over all ops |
|---|---|---|---|---|---|---|---|
| 0 | 0 | 1.4 | — | — | — | — | 24.8 |
| 100 | 16 | 1.7 | 0.7 | 3.75 | 1.0 | 0.1 | 21.1 |
| 1,000 | 14 | 2.05 | 1.05 | 7.25 | 1.15 | 0.2 | 20.9 |
| 2,000 | 13 | 1.7 | 0.95 | 7.9 | 1.15 | 0.1 | 22.3 |
| 5,000 | 11 | 2.1 | 0.9 | 7.95 | 0.9 | 0.1 | 24.6 |
| 10,000 | 12 | 2.7 | 1.3 | 8.1 | 1.0 | 0.2 | 21.2 |

**The apply-to-paint p50 is 13.8–13.9 ms for every operation at every total-row count in both variants**,
without exception — a floor set by the frame cadence, not by the transcript. The largest single
apply-to-paint observation anywhere in the sweep, across **2,520 apply-to-paint measurements** (plus 600
sync-only identical re-applies), is **34.2 ms**, which is 17 % of the 200 ms budget.

Residual dependence on total rows, as an ordinary-least-squares slope of the sync p50 against total rows:

| operation | top variant | follow variant |
|---|---|---|
| append | 0.0028 µs/row | 0.106 µs/row |
| tail replace | 0.039 µs/row | 0.043 µs/row |
| scroll one page | 0.233 µs/row | 0.274 µs/row |
| expand row | −0.046 µs/row | −0.012 µs/row |
| identical re-apply | 0.0024 µs/row | 0.0058 µs/row |

Cost is flat to within measurement noise. Two of the five slopes are negative, which is the clearest
statement that what is being measured at this scale is noise rather than a dependence. Extrapolating the
largest slope, scrolling, one would need on the order of 700,000 rows before the total-row term reached
the 200 ms budget on its own; that extrapolation is arithmetic on measured slopes, not a measurement, and
should not be quoted as one.

One honest qualification about "appending a row MUST cost no more than it does on an empty transcript".
Taken literally as a sync figure, it is **not** met: in the follow variant appending costs 1.4 ms on an
empty transcript and 2.7 ms at 10,000 rows. The difference is 1.3 ms, it is 0.65 % of the 200 ms budget,
and it does not appear at all in the apply-to-paint figure (13.9 ms at 0 rows and 13.9 ms at 10,000 rows).
The residue is the `O(n)` scan and array copy that a **whole-transcript assignment** forces at the view
boundary: `REQ-UIBENCH-055`, `REQ-UIBENCH-057` and `REQ-UIBENCH-058` all hand the view the entire
transcript on every update, so some per-row work is unavoidable however the view is built, unless the
state store offers structural sharing or a version stamp the view can compare in constant time. The
identical-re-apply row isolates that cost: 0.1–0.2 ms for 10,000 rows.

---

## 6. Results — Part 1d: is the reachable viewport knowable at construction?

ADR-0045 states that the earlier formulation — size the pool at construction for "the largest viewport
the window can reach" — is not determinable in the live application, and replaces it with a declared
`H_max` constant. That claim was tested rather than argued.

At construction the display enumeration offered two displays, both 1920×1080 with work area 1920×1032 and
`scaleFactor` 1. The tallest thing any host-derived figure could name is therefore **1080 px**. The window
was then driven to a series of sizes, each read back from both the main process (`getContentSize`) and the
renderer (`window.innerHeight`), with the pool held at 80 slots:

| attempt | requested content size | achieved content size | renderer `innerHeight` | transcript viewport height | slots the viewport calls for | pool sufficient |
|---|---|---|---|---|---|---|
| opening | 1440×900 | 1440×900 | 900 | 768 | 34 | yes |
| `maximize()` | — | 1920×983 | 983 | 851 | 37 | yes |
| work-area height | 1200×1032 | 1200×1032 | 1032 | 900 | 38 | yes |
| full display height | 1200×1080 | 1200×1080 | 1080 | 948 | 40 | yes |
| tallest display + 500 | 1200×1580 | **1200×1580** | **1580** | 1448 | 57 | yes |
| — | 1200×3000 | **1200×3000** | **3000** | 2868 | **104** | **no** |
| — | 1200×8000 | **1200×8000** | **8000** | 7868 | **271** | **no** |
| — | 1200×20000 | **1200×20000** | **20000** | 19868 | **671** | **no** |
| back to opening | 1440×900 | 1440×900 | 900 | 768 | 34 | yes |

**Windows did not clamp the window to any display.** A content height of 20,000 CSS pixels was requested,
granted, and reported by the renderer as a real laid-out viewport, on a machine whose tallest display is
1,080 pixels. Nothing in the display enumeration available at construction bounds it. The empirical answer
to the question is therefore:

- **"The largest viewport the window can reach" is not knowable at construction time on Windows, and the
  gap is not marginal.** It is not a matter of a user maximising onto a taller monitor later — a window on
  *this* machine, with *these* two 1080 px displays, reached a viewport 18.4× taller than the tallest
  display present, without any monitor being attached. The reachable height is bounded by what the window
  manager accepts, which was at least 20,000 px here and was not probed further.
- **ADR-0045's replacement of that formulation with a declared `H_max` constant is therefore not merely
  tidier; the original formulation has no referent.** A constant is the only thing available to write
  down, which is what the record already says.
- **The consequence of the growth branch being unreachable is concrete and worth stating in the size the
  user would see.** At 20,000 px of content the viewport calls for 671 slots and the pool holds 80. The
  pool covers 80 of 671 slots; the rest of the transcript pane would be blank until the pool grew. The
  branch exists in ADR-0045 for exactly this case, and this measurement shows how big the case is.
- **The benchmark cannot reach it.** Confirmed by measurement, not only by argument: across every phase
  record and every resize step of all twelve runs, the largest slot count the viewport ever called for was
  **34**, at the opening canonical size, against a pool of 80; the harness's "pool growth wanted"
  watermark was 0 in all twelve runs including all sixty resize steps. No size in `REQ-UIBENCH-060`'s
  sweep exceeds the construction size in either dimension, and the measurements agree.

Not measured, and therefore not claimed: behaviour when a display is physically attached or removed while
the window exists; behaviour at a `scaleFactor` other than 1 (both displays here report 1); and whether
any other window manager on the two other platforms clamps where Windows does not.

---

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

## 8. Secondary finding — the interface-lag invariant and how a phase is driven

Not asked for, but it falls out of the phase records and bears on ADR-0053. `REQ-UIBENCH-118` requires
`event_loop_lag_ms` strictly below 100 ms in **every** record, probed every 10 ms per `REQ-UIBENCH-049`.

The harness's driver applies each phase's updates in one synchronous burst, which is the obvious way to
implement the phase text. Measured maximum `event_loop_lag_ms` over a run:

| driver | top variant | follow variant |
|---|---|---|
| burst, no yielding | 588, 591, 581.7 ms | 2752.4, 2568.2, 2546.5 ms |
| yields to the event loop after every update | **74.8 ms** | **68.7 ms** |

With a burst driver, `interface_lag_within_budget` is **false**, by a factor of up to 27. With a driver
that yields after every update it is **true** in both variants, with the largest value being
`apply_fixture`'s single bulk assignment, which yielding cannot break up.

Yielding is not free: `ordered_appends` goes from 363.8 ms to 6,318.2 ms and `streaming_updates` from
593.0 ms to 15,693.9 ms in the top variant, because each yield costs a clamped timer turn. The widget
counts and the operation counters are unchanged.

This is a property of how the benchmark drives a phase, not of the recycler, and it is a choice ADR-0053
currently leaves implicit. Whichever way it is settled, one of `REQ-UIBENCH-118`'s boolean and the phase
wall times is going to look very different from the other reading, and the two are not separately tunable.

---

## 9. Verdicts

| # | Requirement | Threshold / condition as written | Verdict | Evidence |
|---|---|---|---|---|
| 1 | `REQ-UIBENCH-054` | `widgets` must not change from the `construct_window` record until the iteration ends — **counting only application-owned structural elements (OQ-28 reading 1)** | **PASS** | 629 at all 384 observations: 84 phase records of 12 runs, 130 intra-phase probes, 110 tail-loop samples, 60 resize steps; §3.1 |
| 2 | `REQ-UIBENCH-054` | the same rule, **counting every element that occupies layout space and can be painted (OQ-28 reading 2)** | **FAIL** | 630 → 777 (top) / 630 → 715 (follow) at the first post-construction record, in every run; §3.2 |
| 3 | `REQ-UIBENCH-085` | `widgets_stable_after_warmup`: one value across all non-construction records of an iteration — reading 1 | **PASS** | single value 629; §3.1 |
| 4 | `REQ-UIBENCH-085` | the same boolean — reading 2 | **FAIL in the follow variant** (715 / 668 / 669), **PASS in the top variant** (777) | §3.2 |
| 5 | `REQ-UIBENCH-087` | every `rss_second_half_growth_bytes` < 64 MiB (67,108,864) | **PASS** | 11 clean runs, 106,496 – 7,172,096 bytes, max 10.7 % of the tripwire; §4 |
| 6 | `REQ-CHAT-055` / `REQ-CHAT-157` | scroll, expand and update within 200 ms with ≥1,000 rows present | **PASS** | worst apply-to-paint 34.2 ms over 2,520 apply-to-paint measurements at up to 10,000 rows; §5 |
| 7 | `REQ-CHAT-055` / `REQ-CHAT-154` | cost depends on visible and changed rows, not on total rows | **PASS** | OLS slopes 0.0024 – 0.274 µs/row, two of five negative; apply-to-paint p50 13.8–13.9 ms at every size; §5 |
| 8 | `REQ-CHAT-055` | appending costs no more than on an empty transcript | **PASS with a stated qualification** | to-paint identical (13.9 ms at 0 and at 10,000 rows); sync cost 1.4 → 2.7 ms, a 1.3 ms residue forced by whole-transcript assignment; §5 |
| 9 | `REQ-UIBENCH-051` / `REQ-UIBENCH-119` (ADR-0053's settle) | each phase's timing closes when the interface has finished showing its effect, bounded at 30 s, using the offscreen `paint` event | **FAIL** | 3 of 7 phase records carry `settle_timed_out` true in the top variant, 1 of 7 in the follow variant; `tail_replacements_1000` runs 360.4 s of which 360 s is expired bounds; §7.2 |
| 10 | same, using `invalidate()` before awaiting the paint | — | **FAIL, and worse** | 0 of 40 invalidate-driven paints carried the committed frame; all 40 were one frame stale, returned in 0.2 ms with `settle_timed_out` false; §7.3 |
| 11 | same, using a renderer double `requestAnimationFrame` offscreen | — | **PASS as far as completion goes; not established as equivalent** | 2.6–30.9 ms, no timeouts, full run in 2.17 s / 5.97 s; equivalence to a paint-based settle not measured; §7.4 |
| 12 | ADR-0045's pool sizing at "the largest viewport the window can reach" | is it knowable at construction on Windows? | **NO — not knowable** | 20,000 px content height granted and laid out on a machine whose tallest display is 1,080 px; 671 slots called for against a pool of 80; §6 |
| 13 | `REQ-UIBENCH-118` | `event_loop_lag_ms` < 100 ms in every record | **FAIL with a burst driver (588–2752 ms), PASS with a yielding driver (≤74.8 ms)** | §8 |
| 14 | `REQ-UIBENCH-083` | `operation_counts_identical` across fresh processes | **PASS** | byte-identical counters in all 12 runs; §3.4 |
| 15 | `REQ-UIBENCH-086` | `markdown_cache` within 256 entries and 2,000,000 chars | **PASS** | max 256 entries, max 78,592 chars; §3.4 |

---

## 10. What this harness does not model

- **It is not the product, and its absolute numbers are not the product's.** The mock shell is 629
  structural elements of plain `div`s and `span`s with a hand-written stylesheet. There is no renderer
  framework, no state store, no IPC contract, no theming layer, no accessibility tree, no icon set, no
  bundled fonts, no syntax highlighting, no tool rows, no group headers, no verifier rows, no live-row
  redraw path. Every one of those adds elements per row and work per update. The element counts in §3 are
  a floor, and the timings in §5 are a floor.
- **The counting rules are the harness's operationalisation of two English sentences**, not the product's
  definition of `widgets`. Rule 1 is "carries a `data-s` attribute", which is exactly as arbitrary as
  ADR-0045 says a product-defined rule is. Rule 2 is "computed display not `none`, computed visibility not
  `hidden`, border box non-degenerate", which is one defensible operationalisation of "occupies space in
  the window's layout and can be painted" and not the only one.
- **Empty slots here are laid out with non-zero boxes.** That makes the rule-2 count more stable than an
  implementation that collapsed them would be; §3.3.
- **No forced garbage collection, no memory pressure, no `--expose-gc`.** §4's figures are raw working-set
  readings from `process.memoryUsage().rss` in the renderer process, which on Windows the operating system
  trims for idle processes — as the one anomalous run demonstrates.
- **One machine, one architecture, `devicePixelRatio` 1, two identical 1080 px displays.** Nothing here
  says anything about a high-DPI display, a mixed-DPI arrangement, a display attached or removed at run
  time, macOS, or Linux. §6's answer is a Windows answer.
- **Row heights vary but are modest.** The fixture's bodies are 80–900 characters; a 2,000-line tool
  output or a very wide table would change both the measurement pass and the element counts per row.
- **Three iterations, one fixture, one seed.** The determinism claim in §3.4 is about three fresh
  processes replaying one fixture, not about fixture variety. The cost sweep is 60 repetitions per cell
  on an otherwise busy developer machine; the p95 and max columns carry the scheduling noise that implies.
- **The `streaming_updates` implementation follows `REQ-UIBENCH-057` literally**, including the full
  transcript assignment per prefix step. A product that streamed by appending to the last row instead
  would produce different numbers everywhere.
- **Part 2 measured the settle signal, not the fidelity of the offscreen composite.** It establishes when
  a paint arrives and, in §7.3, whether the delivered frame is current. It does not establish that
  offscreen composite timings resemble onscreen ones — `REQ-UIBENCH-099` already treats every timing as
  comparative for that reason.
- **The offscreen probes ran with hardware acceleration disabled** (as ADR-0053 requires) and the onscreen
  runs with it enabled. The two sets of timings are therefore not directly comparable to each other, and
  no comparison between them is drawn above except where the figures are identical by construction
  (element counts, operation counters).

---

## 11. Files

All harness code is throwaway and lives in the session scratchpad, outside this repository, at
`…\scratchpad\spike-renderer\`: `main.js` (window, offscreen mode, paint instrumentation, pixel sampling,
IPC), `renderer.js` (shell, recycler, Fenwick offset table, apply pipeline, phase driver, counters, all
probe modes), `fixture.js` (seeded fixture), `index.html` (layout and the `REQ-CHAT-057` metrics), and
`out/*.json` (twenty-three raw result documents, 532 KB, one per run, carrying every per-phase record,
every RSS sample, every per-repetition timing and every paint timestamp quoted above).

Nothing was installed into the shared toolchain; `marked@4.3.0` was installed into the spike's own
directory and the Electron install at `…\scratchpad\spike-base\` was reused unmodified.
