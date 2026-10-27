# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — The thirteen NOTE lines

Part 16 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## The thirteen NOTE lines

| # | NOTE | verdict |
|---|---|---|
| 1 | sign-in: "code-intelligence discovery did not run in this launch" | **Correct.** The sign-in starts no run. Its setup was cut by the quit with nothing recorded, and ask's launch completed it. Hides nothing. |
| 2 | edit: "writes the gate refused for a live scope — none" | **Correct.** #16 wrote only `src/todos.js`; #25 and #26 only `src/todos.test.js`. The PASS above it (0 refusals) is vacuous, and this NOTE says so. |
| 3 | shell: "code-intelligence discovery did not run in this launch" | **Correct.** No run; initialization reported "0 pending". |
| 4 | frictions: "no call was refused at the tool gate as invalid_request" | **Correct.** 0 `invalid_request` rows. The 8 MCP calls of the run also met their advertised schemas, so G3's repair has no live evidence either. Hides nothing. |
| 5 | frictions: "no write_file call left out its operation" | **Correct.** 3 of 3 `write_file` calls sent `operation: create`, so PD-TOOLS-007 is unexercised. The PASS "no todo call was sent to a task id a refusal named" is likewise vacuous (0 refused `replace`). |
| 6 | "the stream-stall abort is not covered here" | **Correct.** faults-stall covers it in this run; the cited path exists. |
| 7 | "the exit-trace gap is not covered here" | **Correct.** It needs a crash, so that repair has no live coverage. The path exists. |
| 8 | faults-ladder: "the dispatch layer alone (2 absorbed retries); the ladder was not reached" | **Correct.** 2 dispatch-layer warnings, 0 issues, traffic #3 a 200 (OQ-110). The ladder stays unexercised. |
| 9 | faults-stall: "completed / tasks_complete after 1 iteration(s)" | **Correct.** Stall seen at 94 s, retried at 120 s, completed. |
| 10 | terminal: "what the model attempted — here-string×1 … pipe-to-shell×1" | **Correct.** 14 terminal calls (#4 to #17), 13 shapes, 2 polls. |
| 11 | terminal: "the wedge did not reach the hard cap" | **Correct, by design.** #9 and #13 soft-paused at 30.0 s; the 100 s bound is unmeasured. A coverage gap, not a defect. |
| 12 | terminal: "a read-only git pipeline through a pipe — blocked by starter:deny-pipe-to-shell" | **Correct, spec-faithful** (REQ-TOOLS-036/038). |
| 13 | "no ceiling was imposed — 1653603 tokens" | **Correct.** Equals 1,607,226 + 46,377, the store's 8 sessions. Aborted requests (8 analysts, 3 classifiers, the stalled answer) carry no usage. |

None of the thirteen hides a product defect.
