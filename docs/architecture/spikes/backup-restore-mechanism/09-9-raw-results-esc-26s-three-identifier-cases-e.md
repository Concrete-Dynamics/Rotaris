# Spike — the whole-store backup and restore, run end to end — 9. Raw results — ESC-26's three identifier cases (`E-identifier.js`)

Part 9 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 9. Raw results — ESC-26's three identifier cases (`E-identifier.js`)

| Case | What was done | Result |
|---|---|---|
| **(a)** workspace carries the artifact's identifier | restore | completes; displaced store retained, openable, **1 session intact**, and its per-session files including `artifacts/keepme.md` still present |
| **(b)** no identifier file at all | establish by exclusive create (`O_CREAT|O_EXCL`), then restore | file created, value matches the artifact, restore completes with 2 sessions; `config.yaml` and `integration.lock` in `.rotaris/` untouched |
| **(b) race** a file appears between the check and the write | exclusive create against a squatter | **refused `EEXIST`**; the squatter's value stands; the action falls through to case (c) — the record's guard works |
| **(c) outcome 2** different readable identifier, restore into the artifact's own store | restore | completes; the workspace's identifier is **unchanged**; the artifact's store exists separately with 2 sessions; the open workspace still resolves to its own store and its own 1 session |
| **(c) outcome 3** different readable identifier, confirmed establishment | ADR-0004 replace shape (staged in `.rotaris/`, `fsync`, rename over), **2.42 ms**, after the gates and before the swap | identifier replaced; restore completes; **the store recorded under the old value is intact, unreferenced, openable, and holds its 3 sessions**; re-writing the old value by hand re-resolves the workspace to those 3 sessions — the undo the confirmation promises |
| **unreadable**, five shapes: not-an-identifier, `v1-abc`, uppercase hex, empty file, comments only | attempted | all five classify as **unreadable**; outcome 3 is not offered; **the file is byte-unchanged in all five** |

The confirmation's required content was assembled from the manifest and the two stores before anything was
written: both identifier values, the count of sessions that become unreachable (3), when the artifact was
taken, how many sessions it holds, whether a store already exists for the artifact's identifier, and how
many sessions arrive needing repair.

**The displaced store is retained and findable in every case where one was displaced**, sitting one
directory level up from the store that replaced it, exactly as the layout block specifies — with the
qualification in section 12.

---
