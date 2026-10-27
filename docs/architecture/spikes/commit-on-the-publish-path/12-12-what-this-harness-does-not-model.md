# Spike — the transaction commit on the publish path — 12. What this harness does **not** model

Part 12 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 12. What this harness does **not** model

- **The model and tool work that produce a row.** `REQ-MONITOR-222` starts at "run activity"; everything
  upstream of `t_commit0` — the provider stream, the transcript projection in the run host, the 50 ms
  coalescing tick of `REQ-MONITOR-219` — is outside the measured interval. The figures here are a lower
  bound on the requirement's own interval, a tighter one than the IPC spike's but still a lower bound.
- **A real schema.** Three tables, no indexes beyond two primary keys and one listing index, no
  migrations, no checkpoint index (ADR-0039), no delivery store (ADR-0041), no improvement library, no
  traceability tables. ADR-0058 consequence 9 says "indexes and query planning are ours to own" and
  names `REQ-SESSION-042`'s listing and `REQ-TRACE-239`'s 100 ms board budget as needing measurement
  against real indexes. **Neither was measured here.** Every additional index on `transcript_row` adds
  WAL frames per insert and therefore both commit cost and checkpoint frequency.
- **One session, one workspace, one store.** `REQ-TOOLS-089` and `REQ-SANDBOX-038` allow concurrent
  runs, which under ADR-0058 share one store and one write lock. Two run hosts contending was **not**
  measured; only run-host-versus-workspace-service was.
- **A store of realistic size.** The largest database built here is 91.1 MB (22,500 rows); the 10,000-row
  conditions ran against a 54.6 MB store. `PRAGMA quick_check` at open,
  `integrity_check`, the pre-migration copy, and everything in ADR-0058's recovery ladder were not
  exercised at any size.
- **Anything but the happy path.** No torn write, no corruption, no disk-full, no `SQLITE_FULL`, no
  read-only volume, no antivirus quarantine of the `-wal` file. The only failure injected was lock
  contention.
- **The `-shm` file across processes on a real user's machine.** Both processes here were started by the
  same user in the same session on local NTFS. `REQ-SESSION-198` puts the store on machine-local storage
  precisely so a synchronising client never sees it, and that is not tested here.
- **Packaging.** Development mode only. The native module's asar-unpacking obligation — ADR-0058
  consequence 1, ADR-0054, ADR-0056 — was **not** exercised. `better-sqlite3` was loaded from a plain
  `node_modules` tree. A packaged build must place `better_sqlite3.node` outside the asar and this spike
  says nothing about whether that works.
- **Any machine but this one.** One NVMe SSD, one NTFS volume, one Windows build, one afternoon. The
  `fsync` figure in section 5.3 is a property of this device: on a spinning disk `FULL` would be
  10–100× worse and the `FULL` verdicts in section 10 would need re-taking. `NORMAL` performs no sync
  and should be far less device-sensitive, but that was not tested on other storage.
- **macOS and Linux.** Neither was touched. `fsync` semantics on macOS in particular differ (`F_FULLFSYNC`
  versus `fsync`), and SQLite's behaviour there is not the same as here.
- **Replicate depth in three places.** The `direct` topology, the `node:sqlite` cross-check, and the
  long-write contention rows are single launches. The long-write maxima (205.4 ms, 61.8 ms) rest on 1
  and 3 reader passes respectively; they are the right order of magnitude and should not be quoted to
  three figures.
- **Anti-malware was active and unmeasured**, as was whatever else the machine was doing. The p99.9
  figures in section 5 (4–12 ms) and the isolated 37–67 ms commit maxima are consistent with external
  interference and were not attributed.
