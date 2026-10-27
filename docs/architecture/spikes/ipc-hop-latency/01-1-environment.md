# Spike — the run-host → main → renderer double hop — 1. Environment

Part 1 of 9 of [the spike report](../ipc-hop-latency.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU arch | x64 |
| Node (host) | v24.11.0 · npm 11.12.1 |
| Electron | 44.1.0 — reused from `spike-base`, not reinstalled |
| Chromium / Node / V8 inside Electron | `152.0.7977.65` / `24.19.0` / `15.2.124.18-electron.0` (read from `process.versions` at run time) |
| `process.platform` / `arch` at run time | `win32` / `x64` |
| Free space on `D:` | 660 GB |
| Harness location | session scratchpad on `C:` |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine, same OS build and same Node build as ADR-0004's DATA spike and as `spike-base`, so these
figures are comparable with that record.

Nothing here was packaged. Every measurement is from `electron.exe <dir>` in development mode.

---
