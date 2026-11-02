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
the ring cap. First recorded as not repaired, since "a per-root count needs a store column, which is outside fin22's
repair round"; that reason did not hold (a store column is appended routinely, `docs/architecture/views/04-seams.md` §3),
and the next round's verifier sent it back as blocking.

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

## Outcome

Repaired 2026-10-06 by fin22 (bundle `fin22-summary-and-counts`, repair round 2).

- **The count.** Store **v33** adds `plan_roots.tool_calls`: how many of a plan cycle root's calls the session's total
  holds. A root recorded from v33 on starts it at 0 (`insertPlanRoot`). `SessionWriter.countToolCalls` raises it
  (`StoreDal.countPlanRootCalls`) in the same transaction as it adds the root's calls to the total: as each completes
  (`planRootCall`), at its release (`planRoot`), and from a crash record (`recordCrash` releases through the same call).
  Nothing zeroes it, so it outlives the release that zeroes v32's `sessions.plan_root_tool_calls`.
- **The line.** `agentsOf` (`packages/engine/src/run/summary.ts`) reads that count. Where none is kept (a root recorded
  before v33, whose column is NULL, and an agent known only by its records) it reads the tool-call record only while the
  ring has dropped nothing, and `n/a` once it has (REQ-SESSION-140's rule for an unavailable value), so the summary never
  states a figure it knows may be short.
- **Pinned by:** `run/summary.test.ts`, "a plan cycle's root reads its own count (store v33), never the capped record's
  rows" (6 against the record's 1, red before the repair) and "where no count is kept … n/a once the cap has dropped any"
  (red before); `run/crash.test.ts`'s two plan-cycle cases now read the root's count through the run, the repair and a
  second crash recording (1, then 2, then 2; red before); `store.test.ts`, "a v32 store migrates to v33" (a pre-v33 row
  stays NULL and nothing raises it; a new one counts across its release).
- **Shown by:** `node apps/desktop/scripts/sessions-proof.mjs --skip-build`, which reads the seeded session's
  `summary.md`.
