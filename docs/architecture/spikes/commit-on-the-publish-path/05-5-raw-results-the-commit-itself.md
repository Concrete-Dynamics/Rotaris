# Spike — the transaction commit on the publish path — 5. Raw results — the commit itself

Part 5 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 5. Raw results — the commit itself

`full` shape, one transcript row + one event + the aggregate update, in one `IMMEDIATE` transaction, in
**microseconds**. Pooled over 3 replicate launches of 3,000 commits each where three per-run p95s are
shown, 1 launch of 3,000 otherwise. `sync` is `PRAGMA synchronous` read back immediately before and
immediately after the measured window, so the condition is evidenced rather than assumed.

### 5.1 Headline — `NORMAL` versus `FULL`

| Condition | rows already in the table | sync | n | min | p50 | p90 | **p95** | p99 | p99.9 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `NORMAL` | 0 | 1/1 | 9000 | 109.0 | **185.4** | 298.1 | **362.8** | 1077.0 | 12595.6 | 37907.5 | 317.9, 331.8, 416.9 |
| `NORMAL` | 10,000 | 1/1 | 9000 | 117.4 | **182.2** | 275.3 | **329.0** | 961.2 | 10701.3 | 15941.9 | 319.8, 315.0, 349.8 |
| `FULL` | 0 | 2/2 | 9000 | 543.8 | **812.1** | 1131.4 | **1434.4** | 4728.0 | 11243.9 | 36613.5 | 1046.2, 1544.9, 1760.9 |
| `FULL` | 10,000 | 2/2 | 9000 | 559.5 | **836.9** | 1119.0 | **1345.9** | 3339.7 | 9599.0 | 38537.2 | 1036.9, 1606.1, 1321.9 |
| `FULL` raised and lowered per commit | 0 | 1/1 | 9000 | 562.3 | **829.8** | 1120.4 | **1372.4** | 3860.6 | 10220.2 | 67318.3 | 1112.8, 1518.6, 1564.4 |
| `FULL` raised and lowered per commit | 10,000 | 1/1 | 9000 | 579.6 | **877.8** | 1273.8 | **1683.0** | 5575.6 | 12081.1 | 33464.8 | 1150.9, 1831.4, 1944.7 |
| `OFF` | 0 | 0/0 | 3000 | 111.8 | 177.5 | 265.1 | 320.9 | 568.6 | 4093.4 | 6995.5 | 320.9 |
| `OFF` | 10,000 | 0/0 | 3000 | 118.3 | 179.8 | 267.9 | 321.1 | 650.3 | 4481.3 | 5810.9 | 321.1 |

Read three things off that table.

- **`FULL` costs 4.4× the `NORMAL` p50 and 4.0× the p95.** The absolute delta at p50 is ~630 µs, which
  is one `fsync` (section 5.3).
- **`OFF` and `NORMAL` are indistinguishable**, exactly as SQLite's WAL semantics predict: at `NORMAL`
  in WAL a commit appends to the log and does not sync. That agreement is the evidence that the
  `NORMAL` figures are not accidentally paying for a sync.
- **Raising and lowering the pragma around the transaction costs essentially nothing beyond the sync
  itself** — 829.8 µs against `FULL`'s own 812.1 µs at p50. `PRAGMA synchronous` measured alone is
  **2.1–2.2 µs**. ADR-0058's raise-and-lower shape is free; the `fsync` is the whole bill.

### 5.2 Where the `NORMAL` cost goes, by transaction shape

`synchronous = NORMAL`, 3,000 commits each, microseconds.

| Shape | rows | p50 | **p95** | p99 | max |
|---|---|---|---|---|---|
| `row` (one insert) | 0 | 130.6 | 302.0 | 1267.9 | 59238.3 |
| `row` | 10,000 | 105.2 | 220.6 | 458.4 | 13999.2 |
| `row+evt` | 0 | 126.4 | 257.2 | 775.0 | 15487.2 |
| `row+evt` | 10,000 | 135.9 | 264.3 | 805.0 | 12513.6 |
| `full` | 0 | 185.4 | 362.8 | 1077.0 | 37907.5 |
| `full` | 10,000 | 182.2 | 329.0 | 961.2 | 15941.9 |
| `full+state` (68 KB `state_json` rewritten) | 0 | 189.1 | 346.1 | 936.6 | 11028.3 |
| `full+state` | 10,000 | 190.6 | 340.0 | 974.2 | 13079.0 |
| `row` at `FULL` | 0 | 695.8 | 945.9 | 1386.5 | 10474.6 |
| `full+state` at `FULL` | 0 | 748.4 | 1035.2 | 1706.0 | 8449.2 |

**Rewriting the whole 68 KB bounded-collection snapshot on every row costs 4–8 µs at p50.** The
pessimistic reading of `REQ-SESSION-072` is not expensive; the ADR's narrower "records only what
changed" is right for other reasons but not for this one. At `FULL` the shape matters even less,
because the `fsync` dominates everything.

### 5.3 What an `fsync` costs on this volume — the control

Because "`FULL` is 4× `NORMAL`" is only meaningful next to the device's own flush cost, that was
measured directly on the same directory: 2,000 iterations of a 4 KiB write, microseconds.

| Operation | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| `write(4 KiB)` + `fsync` | 442.4 | **559.3** | 748.4 | 922.3 | 5716.7 |
| `write(4 KiB)` + `fdatasync` | 429.3 | 546.3 | 745.2 | 984.7 | 2927.9 |
| `write(4 KiB)`, no sync | 6.9 | **9.9** | 79.8 | 111.4 | 1188.2 |

**An `fsync` on this NVMe SSD costs ~560 µs at p50**, and the `FULL`-minus-`NORMAL` delta of ~630 µs is
one of them plus the extra WAL work. `NORMAL` in WAL genuinely performs no sync per commit.

For completeness, the same real-row transaction in the **rollback journal** SQLite would otherwise use,
which is what WAL is being chosen over (`REQ-EVENTS-098` makes the non-blocking property a conformance
property, not a preference):

| journal | `synchronous` | p50 (µs) | p95 (µs) |
|---|---|---|---|
| WAL | NORMAL | 65.3 | 160.8 |
| WAL | FULL | 717.0 | 951.2 |
| DELETE | NORMAL | 3692.3 | 4527.5 |
| DELETE | FULL | 4345.1 | 5942.2 |

WAL at `NORMAL` is **57× cheaper at p50** than the rollback journal at the same durability setting.

### 5.4 An explicit flush

`REQ-SESSION-068` and `REQ-SESSION-072` require an explicit flush to make the newest requested state
durable and not return before it is, "usable from any caller's context, including one where no
asynchronous runtime is active". Measured as the whole raise-`FULL` / commit / lower-`NORMAL` sequence,
200 iterations at the end of every one of the 34 commit-benchmark runs:

**p50 714.8–962.5 µs · p95 1054.0–1559.3 µs · p99 1231.3–2558.5 µs · max 1557.1–44055.2 µs.**

A flush is a sub-millisecond synchronous call. `REQ-SESSION-068`'s "usable where no asynchronous
runtime is active" is satisfied by construction: `better-sqlite3`'s entire API is synchronous, which is
the property ADR-0058 selected it for, and this spike exercised it with no event loop involvement
inside the timed region.

---
