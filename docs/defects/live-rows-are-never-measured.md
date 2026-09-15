## A live row is never measured, so the transcript positions it by an estimate that is wrong for the whole time it is live

`TranscriptPane` writes the measurement key onto each slot as `data-measure={reuseKey(...) ?? ''}`, and the
`ResizeObserver` that records heights skips any entry whose key is `''`. `reuseKey` returns **null for a live
row** — a running tool, a group with a running member or unsettled reasoning, a thinking row still streaming
(`isLive` in `project.ts`). The two concerns are different and share one key:

- **Rendering reuse** must refuse a live row. Its elapsed time advances every second; a cached rendering would
  freeze the clock. That is REQ-CHAT-058's rule and it is right.
- **Measurement** has no such reason. The row is in the DOM with a real height. Refusing to measure it does not
  keep anything fresh; it throws the only accurate number away.

So a live row is positioned by `estimateHeight` for its entire life, and every row after it is positioned from
that estimate through the prefix-sum offset table. Two visible consequences, one cause.

**Rows draw on top of each other.** `estimateHeight` gives a group `36` px, or `56` while a call is in flight —
one line, plus the `⤷` preview line. But `.activity__segments` is `flex-wrap: wrap`, so a run with many segments
draws **two, three or four** lines. An agent mid-run with a dozen segments draws ~90 px into a 36 px allocation,
and the next slot's `translateY` puts it 36 px down, through the middle of the text. Measured in the product:
`REQUIREMENTS-ENGINEER`'s activity line overlapping `CODEBASE-ANALYST`'s, both agents live at once.

**The transcript flickers while two agents work.** A streaming *message* row is not live by `isLive`, so it is
measured — but its `reuseKey` contains `hash(sourceText)`, and the body changes on every chunk. Every chunk is
therefore a **new key with no measurement**, which falls back to `estimateHeight`, which counts `\n` and knows
nothing about wrapping: one 400-character paragraph is one line to the estimate and five on screen. The
sequence per chunk is *estimate (wrong) → paint → observe → `measuredVersion` → paint again (right)*, and the
rows below jump by the difference twice per chunk. With two agents producing at once the jumps interleave and
each one re-pins the tail (`el.scrollTop = el.scrollHeight` while following), which is the "both messages race
to get to the bottom" the owner reported.

The estimate is meant to be coarse — `pool.ts` says so, and says a wrong estimate above the viewport is
corrected on the next settle. That reasoning holds for a row that settles. It does not hold for a row that is
live for a minute, or for a row whose key changes faster than the measurement can land.

## Specs

`REQ-CHAT-058` is contradicted directly: heights are **measured rather than assumed**, and a row in the DOM
that is never measured is assumed. `pool.ts`'s own header states the rule it breaks — "Row heights are measured,
not assumed" — and then documents the estimate as the exception for rows that have not completed layout, which a
live row has.

`REQ-CHAT-053` and `REQ-CHAT-071` are contradicted in effect rather than in letter: the reader's position is to
be preserved across an update, and an update that moves every row below by the estimation error has not
preserved it. `PD-CHAT-004`'s activity line "never appends" and does not — but the line that replaced the
appending rows is the one the estimate is most wrong about, because its height is the one thing the directive
made variable.

No requirement asks for the current behaviour, so nothing is minted.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — `data-measure={... ?? ''}` at the slot, the observer that
  skips `key === ''`, and the `heights` map that falls back to `estimateHeight` on a cache miss.
- `packages/ui/src/transcript/cache.ts` — `reuseKey` returning null for a live row, and `sourceTextOf` keying a
  message on its whole body so every chunk is a new key.
- `packages/ui/src/transcript/pool.ts` — `estimateHeight`: the constant `36`/`56` for a group, and the
  `\n`-counting term for a body, neither of which models wrapping.
- `packages/ui/src/shell.css` — `.activity__segments { flex-wrap: wrap }`, the rule that makes a group's height
  variable in the first place.
- `packages/ui/src/transcript/project.ts` — `isLive`, the predicate both concerns currently share.

*Noticed 2026-09-15 from two screenshots the owner took of the built product: overlapping activity lines, and
flicker while two agents produced output at once.*

**Repaired 2026-09-15** ([R-021](../product/requests.md#r-021)), citing REQ-CHAT-058, REQ-CHAT-053/071 and
PD-CHAT-004. Three changes, and the third is the one that stops the flicker rather than the overlap.

**Measuring and reusing are separated.** `measureKey` is the four-part key for a row in any state; `reuseKey` is
`measureKey` behind the live guard, so a rendering is still never reused for a live row and a *height* is now
always recorded. Every bound slot carries a non-empty `data-measure`.

**The estimate models wrapping.** It takes the width, subtracts the `52px` + `112px` gutter, and counts DRAWN
lines rather than newlines — for the activity line's segments, for a body against its 78 % prose measure, and for
the role gutter's own second line. The constant `36`/`56` for a group is gone.

**A row falls back to what it last drew, not to an estimate.** A second cache keyed on row IDENTITY holds the
last height each row measured under any content. The order is: this exact content's measurement, then this row's
last measurement, then the estimate. A streaming row changes key on every chunk and used to fall all the way to
an estimate each time, paint wrong, get measured, and paint again — two shifts per chunk, each one re-pinning the
tail. It now keeps the height it just drew.

Measured in the built product by `pnpm transcript-proof`'s new `geometry` stage: 26 samples over a planted run
whose line wraps to **7 lines** under an agent name that takes a **32 px** two-line gutter, with a scripted run
appended so that **2 of the 26 samples caught a live line**. Worst overlap between any two bound slots across
every sample: **0 px**. Unkeyed bound slots: **0**. The two guards — that the line actually wrapped, and that a
sample actually caught a live row — are asserted, so the measurement cannot pass by never drawing the case.

*One finding, and REQ-CHAT-055 is what caught it.* Widening the estimate put per-row string work on the paint
path — `split('\n')` per body and a joined summary per group — and `estimateHeight` runs for every displayed row
that has no measurement, which on the first paint of a 1200-row transcript is all of them. Appending there went
to **51.9 ms against 22.7 ms** on an empty transcript, past the requirement's one-frame slack, and the proof
refused it. `wrappedLines` walks the string instead of splitting it and the group sums its segment lengths
without building the summary; **30.4 ms against 25.4 ms**, inside the slack. A correctness fix that is paid for
in the render loop is not free, and the bound that made it visible was already there.
