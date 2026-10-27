# Spike — the writer's own handle, and what a follower sees across a compaction — 1. Environment

Part 1 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, 10.0.26200.9168 |
| Node | v24.11.0 (`process.versions.uv` = 1.51.0) |
| npm | 11.12.1 |
| Volumes | `C:` NTFS, 1,022,726,901,760 B total / 62,917,468,160 B free · `D:` NTFS, 1,000,202,039,296 B total / 708,662,448,128 B free |
| Harness location | the session scratchpad on `C:` — **all figures below are from an NTFS volume, but from `C:` and not from a workspace directory on `D:`** |
| Anti-malware | not disabled, not enumerated, not measured |

This is the same machine and the same Node build as ADR-0004's existing spike, so the numbers are
comparable to it.

---
