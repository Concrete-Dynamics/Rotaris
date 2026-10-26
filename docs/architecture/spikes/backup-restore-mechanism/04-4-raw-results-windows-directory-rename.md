# Spike — the whole-store backup and restore, run end to end — 4. Raw results — Windows directory-rename semantics (`A-rename.js`, 30 trials each)

Part 4 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 4. Raw results — Windows directory-rename semantics (`A-rename.js`, 30 trials each)

ADR-0058 steps 3 and 4 are two directory renames. Everything the mechanism can do rests on what this
platform allows.

| Trial | Succeeded | Failure |
|---|---|---|
| A1 — rename a directory onto a **name that does not exist** | **30 / 30** | — |
| A2 — rename a directory onto an existing **empty** directory | **0 / 30** | `EPERM` |
| A3 — rename a directory onto an existing **non-empty** directory | **0 / 30** | `EPERM` |
| A4 — rename a directory onto an existing **file** | **30 / 30** | — (the file is destroyed; verified: the destination is afterwards a directory holding the source's contents) |
| A5 — rename a directory holding an open plain file descriptor | **0 / 30** | `EPERM` |
| A6 — rename a directory holding an **open `better-sqlite3` connection** | **0 / 30** | `EPERM` |
| A6b — the same, connection **closed first** | **30 / 30** | — |
| A7 — rename a directory whose store **another process** has open | **0 / 30** | `EPERM` |
| A8 — rename onto an existing `…displaced-<stamp>` at **second** granularity | **0 / 30** | `EPERM` |
| A9 — rename a directory that is another process's current directory | **0 / 30** | `EBUSY` |

Three consequences, all of them load-bearing below.

**4.1 The cache spike's finding is confirmed and is stricter than reported.** Renaming onto an existing
directory fails **even when that directory is empty**. There is no "replace if empty" on this platform.
Step 4 therefore depends absolutely on step 3 having vacated the name.

**4.2 Renaming a directory onto an existing *file* succeeds and destroys the file.** A stray
`<base>/<identifier>` that happens to be a file is silently replaced by step 4. Not a likely state; recorded
because it is the one asymmetry in the table and because nothing in the record anticipates it.

**4.3 A single held handle anywhere inside the directory is fatal, from any process.** A plain descriptor,
a SQLite connection in this process, a SQLite connection in another process, and a process's current
directory all block the rename. This is the same shape the Windows writer-handle spike found for files
(`renameSync` over a held file, 0 of 115), one level up.

**4.4 `store.db` is one file only when it is closed.** Measured: while open, the store directory holds
`workspace.db` (4,096 B), `workspace.db-shm` (32,768 B) and `workspace.db-wal` (65,952 B); after a clean
close it holds `workspace.db` alone. Closing both connections is not hygiene before the swap — it is what
makes the directory renameable at all.

---
