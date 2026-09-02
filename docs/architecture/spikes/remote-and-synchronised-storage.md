# Spike — the store and exclusive-create locking on remote and synchronised storage

- **Date:** 2026-09-02
- **Assigned as:** spike 19. ESC-15 retained it with a changed question ("whether anything *else* the
  product writes into `.rotaris/` misbehaves on synchronised storage"); ESC-21 assigned it the strength
  of the integration-lock ruling ("Spike 19 decides whether refusal is the right strength or whether a
  warning suffices; it does not reopen the direction").
- **Question, as given:** what actually happens to the store, and to exclusive-create locking, on remote
  and synchronised storage. This decides the severity of ESC-15 and ESC-21.
- **Scope:** measurement only. No product code was written and none is authorised. Nothing was written
  into the repository except this file.

**Headline.** ESC-15's ruling survives and is strengthened. Its stated *mechanism* does not.
Write-ahead logging did **not** fail on a UNC path over SMB — it succeeded, in 320 process-trials, with
zero errors. The store did **not** open read-only in any measured configuration. What was measured
instead is worse than the ADR predicts: on a mapped network drive letter the store opens read-write,
`PRAGMA journal_mode=WAL` returns `wal`, the read-back that ADR-0058 prescribes returns `wal`, the
32 KiB `-shm` file is created — and the next write throws a disk I/O error. And where one database file
is reached through two path spellings, two writer processes each reported committing 300 rows with zero
errors while up to 568 of those 600 rows silently vanished, with `integrity_check` returning `ok`.

Exclusive create, by contrast, was a flawless mutual-exclusion primitive over SMB: 2,500 races, exactly
one winner in every one. ESC-21's first premise is confirmed by measurement. Its second — that a
file-synchronisation client breaks it — is **not testable on this machine** and was not faked; what
*is* measured is that the tie it creates cannot be broken by anything `REQ-GIT-128` puts in the lock
file, and that the detection ESC-21's ruling depends on works, cheaply, against a real registered
provider.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host name | `ASUS-RTX` |
| Node | v24.11.0 |
| npm | 11.12.1 |
| SQLite binding | `better-sqlite3@13.0.3` (npm prebuild; no local compile) |
| SQLite | **3.53.4**, `COMPILER=msvc-1944`, `ATOMIC_INTRINSICS=0` (from `PRAGMA compile_options`) |
| `PRAGMA mmap_size` default under this binding | **0** (measured, not assumed) |
| Volumes | `C:` NTFS 1,022,726,901,760 B total / 57,245,540,352 B free · `D:` NTFS 1,000,202,039,296 B / 708,656,205,824 B free |
| Harness location | the session scratchpad on `C:`, `…\scratchpad\spike-remote-storage` |
| Anti-malware | not disabled, not enumerated, not measured |
| Registered cloud sync providers on this machine | `SynologyDrive` (4 sync roots) and `CrossDevice` (1), both via the Windows Cloud Filter API |

Same machine and OS build as the four existing spikes, so figures are comparable with them. The
Electron toolchain at `…\scratchpad\spike-base` was **not** used — see section 11.

---

## 2. "Remote" here is a real SMB round trip, not a simulation

Everything called remote below went through the Windows SMB client redirector and the SMB server on the
loopback interface. Four independent confirmations:

**2.1 The shares exist.** `net share` lists `C$`, `D$`, `ADMIN$`, `IPC$`, a games share, and a
non-administrative `Users` share mapped to `C:\Users`. The measurements below use the
**non-administrative** `Users` share wherever a single spelling is needed, because it does not depend on
the caller holding administrative rights and is therefore the closer analogue of a corporate file
server. `\\localhost\C$` was also exercised and behaved identically in section 4.1.

**2.2 Windows classifies it as remote.**

| Root | `GetDriveTypeW` | `GetVolumeInformationW` fs | fs flags |
|---|---|---|---|
| `C:\` | 3 `DRIVE_FIXED` | NTFS | `0x03E72EFF` |
| `D:\` | 3 `DRIVE_FIXED` | NTFS | `0x03E72EFF` |
| `\\localhost\Users\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |
| `\\127.0.0.1\Users\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |
| `\\localhost\C$\` | **4 `DRIVE_REMOTE`** | NTFS | `0x00C700FE` |

The filesystem-flag word differs between the local and the remote view of the *same volume*, which is
the redirector reporting a reduced capability set rather than NTFS reporting itself.

**2.3 There is TCP traffic on port 445.** With a Node file handle held open on
`\\127.0.0.1\Users\…`, `netstat -ano` reported:

```
TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4
TCP    127.0.0.1:445          127.0.0.1:62945        ESTABLISHED     4
TCP    127.0.0.1:62945        127.0.0.1:445          ESTABLISHED     4
TCP    [::]:445               [::]:0                 LISTENING       4
TCP    [::1]:445              [::1]:62944            ESTABLISHED     4
TCP    [::1]:62944            [::1]:445              ESTABLISHED     4
```

`Get-SmbConnection` and `Get-SmbSession` were **denied** (`Windows System Error 5`) — this session is
not elevated, so the dialect in use could not be read. That is a gap, recorded rather than guessed.

**2.4 Every spelling names one file.** A byte written through any one of the four spellings was read
back correctly through all four; `fs.statSync` reported the same `ino` (`5629499535802038`) and the same
`dev` (`941525292`) through all four. A fifth spelling, the mapped drive letter `R:` created with
`net use R: \\127.0.0.1\Users /persistent:no`, was confirmed by `Get-SmbMapping` (`R: → \\127.0.0.1\Users`,
Status `OK`) and by `WNetGetUniversalNameW`, which resolved `R:\…` back to `\\127.0.0.1\Users\…`.
**The mapping was removed at the end of the run** (`net use R: /delete /y`, "R: was deleted successfully").

The five spellings used throughout are therefore:

| Name | Spelling | Stack |
|---|---|---|
| `local` | `C:\Users\ganga\…` | NTFS directly |
| `unc127` | `\\127.0.0.1\Users\ganga\…` | SMB redirector |
| `uncLocalhost` | `\\localhost\Users\ganga\…` | SMB redirector |
| `uncAdmin` | `\\localhost\C$\Users\ganga\…` | SMB redirector, administrative share |
| `mapped` | `R:\ganga\…` | SMB redirector behind a drive letter |

---

## 3. Method

Fourteen throwaway harnesses, all under the scratchpad, all named in section 12. Common shape: a runner
that seeds a database through the `local` spelling (so every arm starts byte-identical), spawns one or
more separate Node processes that reach the file through a chosen spelling, waits for them to exit, then
verifies through a read-**write** open (which forces WAL recovery, so a verifier cannot mistake
"invisible to me" for "lost").

Every writer row carries a payload and a checksum computed over it, so torn content is distinguishable
from missing content. Every verification runs `PRAGMA integrity_check` as well as a row count, because a
count alone cannot tell corruption from loss.

**One methodological correction is recorded because it changes what the numbers mean.** The first pass
verified with `new Database(path, { readonly: true })`. A read-only connection to a WAL database cannot
create the `-shm` it needs, so it can report zero rows for a database whose WAL is full of them. Every
figure below comes from the corrected read-write verifier. The superseded run is kept at
`d-results.json` and must not be quoted.

---

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

## 5. Results — exclusive create over SMB (`i-run.js`)

Four racer processes, released together by a barrier file, each attempting `fs.openSync(path, 'wx')`
(`O_CREAT|O_EXCL`) on the same target name, 500 independent races per pairing. Ground truth taken from
the files actually on disk afterwards and from their contents.

| Pairing | Races | Exactly one winner | More than one winner | No winner | Loser error codes | Files on disk | Unreadable contents |
|---|---|---|---|---|---|---|---|
| `local` + `local` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `unc127` × 4 | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `local` + `unc127` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `local` + `mapped` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| `unc127` + `mapped` | 500 | **500** | **0** | 0 | 1,500 × `EEXIST` | 500 | 0 |
| **Total** | **2,500** | **2,500** | **0** | **0** | **7,500 × `EEXIST`** | 2,500 | 0 |

Exclusive create is a **perfect** mutual-exclusion primitive here, including across the two I/O stacks
that destroyed the WAL store in section 4.5. Where WAL needs coherent shared memory, `FILE_CREATE`
needs only a single arbiter, and the SMB server is one.

**One fairness observation, not a correctness problem.** Winner distributions:

| Pairing | Winners by racer |
|---|---|
| `local` ×4 | 105 / 157 / 127 / 111 |
| `unc127` ×4 | 122 / 132 / 121 / 125 |
| `local` + `unc127` | local 249, local 251, **unc 0, unc 0** |
| `local` + `mapped` | local 240, local 260, **mapped 0, mapped 0** |
| `unc127` + `mapped` | unc 135, mapped 133, unc 111, mapped 121 |

A racer with local access won **500 of 500** races against a racer coming over SMB. Peers on equal
footing shared roughly evenly. For `REQ-GIT-128` this is harmless — exactly one wins, which is all the
requirement asks — but a machine that holds the workspace locally will in practice always beat a machine
reaching it over the network, so "who got the lock" is decided by topology and not by who asked first.

---

## 6. Results — the synchronisation-client case (ESC-21)

### 6.1 What a sync client breaks, stated precisely

`REQ-GIT-128` places the integration lock at `<workspace>/.rotaris/integration.lock`, "created with
exclusive-create semantics", and gives the reason in terms: "what it protects is the base repository,
which is the user's own material and travels with the workspace, so a second machine reaching the same
checkout must meet the same lock."

Exclusive create is a *filesystem* primitive. Its guarantee is that of all openers presenting
`CREATE_NEW` for one name **in one directory served by one arbiter**, exactly one is told yes. Section 5
measures that this holds over SMB, because the arbiter is the server.

A file-synchronisation client removes the arbiter. Each machine has its **own local directory**; the
client makes them look alike **afterwards**, by replication. So:

1. Machine A creates `.rotaris/integration.lock` in *its* copy. Exclusive create succeeds — correctly,
   because in A's directory the name was free.
2. Machine B creates `.rotaris/integration.lock` in *its* copy. Exclusive create succeeds — correctly,
   because in B's directory the name was free too.
3. Both machines begin integrating into the same base branch.
4. The client notices the collision later and resolves it by whatever policy it has — last writer wins,
   a "conflicted copy", a rename. **Neither machine is told anything by the primitive it used**, because
   both calls already returned success.

The promise `REQ-GIT-128` makes — "a second machine reaching the same checkout must meet the same lock"
— is not weakened there. It is **false**, because there is no same lock to meet at the moment either
machine asks. That is exactly ESC-21's reading, and nothing measured here disturbs it.

### 6.2 What is testable on one machine, and what it showed (`q-esc21.js`)

**(a) That the tie is created at all.** Two directories standing in for two machines' replicas, one lock
name: both exclusive creates returned `WON`. Trivial, and recorded only because it is the whole of the
argument.

**(b) That nothing in the lock's own contents can break the tie afterwards.** This *is* worth measuring,
because `REQ-GIT-128` fixes the lock's payload as `{"session_id", "pid", "host", "started_at"}`, and a
reconciler — human or automatic — would reach for `started_at` first.

| Measurement | Result |
|---|---|
| `Date#toISOString` resolution | milliseconds; 404 distinct values across 500 consecutive creates |
| NTFS `mtimeMs` distinct values across 500 consecutive creates | 384 |
| **Minimum non-zero `mtimeMs` step** | **0.5051 ms** |
| Median non-zero `mtimeMs` step | 1.0015 ms |
| `mtimeMs` delta between the two replicas' locks in the Q1 race | 1.009 ms |
| `birthtimeMs` delta | 2.5166 ms |
| **This machine's clock source** | `Local CMOS Clock`; **`Last Successful Sync Time: unspecified`** |
| Clock precision reported by `w32tm` | `-23` (119.209 ns per tick) |
| **Measured offset vs `time.windows.com`, 3 samples** | **+0.8556113 s, +0.8564687 s, +0.8507046 s** |

The orderable step available in a timestamp is about **1 millisecond**. The offset this machine actually
carries against a public time source is about **855 milliseconds** — roughly **850 times larger** — on a
machine whose time service has never successfully synchronised. `started_at` therefore cannot order two
machines' claims, and neither can the file timestamps the client replicates. `host` distinguishes the
two claims but does not rank them; `pid` is meaningless across machines, which `REQ-SESSION-054` already
says. **There is nothing in the lock to arbitrate with.**

**(c) That the condition is detectable at all** — section 6.4, and it is.

### 6.3 What is **not** testable here

The following were **not** measured and are **not** estimated:

- Whether a real client (OneDrive, Dropbox, Google Drive, Synology Drive) actually permits two machines
  to each create the same lock name. It follows from how these clients work, but it was not observed.
- What such a client does on collision — last-writer-wins, a "conflicted copy" rename, a merge — and
  whether either machine is informed.
- The replication latency, which sets how long both machines run unaware.
- Whether the client's local filesystem hooks change exclusive-create semantics inside a placeholder or
  dehydrated file. **This one is genuinely uncertain**: a Cloud-Filter placeholder is a reparse point,
  and `CREATE_NEW` against a dehydrated name is a code path I did not exercise.

**Why not.** A second machine is required, and an account with a sync provider is required. This machine
has four live Synology Drive sync roots holding the user's own material; writing test locks into them
would push files to the user's NAS and was refused. Nothing was written to any synchronised path in this
spike; those paths were read for metadata only.

**What would close it.** A build host or a second machine, both signed into one sync account, both
mounting one synced folder, running the `i-excl-worker.js` race in section 5 against
`<synced>/.rotaris/integration.lock` with the barrier replaced by a wall-clock start time. The single
number that matters is *"races in which both machines' exclusive create returned success"*. That is the
whole of ESC-21's second premise and it is one afternoon's work on two machines.

### 6.4 The detection ESC-21's ruling depends on **works**, and is cheap (`k-detect.ps1`, `k2-child.ps1`, `t-detect-cost.ps1`)

ESC-21 rules that "the integration operation must **detect** the condition and refuse rather than proceed
under a lock that does not lock", and notes this "composes with SR-5, which already requires synchronised
storage to be detected directly". `REQ-STARTUP-166` requires the determination be made "from the storage
the workspace directory sits on" and "SHALL NOT be inferred from a failure". `REQ-SESSION-198` separately
calls such detection "unreliable" — as grounds for never making the *store location* conditional on it.
Those two are consistent, and the measurement supports both: the determination is real and precise for
providers that register with Windows, and blind to those that do not.

This machine has genuine third-party sync roots. `CfGetSyncRootInfoByPath(…, CF_SYNC_ROOT_INFO_PROVIDER)`
was called against each, read-only:

| Path | File attributes | `GetDriveTypeW` | `CfGetSyncRootInfoByPath` |
|---|---|---|---|
| ordinary local directory on `C:` | `0x00000010` `DIRECTORY` | 3 `FIXED` | `hr=0x80070186` — not a sync root |
| ordinary local directory on `D:` (this repository) | `0x00000010` `DIRECTORY` | 3 `FIXED` | `hr=0x80070001` — not a sync root |
| a registered sync root | `0x00000431` `DIRECTORY,REPARSE_POINT` | 3 `FIXED` | **`provider='SynologyDrive'`, status 1** |
| a **child** directory of it | `0x00080410` `DIRECTORY,REPARSE_POINT,PINNED` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| a **grandchild** directory | `0x00080410` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| a **file** inside it | `0x00080420` `REPARSE_POINT,PINNED` | 3 `FIXED` | **`provider='SynologyDrive'`** |
| the sync root's **parent** | `0x00000011` | 3 `FIXED` | `hr=0x80070186` — **correct negative** |
| a second provider's root | `0x00000430` | 3 `FIXED` | **`provider='CrossDevice'`, version `071.84.0`** |
| `\\127.0.0.1\Users\…` | `0x00000010` | **4 `REMOTE`** | `hr=0x80070032` (`ERROR_NOT_SUPPORTED`) |
| `R:\…` | `0x00000010` | **4 `REMOTE`** | `hr=0x80070032` |

Two published Win32 calls cover both halves of `REQ-STARTUP-166`:

- **shared with another machine** → `GetDriveTypeW` returns `DRIVE_REMOTE`. A mapped drive letter is
  unmasked by `WNetGetUniversalNameW`, which resolved `R:\…` to `\\127.0.0.1\Users\…`.
- **synchronised to another machine** → `CfGetSyncRootInfoByPath` returns the **provider's name**, from
  any depth inside the tree, with a correct negative one level above it.

Cost, 200 iterations each, measured through a PowerShell script block (so these are **upper bounds**;
the interop overhead is included):

| Call | p50 | p95 | max |
|---|---|---|---|
| `GetDriveTypeW` on `C:\` | 0.0995 ms | 0.2247 ms | 1.8052 ms |
| `GetDriveTypeW` on `\\127.0.0.1\Users\` | 1.8345 ms | 2.8678 ms | 4.0834 ms |
| `CfGetSyncRootInfoByPath`, ordinary local dir on `C:` | 0.6592 ms | 1.1210 ms | 17.0060 ms |
| `CfGetSyncRootInfoByPath`, ordinary local dir on `D:` | 0.2149 ms | 0.3839 ms | 0.5301 ms |
| `CfGetSyncRootInfoByPath`, a real sync root | 0.2253 ms | 0.3933 ms | 2.3319 ms |
| `CfGetSyncRootInfoByPath`, UNC path | 1.1082 ms | 1.8991 ms | 2.4305 ms |
| `WNetGetUniversalNameW`, ordinary local dir | 0.2483 ms | 0.3917 ms | 0.5066 ms |

Single-digit milliseconds. `REQ-STARTUP-043` puts this determination in post-show background activation
so it "never delays first paint"; on these figures it would not delay anything even if it ran inline.
That is a comfortable margin, not a licence to move it.

**The limitation, stated plainly.** `CfGetSyncRootInfoByPath` sees only clients that register a sync
root with the Windows Cloud Filter API. OneDrive, Dropbox and Google Drive do; Synology Drive does, as
measured. A folder replicated by a client that does not — or by a scheduled `robocopy`, an `rsync` job,
or a network drive the user syncs by hand — is **invisible to this call and indistinguishable from an
ordinary directory**. No such client was available here to test against, so I cannot say how large that
blind spot is in practice. The classification is therefore sound but not exhaustive, which is precisely
why `REQ-SESSION-198` forbids making the store's *location* depend on it, and why `REQ-GIT-150` and
`REQ-STARTUP-150` are right to make an unclassifiable workspace pass in silence rather than be refused.

---

## 7. Results — the concurrent-copy analogue

**Labelled as an analogue.** There is no synchronisation client here. What is modelled is the file-by-file
copy such a client performs — `db`, then `-wal`, then `-shm`, in the order a directory walk hands them
over — against a database being written at the same moment, on one machine, on local NTFS.

### 7.1 A gentle first pass with no statistical power (`l-run.js`) — recorded so it is not re-run

At `REQ-MONITOR-219`'s coalescing cadence (20 commits/s, 128 commits over 8 s) against a small store,
**40 naive copies produced 0 unopenable copies, 0 integrity failures and 0 checksum failures** in each of
WAL-live, DELETE-live and `VACUUM INTO`-live. Copy row counts rose monotonically.

**This result means nothing.** The store was a few hundred kilobytes, each copy completed in a few
milliseconds, and at 20 commits/s the window in which a copy could straddle a write is tiny. It is
reported because a reader who runs the obvious experiment will get this answer and may believe it.

### 7.2 The same experiment with enough power to decide it (`m-run.js`)

Store pre-seeded to **41,062,400 bytes** (20,000 rows × ~2,000-byte payloads). Writer committing one row
per transaction as fast as it could for 20 s. Copier looping continuously.

| Arm | Writer commits (errors) | Copies taken | Copy time min / median / max | **Copies unopenable** | Integrity bad | Bad checksums | Source afterwards |
|---|---|---|---|---|---|---|---|
| **WAL, naive file copy** | 103,475 (0) | 152 | 29 / 99 / 235 ms | **150 of 152** | 0 | 0 | 123,475 rows, `integrity_check` **ok** |
| **DELETE, naive file copy** | 4,662 (0) | 475 | 26 / 36 / 77 ms | **475 of 475** | 0 | 0 | 24,662 rows, **ok** |
| **WAL, `VACUUM INTO`** | 108,525 (0) | 8 | 403 / 1,077 / 2,107 ms | **0 of 8** | **0** | **0** | 128,525 rows, **ok** |

Failure modes on the naive copies were `SQLITE_CORRUPT :: database disk image is malformed` and
`SQLITE_NOTADB :: file is not a database`.

Three things follow.

- **A naive copy of a live store is garbage: 625 of 627 across both journal modes.** This is the
  measured form of ADR-0058 alternative **J**'s stated consequence, and of `howtocorrupt.html` §1.2,
  which says a backup taken mid-transaction holds "some old and some new content, and thus be corrupt".
- **Rollback-journal mode is *worse*, not better, for this.** 475 of 475, because the main database file
  is written on every commit rather than only at checkpoint. Anyone reaching for `journal_mode=DELETE`
  as the network-storage fallback should know it trades one hazard for another.
- **The live store was never damaged.** Every arm ended with `integrity_check` = `ok`. The hazard from a
  client *reading* a live store is that the replica is worthless — which is what the other machine
  receives, and what a restore would restore.

`VACUUM INTO` is the supported alternative (`howtocorrupt.html` §1.2 names `sqlite3_rsync`, `VACUUM INTO`
and the backup API). It produced **8 valid, self-consistent snapshots out of 8** while 108,525 commits
were landing, with row counts rising monotonically from 22,070 to 118,878, at a median of **1,077 ms per
41 MB snapshot** on local NTFS. That is a direct, positive result for `REQ-SESSION-201`'s hardest
clause — a backup that "MUST NOT be refused because a session is live" and must be "a state of the store
that a reader could have observed at one moment".

### 7.3 The other direction: when the replica is pushed back (`n-writeback.js`)

**Analogue, and a lower bound.** A synchronisation client that decides the remote version wins overwrites
the local file. This models the overwrite only — one machine, and the replica is an earlier state of this
same store rather than a different machine's. A real client's replica would be less compatible, not more.

A store was seeded with 3,000 rows and a **clean, quiescent, valid** snapshot taken (verified: 3,000
rows). A live writer was then started, and 2.5 s in the snapshot was copied back over the live files.

| Files overwritten | Writer commits during the run | Writer errors | Store afterwards |
|---|---|---|---|
| `db` only | 44,301 | **0** | **`SQLITE_CORRUPT :: database disk image is malformed`** — unopenable |
| `db` + `-wal` | 45,748 | **0** | **`SQLITE_CORRUPT`** — unopenable |
| `db` + `-wal` + `-shm` | 43,120 | **0** | **`SQLITE_CORRUPT`** — unopenable |
| `-wal` only | 58,273 | **0** | **`SQLITE_CORRUPT`** — unopenable |

Every variant destroyed the store. Every variant did so while the writing process reported **zero
errors** across tens of thousands of commits. Overwriting with a *valid* snapshot is enough; overwriting
only the `-wal` is enough. Under ADR-0058 the loss is one workspace's entire session history, and under
SR-9(b) there is no copy of it in the user's own backup.

---

## 8. Results — the other `.rotaris/` residents on shared storage (`j2-atomic.js`)

ESC-15's reassigned question. After ESC-15 the residents of `<workspace>/.rotaris/` are file-shaped and
written atomically: the workspace identifier (`REQ-SESSION-197`, minted by exclusive create), the
integration lock (`REQ-GIT-128`, exclusive create), and the configuration documents. Sections 5 and 6
cover the exclusive creates. This section covers ADR-0004's write-temp-`fsync`-rename primitive.

300 documents per cell.

| | `local` | `unc127` | `mapped` |
|---|---|---|---|
| **A** rename over existing, **no other opener at all** — first-attempt successes | **300 / 300** | **283 / 300** (17 × `EPERM`) | **280 / 300** (20 × `EPERM`) |
| A, p50 / p95 / max | 2.071 / 2.530 / 9.074 ms | **12.061 / 26.503 / 48.016 ms** | 11.353 / 24.830 / 41.359 ms |
| **B** same, with a reader opening and closing through the other spelling between writes — first try | 300 / 300 | 283 / 300 | 287 / 300 |
| B — needed a retry / gave up | 0 / 0 | **17 / 0** (all on attempt 2) | **13 / 0** (12 × 1 retry, 1 × 2 retries) |
| **C** read-after-write through the other spelling — mismatches | **0 / 300** | **0 / 300** (19 `EPERM` absorbed by the ladder) | **0 / 300** (24 absorbed) |
| **D** `fsync` of the containing directory | **`EPERM`** | `EPERM` | `EPERM` |
| **E** `unlink` while the other spelling holds a read handle | succeeded | succeeded | succeeded |

**Findings.**

1. **Rename-over-existing fails spuriously on SMB with nothing else touching the file** — 37 of 600
   first attempts (6.2 %) across the two remote spellings, in case **A**, which has no concurrent reader
   at all. On `local` it was 0 of 300. The cause is consistent with SMB deferred-close / handle-lease
   behaviour keeping the destination open briefly after the client closed it, but I did not establish
   that.
2. **The bounded retry ladder is load-bearing on shared storage.** Every one of the 30 retried renames
   in case **B** succeeded, 29 on the second attempt and one on the third; **0 of 600 gave up**. The
   existing spike `windows-writer-handle-compaction.md` derived a 5-attempt ladder for local NTFS. On
   SMB it is not a defence against a rare contention case, it is the normal path for about one document
   write in sixteen.
3. **Atomic writes cost about 6× more on SMB** — p50 12.061 ms against 2.071 ms local, p95 26.503 ms
   against 2.530 ms.
4. **Read-after-write is coherent across spellings.** 0 mismatches in 900 documents. Whatever the WAL
   index does, ordinary file content is coherent through the redirector. This matters: it means the
   *identifier file* of `REQ-SESSION-197` and the *lock file* of `REQ-GIT-128` are safe on a share in a
   way the store is not, which is exactly the split ESC-15 drew.
5. **`fsync` of a directory returns `EPERM` on Windows**, on local NTFS as much as on SMB. Not a
   shared-storage finding — a platform one — but it bears on ADR-0004's durability step, which cannot
   assume the containing directory is flushed.

**So: nothing else in `.rotaris/` misbehaves on shared storage in a way the retry ladder does not
already cover, and the two exclusive-create residents are correct there.** The failure is confined to
the store, and the store is no longer there.

---

## 9. Verdicts

| Claim / requirement | Its own threshold or assertion | Verdict |
|---|---|---|
| **ADR-0058 link 1** — "Write-ahead logging requires shared memory and is unsupported on network filesystems" | uniform | **FAIL as stated.** WAL enabled and worked over SMB: 320 process-trials on `unc127`/`uncLocalhost`, 0 open failures, 0 write errors, 0 rows lost, `integrity_check` ok throughout; `-shm` created at 32,768 B. **TRUE for a mapped drive letter** to the same share: 30/30 first-statement `SQLITE_IOERR_IN_PAGE`. The behaviour depends on the path spelling, which the ADR does not consider. |
| **ADR-0058 link 2** — "so the store there opens read-only" | — | **FAIL.** `db.readonly` was `false` in every network configuration measured (`o-chain` B, C, E, F). SQLite produced no read-only store on any network path. The real "no shared memory" states open read-**write** and then fail on **reads as well as writes** (`SQLITE_CANTOPEN`), which is a different and larger failure than read-only. |
| **ADR-0058 link 3** — "therefore no session in that workspace can start at all" | — | **PASS on the mapped-drive and shm-unavailable paths, by a different mechanism than the ADR gives; INCONCLUSIVE on a UNC path**, where nothing failed and a session would start and run. The conclusion ESC-15 acted on is sound; the reasoning printed under it is not. |
| **ADR-0058 decision 3** — "`journal_mode = WAL`, set at open and **read back**, because SQLite silently keeps the previous journal mode when WAL cannot be enabled" | read-back detects failure | **Reason CONFIRMED, guard INSUFFICIENT — FAIL as a sufficient check.** The documented silent no-change is real (in-memory case). But measured counter-examples exist where the pragma **returns `wal`**, the read-back **returns `wal`**, `-shm` exists at 32,768 B, and the next statement throws `SQLITE_CANTOPEN_ISDIR` (cases 4a/4b) or `SQLITE_IOERR_IN_PAGE` (H2). Only a **write** detects those. |
| **`REQ-EVENTS-098`** — "A reader MUST NOT be able to delay or block the writer, and the writer MUST NOT be able to make a reader fail; a store in which one blocks the other does not satisfy this requirement" | conformance property of the store | **PASS on local NTFS and on same-spelling SMB** — 9,330 and 8,631 reader polls, 0 reader errors, 0 writer errors, reader max poll 6.26 ms local / 96.18 ms SMB. **FAIL where one file is reached through two spellings**: 18,776 polls in which the reader never observed the other writer's commits at all, and 55 of 800 rows survived. |
| **`REQ-EVENTS-084` / `REQ-SESSION-089`** — a store that cannot be opened refuses the run and carries "the store's own reported reason unaltered" | the store must *fail to open* | **INCONCLUSIVE, and a gap is exposed.** In every failing configuration measured the store **opened successfully** and threw later. `REQ-EVENTS-084` governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a run. A first-statement failure after a clean open belongs to neither as written. |
| **`REQ-GIT-128`** — the integration lock is a file "created with exclusive-create semantics"; "At most one integration runs per base workspace at a time" | exactly one winner | **PASS over SMB.** 2,500 races across five pairings including two that mix I/O stacks: exactly one winner in 2,500, more than one in 0, none in 0, 7,500 losers all `EEXIST`, 2,500 lock files on disk all readable. |
| **`REQ-GIT-128`** — "a second machine reaching the same checkout must meet the same lock" | two machines | **INCONCLUSIVE.** One SMB client only. The arbiter in the tested configuration is the SMB server, which is also the arbiter for two remote clients, so the result is suggestive; it is not a measurement of two machines. |
| **ESC-21 premise 1** — "Exclusive create is a genuine primitive on a network filesystem" | — | **PASS.** Measured, 2,500 / 2,500. |
| **ESC-21 premise 2** — "and is **not** one inside a file-synchronisation client's tree, because such clients replicate after the fact and both machines can succeed" | — | **NOT TESTABLE ON THIS MACHINE — no result, and none invented.** Requires a second machine and a sync account; the four live sync roots here hold the user's own material and were not written to. What *is* measured and does bear on it: the primitive itself is not what breaks (premise 1), and **nothing in the lock can break the resulting tie** — the orderable timestamp step is ~1 ms while this machine's own clock offset is ~855 ms against a public source, with `Last Successful Sync Time: unspecified`. |
| **`REQ-STARTUP-166`** — determine "directly and without waiting for anything to go wrong" whether a workspace "sits on storage that is shared with or synchronised to another machine", "from the storage the workspace directory sits on", never "inferred from a failure" | must be a direct determination | **PASS as implementable, with a stated blind spot.** `GetDriveTypeW` (+ `WNetGetUniversalNameW` to unmask a mapped letter) gives *shared*; `CfGetSyncRootInfoByPath` gives *synchronised* **and names the provider**, correct at every depth inside a real registered sync root and correctly negative one level above it. Cost p50 0.10–1.83 ms, p95 ≤ 2.87 ms, worst single observation 17.0 ms — comfortably inside `REQ-STARTUP-043`. **Blind to any client that does not register a Cloud Filter sync root**, and no such client was available to measure. |
| **`REQ-SESSION-201`** — the backup "MUST NOT be refused because a session is live" and must be "a state of the store that a reader could have observed at one moment: never a mixture of parts taken before and after a write" | valid while runs are live | **FAIL for a naive file copy** — 625 of 627 copies of a live store were unopenable (`SQLITE_CORRUPT` / `SQLITE_NOTADB`). **PASS for `VACUUM INTO`** — 8 of 8 valid, integrity ok, checksums ok, monotonic, at a median 1,077 ms per 41 MB on local NTFS. |
| **ADR-0004's atomic document primitive on shared storage** | write temp, `fsync`, rename over existing | **PASS only with the bounded retry ladder.** 37 of 600 first attempts failed `EPERM` on SMB **with no other opener present**; all 30 retried renames succeeded within 2 extra attempts; 0 of 600 gave up. p50 cost 12.06 ms on SMB against 2.07 ms local. Directory `fsync` returns `EPERM` on every spelling including local. |
| **ADR-0058 alternative J** — "a store a synchronisation client writes to while the application has it open … is a documented corruption vector" | — | **CONFIRMED in both directions.** Reading a live store yields an unusable replica (625/627). Writing a replica back over a live store destroys it (4 of 4 variants, `SQLITE_CORRUPT`, unopenable), while the writing process reports zero errors across 43,120–58,273 commits. |
| **ESC-15's ruling** — the store is machine-local and always | — | **SUPPORTED, on stronger evidence than the reasoning it was issued on.** The specific failure ESC-15 named was not reproduced on a UNC path; three worse ones were found — silent partial loss with a clean `integrity_check`, a WAL that reports success and then throws, and total destruction from a replica writeback with no error reported. |

---

## 10. What this harness does not model

- **No second machine. This is the single largest gap and it is the one ESC-21 turns on.** Every
  "remote" figure is one SMB client talking to one SMB server that happen to be the same computer. Two
  clients against one server, two machines against one synced folder, and any WAN latency are all
  untested.
- **No synchronisation client was exercised.** Sections 6 and 7 are reasoning plus a labelled
  single-machine analogue. No OneDrive, Dropbox, Google Drive or Synology Drive path was written to, and
  the reconciliation behaviour of all four is unmeasured. In particular, exclusive create against a
  **dehydrated Cloud-Filter placeholder** is a code path I did not exercise and cannot speak to.
- **No Electron.** All measurements are host Node v24.11.0 with an npm prebuild of `better-sqlite3`.
  ADR-0058 requires the module be rebuilt against the Electron ABI (ADR-0056), and the owner has already
  recorded `better-sqlite3` "failing silently under an Electron runtime" through an ABI mismatch. That
  failure mode is orthogonal to everything here and is **not** covered. The Electron toolchain at
  `…\scratchpad\spike-base` was deliberately not used, because the questions are SQLite-and-OS
  questions; a rebuilt-for-Electron confirmation run is still owed.
- **One SQLite version, one binding.** SQLite 3.53.4 via `better-sqlite3@13.0.3`, MSVC-1944 build. The
  named fallback `node:sqlite` was not tested and may differ.
- **The SMB dialect is unknown.** `Get-SmbConnection` and `Get-SmbSession` require elevation and were
  denied. Loopback SMB may also differ from wire SMB in oplock, lease and caching behaviour in ways
  that bear directly on section 4.5. I could not rule that out.
- **Loopback is not a network.** No latency, no packet loss, no reconnection, no server-side contention,
  no signing or encryption cost. The 12 ms p50 rename in section 8 is a floor.
- **`\\localhost\C$` succeeded, which is unusual for a non-elevated caller** and I did not establish why.
  Every headline figure therefore uses the non-administrative `Users` share instead.
- **No power-loss or crash testing.** Nothing here says whether a committed WAL frame survives a power
  cut. `synchronous` was `NORMAL` throughout except where stated.
- **Anti-malware was not controlled or enumerated.** The 17.0 ms outlier in the detection timings and
  the 48.0 ms rename outlier are consistent with scanner activity; I did not establish that.
- **Synthetic writers.** Rows are a tag, a sequence number, a filler payload and a checksum, committed
  one per transaction. They are not wire events, not transcript rows, and carry none of ADR-0008's
  ordering machinery or `REQ-MONITOR-219`'s coalescing. Section 7.2 deliberately runs a writer far
  faster than the product ever would, to give the experiment power; section 7.1 shows what the realistic
  cadence produces, which is nothing.
- **The "mixed spelling" pairing is a mechanism model, not the two-machine case.** It creates two
  independent mappings of one file, which is the condition SQLite's documentation blames. It does not
  prove two machines behave the same way.
- **Detection was measured against two providers on one machine.** `SynologyDrive` and `CrossDevice`.
  OneDrive is present as an environment variable (`ONEDRIVE=C:\Users\ganga\OneDrive`) but registered
  **no** sync root under `SyncRootManager` on this machine, so OneDrive's own detection path is
  **untested here**.
- **The detection timings include PowerShell interop overhead** and are upper bounds, not the cost of
  the raw Win32 call.
- **No repetition of the section 7.3 writeback beyond one trial per variant.** Four variants, one trial
  each. All four failed identically, but four is not a distribution.

---

## 11. Impact on the record

Reported here rather than edited in, per the brief. A second workflow holds
`docs/architecture/adr/`, `README.md`, `constraints.md` and `open-questions.md`; none were touched.

### ADR-0058 — the workspace store

1. **The Context paragraph and alternative J's rebuttal both state a mechanism that measurement
   contradicts.** "Write-ahead logging requires shared memory and is unsupported on network filesystems,
   so the store there opens read-only" is wrong in its second clause and configuration-dependent in its
   first. The **decision does not change** — ESC-15 is supported, and more strongly — but the record
   should say what actually happens: the store opens read-write, may report WAL enabled, and then either
   works, or throws at an arbitrary later statement, or loses committed rows silently. Recommended
   replacement claim, all of it measured: *on a UNC path WAL succeeded here; on a mapped network drive
   letter it reported success and then threw a disk I/O error on every open; and where one database file
   is reached through two path spellings, two writers each reported full success while up to 95 % of
   their committed rows vanished with a clean `integrity_check`.* That is a stronger case for
   machine-local than the one currently written down, and it does not rest on a claim a reader can
   falsify in ten minutes with a UNC path.
2. **Decision point 3's read-back is necessary but not sufficient, and the record currently implies it
   is sufficient.** Add the measured counter-example. The reliable probe is a **write** — a trivial one,
   inside a transaction that rolls back, immediately after the pragma — not a pragma read. This matters
   even under machine-local storage, because decision point 3 says a WAL failure "is therefore treated as
   a fault — the store is reported unopenable with the engine's own reason", and the engine will not give
   its reason until something touches a page.
3. **`SQLITE_IOERR_IN_PAGE` on the first statement after a successful open needs an owner.** It is not
   `REQ-EVENTS-084` (the store opened) and not obviously `REQ-EVENTS-088` (no run has started). ADR-0058
   should say which, and should say that the first-statement probe result is what `REQ-SESSION-089`
   reports. Left undrawn, the natural implementation swallows it and retries — which works, and which is
   exactly the silent-degradation `REQ-EVENTS-084` exists to forbid.
4. **The store's path must resolve to one canonical spelling, and the ADR should say so.** Section 4.5
   is a same-machine hazard: the run host and the workspace service reaching one store by two different
   spellings would silently destroy each other's writes. ADR-0058 already makes the workspace service
   "the only process that resolves an identifier" and hand the **resolved store path** to the run host,
   which prevents this — but it prevents it by accident, not by stated intent. One sentence naming the
   reason turns a happy consequence into a guarantee.
5. **`locking_mode = EXCLUSIVE` must be refused explicitly.** It is the obvious fix for a network path,
   it is documented, and it worked here on both local and UNC paths with no shared memory at all. It is
   incompatible with ADR-0058's two-writer process table, and `wal.html` §9 says other connections then
   get `SQLITE_BUSY`. Recording the refusal is cheaper than re-deriving it later.
6. **The recovery section gains a measured fact.** A naive copy of a live store is unopenable 625 times
   in 627, and `VACUUM INTO` produced 8 valid snapshots in 8 at a median 1,077 ms per 41 MB while
   108,525 commits landed. That is the mechanism `REQ-SESSION-201`'s "valid while runs are live" needs,
   and it now has a number.

### ADR-0004 — the atomic document primitive

7. **The retry ladder is a normal-path requirement on shared storage, not a rare-contention defence.**
   6.2 % of rename-over-existing calls failed `EPERM` on SMB **with no other opener present at all**.
   The existing ladder absorbed every one of them, 29 of 30 on the second attempt. ADR-0004 and the
   `windows-writer-handle-compaction` record both derive the ladder from a local-NTFS reader-contention
   argument; the SMB failure has a different cause and a much higher rate, and an implementer who reads
   the ladder as belt-and-braces may drop it.
8. **Atomic writes cost about 6× more on a share** (p50 12.06 ms vs 2.07 ms; p95 26.50 ms vs 2.53 ms).
   The user's own material stays on the share under `REQ-SESSION-198`, so this is the cost of every
   configuration document write for such a user, and it is not currently anywhere in the record.
9. **Directory `fsync` returns `EPERM` on Windows on every spelling, local included.** If ADR-0004's
   durability step assumes it, that assumption is unavailable on the primary platform.

### ADR-0005 — the session lock / ESC-21

10. **ESC-21's ruling stands, and its first premise is now measured**: exclusive create is a genuine
    primitive over SMB, 2,500 / 2,500. Its second premise remains unmeasured and I did not fake it.
11. **On strength — refusal versus warning, which is what ESC-21 asked this spike to decide: this spike
    cannot decide it, and says so.** The deciding measurement is two machines on one synced folder. What
    the spike *can* contribute is that the failure, if it occurs, is **undetectable after the fact by the
    lock itself**: `started_at` cannot order two machines when the orderable step is ~1 ms and a real
    machine's clock offset is ~855 ms, `pid` is meaningless across machines, and `host` distinguishes
    without ranking. So a warning-only design would leave the user with two integrations into one base
    branch and no artefact that says which came first. That is an argument for refusal, and it is
    reasoning from a measurement rather than a measurement.
12. **The detection ESC-21's ruling composes with is real, precise and cheap**, verified against a live
    third-party provider at every depth with a correct negative above the root, at p50 0.10–1.83 ms. Its
    blind spot — clients that register no Cloud Filter sync root — should be stated wherever the
    refusal is specified, because a refusal that silently does not fire is worse than none.

### `REQ-GIT-124` ordering — confirmed by measurement

13. `REQ-GIT-124` already evaluates the replicated-storage condition **ahead of** the lock check,
    "because that is exactly the condition under which the lock the next check reads does not mean what
    it says". Sections 5 and 6 confirm both halves independently: the lock means exactly what it says
    over SMB, and there is no information in it that could rescue the synchronised case. The ordering is
    correct and the stated reason is the right one.

### Open question this spike opens

14. **Where does a first-statement store failure after a successful open belong?** Between
    `REQ-EVENTS-084` (opening) and `REQ-EVENTS-088` (a write failing during a run) there is a gap, and
    the mapped-drive result lands in it 30 times out of 30. Worth an entry in `open-questions.md`; I did
    not add one, per the brief.

---

## 12. Files

All throwaway, all under
`C:\Users\ganga\AppData\Local\Temp\claude\D--Development-Apps-Rotaris-crw\8ddb8c86-64f1-495f-8cc7-35576c51f79c\scratchpad\spike-remote-storage`.

| File | What it does |
|---|---|
| `lib.js` | the five path spellings |
| `probe-unc.js` | whether each UNC spelling is readable and writable |
| `drivetype.ps1` | `GetDriveTypeW` / `GetVolumeInformationW` per root |
| `a-wal.js` | §4.1 — `journal_mode = WAL` per root, set, read back, write, reopen |
| `b-fallback.js` | §4.2 — the six silent-fallback conditions |
| `h-mapped.js` | §4.3 — where exactly the mapped drive fails (H1–H5) |
| `p-intermittent.js` | §4.3 — 30 opens × 200 commits per spelling |
| `o-chain.js` | §4.4 — ADR-0058's chain against a `REQ-SESSION-046`-shaped lock table |
| `c-worker.js`, `c-run.js` | §4.5 — writer/reader concurrency, three pairings |
| `d-run.js`, `e-run.js` | §4.5 — journal-mode × pairing matrix (`d` uses the **superseded** read-only verifier) |
| `g-worker.js`, `g-run.js` | §4.1 — 1-writer / 2-writer × mmap × spelling, 20 trials each |
| `s-mixed.js` | §4.5 — the headline 20-trial mixed-spelling run, every outcome distinguished |
| `f-identity.js` | §2.4 — path identity and `-shm` observation |
| `i-excl-worker.js`, `i-run.js` | §5 — the exclusive-create races |
| `j-atomic.js` (superseded), `j2-atomic.js` | §8 — atomic-document behaviour per spelling |
| `k-detect.ps1`, `k2-child.ps1` | §6.4 — storage classification, read-only |
| `t-detect-cost.ps1` | §6.4 — what the classification costs |
| `q-esc21.js` | §6.2 — the ESC-21 shape and the tiebreak resolution |
| `l-writer.js`, `l-run.js` | §7.1 — the low-power copy pass |
| `m-writer.js`, `m-run.js` | §7.2 — the copy analogue with power |
| `n-writeback.js` | §7.3 — the replica-writeback analogue |
| `map.bat`, `unmap.bat` | create and remove the `R:` mapping |
| `d-results.json`, `e-results.json`, `g-results.json`, `s-results.json`, `l-out.txt`, `m-out.txt`, `n-out.txt` | raw results |

**Cleanup.** The `R:` mapping was removed (`net use R: /delete /y` → "R: was deleted successfully"; the
only remaining entry in `net use` is a pre-existing WebDAV connection that this spike did not create and
did not touch). All databases, copies, lock-race directories and temporary reports were deleted; the
harness sources and the raw result files remain in the scratchpad. **No file was written to any
synchronised path, to any share the user depends on, or anywhere in the repository except this
document.**

**Public documentation consulted** (approved input, quoted rather than recalled):
`sqlite.org/wal.html` §§1, 2.2, 3, 7, 8, 9 and `sqlite.org/howtocorrupt.html` §§1.2, 1.3, 1.4, 2.1, 2.4.
