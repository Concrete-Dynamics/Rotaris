# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph — First execution — 2026-09-03, the ledger with children in it

Part 6 of 14 of [ADR-0012](../0012-the-delegated-child-scheduler.md), which indexes every part.

## First execution — 2026-09-03, the ledger with children in it

*Recorded under GD-10.*

**Built and run:** store v5 (`children`, `model_slot_queue`; no index — every query is a primary-key range or one
session's scan, and REQ-ORCH-151's isolation is a predicate a test asserts over the DAL's statement text: every
statement over these tables carries `session_id`); `contracts/src/children.ts` holds REQ-MONITOR-300's table AS
DATA and the two settling paths as arguments; the writer's `transitionChild` is the SOLE implementation — it
validates, stamps the completion timestamp, writes the row and `child.transition` in ONE transaction, and a
refused move commits nothing and names both states; `claimChildStart` is the one conditional update
`queued → starting` whose affected-row count is the claim, with the losing claim's `child_launch_suppressed`
entry and `stale_child_launch_claim` issue IN THE SAME TRANSACTION (verified: two claims, one `child_start`, one
suppression). `engine/src/children/`: admission (the five checks in order, aliases, naming with the 80-character
digest suffix), the scheduler as a pass to quiescence triggered by a state change and never a timer (cascade
`blocked` transitively, admit on `succeeded` + report stored, promote one held child per freed slot in the order
held dropping a terminal one, start claimed children; a pass that changes nothing schedules no other), the one
waiting mechanism with no deadline, the child's execution (REQ-ORCH-088's 1,200 s on the monotonic clock, one
re-prompt for no activity, `summarizing` until the report exists, REQ-ORCH-098's teardown entries), the report's
bounded pass with its `summary_failure` fallback, the parent's resume loop, the finalize sweep at every iteration
exit, and the settle-on-continue sweep. Verified in the built app: a delegation that wrote a file through the gate;
a failed dependency blocking its dependent without a start; a cap of one parking the second child; a stop mid-child
settling it `cancelled` with a report.

**One reading, recorded because two requirements draw the slot differently.** `REQ-ORCH-050` caps children "in
`starting` or `running`"; `REQ-MONITOR-020` says "only running and summarizing agents count against the per-model
cap". Read together: a slot is HELD from the claim (`starting`) until the terminal state (through `summarizing`),
and it FREES when a running or summarizing child ends. Counting `starting` is what stops two children claimed in
one pass from both running under a cap of one; the first execution with the literal reading of REQ-MONITOR-020
did exactly that — the second child was started because the first was still `starting` — and the test now pins
the reading.

**Found — REQ-ORCH-053's settle-on-continue has no route in the product today.** Every prompt mints a new session
(`REQ-CHAT-011`'s "with no session"); the `continue` and `resume` controls are not built, so no run ever takes
the lock of a session a previous run left children in. The sweep exists and is tested against a hand-planted
`running` row; it is reachable only from a test until those controls land. Reported here, not repaired: the
sweep is the specified mechanism and the missing route is the map's.

**Consequence 2's termination obligation** is met with a belt: the pass ends when nothing changed, and a guard
at 10,000 rounds warns and stops rather than spins. **Consequence 6** (one crash domain) is unchanged and untested.
**Not built:** the loop supervisor (REQ-ORCH-099..107), the fallback model and rate-limit paths (REQ-ORCH-090/091),
the artifact index and attachments in the payload (ADR-0041), the verifier prefix, the delegation-context header
row and the scope toggle (REQ-CHAT-068/069), the three-failed-attempts refusal per todo item (REQ-ORCH-030 — the
loop's todo is the run's, not yet the coordinator's).

**Second execution, 2026-09-04, the BUDGET clamp (REQ-ORCH-024).** The fixed `normal` cell that stood in
for the playbooks is gone: the run clamps the configured policy by the entry role's resolved BUDGET variant
— `tight` {2, 6, 2}, `normal` {4, 12, 3}, `wide` no clamp — and with no pre-flight the configured policy stands
unchanged. In the built app a `question` (the answer group, `tight`) admitted two children and refused the
third with `Max active children 2 exceeded`. **Found: nothing.**

**Third execution, 2026-09-05, the sweep's route and the supervisor.** The finding above is closed: `continue`
exists — `Sessions.prompt` on a loaded session appends the row and starts a run on the same session, and
`Sessions.resume` claims the lock of a stored one — and the settle-on-continue sweep ran in the built app on
the product's route: a `running` child row planted after a completed run was `cancelled`, with its report,
before the first continuation iteration (`pnpm part-h-proof`; `REQ-ORCH-053`, `REQ-SESSION-065`). The loop
supervisor is built and recorded as ADR-0059, which holds the tenth defect of the pattern. Still not built
from the list above: the fallback model and rate-limit paths, ADR-0041's artifacts, the verifier prefix,
`REQ-CHAT-068/069`, `REQ-ORCH-030`.

**Fourth execution, 2026-09-05, the child's fallback routes (Part Q; REQ-ORCH-088/090/144, REQ-CONFIG-110/114).**
The first-execution note above said "REQ-ORCH-088's 1,200 s on the monotonic clock" and nothing about the
requirement's second clause; the timeout's expiry failed the child unconditionally. Now every child runs under
one **resilience cell** (`run/ladder.ts`): its model choice, its role's fallback, and one "attempted" mark shared
by the two routes REQ-ORCH-144 names. **The hard timeout** (`children/orchestration.ts`, `execute`): on expiry,
when the role has a fallback not yet attempted for this child, the child is run once more on it — a fresh
controller, a fresh timer, the same task payload — with the `child_timeout_fallback` timeline entry and warning
issue *(renamed 2026-10-01 to REQ-ORCH-139's words, the `fallback_model` entry and the `timeout_fallback` issue — acceptance
A29, OQ-157)*; a second expiry, or no fallback, fails the child with the `timeout` issue and the report
`Child timed out after <N>s`, as before. **The unresponsive model** (`run/turn.ts` `step`): while the fallback is
untried and `llm_response_timeout` (floored at 30 s) is below the child timeout, a timer on the clock port aborts
a call that produced no part of any kind — the backend now reports the first part through `TurnSink.started`,
so a tool-call-only step counts as an event — and the step re-runs on the fallback (`unresponsive_model_fallback`; *`llm_unresponsive` since 2026-10-01, A29*);
the child keeps running. **The role's fallback** is `personas.<role>.fallback_model` when stated (REQ-CONFIG-110),
else the run-level `fallback_model` slot (REQ-CONFIG-065/067 name that slot as the retry "when a child's model
fails to answer within the configured limits"), and never the child's own model — a slot that resolves to the
same pair arms nothing. The same cell carries the rate-limit ladder for the child's own calls (ADR-0027's note).

**Found — `runtime.child_timeout` never reached the run.** The loader read it since Part C and the engine took a
`childTimeoutMs` dependency since the first execution, but no root passed one: every child ran under the
engine's 1,200 s constant whatever the file said. Wired through `RuntimePosture.childTimeoutMs`; the proof's
child timed out at the configured 8 s. (The manager numbers it.)

**Measured** (`packages/engine/src/run/ladder.test.ts`, FakeClock; `pnpm resilience-proof`, launches 5 and 6): a
child hung on `alpha` for 10 s (unit) / 8 s (app) was retried once on `beta` and succeeded, its first two calls
`a1, f1`; without a fallback it failed with `Child timed out after 10s` / `8s`; the unresponsive timer fired at
exactly 30 s and not at 29.999 s, and stayed unarmed when no fallback existed or the threshold was not below the
bound. The re-prompt of REQ-ORCH-095 still follows a text-only implementer on the fallback (one more call, on
the fallback still). Still not built from the list above: ADR-0041's artifacts, the verifier prefix,
`REQ-CHAT-068/069`, `REQ-ORCH-030`; the stall watchdog's badge (REQ-ORCH-089) is not built either. *(2026-09-29: the
watchdog itself is built, and its badge still is not. See "First execution of the stall watchdog" below.)* *(2026-09-30:
the badge is built. See "The stall callback reaches a host" below.)*
