## A paused session's root is shown cancelled

The agents panel and the inspector present a session's run-level agent (its root, `runLevelAgent`) from the session's
execution status: busy is running, `completed` is done, `failed` is failed, and everything else — `paused` among it — is
cancelled. A session at rest after a pause therefore shows its root as "cancelled" beside the Continue action's "N agents
will resume", while the store holds the root's iteration open and the next continue resumes it. The delegated agents of
the same session present as the paused state OQ-67 reads. Seen in the built app during phase 5's review of
`PD-ORCH-005` (2026-09-27) and again in phase 5's own captures; not repaired.

## Specs

`PD-ORCH-005` clause 2 (every agent that has not reached a terminal state is left `paused`; a root at rest is one), and
clause 6 (the Continue action states that it resumes), which a root shown cancelled contradicts.

## Relevant files

- `packages/ui/src/agents.ts` — `runLevelAgent`, the status-to-state mapping that falls through to `cancelled`.
- `packages/ui/src/Inspector.tsx`, `packages/ui/src/AgentTree.tsx` — where the root's state is drawn.

## Repaired — 2026-09-28

`PD-ORCH-005` clause 13 (revision 4) gives a paused agent the presentation state `paused`, and clause 19 counts the
root among the agents that resume. `runLevelAgent` now presents the run-level agent `paused` (state `paused`, not live,
not ended) while its session rests with an iteration open — `paused`, `interrupted`, or in REQ-CHAT-008's recovery state,
which its callers pass (`runLevelResting`, OQ-73) — so the root agrees with the Continue action's count. A session at
rest with nothing open presents its root as before. Evidence: `packages/ui/src/agents.test.ts`, the describe
"PD-ORCH-005 clause 13 (revision 4): a paused agent presents as paused (OQ-73)"; reverting `runLevelResting` turns it red.
