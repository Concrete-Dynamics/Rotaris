# Spike — the cached launch of the Windows `onefile` portable — 13. What this harness does **not** model

Part 13 of 16 of [the spike report](../cached-portable-launch.md), which indexes every part.

## 13. What this harness does **not** model

- **It contains no product.** The application is spike 17's probe: one `BrowserWindow`, 80 `<div>`s,
  report, exit. No renderer framework, no bundler output, no IPC contract, no preload, no persistence,
  no native module, no `better-sqlite3` (ADR-0058), no `node-pty` (ADR-0020), no MCP client, no theme
  system. `REQ-STARTUP-040`'s icon, font registration and theme restore — which ADR-0055 puts before any
  window exists — are absent. **Everything the product does before first paint is additional to the
  575.5–1,414.6 ms measured here.** The usable figure is the headroom: **roughly 3.6–4.4 s.**
- **The bundle weight is real bytes but not the real bundle.** It is spike 17's `W150` anchor, with
  `monaco-editor` as declared ballast for a component ADR-0035 has not chosen. Nothing is *loaded* from
  the payload at startup, so this measures the cost of **carrying** weight, not of **executing** it.
- **The launcher's own design is one of several.** Raw DEFLATE at level 6 with 8 MiB chunks and a
  thread-per-core pool is a conventional choice, not an optimal or a recommended one. LZMA, which is what
  `electron-builder` uses and what would produce the smallest artifact, was **not** measured: no
  pure-Rust LZMA decoder was brought into the harness. Spike 17's LZMA figures were for a different
  mechanism and must not be transplanted.
- **`store` first-run figures are not a recommendation.** They exist to isolate the write cost from the
  decompression cost.
- **No `.dmg`, no AppImage, no macOS, no Linux.** `REQ-STARTUP-155` binds those too, and `REQ-STARTUP-165`
  reaches only `onefile` artifacts, of which the Windows portable is the only one (`REQ-STARTUP-013`).
- **No SmartScreen, no Mark-of-the-Web, no signing, no notarisation.** Every artifact here was written
  locally and carries no zone identifier, so the first-launch reputation prompt of `REQ-STARTUP-021`
  never fired. §11 is an on-access-scan observation, not a SmartScreen one. A real download adds a cost
  that is not measured here and that lands on the first run.
- **The read-only medium test is an approximation.** An `icacls` deny ACE on the containing directory,
  with the write probe verified to fail. It is **not** a read-only volume, a CD, a write-protected USB
  stick, or a network share. The stronger claims in clause (a) about removable media remain untested.
- **Clause (d) was not independently verified.** No network capture and no privilege trace was taken; the
  claim that preparing fetches nothing and elevates nothing rests on the launcher's source.
- **Clause (c)'s "no usable preparation at all" branch was not exercised.** A full disk, a refused write,
  or unavailable storage — and the persistent warning notice `REQ-STARTUP-165` (c) requires for exactly
  that case — were not tested. That is the one preparation outcome the product reports, and it is
  unmeasured.
- **`REQ-STARTUP-164`'s hand-over interval, `REQ-STARTUP-066`'s 100 ms empty-plan fast path, and
  `REQ-STARTUP-155`'s setup-pass bound are all untouched**, exactly as in spike 17. §10.5 measures the
  preparation race only, not single-instance resolution.

---
