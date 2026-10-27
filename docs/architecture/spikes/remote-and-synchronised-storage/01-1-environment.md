# Spike — the store and exclusive-create locking on remote and synchronised storage — 1. Environment

Part 1 of 12 of [the spike report](../remote-and-synchronised-storage.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host name | `ASUS-RTX` |
| Node | v24.11.0 |
| npm | 11.12.1 |
| SQLite binding | `better-sqlite3@13.0.3` (npm prebuild; no local compile) |
| SQLite | **3.53.4**, `COMPILER=msvc-1944`, `ATOMIC_INTRINSICS=0` (from `PRAGMA compile_options`) |
| `PRAGMA mmap_size` default under this binding | **0** (measured, not assumed) |
| Volumes | `C:` NTFS 1,022,726,901,760 B total / 57,245,540,352 B free · `D:` NTFS 1,000,202,039,296 B / 708,656,205,824 B free |
| Harness location | the session scratchpad on `C:`, `…\scratchpad\spike-remote-storage` |
| Anti-malware | not disabled, not enumerated, not measured |
| Registered cloud sync providers on this machine | `SynologyDrive` (4 sync roots) and `CrossDevice` (1), both via the Windows Cloud Filter API |

Same machine and OS build as the four existing spikes, so figures are comparable with them. The
Electron toolchain at `…\scratchpad\spike-base` was **not** used — see section 11.

---
