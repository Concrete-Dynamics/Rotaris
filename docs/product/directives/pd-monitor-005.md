[Product directives](../directives.md) › PD-MONITOR-005

<a id="pd-monitor-005"></a>

### PD-MONITOR-005 — the stall watch counts the silence of the agent's own model steps, and a wait the run holds it in is not that silence

*Revision 2 (2026-10-06, [R-071](../requests.md#r-071)) — **the `stall` issue is written with its warning, not at every
evaluation**, the owner's ruling of OQ-127. A clause is added after the paragraph on the provider library's retries, whose
last sentence is replaced and quoted beside its replacement, and a paragraph each joins "As built" and "Why, and what it
costs". Revision 1 (2026-10-06, [R-071](../requests.md#r-071), the rulings of OQ-155 and OQ-173) is otherwise unchanged.*

The silence REQ-MONITOR-118 and REQ-MONITOR-119 count SHALL be the silence of a model step the agent has in flight. Three
waits are **outside** an agent's stall watch, though the agent has no model event, no token and no tool call in flight
through them:

1. **Between its turns**: from the end of a turn until the run starts its next — the wait on its own children, a resume into
   that wait (PD-ORCH-005 clause 4), or the end of its execution. An evaluation there reports no stall and no wait, logs
   nothing, and invokes the stall callback with *not stalled*; each child it waits on is watched for its own silence.
2. **A wait the run imposes between two model steps**: the retry backoff of REQ-ORCH-092 and the suspended wait on a
   provider limit of REQ-ORCH-091 (c).
3. **A compression's own model call** (REQ-MONITOR-076, REQ-ORCH-093), automatic or on a rejection.

Through 2 and 3, an evaluation past the stall timeout emits no `stall` issue and no stall warning, and invokes the stall
callback with *not stalled*; it logs, in REQ-MONITOR-118's manner, a line naming the wait (`… waiting on a retry backoff`,
`a provider limit` or `a context compression`) where REQ-MONITOR-118's line names the number of active tool calls, at entry
and at each repeat REQ-MONITOR-120's throttle allows, to the session log and with no timeline word. The wait's end restarts
the silence, as a tool call's result does, and so does the next turn the run starts. A stall under way when such a wait
begins, or when the turn ends, is over; it is logged recovered only on REQ-MONITOR-120's terms as OQ-153 reads them, when
the agent was active after the evaluation that last found it stalled.

The provider library's own short internal retries inside one model step are **not** such a wait: they stay counted as the
ordinary silence of that step, and REQ-MONITOR-119 governs them as this directive reads it. Every other clause of
REQ-MONITOR-118 and REQ-MONITOR-119 still governs, but for the cadence of REQ-MONITOR-119's `stall` issue, which the next
paragraph narrows — revision 2.

> *Revision 1 said, and no longer governs:* "and REQ-MONITOR-119 governs them as written. Every other clause of
> REQ-MONITOR-118 and REQ-MONITOR-119 still governs." Revision 2 narrows REQ-MONITOR-119's issue as well (OQ-127).

**The `stall` issue — revision 2.** At an evaluation that finds this silence with no tool call in flight, the diagnostic
issue of kind `stall` SHALL be emitted **only when that evaluation also writes the warning**: at stall entry, and then no
more often than REQ-MONITOR-120 lets the warning repeat (the stall timeout, or 30 seconds, whichever is longer). The issue
carries what REQ-MONITOR-119 lists — the agent's active tools, its recent tool calls and the type of the last model event
— and the silence at that evaluation, at warning severity. The warning is unchanged, and the host's stall callback SHALL
still fire at **every** evaluation, at REQ-MONITOR-117's interval, so a host countdown advances at that rate.

**As built.** `StallWatch.betweenTurns` and `StallWatch.imposedWait` (`packages/engine/src/children/stall.ts`), marked by
`execute` and `Run.turn` (`packages/engine/src/children/orchestration.ts`, `packages/engine/src/run/run.ts`), by
`resilientStep`'s backoff and provider-limit wait (`packages/engine/src/run/ladder.ts`) and by `runTurn`'s `compressing`
(`packages/engine/src/run/turn.ts`); the line is `stallImposedWaitLine`. Revision 2: `stallRecords` in
`packages/engine/src/children/stall.ts`, the one writer for a child's watch and the root's, whose `stalled` sink writes
the warning and the issue together when the evaluation's warning is due, and nothing otherwise.

**Why, and what it costs.** OQ-155 and OQ-173: REQ-MONITOR-118 tells a wait from a stall only by tool calls in flight, so
read literally each of these waits is "the same silence with no tool call in flight", and REQ-MONITOR-119 would have every
evaluation warn that a child waiting as designed on its own children "appears stalled", or that an agent the run itself
holds in a backoff, a provider limit or a compression is stalled, beside the wait's own notice (REQ-NOTIFY-083 to
REQ-NOTIFY-087). The owner confirmed both as built. What it costs: an agent held in one of these waits for longer than it
should be — a compression whose call is slow to answer, an exhausted provider's indefinite wait — is never reported stalled
by this watch; the wait's own bound and its notice are what speak for it.

**Why revision 2, and what it costs.** REQ-SESSION-133 keeps a session's newest 500 issues. With an issue at every
evaluation, one child stalled from its 90 s threshold to its 1,200 s `child_timeout` wrote 223 `stall` issues at the
default 5 s cadence, so two such children, or one with REQ-ORCH-088's fallback retry, could evict every other issue the
session had — the record an autopsy reads to find out what else went wrong. Written beside the throttled warning, the
same stall writes thirteen. What is given up: the issue record no longer holds each evaluation's silence between two
warnings; the agent's live figure (the callback, `stalled Ns` on its row) and the next warning carry it. OQ-127 raised
it; the owner ruled it as recommended. It is a revision of this directive and not a directive beside it because this
directive already narrows REQ-MONITOR-119, and precedence over one requirement must be unambiguous.

> **Narrows:** REQ-MONITOR-118, REQ-MONITOR-119

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the rulings of OQ-155 and OQ-173.*

*Revision 2 raised by the owner, 2026-10-06, ruling OQ-127 as recommended; logged as [R-071](../requests.md#r-071). Built
as `PD-MONITOR-003`, a directive of its own, and made this directive's revision 2 before it landed, once `main`'s
`PD-MONITOR-003` to `PD-MONITOR-005` had landed and this directive narrowed REQ-MONITOR-119 first.*

> **First execution of revision 2, 2026-10-06, built under [R-071](../requests.md#r-071) with OQ-127's ruling:** the rule
> held as written. The watch's reports are written by one function for a child and the root alike (`stallRecords` in
> `packages/engine/src/children/stall.ts`), whose `stalled` sink writes the warning and the issue together when the
> evaluation's warning is due and nothing otherwise; the callback stays the caller's, at every evaluation. **What was
> measured.** `stall.test.ts` (a stall from 90 s to 1,200 s writes thirteen issues, each beside its warning) and
> `children.test.ts` (an end-to-end child stall: issues at 90 s and 180 s only, over nineteen evaluations that found
> it), both red on `37f7a98`. **What was not measured.** No live run: the `faults-stall` scenario's root stall should
> now leave one `stall` issue at 90 s before the 120 s idle bound, where it left one per evaluation. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Measured live, 2026-10-06 (finacc3, finding F14):** the root stall left **one** `stall` issue, at 94 s of silence
> (the evaluation after the 90 s threshold, at the 5 s cadence), beside its one `WARNING` line, before the 120 s idle bound
> gave the call up. The `faults-stall` packs of the orchestrator's default live runs that day (at `c2fdd6a`, 15:47 UTC, and at 17:41
> UTC) already showed one such warning each, but the scenario's check asked only that an issue existed and would have passed one
> per evaluation as well ([`the-faults-stall-check-does-not-assert-the-stall-issue-throttle`](../../defects/fixed/the-faults-stall-check-does-not-assert-the-stall-issue-throttle.md)).
> It now fails a repeat sooner than REQ-MONITOR-120's throttle (`apps/desktop/scripts/lib/stall-issue-cadence.mjs`), and
> `live-run.mjs --only=faults` at `4ddcc02` passed it ("1 stall(s): orchestrator at 94 s"). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
