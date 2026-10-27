# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 4. Results — Part 1b: the tail-phase memory tripwire

Part 4 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

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
