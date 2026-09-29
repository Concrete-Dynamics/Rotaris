## The run-level agent's tool-call count reads zero while its turn runs

The inspector's meta line for the run-level agent (`{state} · {elapsed} · {N} tool calls`) derives N as the session's
tool-call total less the children's (`runLevelAgent` in `packages/ui/src/agents.ts`). The root's own calls reach that
total only when its turn returns (`Run.turn` adds `outcome.toolCallCount`, `packages/engine/src/run/run.ts`), so while the
root's turn runs its count reads 0 — or too few — although it has called tools. Seen 2026-09-29 while repairing live-run
finding K1: `pnpm artifacts-proof` item 2's `children-inspector.png` shows `running · 8s · 0 tool calls` beside the root's
`delegate used` and `artifact_write used` chips. The tracker already counts the root's calls live
(`AgentActivity.callCount(persona)`), which `SessionRecord.entryTools` could carry. Not repaired: it is not K1's. Related,
not the same: `a-roots-calls-before-a-crash-never-reach-the-session-total.md` (the calls a crash leaves uncounted).

## Specs

- `REQ-MONITOR-052`: the meta line's `{N} tool calls`, which reads a figure the agent has already exceeded.
- `REQ-MONITOR-044`: each agent as presented carries its tool-call count.

## Relevant files

- `packages/ui/src/agents.ts` — `runLevelAgent`'s `toolCalls`, the total less the children's.
- `packages/engine/src/run/run.ts` — `turn()` adds the root's calls to `Aggregates` only after its turn returns.
- `packages/engine/src/children/activity.ts` — `callCount`, the live per-agent count.
