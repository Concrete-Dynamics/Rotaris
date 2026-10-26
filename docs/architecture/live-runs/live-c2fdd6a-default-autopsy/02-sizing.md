# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Sizing

Part 2 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Sizing

| scenario | session | wall (created → last update) | requests | in / out tokens | tool calls (failed / blocked) | intent |
|---|---|---|---|---|---|---|
| ask | 3ce37ae3 | 15.2 s | 5 | 28,140 / 703 | 2 (0/0) | question 0.97 |
| edit | 8a7d0d7c | 133.7 s | 29 | 357,385 / 12,614 | 31 (0/0) | moderate_feature (12 s fallback) |
| resume | 1248a1f2 | 90.3 s (21.8 s + 68.2 s; rested 0.29 s) | 25 | 278,644 / 8,225 | 17 (2/0), plus 5 the pause stopped before they ran | moderate_feature (12 s fallback), carried at the Continue |
| requirements (board) | bef9de1f | 198.5 s | 41 | 539,320 / 13,593 | 48 (1/1) | small_feature 0.92 |
| frictions | 21ebbb5d | 20.8 s | 8 | 65,152 / 1,142 | 5 (0/0) | explicit_trivial 0.99 |
| faults-ladder | 055e5eba | 13.5 s | 6 (2 injected) | 18,554 / 326 | 1 (0/0) | question 0.94 |
| faults-stall | 64426c61 | 131.3 s | 6 (1 stalled) | 18,554 / 582 | 1 (0/0) | question 1.0 |
| terminal | 09450abb | 213.8 s | 24 | 301,477 / 9,192 | 21 (4/1) | moderate_feature (12 s fallback) |
| **total** | 8 sessions | **817.2 s** (27a5127: 924.4 s) | 144 | **1,607,226 / 46,377** | 126 (7/2) | |

**Accounting is coherent.**
- **Tokens.** In 7 of 8 sessions the store's totals equal the sum of `usage` in the traffic, to the token. faults-stall's
  traffic holds 8,778 in / 128 out more. That is the answer the proxy withheld (traffic #2, `aborted` after 120,738 ms),
  which never reached the product. The store's total, 1,653,603, equals the console's spend line and the last NOTE.
- **Counters.** In all 8 sessions:
  - `sessions.tool_calls` equals the session's rows;
  - `iterations.root_tool_calls` equals the root's rows;
  - each `children.tool_calls` equals that child's rows (for example terminal 7 + 14 = 21, requirements 19 + 16 + 13 = 48).
- **Cost.** 0 with `cost_qualifier: unknown` everywhere; the strip reads "n/a cost". Correct for an unpriced endpoint.
- **Summaries.** All 8 rows read `completed` / `tasks_complete` / "The run completed.". Resume's first run rested with
  "The run came to rest at the user's request." (`warning` notice, REQ-ORCH-082 rule 1).

**Where the time went.**
- **The product's own share is small.** Subtracting the union of request and tool intervals from each session's wall time
  leaves 0.3 to 1.3 s per session. The exception is faults-ladder at 7.3 s, which includes the two designed dispatch-layer
  waits of 2,005 and 4,002 ms.
- **The endpoint was healthy** apart from the injected faults.
- **Classification** took 53.1 s over 8 calls:
  - 5 completed in 2.5 to 4.2 s;
  - 3 were cut at the bound: edit 11,968 ms, resume 11,968 ms and terminal 11,959 ms, with 3,613 to 4,098 reasoning
    characters and no answer.
- **Report summarising**: 7 passes took 127.3 s, of which 91.2 s ran with no other model request in flight. The five passes
  that closed a parent's wait each ended 5 to 31 ms before that `wait_for_tasks` returned:

  | session | summariser time alone on the critical path |
  |---|---|
  | terminal | 31.2 s |
  | requirements | 22.5 s + 10.3 s |
  | resume | 16.5 s + 3.0 s |
  | edit | 7.7 s |

- **Ruled, not a defect.** OQ-114's ruling keeps both figures, so these are costs, not findings.
- **The post-run improvement analyst** was cut off at quit in all 8 sessions (the last traffic record of each, `aborted`).
  That is REQ-LIBRARY-127 at the harness's quit, as at `27a5127`.
