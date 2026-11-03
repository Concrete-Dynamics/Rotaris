## A backup whose snapshot fails leaves the live store's connection open

Found on 2026-11-03 by hardening C2 (`docs/architecture/hardening.md` §3.3 row 4) while writing the unit tests beside
`packages/store/src/backup.ts`; not repaired there, since that bundle's task was the tests.

`takeBackup` opens a second connection to the live store (`openStore(storeFile(...))`), runs `VACUUM INTO` the staging
snapshot and closes it; then opens the snapshot read-only, counts, and closes that. Neither open is guarded by a
`try`/`finally`. When `VACUUM INTO` throws, the live store's connection is never closed; when a query on the snapshot
throws, the snapshot's connection is never closed. The workspace service's wrapper (`backupWorkspace`) catches the
throw, removes the two staging names and returns `backup.failed`, so the user is told the backup failed, but the
workspace service keeps an open handle on the store it backs up for as long as the garbage collector leaves the
`Database` object alone.

Reproduced on Windows 11 ARM64, Node 26.13.0: a store of 400 sessions whose `sessions` table's root page was
overwritten in the file (the `corruptStore` shape of `packages/store/src/open.test.ts`), then `takeBackup` to a
destination in a temporary directory. `VACUUM INTO` threw `SqliteError: database disk image is malformed`; afterwards
the store directory held `workspace.db-wal` and `workspace.db-shm` (a closed last connection removes both) and
`rmSync` of the store directory failed `EPERM`. On Windows a handle held on the store blocks renaming its directory,
which is what a restore's step 8 does, and on the snapshot's path it would make the wrapper's own removal of the
staging throw out of its `catch`, so `backupWorkspace` would reject instead of returning its failure.

Since hardening C1 the service refuses to open a store that fails `quick_check`, so damage found at open no longer
reaches a backup; damage that appears later, and any other failure of `VACUUM INTO` (a full disk at the destination's
volume), still does.

## Specs

REQ-SESSION-201: a backup that fails "MUST leave the store exactly as it was", and a restore of that workspace must not
be blocked by something the failed backup left. The handle is not a change to the store's contents, but it is a change
to what the store's owner can do with it until it is released. ADR-0058 (the restore's renames) assumes no connection
of the workspace service is open on the store it displaces.

## Relevant files

- `packages/store/src/backup.ts` — `takeBackup`: `live` and `s` opened without a `finally` that closes them.
- `packages/workspace/src/backup.ts` — `backupWorkspace`: the `catch` that removes the staging with `rmSync`, which
  throws on Windows while the snapshot's handle is open.
- `packages/store/src/backup.test.ts` — the staging, manifest and archive cases; a repair adds the failing-snapshot
  case (both connections closed, no `-wal` or `-shm` left beside the store).
