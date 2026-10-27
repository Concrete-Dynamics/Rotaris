# Spike — the store and exclusive-create locking on remote and synchronised storage — 12. Files

Part 12 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

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
