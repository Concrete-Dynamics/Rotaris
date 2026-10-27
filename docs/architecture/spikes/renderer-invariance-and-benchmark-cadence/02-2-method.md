# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 2. Method

Part 2 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

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
