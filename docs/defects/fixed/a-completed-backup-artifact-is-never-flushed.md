## A completed backup artifact is never flushed

`takeBackup` reports a backup complete without issuing a single flush for it. The store half is written by
`VACUUM INTO`, which by SQLite's own documentation does not `fsync` its output
(<https://www.sqlite.org/lang_vacuum.html#vacuuminto>); the archive is written by an external `tar -cf` into
`<destination>.tmp-<pid>` and renamed onto the destination with no `fsync` of the archive and none of its
directory. After a power loss or an operating-system crash shortly after the success, the destination may be
absent, empty or torn, although the user was told the backup was complete. Found 2026-10-24 by reading the code
while writing [`power-loss-test-concept.md`](../../research/power-loss-test-concept.md); not reproduced, since no
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

## Repaired — 2026-10-30

`takeBackup` now flushes the archive (`<destination>.tmp-<pid>`) once `tar -cf` has written it, renames it onto the
destination, and then flushes the destination's directory, so the name and the bytes it points at are both durable
before the backup is reported complete. The flush helpers moved out of `recover.ts` into
`packages/store/src/flush.ts` (`fsyncFile`, `fsyncDirectory`); the restore journal uses the same `fsyncDirectory`
as before.

The staging directory (the `VACUUM INTO` copy, the session bodies, the manifest) is not flushed, and needs no flush:
`tar` reads it through the page cache, the archive is a fresh copy of those bytes, and the stage is removed once the
archive is in place. What survives a crash is decided by the archive's flush alone; an unflushed `VACUUM INTO` output
is not a hazard for the artifact.

Evidence:
- `packages/store/src/store.test.ts`, "a completed backup is flushed": the archive's flush, the rename and the
  directory's flush are observed in that order through `takeBackup`'s verification-only options, and an artifact taken
  with the real flushes still expands to the store and its manifest. Whether a flush reached the device remains
  unmeasured until a power-loss run exercises the backup (OQ-12).
