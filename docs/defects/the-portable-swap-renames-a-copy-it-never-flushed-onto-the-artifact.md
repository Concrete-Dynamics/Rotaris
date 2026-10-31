## The portable swap renames a copy it never flushed onto the artifact

Noticed 2026-10-31 while repairing the portable swap's empty window
([fixed note](fixed/the-portable-swap-leaves-the-artifact-path-empty-between-its-two-renames.md)); read, not run.
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
