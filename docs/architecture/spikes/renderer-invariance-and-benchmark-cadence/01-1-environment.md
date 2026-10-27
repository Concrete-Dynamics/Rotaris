# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 1. Environment

Part 1 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200` |
| CPU arch | x64 |
| Node (host) | v24.11.0 · npm 11.12.1 |
| Electron | 44.1.0 (reused from `spike-base`, not reinstalled) |
| Chromium / Node / V8 in Electron | 152.0.7977.65 / 24.19.0 / 15.2.124.18-electron.0 |
| Markdown renderer | `marked@4.3.0` (CommonJS build, `marked.parse`) |
| Displays present throughout | two, both 1920×1080, `workArea` 1920×1032, `scaleFactor` 1, `rotation` 0; primary internal at (0,0), second at (−1920,191) labelled `F3-L` |
| Renderer `devicePixelRatio` | 1 |
| Shell | Git Bash (POSIX `sh`) |

This is the same machine and OS build as ADR-0004's DATA spike and as the `spike-base` toolchain
verification, so figures here are comparable with those.

**Display refresh rate was not read from the operating system.** The onscreen apply-to-paint floor
measured below (13.8–13.9 ms, section 5) is reported as measured; no refresh figure is inferred from it.

---
