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

## Outcome — repaired 2026-10-01 under R-067

Acceptance finding A20. Confirmed on `fix-accept1-20` before the repair: a driven session whose root had made two calls
and whose turn was still running published a snapshot with `toolCalls.total` **0** — so `runLevelAgent`'s total less the
children's read 0 — and `pnpm artifacts-proof` item 2, given a new assertion on the inspector's meta line, failed on a
build without the surface change with `running · 8s · 0 tool calls` beside the root's `delegate used` and
`artifact_write used` chips.

What changed: the session record carries the run-level agent's own count, `SessionRecord.entryToolCalls`
(`entryToolCallsOf` in `packages/engine/src/sessions.ts`): the roots' share of the persisted total — the total less every
child's persisted `children.tool_calls`, which the writer moves with the total in one transaction — plus the calls the live
root has started in its running execution that the total does not hold yet (`Run.entryUncountedToolCalls`: the tracker's
`callCount` under the name the root dispatches as, less that count when the execution began; zero once its calls join the
total, so no call is counted twice). `runLevelAgent` reads it, and falls back to the total less the children's only for a
record with no projection (`null`). Subtracting the children's persisted counts rather than their displayed ones also
stops a child's live calls, which the total does not hold during its pass either (OQ-116), from being taken off the
root's figure.

Pinned by: `packages/engine/src/agent-links.test.ts`, describe "engine — the run-level agent's tool-call count while its
turn runs" — the driven case (2 while the turn runs with the total at 0; 2 again from the total once it returns) and the
projection case (7 total, a child's 3, a live root's 2 uncounted → 6), both red before the repair (`entryToolCalls`
undefined); the two cases "REQ-MONITOR-044/052: once the root's turn returns / raises and the run is still live, its
calls are counted from the total alone, never twice" in the same describe, which hold the run live in its `iteration_end`
hook after the root's execution is over and read 2 (3 for the root whose turn raised) where the total holds the same calls;
and `packages/engine/src/children/children.test.ts` "REQ-MONITOR-044/052: while the rest waits for a child after the root
returned, the run-level agent's count holds the root's calls once", which reads it in the window between the root's return
and the end of the rest that waits for its child. Those three pin the "no call counted twice" claim: with both of `Run.turn`'s
clearings of `rootUncountedFrom` removed the first two read 4 and 6; with only the clearing at the root's outcome removed
the third reads 4; with only the one in `turn`'s `finally` removed the root that raised reads 6. *(Added 2026-10-01 at
verification: the driven case alone read its post-return figure after the session had let go of the run, where no run's
uncounted term is added whether or not it was cleared, so nothing pinned the claim.)* `packages/ui/src/agents.test.ts`
"REQ-MONITOR-044/052 (acceptance A20) …", red without the surface change
(0 where 2 is due); and `pnpm artifacts-proof` item 2's new meta-line assertion, which failed on a build without the
surface change and passed with it (`running · 8s · 3 tool calls`: the root's `artifact_write` and two `delegate` calls).

What the figure means is open: it is the run-level agent's own count, as REQ-MONITOR-044/052 present an agent's and as
the figure was before the repair, while REQ-MONITOR-101 gives the run's synthetic root "the aggregate run count and the
aggregate called-tool history". **OQ-158** asks which the run-level agent shows; the figure stays its own until it is
ruled. *(Added 2026-10-01 at verification: the repair first wrote the roots'-share reading into the contract and the views
without citing REQ-MONITOR-101.)*

Not shown live: no live-run scenario was run for this task; the proof that found it shows the repair.
