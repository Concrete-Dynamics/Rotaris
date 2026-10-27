# Spike — the writer's own handle, and what a follower sees across a compaction — 9. Files

Part 9 of 9 of [the spike report](../windows-writer-handle-compaction.md), which indexes every part.

## 9. Files

Harness (throwaway, scratchpad only):
`p1-baseline.js`, `p2-shareflags.js`, `p2b-osshare.js`, `p2c-osshare2.js`, `p2d-whoblocks.js`,
`p2e-replacefile.js`, `holder.ps1`, `p4-durability.js`, `p6-identity.js`, `p7b-window.js`,
`p8-dutycycle.js`, `writer.js`, `follower.js`, `p3-run.js`, `matrix3.sh`.

Raw output retained beside them: `p1-out.json`, `p2-out.json`, `p2b-out.json`, `p2c-out.json`,
`p2d-out.json`, `p2e-out.json`, `p4-out.json`, `p4b-dirfsync.txt`, `p4c-dirfsync-verify.txt`,
`p6-out.json`, `p7b-out.json`, `p8-out.json`, `clean-R-{A,B,C,D,E,F,G,H}.json`, and per-arm
`SUMMARY.json`, `writer.log.jsonl` (one record per trim) and `follower.<pid>.anomalies.jsonl`.
