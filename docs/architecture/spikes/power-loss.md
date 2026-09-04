# Spike — the power-loss test (OQ-12; the terminal save's durability ground)

- **Date:** 2026-09-04 (the harness half). **The fault half awaits the owner** — section 4.
- **Prices:** `implementation-conditions.md` "How the unstarted spikes bind" — *the power-loss test*, OQ-12's
  outstanding half and the **sole stated ground** for `synchronous = FULL` on a terminal save (ADR-0058 "Why the
  decision stands anyway"); ADR-0004 rule 2's *no directory `fsync`*; ADR-0009's "`NORMAL` buys no power-loss
  durability".
- **Host:** `ASUS-RTX`, Windows 11 Pro 10.0.26200, a notebook (chassis type 10) on battery power, system disk
  `CT1000P310SSD8` (NVMe SSD), second disk `WDC PC SN530` (RAID bus); Node v24.11.0; `better-sqlite3` 13.0.3
  with SQLite 3.53.4; NTFS.
- **Harness:** `packages/store/spike/power-loss-writer.cjs` (the writer) and
  `packages/store/src/power-loss.spike.test.ts` (the three phases, gated on `ROTARIS_POWER_LOSS_PHASE`).
  `packages/store/src/store.test.ts` holds the writer's settings equal to `open.ts`'s (WAL read back,
  `synchronous = NORMAL`, `busy_timeout = 5000`, the write probe rolled back) so the harness measures the
  product's settings rather than a copy that drifted.

**Verdict so far: the harness can see a loss and the process-death baseline holds; nothing here is evidence
about a power cut.** Section 3 states exactly what the dry run proves and does not. The measurement OQ-12 owes
is section 4, and it is a physical act on this machine that only the owner can perform.

---

## 1. What is under test, and what would count

The writer commits a ledger row every ~1 ms at the publish path's setting (`NORMAL`); every 50th row is
committed at `FULL`, raised and lowered around the transaction exactly as `StoreDal.durableTransaction()`
does for a terminal save and an explicit flush; every 25th row replaces two documents carrying the ordinal —
`doc-a.json` by ADR-0004's shape (stage → write → `fsync` → rename, no directory `fsync`) and `doc-b.json` by
the same shape followed by an `fsync` of the parent directory on a write-opened (`'r+'`) handle, the call
the writer-handle spike found available. After every `FULL` commit and every replace one JSON line goes to
stdout: the witness the kill variants capture. Under a real cut stdout is lost with the page cache; the
`FULL` rows are then their own witness.

| Claim | Where it is made | Passes when | Fails when |
|---|---|---|---|
| A `FULL` commit that returned survives a power cut or an OS crash | ADR-0058 "Why the decision stands anyway" | every `FULL` ordinal whose commit returned is present after the cut | any is absent — the device acknowledges a flush it did not perform, and `FULL` buys nothing here |
| A `NORMAL` commit may not survive one | ADR-0058, ADR-0009 | the survivor's last ordinal is ≥ the last `FULL` and rows after it may be missing; **how many, and how many milliseconds**, is the number OQ-12 wants | — (a survivor holding every `NORMAL` row says the setting was never needed on this device, which ADR-0058's *revisit if* names) |
| The store opens whole | `REQ-SESSION-034` | `openStore` succeeds (WAL recovery, the write probe), `integrity_check` = `ok`, the ordinals are gap-free to the last survivor | a torn frame accepted, a gap, a failed open |
| A replaced document is one whole version | ADR-0004 rule 2, `REQ-SESSION-033`, `REQ-CONFIG-027` | each document is the old or the new whole version | a document absent, empty or torn |
| What a directory `fsync` adds | OQ-12, ADR-0004 rule 2 | reported, not asserted: the lag of `doc-a` against `doc-b` behind the last surviving ordinal | — |

## 2. The process-death baseline — ten runs on this machine

`ROTARIS_POWER_LOSS_PHASE=kill`: the writer runs for 5 s under the product's settings and is killed with
`taskkill /F`; the survivor is opened through `openStore`. ADR-0058 says a `NORMAL` commit survives a process
death because the frame is in the WAL and the page cache; that is the baseline the fault variant is read
against.

| run | rows committed | last `FULL` | gaps | `FULL` rows lost | `integrity_check` |
|---|---|---|---|---|---|
| 1 | 3,789 | 3,750 | 0 | 0 | ok |
| 2 | 3,638 | 3,600 | 0 | 0 | ok |
| 3 | 3,836 | 3,800 | 0 | 0 | ok |
| 4 | 3,300 | 3,300 | 0 | 0 | ok |
| 5 | 3,800 | 3,800 | 0 | 0 | ok |
| 6 | 3,768 | 3,750 | 0 | 0 | ok |
| 7 | 3,871 | 3,850 | 0 | 0 | ok |
| 8 | 3,855 | 3,850 | 0 | 0 | ok |
| 9 | 3,834 | 3,800 | 0 | 0 | ok |
| 10 | 3,875 | 3,850 | 0 | 0 | ok |

**Ten of ten: nothing lost at `NORMAL`, no gap, every witnessed `FULL` and every witnessed replace present,
both documents whole.** About 750 commits per second with a `FULL` commit and two document replaces in the
mix; the rate is the harness's, not a product figure.

The two owner-facing phases were round-tripped once across processes the same way: `prepare` started the
writer detached (pid recorded in `state.json`), it was killed by hand after ~8 s, and `verify` in a fresh
process found 5,816 rows, the last `FULL` at 5,800 with 16 `NORMAL` rows after it, no gap, `integrity_check`
ok, both documents at 5,800, and 0 `FULL` rows lost against the witness. The crash-dump directory is not
readable without elevation; `verify` reports that rather than failing on it.

## 3. The verifier's dry run — what an OS-cache loss would look like, constructed

A power cut drops the tail of the WAL that was never flushed. The dry run constructs that tail: a second
writer runs with `wal_autocheckpoint = 0` (a checkpoint rewinds the WAL, so a recorded length stops naming a
commit — **this is the one setting that differs from the product's, and only in this half**), is killed, its
files are copied **before** any connection opens them (closing the last connection checkpoints and deletes
the WAL, which cost the first attempt), and the copy's WAL is truncated to the length the writer recorded at
its second-to-last `FULL` commit.

| run | cut at `FULL` # | WAL bytes cut | survivor ends at | rows dropped (≥) | ms of commits dropped (≥) | `integrity_check` |
|---|---|---|---|---|---|---|
| 1 | 3,700 | 255,440 | 3,700 | 50 | 71 | ok |
| 2 | 2,800 | 341,960 | 2,800 | 50 | 116 | ok |
| 3 | 3,650 | 412,000 | 3,650 | 50 | 72 | ok |
| 4 | 3,700 | 395,520 | 3,700 | 50 | 71 | ok |
| 5 | 3,750 | 341,960 | 3,750 | 50 | 71 | ok |
| 6 | 3,700 | 341,960 | 3,700 | 50 | 72 | ok |
| 7 | 3,750 | 296,640 | 3,750 | 50 | 72 | ok |
| 8 | 3,750 | 321,360 | 3,750 | 50 | 69 | ok |
| 9 | 3,750 | 280,160 | 3,750 | 50 | 69 | ok |
| 10 | 3,700 | 457,320 | 3,700 | 50 | 70 | ok |

**Ten of ten: the survivor ends exactly at the cut, every row before it present and gap-free, the store
opens and checks whole.** The "≥" is honest: the witness names the last `FULL` after the cut, not the last
`NORMAL` commit before the kill.

**What this proves.** That the verifier detects a loss of exactly the rows a truncated WAL tail removes, that
SQLite's WAL recovery accepts a truncated tail as a clean cut rather than a corruption, and that
`openStore`'s probe passes on such a survivor. **What it does not prove — and must not be cited for.** Anything
about the platform: whether the device honours a flush, whether a `FULL` commit's frames reach it before the
call returns, whether the OS writes the WAL tail back in order, or whether a directory `fsync` changes what
a rename leaves behind. A truncation is a model of the best case; a real cut may reorder, tear or lose the
middle. The number OQ-12 asks for is in section 4's table, and that table is empty.

## 4. The fault half — the owner's steps, and the table to fill

**Risk, stated plainly.** Both faults below lose everything unsaved on this machine at the moment of the
fault — the owner's own work, not only the harness's — and a forced power-off of a notebook on battery is a
hardware action Windows will report as an unexpected shutdown. Close what matters first. Suggested to be
bundled with IC-4's rename-and-reboot session, since both end in a reboot.

1. `ROTARIS_POWER_LOSS_PHASE=prepare pnpm vitest run packages/store/src/power-loss.spike.test.ts`
   starts the writer detached under `%LOCALAPPDATA%\rotaris\data\power-loss\owner-<stamp>\` and prints
   its pid. Let it run **at least 30 s** (about 20,000 commits, 400 `FULL`, 800 replaces).
2. Inject one fault:
   - **(a) POWER** — hold the power button until the machine is off (about four seconds). This is the
     measurement the record asks for.
   - **(b) CRASH** — a kernel crash keeps the disk powered and loses only the operating-system cache, which
     separates the software claim (`FULL` vs `NORMAL`) from the device's honesty about flushes. Either
     `CrashOnCtrlScroll` (a registry value under the keyboard driver's `Parameters`, then a reboot, then
     right-Ctrl + Scroll Lock twice) or Sysinternals NotMyFault; both are Microsoft's own tooling. The
     crash dump's timestamp under `C:\Windows\Minidump` is a witness of the instant, written outside the
     page cache; `verify` reads it.
3. Boot, then `ROTARIS_POWER_LOSS_PHASE=verify ROTARIS_POWER_LOSS_FAULT=power` (or `crash`)
   `pnpm vitest run packages/store/src/power-loss.spike.test.ts`. The result is written beside the store as
   `result.json` and printed; copy the figures into the table below and the verdict into the records
   section 5 names.

| fault | rows survived | last `FULL` survived | `FULL` rows lost | `NORMAL` rows survived after the last `FULL` | gaps | `integrity_check` | `doc-a` | `doc-b` | minidump |
|---|---|---|---|---|---|---|---|---|---|
| power | | | | | | | | | — |
| crash | | | | | | | | | |

**How to read it.** `FULL rows lost = 0` keeps ADR-0058's decision on the ground it now stands on. A
non-zero count reopens it for the owner: the device does not honour a flush and `FULL` is paying ~560 µs
per terminal save for nothing on this hardware. *`NORMAL` rows survived after the last `FULL`* is the number
OQ-12 wants: how far behind the record can be after a cut, in commits and (from `at_ms`) in milliseconds.
`doc-a` versus `doc-b` says whether the directory `fsync` ADR-0004 declines to perform changes anything.

## 5. Records this discharges into, when section 4 is filled

- **OQ-12** — closes or narrows on the two figures.
- **ADR-0058** "Why the decision stands anyway" — the ground gains its measurement, either way.
- **ADR-0004** rule 2 and *revisit if* — what a directory `fsync` guarantees here.
- **ADR-0009** — "`NORMAL` still buys no power-loss durability" becomes a number.
- `implementation-conditions.md` "How the unstarted spikes bind" — the power-loss bullet.

Until then each carries a note dated 2026-09-04 that the harness exists, what it showed, and that the
measurement is pending on the owner.

## 6. What the harness found on its own first execution

Two defects in the harness, in the pattern ADR-0058 consequence 17 records — neither in the product:

1. **A recorded WAL length does not name a commit once a checkpoint has happened.** The first dry run
   truncated to the recorded length and lost nothing: SQLite had checkpointed at 1,000 pages and restarted
   the WAL from its head, so the file's length no longer grew with commits. The dry run now runs its writer
   with `wal_autocheckpoint = 0` and says so.
2. **Surveying the survivor deletes the evidence.** Closing the last connection checkpoints and removes the
   WAL, so a dry run that surveyed before truncating had no WAL left to truncate. The killed state is now
   copied first — which is also exactly the set of files a power cut leaves behind.

And one fact worth keeping: a 2 ms `Atomics.wait` on this platform rounds to the ~15.6 ms timer tick, so a
harness that wants a millisecond period spins on the monotonic clock.
