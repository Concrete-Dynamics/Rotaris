# Spike — the whole-store backup and restore, run end to end — 8. Raw results — ADR-0005 consequence 11's lock rows (`J-short.js`, `B-restore.js lockrows-*`)

Part 8 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 8. Raw results — ADR-0005 consequence 11's lock rows (`J-short.js`, `B-restore.js lockrows-*`)

A backup was taken with two sessions mid-run (`execution_status = running`, lock rows held), then restored.
The counterfactual — the same restore with the correction disabled — was run against the same world.

| | correction applied | correction **not** applied |
|---|---|---|
| lock rows in the artifact | 2 | 2 |
| foreign-host rows dropped | **2** | 0 |
| `live-1` after restore | `status=running`, no lock, **live=false**, **stale=true**, repairable | `status=running`, lock `host=DEAD-LAPTOP-7`, **live=true**, stale=false, **not repairable**, needs `REQ-SESSION-183` |
| `live-2` after restore | same | same |
| `done-1` (terminal) | untouched | untouched |
| after the ordinary explicit repair | both `interrupted`, locks released | repair does not apply to them |

Rows naming **this** machine are kept, and because their pids probe dead they are already stale, so the
ordinary repair settles them and `REQ-SESSION-059` still has the pid to name.

**ADR-0005 consequence 11 is vindicated against the case it was written for, and the case has now run.**
The sessions arrive reachable rather than permanently locked, and without the correction they arrive
permanently locked exactly as the consequence predicts.

---
