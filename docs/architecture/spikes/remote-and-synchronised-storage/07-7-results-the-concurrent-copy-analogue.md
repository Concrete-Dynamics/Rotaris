# Spike — the store and exclusive-create locking on remote and synchronised storage — 7. Results — the concurrent-copy analogue

Part 7 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

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
