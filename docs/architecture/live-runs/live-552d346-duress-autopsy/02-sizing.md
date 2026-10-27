# Live-run autopsy — origin/main `552d346`, final duress pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Sizing

Part 2 of 9 of [the autopsy](../live-552d346-duress-autopsy.md), which indexes every part.

## Sizing

| item | value |
|---|---|
| run (`run_started_at` → `run_end`) | 08:12:57.577 → 09:07:21.284, **3,263.7 s**; the harness's 3,273 s counts from launch |
| iterations / tool calls / children | 1 / 303 / 8 (orchestrator 63) |
| requests | 199: orchestrator 41, children 147 (a 15, b 12, c 12, d 19, e1 15, e2 24, f1 18, f2 32), report summariser 8, intent classifier 1, loop classifier 1, analyst 1. 196 completed; 3 aborted (intent at 11,975 ms, loop at 1,994 ms, analyst at the quit). 5 responses were cut by the recorder at 1 MB (reqs 80, 96, 144, 145, 149); their record-level `usage` is intact. |
| tokens | 5,800,296 in / 307,187 out (232,400 reasoning, 75.7 %); orchestrator 1,873,382 / 23,895 |
| failures | 9 `failed` + 1 `blocked`: `todo` with no operation (#13, gate), `edit_memory` without its fields (#288, gate), `delegate` write-scope refusal (#92), `read_file` of `node_modules` (#136) and `.rotaris/artifacts` (#197), 4 terminal exits ≠ 0 (#31, #67, #222, #232), 1 permission deny (#63, `starter:deny-recursive-delete`) |
| issues | 10: `tool_error` 5, `terminal_shell_failure` 4, `permission_denied` 1 |
| waits | `wait_for_tasks` ×5 held 2,867.0 s, 87.8 % of the run |
| largest prompt | 88,720 (req 197, the answer), 34 % of 262,144; 0 compressions |
| endpoint pace | median 78.7 output tokens/s over 98 requests of ≥ 500 output tokens (47.1–97.3); no slow tail |

| child | persona | life | requests | generation | output (reasoning) | calls | first write | steps > 45 s | summariser |
|---|---|---|---|---|---|---|---|---|---|
| a: docs/api.md | docs-writer | 208.5 s | 15 | 194.0 s | 13,267 (50 %) | 23 | +134 s | 1, 79.3 s | 14.1 s |
| b: test/extra.test.js | tester | 150.2 s | 12 | 115.5 s | 6,270 (33 %) | 12 | +55 s | 0 | 30.6 s |
| c: docs/overview.md | docs-writer | 123.0 s | 12 | 95.7 s | 5,384 (39 %) | 23 | +79 s | 0 | 26.9 s |
| d: reconcile | docs-writer | 449.2 s | 19 | 436.8 s | 33,561 (86 %) | 36 | +241 s | 3, 250.6 s | 11.7 s |
| e1: design analysis | architect | 547.9 s | 15 | 521.2 s | 33,854 (73 %) | 32 | — | 5, 422.4 s | 26.4 s |
| e2: docs/decisions.md | docs-writer | 389.9 s | 24 | 372.1 s | 29,404 (66 %) | 42 | +307 s | 1, 90.6 s | 16.9 s |
| **f1: verify** | verifier | **1,253.2 s** | 18 | 1,217.2 s | 109,457 (91 %) | 27 | — | **10, 1,150.0 s** | 31.7 s |
| f2: docs/verification.md + fixes | docs-writer | 515.3 s | 32 | 495.5 s | 40,665 (75 %) | 45 | +301 s | 2, 136.6 s | 18.6 s |

**Critical path** (sums to the 3,263.7 s run):

| segment | span | what held it |
|---|---|---|
| launch → wave 1 wait | 84.0 s | intent classifier cut at 12 s (Q2); `list_memories` #2 3.2 s on the code-intelligence connect; #13 refused and re-sent (req 8, 5.5 s); a three-`delegate` step (req 9, 27.1 s) |
| wave 1 wait (#24) | 198.7 s | a, then its summariser (14.1 s) |
| orchestrator | 115.9 s | 10 reads, 4 closes, d and the refused #92 (req 59, 32.7 s), the re-brief (req 65, 30.0 s) |
| wave 2a wait (#116) | 540.5 s | e1 (its last step, req 96, 198.3 s), then its summariser (26.4 s); d ended at 08:26:27.9 |
| orchestrator | 21.8 s | req 98 (17.6 s) briefed e2 |
| wave 2b wait (#166) | 385.7 s | e2 |
| orchestrator | 56.9 s | 4 reads, 3 closes, briefed f1 (req 130, 18.8 s) |
| wave 3a wait (#219) | 1,243.8 s | f1 |
| orchestrator | 75.6 s | retrieving f1's report (#243–#246, about 19 s) and the 7,123-character brief (req 155, 39.4 s) |
| wave 3b wait (#252) | 498.2 s | f2 |
| answer | 42.5 s | 5 reads, a `grep`, the loop classification (2.0 s), a memory, `todo` #302, `write_memory` #303, the answer (req 197, 11.4 s) |

Summariser passes on the critical path: 107.7 s (a, e1, e2, f1, f2); all 8 passes 176.9 s (OQ-114, kept).
