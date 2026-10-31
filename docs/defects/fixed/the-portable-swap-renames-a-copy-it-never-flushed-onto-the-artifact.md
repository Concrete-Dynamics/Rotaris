## The portable swap renames a copy it never flushed onto the artifact

Noticed 2026-10-31 while repairing the portable swap's empty window
([fixed note](the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md)); read, not run.
`applyPortable` copies the verified download to `<name>.update` (`StrategyFiles.copyFile`, `fsp.copyFile`) and renames it
onto the target. Nothing flushes `<name>.update`'s data to the medium before that rename. The `<name>.old` copy is not
flushed either. A file system that journals the rename but not the file's data (NTFS and ext4's default mode both
allow it) can come back from a power loss with the target naming a file whose bytes never reached the disk. That leaves a
truncated or zero-filled executable at the artifact's path. The process being killed is not affected, since the operating
system still holds the written data; only the machine losing power is. Never executed on a Windows host.

## Specs

- REQ-STARTUP-176: at every instant, "the machine's loss of power included", the artifact's path names a complete
  executable. A rename of unflushed data meets that for a killed process and not for a power loss.
- REQ-STARTUP-126: what is installed stays byte-for-byte what it was should any stage fail.

## Relevant files

- `apps/desktop/src/main/updater/electron.ts` — the `copyFile` and `copyAside` ports (`fsp.copyFile`, no flush).
- `apps/desktop/src/main/updater/strategies.ts` — `applyPortable`, which renames `<name>.update` onto the target.

## Repaired — 2026-10-31

*Falsified by the repair: `applyPortable` no longer renames a copy it has not flushed. The description above is what it
did until this date.*

`StrategyFiles` gains `flushFile` and `flushDirectory`, and `applyPortable` uses them in this order: copy to
`<name>.update` and flush it; remove the previous `<name>.old`; copy the target aside to `<name>.old`, flush it and flush
the directory; rename `<name>.update` onto the target in one step; flush the directory again before reporting `replaced`.
The single rename and the target that is never moved aside (the fixed note above) are unchanged. A flush that fails
before the rename fails the step with the target untouched and this attempt's `<name>.old` and `<name>.update` removed.
A directory flush that fails after the rename puts the previous bytes back by the same order (copy `<name>.old` to
`<name>.update`, flush, one rename), so the target ends byte-for-byte as it was (REQ-STARTUP-126); should that fail
too, the sentence says the new version is at the path and the previous one is kept as `<name>.old`. The foreign file the
exclusive copy aside refuses is still left alone.

The real ports sit in `apps/desktop/src/main/updater/flush.ts`, which `electron.ts` wires in: the file is opened
read-write and synced (fsync(2) on POSIX, `FlushFileBuffers` on Windows, which needs write access), and the directory is
opened and synced on POSIX and not flushed at all on Windows, where Node opens no directory handle. **Measured on the
Linux agent host** (ext4, Node 26.12.1, 2026-10-31, `strace -e trace=openat,fsync`): one `fsync` on the file opened
`O_RDWR` and one on the directory. That shows the calls reach the kernel; it does not show a power loss survived. **Not
measured on a Windows host:** that `FileHandle.sync` reaches `FlushFileBuffers` there is libuv's documented behaviour,
and what NTFS keeps of a rename that was never flushed is NTFS's. A rename lost there leaves the previous executable
at the path, because the swap never moved or modified it.

Pinned in `strategies.test.ts` over a fake volume that models a power loss on a file system that may keep a rename and
drop unflushed data. It checks that the target names flushed bytes, the previous or the new ones, after every operation;
that the backup is on the medium when the rename replaces the target; that the outcome is on the medium before the step
reports it; and the exact order. Each of the four flushes on the ordinary path (the incoming file, the backup, the
directory before the rename, the directory after it) is load-bearing: deleting any one reddens the order test *and* the
power-loss test, and the power-loss assertion reddens on its own when the order assertion is neutralised with it. The
fifth site, the flush inside `putPreviousBack`, reddens the restore-order test alone — it is that branch's own, and it is
not one of the four. `flush.test.ts` runs both flushes against the host's real file system.

Only a Windows host classifies as portable, and the directory flush does nothing there, so in production today neither
directory flush does anything and the put-back is not reached: the repair that takes effect is the two file flushes.
The directory flushes and the put-back are pinned against the port's contract, on a POSIX target.
