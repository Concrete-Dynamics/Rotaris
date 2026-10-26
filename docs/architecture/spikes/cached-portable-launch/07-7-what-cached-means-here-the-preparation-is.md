# Spike — the cached launch of the Windows `onefile` portable — 7. What "cached" means here — the preparation is genuinely reused

Part 7 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 7. What "cached" means here — the preparation is genuinely reused

Spike 17's §6.2 found that `electron-builder`'s portable stub **deletes** its `%TEMP%` extraction
directory when the application exits, so every launch re-extracts and there is no warm path at all. That
does not happen here, and it was checked rather than assumed. Across 149 launches that went through the
launcher and painted:

- **149 of 149** reported `process.execPath` inside `…\rotaris\launch\<token>\`, i.e. every one ran the
  prepared image.
- After a launch completes, the token-named directory is still present with all 73 files and 507.9 MiB.
- Launching a **different** artifact does not disturb it (§10.3).

---
