# Spike — the transaction commit on the publish path — 9. Cross-check against ADR-0058's named fallback binding

Part 9 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 9. Cross-check against ADR-0058's named fallback binding

Same schema, same generated rows, same machine, `node:sqlite` (`DatabaseSync`) in Electron 44.1.0,
SQLite 3.53.3, 3,000 commits, microseconds. Single launch per condition, so these have no replicate
spread and the `better-sqlite3` column is pooled over three launches.

| Condition | `node:sqlite` p50 | p95 | p99 | max | `better-sqlite3` p50 | p95 |
|---|---|---|---|---|---|---|
| `NORMAL`, 0 rows | 159.9 | 274.7 | 833.3 | 9745.6 | 185.4 | 362.8 |
| `NORMAL`, 10,000 rows | 157.5 | 267.0 | 990.4 | 11078.8 | 182.2 | 329.0 |
| `FULL`, 0 rows | 666.7 | 903.2 | 1773.5 | 11176.5 | 812.1 | 1434.4 |

The fallback binding is not slower — on these samples it is slightly faster, and it needs no ABI
rebuild, no asar unpacking and did not exhibit defect 2.3. It also carries the opposite inherited WAL
durability default (section 2.5). Nothing here reopens ADR-0058's choice, which rests on
`node:sqlite`'s Stability 1.2 status and on Electron's non-contractual shipping of the module, not on
speed — but the record should not carry an unstated assumption that the fallback is a performance
sacrifice.

---
