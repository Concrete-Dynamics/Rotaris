## A root's calls before a crash never reach the session total

The session's tool-call total (`REQ-MONITOR-102`) counts an agent's calls when its turn returns: a child's when its
execution settles, the root's when `Run.turn` adds its outcome. A crash ends the root's turn without returning, so
the calls the root made before it are recorded in its conversation and its transcript rows but never counted. A
resumed child's are now credited at its resume from its record (`callsRun`); the root's are not, and the agents
panel, which derives the root's figure as the total less the children's, shows it too few. Noticed by phase 4's third
review of `PD-ORCH-005` (2026-09-27), established by reading the code; not driven.

## Specs

`REQ-MONITOR-102` (the session-wide total counts each call once), which a call counted never does not meet.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn`, where the root's calls join the total (`aggregates.addToolCalls`).
- `packages/engine/src/children/orchestration.ts` — `execute`, where a resumed child's recovered calls are credited.
- `packages/ui/src/agents.ts` — the root's figure, the total less the children's.

## Measured live — the duress run of 2026-09-29 (D4's crash half)

Live-run finding: D4 (live runs of 2026-09-29), its crash half. Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`. The run was ended at its
40-minute deadline by the harness's immediate exit, which the run meets as a crash (the harness side is
`the-drivers-quit-skips-the-applications-shutdown.md`). At that point `sessions.tool_calls` read **240** against **309**
`tool_calls` rows: the orchestrator's **54** calls were never counted, because its one turn never returned, and the
running child `f`'s **15** were not either (`children.tool_calls` 0 for `f`, which never settled). The autopsy's header
said 240 above its own per-tool breakdown summing to 309. The session stayed `running`, `stop_reason` NULL. The same
figures are the lag half of the finding, which REQ-ORCH-097's "after each successful execution pass" permits while the
pass runs, and which is [OQ-115](../architecture/open-questions.md), open.
