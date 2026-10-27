# Spike — the store and exclusive-create locking on remote and synchronised storage — 4. Results — the store on a network filesystem

Part 4 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 4. Results — the store on a network filesystem

### 4.1 Write-ahead logging **succeeds** over SMB (`a-wal.js`)

A fresh database created directly on each root, `PRAGMA journal_mode = WAL` issued, mode read back on
the same connection, written to, closed, reopened, read and written again.

| | `local` (C:) | `unc127` | `uncAdmin` (`\\localhost\C$`) |
|---|---|---|---|
| default `journal_mode` | `delete` | `delete` | `delete` |
| `PRAGMA journal_mode = WAL` returned | `wal` | **`wal`** | **`wal`** |
| read back, same connection | `wal` | **`wal`** | **`wal`** |
| `locking_mode` | `normal` | `normal` | `normal` |
| write after setting WAL | OK, 1 row | **OK, 1 row** | **OK, 1 row** |
| `-wal` / `-shm` while open | 12,392 B / 32,768 B | **12,392 B / 32,768 B** | **12,392 B / 32,768 B** |
| after close | `-wal`, `-shm` removed | removed | removed |
| mode on reopen | `wal` | `wal` | `wal` |
| rows on reopen / write on reopen | 1 / OK | 1 / OK | 1 / OK |
| `integrity_check` | `ok` | `ok` | `ok` |

The `-shm` is 32,768 B on the network path, matching SQLite's own note that the wal-index "rarely
exceeds 32 KiB in size". **The shared memory WAL needs was obtained over SMB.**

This was not a one-off. `g-run.js` ran 20 trials of each of {1 writer, 2 writers} × {default `mmap_size`,
`mmap_size = 0`} against each spelling, 200 commits per writer:

| Spelling | Cells | Trials | Open failures | Write errors | Trials losing rows | `integrity_check` bad |
|---|---|---|---|---|---|---|
| `local` | 4 | 80 | 0 | 0 | 0 | 0 |
| `unc127` | 4 | 80 | 0 | 0 | 0 | 0 |
| `uncLocalhost` | 4 | 80 | 0 | 0 | 0 | 0 |
| `mapped` | 4 | 80 | **80** | 0 | 0 | 0 |

`p-intermittent.js` pushed the same question harder — 30 opens × 200 single-row commits per spelling:

| Spelling | Opens | First statement after open failed | Commit attempts | Commit failures | Opens losing rows |
|---|---|---|---|---|---|
| `local` | 30 | 0 | 6,000 | 0 | 0 |
| `unc127` | 30 | 0 | 6,000 | 0 | 0 |
| `mapped` | 30 | **30** (`SQLITE_IOERR_IN_PAGE`) | 6,000 | **0** | **0** |

So on this configuration ADR-0058's first link — "write-ahead logging … is unsupported on network
filesystems" — is **false for a UNC path** and **true, in a specific and nastier form, for a mapped
drive letter to the same share**.

SQLite's own documentation is consistent with this rather than contradicted by it. `wal.html` §1 gives
the reason as "requires all processes to share a small amount of memory and **processes on separate host
machines** obviously cannot share memory", and §2.2 says "all readers must exist on the same machine.
This is why the write-ahead log implementation will not work on a network filesystem." The prohibition
is about **separate hosts**. One host reaching a file over its own redirector is not that case, and it
worked. Section 4.5 shows what happens as soon as there are two independent mappings.

### 4.2 The read-back ADR-0058 prescribes does not detect the failure it exists to detect (`b-fallback.js`, `h-mapped.js`)

ADR-0058 decision point 3: *"`journal_mode = WAL`, set at open and read back. … The pragma is read back,
because SQLite silently keeps the previous journal mode when WAL cannot be enabled."*

**The stated reason is real.** Case 1 below is exactly it, and it is documented (`wal.html` §3: on
failure "the journaling mode will be unchanged and the string returned from the primitive will be the
prior journaling mode"). **The check is not sufficient.** Cases 4 and H2 pass it and are broken anyway.

| # | Condition | `PRAGMA journal_mode = WAL` | read back | then what |
|---|---|---|---|---|
| 1 | in-memory database | returns `memory`, no error | `memory` | *silent no-change — the documented case; read-back catches it* |
| 2 | inside an open transaction | **throws** `SQLITE_ERROR :: cannot change into wal mode from within a transaction` | `delete` | caught |
| 3 | database opened read-only | **throws** `SQLITE_READONLY :: attempt to write a readonly database` | `delete` | caught |
| 4a | `local`, DELETE-mode db, `-shm` name occupied by a directory | **returns `wal`** | **`wal`** | next read *and* write: `SQLITE_CANTOPEN_ISDIR`. `db.readonly` = **false** |
| 4b | `unc127`, same | **returns `wal`** | **`wal`** | identical |
| 5a | `local`, db header already WAL, `-shm` blocked | — | first `PRAGMA` throws `SQLITE_CANTOPEN_ISDIR` | open **succeeded**, `db.readonly` = false, *reads fail too* |
| 5b | `unc127`, same | — | identical | identical |
| 6a | `local`, WAL header, `-shm` blocked, `locking_mode = EXCLUSIVE` set first | `locking_mode` → `exclusive` | `journal_mode` → `wal` | read 1 row **OK**, write **OK** |
| 6b | `unc127`, same | identical | identical | read **OK**, write **OK** |

Cases 4 and 5 construct "the filesystem cannot supply shared memory" mechanically, by occupying the
`-shm` name with a directory. That is the condition SQLite's documentation names as the reason WAL fails
on a network filesystem, reproduced deterministically.

The sharpest single result is `h-mapped.js` case **H2** — a database created from scratch on the mapped
network drive, nothing else involved:

```
open                       : ok
default journal_mode       : delete
CREATE TABLE               : ok
INSERT (rollback mode)     : ok
PRAGMA journal_mode = WAL  : "wal"            <-- reports success
PRAGMA journal_mode        : "wal"            <-- ADR-0058's read-back PASSES
INSERT (WAL mode)          : ERR SQLITE_IOERR_IN_PAGE :: disk I/O error
SELECT count(*)            : 1                <-- the WAL-mode insert is gone
-shm size                  : 32768            <-- the file exists
close                      : ok
```

**A store can report WAL enabled, read back as WAL, own a 32 KiB `-shm`, and be unable to write.** No
pragma read-back can catch that. The only check that catches it is a write.

Case 6 is worth carrying forward for a different reason: `locking_mode = EXCLUSIVE` makes WAL work with
no shared memory at all, on the network path, for both reads and writes. `wal.html` §8 documents this
since 3.7.4. It is not usable here — ADR-0058's process table has **two** writer processes against one
store, and §8 requires the process "be the only process accessing the database", with §9 noting other
connections then get `SQLITE_BUSY` — but it is the reason a naive "just set exclusive locking" fix must
be refused explicitly rather than left unmentioned.

### 4.3 A mapped network drive letter fails deterministically, then works (`h-mapped.js`, `p-intermittent.js`)

`R:` mapped to `\\127.0.0.1\Users` is the same share as `\\127.0.0.1\Users`, the same bytes, the same
`ino`. It behaves differently.

| Case | Result |
|---|---|
| H1 plain file I/O via `R:` — write 1 MiB, read back, open `r+`, unlink | all OK |
| H2 fresh database, set WAL there | pragma returns `wal`, read-back `wal`, **next write `SQLITE_IOERR_IN_PAGE`** |
| H3 WAL database seeded locally, opened on `R:` | open OK, **first `PRAGMA journal_mode` throws `SQLITE_IOERR_IN_PAGE`**; subsequent read and write then succeeded |
| H4 same, with `locking_mode = EXCLUSIVE` set first | `exclusive`, `journal_mode` `wal`, read OK, write OK |
| H5 DELETE-mode database on `R:`, 200 commits | all OK, count 200 |

`p-intermittent.js` quantifies H3: **30 of 30 opens** threw `SQLITE_IOERR_IN_PAGE` on the first
statement, and if the application swallowed that and carried on, **6,000 of 6,000 commits then
succeeded with zero rows lost**. That is a 100 %-reproducible loud failure sitting in front of a
working store.

This is precisely the shape the owner already flagged under "A consequence for ADR-0058 the comparison
surfaced" — `better-sqlite3` "failing silently under an Electron runtime … with the error swallowed".
Here the error is at the first statement after open. An implementation that opens the store, probes it
once, catches the throw and retries would run fine and would never report the condition.

### 4.4 ADR-0058's chain, link by link (`o-chain.js`)

A lock table shaped exactly as `REQ-SESSION-046` / `REQ-GIT-020` fix it — `pid INTEGER`, `host TEXT`,
`acquired_at TEXT`, claimed by an operation that "either succeeds or reports the existing holder".

| Case | link 0: open | link 2: `db.readonly` | link 1: journal mode read back | link 3: first claim | second claim, same session | claim on another session | reads |
|---|---|---|---|---|---|---|---|
| **A** `local` | OK | **false** | `wal` | **acquired** | refused, holder `{pid 18948, host ASUS-RTX, acquired_at …}` | acquired | OK |
| **B** `unc127` | OK | **false** | `wal` | **acquired** | refused, holder reported | acquired | OK |
| **C** `mapped` | OK | **false** | **`ERR SQLITE_IOERR_IN_PAGE`** | **acquired** | refused, holder reported | acquired | OK |
| **D** `local`, opened read-only | OK | **true** | `wal` | **failed** `SQLITE_READONLY` | failed `SQLITE_READONLY` | failed `SQLITE_READONLY` | **OK** |
| **E** `local`, `-shm` unavailable | OK | **false** | `ERR SQLITE_CANTOPEN_ISDIR` | failed `SQLITE_CANTOPEN_ISDIR` | failed | failed | **fail** |
| **F** `unc127`, `-shm` unavailable | OK | **false** | `ERR SQLITE_CANTOPEN_ISDIR` | failed `SQLITE_CANTOPEN_ISDIR` | failed | failed | **fail** |

Reading the chain off that table:

- **Link 1 — "WAL is unsupported on network filesystems."** Not reproduced on `unc127` (case B: WAL,
  read-write, lock taken, holder correctly reported). Reproduced on `mapped` (case C) in a form the ADR
  does not describe.
- **Link 2 — "so the store therefore opens read-only."** **Never observed.** `db.readonly` was `false`
  in every network case. A genuinely read-only store (case D) is a *different animal*: it opens, it
  **reads perfectly well**, and only writes fail, with `SQLITE_READONLY`. Cases E and F — the real
  "shared memory unavailable" state — open read-**write** and then fail on **everything, reads
  included**, with `SQLITE_CANTOPEN`. The ADR's middle link describes a state SQLite does not produce.
- **Link 3 — "therefore no session can start."** The **conclusion holds** wherever links 1 or 2 bite,
  and holds harder than the ADR claims. Under `REQ-SESSION-089` and `REQ-EVENTS-084` a store that
  cannot be opened refuses the run and reports the store's own reason; cases E and F would do exactly
  that. But the conclusion is reached by a different route, and the route matters:
  - In case D (a truly read-only store) the product could still **list** sessions and show history, and
    only the lock write would fail. That is the degraded mode the superseded ADR described.
  - In cases E and F nothing works at all — closer to "no store".
  - In case C the store *works* after one thrown statement, so whether a session starts depends entirely
    on whether the implementation treats that throw as fatal. `REQ-EVENTS-084` governs "opening the
    store only"; a first-statement failure after a successful open sits on the boundary between it and
    `REQ-EVENTS-088` ("a write that fails *during* a run"). **That boundary is not currently drawn by
    anything in the record**, and case C lands on it.

### 4.5 Two openers, one file, two spellings: silent, undetected loss (`s-mixed.js`, `c-run.js`, `e-run.js`)

The strongest result in this spike. Two writer processes, one database file, WAL, 300 single-row commits
each, differing only in the path spelling each process used to reach it. 20 trials per pairing.

| Pairing | Trials | Both writers reported 300/300 with zero errors | Of those, trials that **silently lost rows** | Rows lost in those trials | `integrity_check` | Trials where a writer failed loudly at open |
|---|---|---|---|---|---|---|
| `local` + `local` | 20 | 20 | **0** | — | `ok` ×20 | 0 |
| `unc127` + `unc127` | 20 | 20 | **0** | — | `ok` ×20 | 0 |
| `unc127` + `local` | 20 | 11 | **11 of 11** | `294, 300, 300, 293, 300, 513, 568, 374, 300, 300, 299` | **`ok` ×20** | **9** (`SQLITE_IOERR_IN_PAGE`) |

Final row counts per trial in the mixed pairing, against an expected 600:

```
300, 306, 300, 300, 300, 300, 300, 307, 300, 300, 300, 300, 87, 32, 226, 300, 300, 300, 300, 301
```

and the per-writer breakdown of the survivors:

```
B=300 | A=123,B=183 | B=300 | B=300 | B=300 | A=73,B=227 | A=162,B=138 | A=214,B=93 | B=300 | B=300
B=300 | A=300      | A=27,B=60 | A=23,B=9 | A=168,B=58 | A=300 | B=300 | B=300 | B=300 | A=300,B=1
```

**Not one of the twenty trials was correct.** Eleven lost data silently; nine failed loudly. Every
survivor passed `integrity_check`, and every surviving row's payload checksum verified — the database is
not *corrupt*, it is *short*. Nothing anywhere reported an error.

`c-run.js` adds the reader's view. A third process polled the same file continuously while the two
writers ran:

| Scenario | Reader spelling | Polls | Max rows the reader ever saw | Bad checksums | Count went backwards | Max poll | Final rows (expected 800) |
|---|---|---|---|---|---|---|---|
| both writers `local` | `local` | 9,330 | 800 | 0 | 0 | 6.26 ms | **800** |
| both writers `unc127` | `unc127` | 8,631 | 800 | 0 | 0 | 96.18 ms | **800** |
| writer1 `unc127`, writer2 `local` | `local` | 18,776 | **400** | 0 | 0 | 1.91 ms | **55** |

In the mixed run the local reader **never once observed a single row committed by the UNC writer**, over
18,776 polls, and the file finished with 55 of 800 rows. Writer timings for the same runs: `local`/`local`
400 commits in 38.6 ms and 55.0 ms; `unc127`/`unc127` 400 in 306.3 ms and 99.4 ms; mixed 400 in 91.2 ms
and 98.0 ms.

**Is this WAL-specific?** `e-run.js` and `d-run.js` ran the same matrix across journal modes. It is:

| Journal mode | `local`+`local` | `unc`+`unc` | `unc`+`local` | `mapped`+`mapped` | `mapped`+`unc` | `mapped`+`local` |
|---|---|---|---|---|---|---|
| **WAL** | clean | clean | **loses** | fails / loses | fails / loses | **loses** |
| **DELETE** | clean | clean | **clean** | clean | clean | clean |
| **TRUNCATE** | clean | clean | **clean** | clean | clean | clean |

5 trials per cell in `d-run.js`, 5 more per cell in `e-run.js`, 20 in `s-mixed.js` for the three main
pairings. **Rollback-journal mode was correct in every mixed pairing.** The divergence is the WAL index,
exactly as SQLite's documentation says it would be: two openers that do not share one wal-index each
believe they own the log, and the loser's frames are discarded on reset.

**What this does and does not prove about two machines.** It does not prove the two-machine case; there
is one machine here. What it does establish is that the *mechanism* SQLite names — separate shared-memory
areas over one database file — produces exactly this outcome on this build, and that the outcome is
silent. Two machines reaching one share is two mappings by construction. It also establishes a hazard
that needs no second machine at all: **two processes on one machine that spell the same workspace
differently** (one resolves the UNC path, one a mapped drive letter, one a substituted or symlinked
path) will corrupt each other's session history without either noticing. ADR-0058 gives the store two
writer processes. Under ESC-15 the store is machine-local and this cannot arise; it is recorded because
it is the measured reason ESC-15 is right, and because the machine-local path must resolve to one
canonical spelling.

---
