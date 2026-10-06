## A replaced attempt's completed calls hide the retry's unfinished call from the count

A delegated child's settle (`IterationChildren.execute` in `packages/engine/src/children/orchestration.ts`) computes its
calls as `priorCalls + Math.max(made, live)`, where `live` is every call completed across all of the execution's attempts
(each joined the session's total as it completed, `PD-ORCH-008`) and `made` is the replaced attempts' outcome counts
(`spent`) plus the last attempt's. An attempt REQ-ORCH-088's fallback retry replaces after its backstop cut it has no
outcome when its turn raised (a call that raises out of the tool port; an attempt the backstop cuts on a model step returns
a failed outcome instead), so its completed calls are in `live` and nothing of it is in `made`. If the retry then starts a call it never
completes (a call answered from a replay, REQ-ORCH-141, or one cut by a detach), that call is in `made` and not in `live`,
and `Math.max` keeps the larger of the two: the replaced attempt's completed calls cover it, and the unfinished call is
never counted, in the child's count or in the session's total. Concretely: attempt 1 completes `g1`, then starts `boom`,
which raises after the ceiling; the retry re-issues `g1` and is answered from the replay. `live` is 1, `made` is 1, the
child counts 1 and the session's total misses the replayed call (and `boom`, which the attempt dispatched and never
completed).

Noticed 2026-10-06 by the fin20 verifier (OQ-116's build); recorded by fin22, which reproduced it with the raising attempt
(a backstop cut alone leaves an outcome, and the old count was right for it).

## Specs

`PD-ORCH-008` (OQ-116 as ruled, R-071): each call joins the total as it completes, and the settle adds "the rest: a call
started and never completed, or one answered from a replay (REQ-ORCH-141)". REQ-MONITOR-102 (each call counted once,
whatever the agent ended as), REQ-ORCH-088 (the retry).

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the attempt loop's `live` and `spent`, and the settle's `toolCalls`.
- `packages/engine/src/run/ladder.test.ts` — the OQ-116 fallback-retry case beside which the repair's cases stand.

