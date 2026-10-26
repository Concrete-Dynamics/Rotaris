# Spike — the wedged presenter, and the single-instance claim on Windows — 1. Environment

Part 1 of 9 of [the spike report](../presenter-liveness-and-instance-claim.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host Node / npm | v24.11.0 / 11.12.1 |
| Electron | **44.1.0**, reused from `spike-base` per its `README-FOR-SPIKES.md`; not reinstalled |
| Electron internals at run time | Chromium `152.0.7977.65`, Node `24.19.0`, V8 `15.2.124.18-electron.0` |
| Platform / arch | `win32` / `x64` |
| Bundle mode | **unpackaged** — `electron.exe <appdir>`; no `electron-builder` artifact was produced |
| Shell | Git Bash (POSIX `sh`) for orchestration; PowerShell 5.1 for the Win32 probes |
| Display | one interactive desktop session; native dialogs were shown on the real desktop |

**Uncontrolled background load, disclosed.** During the SPIKE-16 runs an unrelated Electron process tree
with a window titled `ipc-hop-spike` was observed on this host (five `electron.exe` processes, all with
`StartTime 02.09.2026 00:39:46`). It is not part of this harness. It carries a different application
name and therefore a different single-instance record, so it cannot have contended for the claim under
measurement, but it was competing for CPU. No SPIKE-16 figure below is a latency percentile, so the
exposure is limited to the two 20-second blocks in §5.3, whose magnitude leaves no room for doubt. The
SPIKE-14 percentiles in §4.1 were taken earlier, before that process appeared; at the end of the session
`Get-Process -Name electron` returned **0**, so no harness process leaked.

**Safety of the dialog scenarios.** Every native dialog raised by this spike was driven by an external
PowerShell watcher that posts `WM_CLOSE` after a fixed hold, each Electron launch had its own quit
timer, each utility process had its own watchdog, and the driver force-killed the whole process tree
after a hard timeout. No dialog was left on screen without a way out.

---
