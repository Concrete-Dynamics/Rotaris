# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 3. Results — Part 1a: is the element count invariant?

Part 3 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

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
