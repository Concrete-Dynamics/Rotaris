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
