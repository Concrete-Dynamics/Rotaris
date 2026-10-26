# Spike — element-count invariance of a recycled row pool, and whether the offscreen paint event can time a phase — 11. Files

Part 11 of 11 of [the spike report](../renderer-invariance-and-benchmark-cadence.md), which indexes every part.

## 11. Files

All harness code is throwaway and lives in the session scratchpad, outside this repository, at
`…\scratchpad\spike-renderer\`: `main.js` (window, offscreen mode, paint instrumentation, pixel sampling,
IPC), `renderer.js` (shell, recycler, Fenwick offset table, apply pipeline, phase driver, counters, all
probe modes), `fixture.js` (seeded fixture), `index.html` (layout and the `REQ-CHAT-057` metrics), and
`out/*.json` (twenty-three raw result documents, 532 KB, one per run, carrying every per-phase record,
every RSS sample, every per-repetition timing and every paint timestamp quoted above).

Nothing was installed into the shared toolchain; `marked@4.3.0` was installed into the spike's own
directory and the Electron install at `…\scratchpad\spike-base\` was reused unmodified.
