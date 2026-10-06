## The duress time split counts a parent's wait on its children as "tools"

The duress scenario's deadline check divides the wait into four parts: endpoint, tools alone, launch, and the product with
nothing in flight. `attributeWait` files an instant under "tools" whenever any tool call is open and no model request is.
The coordinator's own `wait_for_tasks` is a tool call, and so is a `delegate` with `run_in_background: false`, which waits on
its child the same way. Each one stays open for as long as the children run. So every gap between the children's steps,
where nothing is in flight but the parent's wait, is counted as "tools". The product's own between-step time is then
understated.

Observed in the orchestrator's final duress live run at origin/main `27a5127` (2026-10-06, 01:48 to 02:44 UTC, against the
self-hosted endpoint; pack `2026-10-06T01-47-53-900Z`, finding H7 of its autopsy). The PASS line, "the long run reached its result inside the wait", in the pack's
`results.json` reads "tools alone 18 s … the product with nothing in flight 2 s". The pack's
`workspace.db` holds four `wait_for_tasks` calls, about 3,075 s open in all. Recomputed with them left out, the split is
12.1 s tools and 7.9 s product: about 6 s of the product's own time was being reported as tools. The check's conclusion
(the product under 0.3 % of the wait) holds either way.

## Specs

None (harness): live-run finding H-h's deadline reading, `apps/desktop/scripts/lib/duress-checks.mjs`. Its own comment
defines "tools" as "no request was open and at least one tool call was running". A wait on children runs no tool of its own,
so counting it there contradicts what the line says it measures.

## Relevant files

- `apps/desktop/scripts/lib/duress-checks.mjs` — `attributeWait`, the sweep that puts an instant under `tools` when any tool
  interval is open; `deadlineReading`, which prints the split.
- `apps/desktop/scripts/live-run.mjs` — the duress scenario passes every finished tool call of the session as a tool interval,
  `wait_for_tasks` included.
- `packages/agent-tools/src/tools/delegation.ts` — `wait_for_tasks`, and `delegate`'s foreground path, the two calls that wait
  on children.

Noticed 2026-10-06 by the autopsy of the final duress live run at `27a5127` (H7); recorded by plan fin19 before any repair.
