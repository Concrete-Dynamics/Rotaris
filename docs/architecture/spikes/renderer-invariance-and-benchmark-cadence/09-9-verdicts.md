# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 9. Verdicts

Part 9 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

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
