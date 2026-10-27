# Spike — the whole-store backup and restore, run end to end — 1. Environment

Part 1 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host name | `ASUS-RTX` |
| Node (host) | v24.11.0, `NODE_MODULE_VERSION` 137, N-API 10 |
| npm | 11.12.1 |
| Electron | 44.1.0 — Node 24.19.0, `NODE_MODULE_VERSION` 149, N-API 10, Chromium 152.0.7977.65 |
| SQLite binding | `better-sqlite3@13.0.3` (both the shipped npm prebuild and a from-source Electron build) |
| SQLite | **3.53.4**, `COMPILER=msvc-1944`, `DEFAULT_WAL_SYNCHRONOUS=1`, `DEFAULT_WAL_AUTOCHECKPOINT=1000`, `THREADSAFE=2` |
| Toolchain | Visual Studio 2022 Community 17.14.37531.7, MSBuild 17.14.51, node-gyp 12.4.0, Python 3.14.4, `@electron/rebuild` 4.2.x |
| Archive container | `C:\Windows\System32\tar.exe` (bsdtar), used for the artifact |
| Volumes | `C:` NTFS 1,022,726,901,760 B total / 59,793,588,224 B free · `D:` NTFS 1,000,202,039,296 B / 708,652,838,912 B free |
| `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` | **1** (measured, not assumed) |
| Harness location | `…\scratchpad\spike-22` (on `C:`, under `%TEMP%` — see 11.2) |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine and OS build as `spike-base`, `remote-and-synchronised-storage` and
`commit-on-the-publish-path`, so figures are comparable with them.

---
