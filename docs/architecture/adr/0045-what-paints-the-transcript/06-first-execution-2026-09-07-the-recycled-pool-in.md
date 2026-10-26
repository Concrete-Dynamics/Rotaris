# ADR-0045 — What paints the transcript: a fixed-capacity recycled row pool — First execution — 2026-09-07, the recycled pool in the product (Part Z)

Part 6 of 7 of [ADR-0045](../0045-what-paints-the-transcript.md), which indexes every part.

## First execution — 2026-09-07, the recycled pool in the product (Part Z)

*Recorded under GD-10. Measured by `pnpm transcript-proof`; evidence under `.transcript-proof/`.*

The pool is built: `packages/ui/src/transcript/` — `constants.ts` (the declared constants and the counting rule),
`pool.ts` (the offset table, the visible span, the anchor, REQ-CHAT-053's four shapes), `cache.ts` (the two bounded
caches and the four-part reuse predicate), `project.ts` (ADR-0046 step 4), `search.ts`, `TranscriptPane.tsx` (the
slots and step 5). `TranscriptRows.tsx`'s row-per-article list is gone from the Workspace view.

**`H_max` is declared at 4,320 CSS pixels**, the height of a 4320p panel in its ordinary orientation — so the pool
is **154 slots** (`ceil(4320 / 30) + 10`), allocated once and never added to. *(226 since 2026-10-01 —
`ceil(4320 / 20) + 10`; the 30 px unit was taller than a row `PD-CHAT-003` draws, reported below.)* The record asked for the number to be
chosen and reviewable rather than imagined, and that is the number. The one growth branch (`capacityFor`) exists in
the product's own rendering path, is not conditioned on being under measurement, and is unreachable at every size
REQ-UIBENCH-060's sweep visits.

**The counting rule is written down once**, in `constants.ts`, as `WIDGET_SELECTOR` / `countWidgets` /
`countUiObjects`, and is read from there by the proof and by anything ADR-0053 later builds. It is reading 1.

### Found — the first defect, and it is the record's rather than the code's: the rule cannot count a conditional pane

Reading 1's list of structural elements includes "the seven views' panes". **Three classes of element in this
product are panes by that description and are nevertheless mounted and unmounted during ordinary, specified
behaviour**, and counting any of them makes `REQ-UIBENCH-054` false with no recycler anywhere near it:

- **REQ-MONITOR-051 turns the inspector and the agents panel into overlay drawers below 1180 px**, which *unmounts*
  the inspector — **inside REQ-UIBENCH-060's own resize sweep**, which visits 1000×680.
- The agents panel exists only when the session has delegated children; the queued-messages panel only while the
  queue is non-empty. Both appear and disappear on data, not on layout.
- The transcript's own search panel and its "N new updates" button exist only while the reader has asked for them.

The spike could not have seen this: it drove a hand-written recycler with no responsive layout, no data-conditional
pane and no transient control. The rule now states the exclusion **and its reason**, so a later reader does not read
the short list as a counter quietly trimmed to pass. All three classes are counted in `ui_objects`, which
REQ-UIBENCH-109 makes informational. **This is a constraint on how `widgets` may be defined at all, not a tuning:**
any definition that counts a surface the product legitimately unmounts cannot satisfy `REQ-UIBENCH-054`.

One consequence for the transcript itself is taken rather than argued: **the slot pool is rendered whether or not
the transcript holds any rows**, so REQ-CHAT-073's empty state is drawn *over* an intact pool of empty slots rather
than instead of one. Emptied rather than unmounted applies to the pool as a whole exactly as it does to one slot.

### Measured, in the product, at REQ-UIBENCH-060's own sizes

One process, one window, nine observations: the transcript emptied, then three planted sessions opened in turn
through the session browser, then the five window sizes of the resize sweep.

| observation | displayed rows | `widgets` | `ui_objects` | slots | bound slots |
|---|---|---|---|---|---|
| no session | 0 | **165** | 276 | 154 | 0 |
| session opened | 1 | **165** | 273 | 154 | 1 |
| session opened | 601 | **165** | 348 | 154 | 16 |
| session opened | 997 (1000 rows, four folded) | **165** | 348 | 154 | 16 |
| 1000×680 | 997 | **165** | 309 | 154 | 15 |
| 1440×900 | 997 | **165** | 363 | 154 | 19 |
| 1180×760 | 997 | **165** | 353 | 154 | 17 |
| 1000×680 | 997 | **165** | 309 | 154 | 15 |
| 1440×900 | 997 | **165** | 363 | 154 | 19 |

**`widgets` did not move at all** — 165 at every one of the nine observations, across 0, 1, 601 and 997 displayed
rows and across the whole sweep, which is the same "did not move at all rather than passed at the sampling points"
result the spike got, now with a framework, a theme, an accessibility tree and real tool rows behind it.
`ui_objects` moved between 273 and 363 exactly as reading 1 says it should, and no invariant reads it.

The spike's 629 and this build's 165 are not comparable and are not meant to be: `REQ-UIBENCH-050` disclaims
cross-implementation comparison, the spike counted every element of a bare harness, and this counts the twelve
application-owned structural classes the rule names.

### The other measurements the record asked for

- **REQ-CHAT-055's append clause, at the point that requirement fixes** — after the frame showing the update has
  been painted, never a synchronous figure. Two scripted runs of identical shape, one appended to an all-but-empty
  transcript and one to a 1200-row one:

  | transcript | samples | median shown-update | p95 | worst |
  |---|---|---|---|---|
  | 1 row | 5 | **58.3 ms** | 84.9 ms | 84.9 ms |
  | 1200 rows (1000 resident) | 7 | **53.8 ms** | 66.1 ms | 66.1 ms |

  **The loaded transcript showed its appends faster than the empty one**, which is the strongest form the clause
  can take: not "within tolerance" but "not more, at every quantile measured". The figures are wall time to a frame
  boundary under a scripted run and are not comparable with the spike's 13.8 ms apply-to-paint p50, which measured a
  bare harness with no engine behind it. The measurement point is a double `requestAnimationFrame`, which this
  record already establishes is a **proxy**: it says a frame boundary passed after the change was committed, not
  that a frame containing the change was presented. The platform's own paint event remains unusable for it — with
  no damage it delivers about one frame every five seconds — and nothing here establishes that the two agree where
  both resolve.
- **REQ-CHAT-071's anchor, measured as the invariant rather than as a rectangle.** Fifty older rows paged in above
  the viewport: the transcript grew **3,331.25 px** and the reader's scroll position moved **3,331 px**, so the
  content shifted under the reader by **0.25 px**. Reading it as "the transcript grew by exactly what the reader
  moved" is what makes the figure meaningful; the first attempt read a rectangle instead and reported a 360 px
  drift that was mostly the probe's own one-render lag behind the pool's rebinding.
- **The reuse predicate is all four parts and it is enforced by construction**: `reuseKey` returns null for a live
  row, so a running tool, a running group or streaming reasoning is redrawn on every repaint and its elapsed time
  keeps advancing; for every other row the key is identity, a content hash, the laid-out width and the expansion
  state, and a search highlight. The rendering cache's occupancy stayed far inside REQ-UIBENCH-063's bounds
  throughout the invariance launch — at most **171 entries and 10,956 source characters** against 256 and
  2,000,000 — with 552 hits against 171 misses by the end of the sweep, and no eviction.
- **Row heights are measured rather than assumed**, by a `ResizeObserver` over the bound slots feeding the
  prefix-sum offset table. The measurement pass is an observer callback and not an effect body, which is both the
  correct place for it and the only place the framework's rules allow a measurement to become state.

### Carried, and owed

`REQ-CHAT-055`, `REQ-CHAT-154` and `REQ-CHAT-157` name the benchmark domain's replay harness (ADR-0053) as the
authority that accepts or rejects them. **That harness is not built, so this part cannot discharge those three**;
the acceptance is owed to the benchmark part, and what is recorded here is a measurement against this proof.
ADR-0045's "Revisit if" is not fired: no measured recycler failed the budget. Its two replacement triggers are
live — `H_max` at 4,320 is exceeded by a portrait 8K panel or by any display at a `scaleFactor` below 1, and the
settle signal is still a proxy.
