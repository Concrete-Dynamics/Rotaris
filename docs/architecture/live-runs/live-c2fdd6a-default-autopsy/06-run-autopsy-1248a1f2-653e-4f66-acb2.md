# Live-run autopsy — origin/main `c2fdd6a`, default pack (the self-hosted endpoint, `qwen3.8-flash-next`, unmetered) — Run autopsy — 1248a1f2-653e-4f66-acb2-6e35dbbf2a59 (resume, v1-4ec58051303c4300829be798789f98db, 90.3 s over 2 runs, 278,644 in / 8,225 out)

Part 6 of 18 of [the autopsy](../live-c2fdd6a-default-autopsy.md), which indexes every part.

## Run autopsy — 1248a1f2-653e-4f66-acb2-6e35dbbf2a59 (resume, v1-4ec58051303c4300829be798789f98db, 90.3 s over 2 runs, 278,644 in / 8,225 out)

**The launch.** Classification was cut at 11,968 ms (traffic #0, 4,098 reasoning characters, fallback `moderate_feature`).
Two background coding children started at 15:50:34.40 and 15:50:34.47.

**The pause.** Pause was pressed at 15:50:34.719 and accepted at .742. The current step finished, and both children were
paused at 15:50:36.871 and .910. The run rested `paused` at 15:50:36.924. Five calls emitted at the step's end were not
run (rows 7 to 11, `blocked`, "This call was not run: it was interrupted by the pause before it started…"); this is
PD-ORCH-005 clause 2, as built.

**The Continue** was pressed at 15:50:37.106. It made no classification; the intent was carried (OQ-162 row). Both
children resumed under their own ids, and the iteration closed `succeeded` at 15:51:45.436.

### 1. Spec-faithful and harness observations (no finding)
- **Transcript row 13** reads "Intent classified: moderate_feature (continued from previous run)" although nothing was
  classified. REQ-SESSION-114 fixes that row's wording, so it is spec-faithful. The header's "(continued from the previous
  run)" is the clause-40 wording.
- **The two `terminal_shell_failure` issues** (#6 exit 2, #10 exit 1) are notes-functions' own `ls` and `grep` checks
  (REQ-SESSION-136).
- **The summariser held the parent's wait** for 16.5 s (traffic #22, which ended 13 ms before #5 returned). OQ-114 keeps
  that figure.
- **Harness scenario order, not the product:** both children spent turns proving that `src/todos.js` and
  `src/todos.test.js`, modified in the shared workspace, were not theirs (#12, #16: `git diff --stat` with `ls -l`
  mtimes; rows 30, 32, 40, 42). These are the edit scenario's uncommitted changes, which the harness leaves in the workspace
  the next scenario uses.
