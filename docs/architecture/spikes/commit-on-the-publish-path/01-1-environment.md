# Spike — the transaction commit on the publish path — 1. Environment

Part 1 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU arch | x64 |
| Node (host) | v24.11.0 (`NODE_MODULE_VERSION` 137) · npm 11.12.1 |
| Electron | 44.1.0 — reused from `spike-base`, not reinstalled |
| Electron internals | Chromium `152.0.7977.65` · Node `24.19.0` · V8 `15.2.124.18-electron.0` · `NODE_MODULE_VERSION` **149** · N-API 10 |
| Store volume | `C:` — **NTFS**, disk 0, `CT1000P310SSD8`, **NVMe SSD**, 54.9 GB free |
| Other volume | `D:` — NTFS, disk 1, `WDC PC SN530`, NVMe SSD, 708.7 GB free |
| Toolchain for the native build | Visual Studio Community 2022 `17.14.37531.7`, MSVC toolset `14.44.35207`, Python 3.12.7, node-gyp 12.4.0, `@electron/rebuild` 4.2.0 |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine, same OS build and same Electron build as the `ipc-hop-latency`, `packaged-first-paint`
and `windows-writer-handle-compaction` spikes, so these figures are comparable with that record.

**Where the store was put.** ADR-0058 puts the store in the per-user *local* data directory
(`REQ-STARTUP-145`), which on Windows is under `%LOCALAPPDATA%` on `C:`. Every database in this spike
was created on `C:`, the same NTFS volume on the same NVMe device, so the `fsync` costs below are the
ones the product would pay. Nothing was measured on `D:` and nothing was measured on a network share.

Nothing here was packaged. Sections 5, 6, 8 and 9 run the store under `ELECTRON_RUN_AS_NODE=1
electron.exe`, which is Electron's own Node; section 7 runs it inside a real Electron `utilityProcess`,
which is where ADR-0002 puts the run host.

---
