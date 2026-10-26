[Product directives](../directives.md) › PD-ORCH-008

<a id="pd-orch-008"></a>

### PD-ORCH-008 — a tool call joins the saved totals as it completes

Every tool call an agent of a run completes — the root of an iteration, the root of a plan cycle, and every delegated child
— SHALL join the session's persisted tool-call total, and the persisted count of the agent that made it, as it completes,
in one write, not after the agent's execution pass ends. What the pass's end adds is only what was not counted as it
completed: a call started and never completed, or one answered from a replay. A call is never counted twice, and a process
death between two calls leaves the total and the agent's count agreeing on every call that completed. The displayed total
(REQ-MONITOR-102) is therefore the record's during a pass, less the calls still in flight.

REQ-ORCH-097's accumulation is narrowed in its timing only; its replacement of cumulative token and cost snapshots, and
what the counters feed, are unchanged.

**Why, and what it costs.** In the duress live run of 2026-09-29 the root's one pass lasted the whole 40-minute run, and at
its deadline the displayed total read 240 against 309 calls made ([OQ-116](../../architecture/open-questions.md)); the
per-agent figures, which read the live tracker, added up to more than the total. For as long as a pass lasts the user saw a
number that was wrong and contradicted the figures beside it. The cost is a write per completed call, where there was one
per pass, and one more counter on the session's row for a plan cycle's root, which has no iteration row to hold its count
(store v32, `sessions.plan_root_tool_calls`).

> **Narrows:** REQ-ORCH-097

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), which ruled OQ-116 as recommended.*

> **First execution, 2026-10-06 (fin20).** The root's `onToolCompleted` (`countRootCall` in `packages/engine/src/run/run.ts`)
> and a child's (`countCall` in `packages/engine/src/children/orchestration.ts`) each add the call to the run's aggregate and
> persist it with the agent's count through `SessionWriter.countToolCalls` — an iteration root's `iterations.root_tool_calls`,
> a plan cycle root's new `sessions.plan_root_tool_calls` (store v32, `planRootCall`, which does not release it), a child's
> `children.tool_calls` — and the pass's end, give-up or raise adds only the remainder. The crash record of a plan cycle's root
> adds its record's calls beyond `plan_root_tool_calls`. **What was measured.** `agent-links.test.ts` (the root's total while
> its turn runs), three cases in `run/crash.test.ts` (the plan cycle's root and child while they run, through a crash and a
> release apart), one in `run/ladder.test.ts` (a call the attempt REQ-ORCH-088's fallback replaced made) and one in
> `store.test.ts` (v32); the engine's four were red on the code before. **What was not measured.** No built-app proof holds
> a pass open long enough to read the total mid-pass; the orchestrator's duress live run should show `sessions.tool_calls`
> equal to the completed `tool_calls` rows at its deadline. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Corrected 2026-10-06 (fin22).** The first execution counted a child's remainder over its attempts together,
> `Math.max(made, live)`, so an attempt REQ-ORCH-088's fallback replaced with no outcome (its turn raised) hid, behind the
> calls it had completed, a call the retry started and never completed — a replay of `g1` read 1 call where 3 were made
> ([`a-replaced-attempts-completed-calls-hide-the-retrys-unfinished-call-from-the-count.md`](../../defects/fixed/a-replaced-attempts-completed-calls-hide-the-retrys-unfinished-call-from-the-count.md)).
> The remainder is now each attempt's own: its outcome's count less the calls it completed, or, with no outcome, the calls
> it dispatched less those it completed (`unfinished` in `IterationChildren.execute`). Two cases in `run/ladder.test.ts`:
> the raising attempt and the retry's replay (red on the code before), and the replaced attempt's own unfinished call (the
> `spent` limb alone, green before and after).
>
> **Corrected again 2026-10-06 (fin22, repair round 1).** That repair's remainder still lost a call in two shapes, both
> reproduced by the bundle's verifier: a raised attempt's calls were read from `onToolStarted`, which a call answered from a
> replay never fires (attempt 1 completes `g1`, asks for `g1` again beside `boom`, and `boom` raises: 2 counted where 3 were
> made), and an attempt with an outcome kept its first turn's count while its completed calls took in a REQ-ORCH-095
> re-prompt's or OQ-127 corrective turn's that then raised (the re-prompt completes `g1` and `boom` raises: 1 where 2). The
> remainder is now every call the attempt's turns counted, a replay included (`attemptCounted`, told by the turn's new
> `onToolCounted` as it counts each call), less those it completed, with or without an outcome. Two more cases in
> `run/ladder.test.ts`, one per shape, red on the first repair.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: the duress measure.
> At the run's end (no deadline was reached) `sessions.tool_calls` read **303**, equal to the 303 `tool_calls` rows and to
> `root_tool_calls` 63 plus the children's 240 (23, 12, 23, 36, 32, 42, 27, 45); `ring_state` held 303 with 0 dropped. Every
> session of both default packs agrees the same way (at `552d346` edit 13 + 15, requirements 25 + 43, terminal 6 + 15,
> faults-args 1 + 3, resume 6 + 10; at `0bc3eee` edit 11 + 16, resume 6 + 14, requirements 37 + 75). No pack samples the total
> while a pass is still open, so the mid-pass half stays shown by the unit cases alone. Evidence:
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
