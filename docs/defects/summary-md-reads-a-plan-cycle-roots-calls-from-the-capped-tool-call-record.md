## summary.md reads a plan cycle root's calls from the capped tool-call record

`summary.md`'s Agents section (REQ-SESSION-140, built by fin22) lists each agent with the calls it counted. It reads
those counts from two kinds of source:

- An iteration's root reads its counter, `iterations.root_tool_calls`.
- A child reads its counter, `children.tool_calls`.
- A plan cycle's root reads the retained tool-call record (`sessionMetrics(...).per_agent`, in `agentsOf` in
  `packages/engine/src/run/summary.ts`).

The tool-call record is a ring capped at 5,000 rows per session (`RING_CAPS` in `packages/store/src/dal.ts`). Once a
session passes the cap, the oldest rows are dropped, so a plan cycle root's line reads fewer calls than it made. It then
disagrees with the session total and with an iteration root's line, which come from counters.

The store keeps no counter of its own for a released plan cycle root. `sessions.plan_root_tool_calls` (store v32,
`PD-ORCH-008`) holds only the calls of the root under way, and it is zeroed when that root is released.

Noticed 2026-10-06 by fin22's verifier (an optional finding) and confirmed by reading `agentsOf`, `sessionMetrics` and
the ring cap. Not repaired: a per-root count needs a store column, which is outside fin22's repair round.

## Specs

- REQ-SESSION-140: an Agents section; the build lists each agent's counted calls.
- REQ-MONITOR-102: each call counted once, whatever the agent ended as.
- REQ-SESSION-133: the retention caps (ring-buffer semantics, newest kept).
- `PD-ORCH-008`: a plan cycle root's under-way count.

Nothing in the application reads the file (REQ-SESSION-006). Only a person who opens it sees the low figure.

## Relevant files

- `packages/engine/src/run/summary.ts`: `agentsOf`, which reads the plan cycle root's line from `per_agent`.
- `packages/engine/src/export.ts`: `sessionMetrics`, whose `per_agent` counts only the retained record.
- `packages/store/src/dal.ts`: `RING_CAPS`, `planRootsOf`, and the `plan_root_tool_calls` statements.
