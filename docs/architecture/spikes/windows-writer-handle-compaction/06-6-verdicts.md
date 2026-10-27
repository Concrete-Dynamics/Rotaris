# Spike — the writer's own handle, and what a follower sees across a compaction — 6. Verdicts

Part 6 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 6. Verdicts

| Requirement / constraint | Threshold | Verdict |
|---|---|---|
| `REQ-EVENTS-091`, constraint **E-06** | trim replaces the file in one atomic step; keeps newest `cap`; incomplete trim leaves previous contents in force, warns, and is not reflected in the marker | **FAIL** for the writer-holds-handle shape (0/115 trims completed, cap exceeded by 115 lines and growing). **PASS** for close-stage-`fsync`-rename-reopen: 400/400, 250/250, 250/250, 300/300, 30/30 at the default cap. Failed trims behaved exactly as specified — previous contents in force, warning recorded, marker untouched, staged file removed. |
| `REQ-EVENTS-091` cap arithmetic (default 20000, headroom 2500, trim above 22500) | file must not exceed cap + cap/8 other than transiently | **PASS** — R-F high-water 22,501 against a limit of 22,500 |
| `REQ-EVENTS-029`, constraint **E-03** | one write followed by an immediate flush, per event | **PASS**, at 0.518 ms per event. **Caveat, not a violation:** a compaction closes the append handle for p50 29.8 ms at the default cap (p95 41.4 ms), and up to 840 ms when the ladder is exercised; no append can be flushed in that window. |
| `REQ-EVENTS-108`, `110`, `111`, `113`, `116`; `REQ-SESSION-149` | resumable read delivers every event exactly once, in order; offset lands after a complete record; partial tail held without warning | **PASS** in 172,191 reads — 0 silent gaps, 0 silent duplicates, 0 partial lines delivered, 0 unparseable lines. **CONDITIONAL:** the deterministic sweep shows 200/200 offsets undetected when a same-length replacement coincides with a stale marker. |
| `REQ-EVENTS-111` (marker comparison makes restart guaranteed) | restart whenever the dropped count has risen | **PASS** where the marker is current (0/200 undetected). **FAIL as an unconditional guarantee** — two measured windows exist in which the marker the follower reads is older than the journal bytes it reads. |
| `REQ-EVENTS-092`, `094`, constraint **E-07** | marker written atomically, sorted keys, trailing newline, cumulative count | **PASS** — written by the same stage-`fsync`-rename primitive; no corrupt marker was produced or observed |
| `REQ-LIBRARY-043` ("never a partial, **empty**, or unparseable file") | a concurrent read returns the complete previous or complete new file | **PASS** for this compaction shape — 0 empty reads in 172,191. Note this requirement governs the improvement-artifact store; the journal's analogue is `REQ-EVENTS-091`. |
| `REQ-LIBRARY-043` retry bound (5 attempts, all within 1 s of the first) | bounded ladder | **PASS** — 50/100/200/400 ms of pauses; the longest ladder observed across the whole clean matrix elapsed **831.9 ms** including the attempts themselves, inside the 1 s bound. That instance *succeeded* on a late attempt. |
| `REQ-TOOLS-078`, `REQ-TOOLS-190`, `REQ-SESSION-133` (5,000-entry rings) | never altered, never reordered, trimmed to the newest N, every retained entry byte-for-byte | **INCONCLUSIVE as measured.** These files were **not exercised separately.** They use the same compaction mechanism, so section 3.1's result applies to them by construction, but no figure here is a measurement of `permissions.jsonl` or `verification-gate.jsonl`. |
| Constraint **D-07** / `REQ-LIBRARY-043` (no transient file left behind) | none on any path | **PASS** — no arm left a `.tmp` file, including across 138 and 115 rename failures |
| **OQ-12** (durability semantics) | — | **UNTOUCHED.** I measured which sync calls return success, not whether anything survives a power cut. No power-loss test was performed. |

---
