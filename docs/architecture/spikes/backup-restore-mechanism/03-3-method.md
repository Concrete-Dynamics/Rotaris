# Spike — the whole-store backup and restore, run end to end — 3. Method

Part 3 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 3. Method

Every rename trial is 30 process-local attempts on freshly created directories, reported as a count. Every
restore trial that carries a verdict is 30 repetitions with a fresh world each time. Timing is
`process.hrtime.bigint()` inside the process that does the work, reported as min / p50 / max over 10
repetitions per store size. The observer that watches the rename gap runs in a **separate process** and
holds no handle on anything inside the store directory — an earlier version of it opened the store to look,
and its own transient handle broke step 3, which is itself recorded in 4.3.

Raw JSON for everything below is under `…\scratchpad\spike-22\out\`; the harness file list is section 16.

---
