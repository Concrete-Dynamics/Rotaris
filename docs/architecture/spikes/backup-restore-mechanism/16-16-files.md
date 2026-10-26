# Spike — the whole-store backup and restore, run end to end — 16. Files

Part 16 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 16. Files

All under `C:\Users\ganga\AppData\Local\Temp\claude\D--Development-Apps-Rotaris-crw\8ddb8c86-64f1-495f-8cc7-35576c51f79c\scratchpad\spike-22`.
Working directories (3.2 GB of generated stores) were deleted; `out\` and the harnesses remain.

| File | What it does |
|---|---|
| `lib.js` | store layout, ADR-0058 rule 3's open sequence, identifier read/mint/replace, the backup |
| `restore.js` | the three gates, the swap, the reversal, the lock-row correction, the fault injector |
| `proc-svc.js`, `proc-runhost.js`, `orch.js`, `holder.js` | the two processes, the relay, the gap observer |
| `A-rename.js`, `A2-extra.js` | section 4 |
| `B-restore.js` (21 scenarios), `H-reps.js`, `I-gap.js`, `I-observer.js` | sections 5 and 6 |
| `K-gates.js` | section 7 |
| `J-short.js` | section 8, and the displaced store's retention |
| `E-identifier.js` | section 9 |
| `F-timing.js` | section 10 |
| `e\main.js`, `e\svc-child.js`, `e\rh-child.js`, `e\abi-probe.js`, `e\abi-child.js`, `e\index.html` | section 11 |
| `D-longpath.js`, `D2-threshold.js`, `D3-name.js`, `D4-displaced.js` | section 12 |
| `out\*.json`, `out\F-timing.txt`, `out\ngyp3.log` | every raw result quoted above |

---
