# Spike — the store and exclusive-create locking on remote and synchronised storage — 8. Results — the other `.rotaris/` residents on shared storage (`j2-atomic.js`)

Part 8 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

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
