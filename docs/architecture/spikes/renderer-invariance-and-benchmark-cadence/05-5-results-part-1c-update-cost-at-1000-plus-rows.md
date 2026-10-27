# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 5. Results — Part 1c: update cost at 1,000-plus rows with real Markdown bodies

Part 5 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

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
