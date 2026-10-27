# Spike — the whole-store backup and restore, run end to end — 12. Raw results — path length, which consequence 13 predicts and points at the wrong file

Part 12 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 12. Raw results — path length, which consequence 13 predicts and points at the wrong file

`better-sqlite3@13.0.3` on this machine, measured by opening a store at every absolute database-path length
from 240 to 262 (`D2-threshold.js`):

| absolute `workspace.db` path length | `new Database(file)` | `PRAGMA journal_mode = WAL` | a write | Node's own `fs` |
|---|---|---|---|---|
| ≤ 251 | ok | `wal` | ok | ok |
| **252 – 259** | **ok** | **throws `unable to open database file`** | throws | ok |
| ≥ 260 | **throws `unable to open database file`** | — | — | ok |

`LongPathsEnabled` is `1` on this machine and Node's `fs` created, wrote, read, listed and renamed at every
length tested, up to 328 characters. **The registry opt-in does not reach SQLite.**

The restore's own names cost:

- `<identifier>.restoring-<n>` — **+12 characters**
- `<identifier>.displaced-<UTC timestamp>` — **+35 characters**

Which produces a measured band (`D4-displaced.js`), where a live store works and its displaced copy does
not:

| live store `workspace.db` path length | live store | after step 3, displaced path length | displaced store |
|---|---|---|---|
| 200 | rows=1 | 235 | rows=1 |
| 220 | rows=1 | 255 | rows=1 |
| **230** | **rows=1** | **265** | **OPEN THROWS `unable to open database file`** |
| 240 | rows=1 | 275 | OPEN THROWS |
| 251 | rows=1 | 286 | OPEN THROWS |
| 252 | CREATE THROWS | — | — |

**A store whose database path is 230 to 251 characters works perfectly, and the store the restore keeps for
the user — retained deliberately, never deleted, the one thing that makes a wrong restore recoverable —
cannot afterwards be opened by the product at all.** The rename itself always succeeds.

**This does not bite in the shipped location.** Measured on this machine, the real default is

```
C:\Users\ganga\AppData\Local\rotaris\workspaces\v1-<32 hex>\workspace.db     96 characters
    …\v1-<32 hex>.restoring-1\workspace.db                                  108
    …\v1-<32 hex>.displaced-<UTC stamp>\workspace.db                        131
```

— all far below every threshold, because the store's own path is fixed-length by construction: a per-user
local directory, an identifier of fixed width, and a fixed filename. It bites where that prefix is long: a
long account name, a redirected profile, a junctioned `%LOCALAPPDATA%`. The harness hit it by accident, on
a scenario directory name, mid-restore.

**Consequence 13 names the right hazard and points at the wrong path.** It says the suffixes "add a suffix
to the deepest path in the record, which is where a long-path limit would bite first". The deepest path is
an artifact body under `sessions/<session-id>/artifacts/<name>`, which only Node's `fs` touches and which
worked at 328 characters here. The path with the hard limit is the **shallowest** one — `workspace.db` —
because SQLite, not the filesystem, is what refuses. And the refusal at 252–259 lands in the "opens clean
and throws on the first statement" shape that ADR-0058 rule 3 exists for, reached without a network in
sight.

---
