# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Run autopsy — 09450abb-a3a5-4971-b9f0-8a09bd28b090 (terminal, v1-4ec58051303c4300829be798789f98db, 213.8 s, 301,477 in / 9,192 out)

Part 9 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Run autopsy — 09450abb-a3a5-4971-b9f0-8a09bd28b090 (terminal, v1-4ec58051303c4300829be798789f98db, 213.8 s, 301,477 in / 9,192 out)

**The classification and the delegation.** Classification was cut at 11,959 ms (traffic #0), so the run fell back to
`moderate_feature` and the coordinator was coordination-only. Its first request (traffic #1) took 31,247 ms and 6,043
reasoning characters weighing whether to delegate a task that said "run each of the following in the terminal". It then
delegated the sequence to one coding child, and its `wait_for_tasks` was held for 140.4 s.

**The 13 shapes.** The child attempted all 13 shapes in 14 terminal calls (#4 to #17), and every terminal check passed:
- `exec bash` (#6) and `exit 3` (#8) gave `execution_error` with `session_reset`;
- `${PIPESTATUS[0]}` (#7) exited 2 in 38 ms;
- the wedge soft-paused at 30.0 s (#9, #13);
- the poll after C-c gave `execution_error` −1 (#12);
- #14 reported the paused command's end and its `slept`.

### 1. Spec-faithful (no finding)
- **#17 refused by `starter:deny-pipe-to-shell`** (REQ-TOOLS-036/038).
- **REQ-MONITOR-118's wait** is logged at INFO and written to the timeline as `waiting_on_tools` (16:00:58.844).
- **The summariser's pass** (traffic #18, 31,249 ms) ended 31 ms before the foreground wait returned (OQ-114, kept).
- **The 31 s deliberation and the delegation hop** follow from the 12 s fallback's `moderate_feature`. `27a5127` classified
  this prompt `exploration` and `1763f7f` `explicit_trivial`; the classification is the model's, and the bound is ruled.
