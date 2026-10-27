# Spike — the cached launch of the Windows `onefile` portable — 1. Environment

Part 1 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU | Intel Core i7-10875H @ 2.30 GHz, 8 physical / 16 logical cores |
| RAM | 16,953,679,872 B (15.79 GiB) |
| Storage | `C:` NTFS 1,022,726,901,760 B total / 51,263,311,872 B free; `D:` NTFS 1,000,202,039,296 B / 708,655,611,904 B free. Physical: `CT1000P310SSD8` (SSD) and `WDC PC SN530 SDBPNPZ-1T00-1002` (SSD) |
| Node (host) | v24.11.0, npm 11.12.1 |
| Rust | `rustc 1.91.1 (ed61e7d7e 2025-11-07)`, host `x86_64-pc-windows-msvc`, LLVM 21.1.2; `cargo 1.91.1` |
| Electron | `electron@44.1.0` — Chromium `152.0.7977.65`, Node `24.19.0`, V8 `15.2.124.18-electron.0` (read from the running packaged app, not from a changelog) |
| Packaging of the payload tree | `electron-builder@26.15.3`, `dir` target (the `onedir` tree only) |
| Launcher | written for this spike in Rust, 330,752 B, `#![windows_subsystem = "windows"]`, one third-party crate (`flate2` with the pure-Rust `miniz_oxide` backend) plus `sha2` for the check benchmark |
| Anti-malware | **Microsoft Defender was on and was not disabled.** `AMServiceEnabled=True`, `RealTimeProtectionEnabled=True`, `AntivirusEnabled=True`, `AMEngineVersion=1.1.26070.7`, `AntivirusSignatureVersion=1.457.442.0`. This matters — see §11 |
| Artifact location | the session scratchpad on `C:` |
| Preparation location | the real `%LOCALAPPDATA%` on `C:` — `C:\Users\ganga\AppData\Local\rotaris\launch\<token>\`. Removed at the end of the spike |
| Concurrency | **other agents were working on this machine throughout.** CPU busy in the 400 ms before each launch was sampled per run and ranged **1.2 %–70.5 %** |

Same machine, same OS build, same Electron and same Node as spike 17 (`packaged-first-paint.md`) and as
the `spike-base` toolchain note, so the figures here are directly comparable with both.

---
