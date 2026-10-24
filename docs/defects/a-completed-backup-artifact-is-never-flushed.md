## A completed backup artifact is never flushed

`takeBackup` reports a backup complete without issuing a single flush for it. The store half is written by
`VACUUM INTO`, which by SQLite's own documentation does not `fsync` its output
(<https://www.sqlite.org/lang_vacuum.html#vacuuminto>); the archive is written by an external `tar -cf` into
`<destination>.tmp-<pid>` and renamed onto the destination with no `fsync` of the archive and none of its
directory. After a power loss or an operating-system crash shortly after the success, the destination may be
absent, empty or torn, although the user was told the backup was complete. Found 2026-10-24 by reading the code
while writing [`power-loss-test-concept.md`](../research/power-loss-test-concept.md); not reproduced, since no
power-loss run exists (OQ-12).

## Specs

`REQ-SESSION-034` level 2: "a backup artifact reported complete (REQ-SESSION-201) MUST survive loss of the
operating system or of power, subject to the storage device honouring the flushes the product issues". The
product issues none here, so the condition cannot be met on any device. The restore path, by contrast, flushes
its journal and its directory (`packages/store/src/recover.ts`).

## Relevant files

- `packages/store/src/backup.ts` — `takeBackup`: `VACUUM INTO`, `tar -cf` to a temporary name, `renameSync`, no flush.
- `packages/store/src/recover.ts` — `writeRestoreJournal` / `fsyncDirectory`, the flush shape the restore uses.
- `docs/architecture/adr/0058-the-workspace-database.md` — the backup mechanism (alternative U, `VACUUM INTO`).
- `docs/architecture/spikes/power-loss.md` — the harness, which does not exercise the backup.
