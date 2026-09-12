# ADR-0012 — The delegated-child scheduler: a persisted ledger, not a promise graph

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-01, under `owner-decisions.md` **SR-4** (the delegated-child ledger is named in
  that ruling's own table as a database row kind), **SR-1** and **SR-2** (no second process can hold a
  child record), and the amendment of `REQ-SESSION-067` (no save is deferred, parked or coalesced).
  **The decision itself is unchanged — a persisted ledger driven to quiescence, not a promise graph.**
  What changed is the medium, and the medium makes two of this record's mechanisms *stronger* rather
  than merely different: the start claim and the transition function. The crash story changed outright.
- **Origin:** RUNTIME (ADR-RUNTIME-06)
- **Depends on:** ADR-0006, ADR-0008, ADR-0058

## Context

`REQ-MONITOR-014`, `REQ-MONITOR-300`, `REQ-ORCH-040` and `REQ-ORCH-041` fix the child state set
exactly — `queued`, `starting`, `running`, `summarizing`, `waiting_on_dependencies`,
`waiting_on_model_slot`, `succeeded`, `failed`, `cancelled`, `blocked` — with the last four terminal
and **absorbing**, a legal-transition table fixed in full, and `REQ-MONITOR-300` designated the
**single definition** of the machine.

`REQ-MONITOR-016` and `REQ-MONITOR-017`: an attempt to move a child into a state not reachable from
its current one must be **rejected with an error naming both states and must leave the record
untouched** — same state, no completion timestamp, and **no state-change event delivered to any
surface**. Entering a terminal state stamps a UTC completion timestamp.

**`REQ-MONITOR-300` as it now stands admits two *settling* paths from every non-terminal state**, and
names them "the only way a state may be reached that this table does not otherwise allow": cancellation
settles any non-terminal child to `cancelled` (`REQ-MONITOR-209`), and run reconciliation settles any
non-terminal child to the terminal state the run's own outcome dictates (`REQ-MONITOR-211`). Both stamp a
completion timestamp exactly as an ordinary terminal transition does. This is read carefully rather than
in passing: it means the sweeps of `REQ-ORCH-052` and `REQ-ORCH-053` are **inside** the table rather than
exceptions to it, and the transition function therefore needs no bypass. `REQ-ORCH-041` says the same
thing from the orchestration side — cancellation settles a child "from whatever state it is in", so the
sweeps "can never fail partway".

`REQ-ORCH-046`, `REQ-ORCH-038` and `REQ-ORCH-024`: spawn admission runs **five checks in a fixed
order**, the first failure rejecting with no child record and no task id — depth (default 3), total
children (20), active children (6), every `depends_on` naming an existing child of the same parent,
and the new edges closing no cycle. Budget clamps from the playbook cell only narrow.

`REQ-ORCH-049`: a child is started **at most once**, however many scheduling passes are in flight; over
the whole run, `child_start` events per task id are exactly one for a child that started and zero for
one that did not; and a suppressed start must be **recorded** — a `child_launch_suppressed` timeline
event plus a `stale_child_launch_claim` issue naming the child.

`REQ-ORCH-050`, `REQ-MONITOR-015`, `REQ-MONITOR-020` and `REQ-MONITOR-021`: a child over the per-model
cap is **created and held**, reported `waiting_on_model_slot`, never rejected; held children are
released **in the order they were held**, exactly one per terminal transition of a child on the same
model key; a held child that has itself gone terminal is dropped; a child in `waiting_on_model_slot`
consumes no active-child allowance.

`REQ-ORCH-047`: a dependent starts only when **all** dependencies reached `succeeded` **and** stored
their report artifact, with the prior-agent-context block prepended exactly once. `REQ-ORCH-048`: on a
dependency reaching `failed` or `cancelled`, every dependent still in a pre-start state moves to
`blocked`, **transitively**, while a dependent already under way is left to run.

`REQ-ORCH-056`: scheduling continues until **three conditions hold simultaneously** — no outstanding
wait, no undelivered completion notification, every startable child started at least once — and must
then leave the parent idle, with an explicit clause that **the loop must not be able to alternate
indefinitely without some child changing state**.

`REQ-ORCH-052` and `REQ-ORCH-053`: an idempotent finalize-incomplete sweep closes every non-terminal
child as `cancelled` through the normal terminal path, re-checking per record because closing one can
cascade-block another; and on session continue, a run that has just acquired the lock settles every
non-terminal child record **read back from the previous run** to `cancelled` before its first
iteration. `REQ-ORCH-053` no longer describes where that record was read from — it says "the previous
run (e.g. after a killed host or hard cancel)" — and the requirement's own reason for not probing
process liveness, that holding the lock is itself proof, is reinforced rather than replaced by **SR-1**
and **SR-2**: there is no second instance that could still be running those children, and a session is
either live in this instance's run host or it is a persisted record.

`REQ-ORCH-062`, `REQ-ORCH-037`, `REQ-TOOLS-153` and `REQ-TOOLS-156`: there is **one** waiting mechanism
in the product; a parent has at most one wait outstanding; a wait carries **no deadline of its own**,
because the child timeout and the sweeps already bound it, and imposing one is explicitly forbidden.

## Alternatives considered

**A — A promise graph.** Each delegation is an asynchronous function; dependents await their
dependencies; concurrency is a semaphore. Idiomatic, small, and the first thing reached for. It fails
on four hard constraints:

- `REQ-MONITOR-016` requires an *attempted illegal move* to be rejected with a specific error and to
  leave no trace. Implicit control flow has no representation of a move that was attempted and
  refused.
- `REQ-ORCH-049` requires the duplicate-start race to be **observable** — a timeline event and an
  issue. A promise that has already been awaited simply resolves again; the race is prevented and
  invisible, which is not what is asked for.
- `REQ-ORCH-052` and `REQ-ORCH-053` sweep non-terminal records **left behind by a previous run** of the
  same session, whose process is gone. A promise graph has no representation of a child that exists only
  as a record. *SR-4 does not weaken this objection; it sharpens it, because the record is now a row a
  query returns rather than a fragment of a document somebody has to remember to parse.*
- `REQ-ORCH-048` requires the cascade to settle dependents that have not started while leaving started
  ones running. An await-graph cannot distinguish "not yet started" from "started"; a rejected
  dependency propagates to every dependent uniformly.

**B — An actor or queue per child.** Adds a mailbox and a supervisor without addressing the ledger
requirement, since the ledger still has to exist to satisfy the sweeps and the illegal-move rule. The
actor model would be a way of *driving* the ledger, not a replacement for it.

**C — A persisted child ledger with a scheduler run to quiescence.** Chosen.

## Decision

The **ledger is the primary representation**: one **row per child**, carrying the fields `REQ-ORCH-043`
and `REQ-MONITOR-022` enumerate, in the workspace database of ADR-0058, written through the session
writer of ADR-0008. SR-4's table names "the delegated-child ledger" among the session data a row holds,
and the ledger meets that ruling's own principle exactly: only the application reads a child record, and
the record is queried and transactional. Nothing about the ledger's *contents* changes —
`REQ-MONITOR-022` requires the record to expose its fields "to monitoring surfaces" and fixes no medium.

All state change goes through one `transition(childId, to, reason)` function, which is the **sole**
implementation of `REQ-MONITOR-300`. It validates the move, stamps the completion timestamp on a
terminal state, and emits `child.transition`. No second table exists anywhere in the product; every
other domain that names a child state cites `REQ-MONITOR-300` rather than restating it, and the code
mirrors that.

**The transition function becomes stronger under rows, and the strength is worth naming.** The child
row's update and the `child.transition` event are written in **one transaction** by the writer of
ADR-0008, so `REQ-MONITOR-016`'s "leave the record untouched, and no state-change event delivered to
any surface" is no longer a discipline the function must be trusted to keep — a refused move commits
nothing, and there is no interval in which a record has moved but its event has not, or the reverse.
The two settling paths `REQ-MONITOR-300` now admits (`REQ-MONITOR-209`, `REQ-MONITOR-211`) are
implemented as ordinary arguments to the same function rather than as a bypass around it, so the claim
that this function is the machine's *sole* implementation survives the sweeps that previously looked
like exceptions to it.

**The start claim becomes simpler and is now genuinely atomic.** A start is a **compare-and-set on the
child row** — one conditional update that moves `queued -> starting` only where the row still reads
`queued`, and the statement's own affected-row count is the claim's outcome. Under the file design this
"compare-and-set" was a read-modify-write over a document, and its atomicity was supplied by the
writer's serialised queue rather than by the store; the ledger and its guard were the same document,
and two scheduling passes could only be kept apart by the queue that ordered them. A conditional update
needs neither the queue nor the argument. `REQ-ORCH-049`'s "started at most once, however many
scheduling passes are in flight" therefore holds by the store rather than by the scheduler's shape, and
a losing claim is a zero-row result — an observation, which is exactly what `REQ-ORCH-049` asks to be
recorded as a `child_launch_suppressed` timeline event and a `stale_child_launch_claim` issue. **The
suppression record is written in the same transaction as the losing claim**, so a race that is
suppressed can never go unrecorded.

Scheduling is a **pass over the ledger triggered by a state change, not by a timer**. Each pass admits
ready children through the five checks in order, promotes at most one held child per model key per
freed slot, applies the dependency cascade, and repeats until the three-condition quiescence holds.
Promises live only *inside* one child's execution, from `starting` through to a terminal state, which is
where they belong.

**A scheduling pass is not one transaction, and must not become one.** The temptation the store creates
is to wrap a whole pass so that admission, promotion and cascade settle together. That is refused: a
pass may start children, and starting a child is model and tool work that cannot sit inside a write
transaction. Each *transition* is a transaction; a pass is a sequence of them. What the store does buy
is that the pass's reads see a consistent ledger, so the five checks of `REQ-ORCH-046` — depth, total
children, active children, dependency existence, and cycle closure — are evaluated against one state
rather than against a document that may have been rewritten between two of them.

**`REQ-ORCH-151`'s per-run isolation changes shape and gets weaker by construction, so it needs a
test.** Under the file design a run's child records lived in that session's own directory and isolation
was a property of the path. In one workspace-scoped store they are rows distinguished by a session-id
predicate, and a query written without that predicate is a cross-run leak that nothing structural
prevents. `REQ-ORCH-151` requires that "a run's stop reason, terminal status, and the sequence of states
each of its children passes through MUST NOT depend on how many other runs are in flight", which is now
a statement about every ledger query carrying its session id. This is recorded as an obligation, not as
an incidental.

Per-model concurrency caps come from the user's setting, else the provider catalogue entry's
declaration, else uncapped (`REQ-ORCH-050`). Which of those the catalogue declares — a number or a
boolean — is unsettled between `REQ-CONFIG-095`, `REQ-MONITOR-021` and `REQ-PROVIDER-049`; see OQ-6.

## Consequences accepted

1. Every state change is a function call that can fail, and callers must handle the refusal. That is
   the cost of `REQ-MONITOR-016` being observable, and it is the point.
2. The scheduler runs to a fixed point rather than on a tick. `REQ-ORCH-056`'s no-livelock clause
   becomes a **termination proof obligation**: each pass must either change some child's state or
   reach quiescence, so a pass that changes nothing must not schedule another.
3. **The crash story is not the one this record previously accepted, and the change is a specification
   amendment rather than a design choice.** The earlier text read: "the ledger is written through the
   10.0 s debounce like any other state, so a crash may lose up to one debounce window of ledger
   movement". `REQ-SESSION-067` as amended states the opposite in terms — "No save is deferred behind a
   timer, parked, or coalesced with a later one" — and `REQ-SESSION-034` now states the crash-loss
   budget **in saves rather than in seconds**, with `REQ-SESSION-028` making an interrupted save absent
   whole. A crash therefore loses only a transition for which no save was ever requested: an in-flight
   transaction, not a window of movement. `REQ-ORCH-053`'s settle-on-continue survives this unchanged
   and is *not* left without a purpose — it exists for children that were genuinely mid-flight when the
   host died, which is a state no durability rule removes. The instruction not to probe liveness also
   survives, and under SR-1 it is now trivially safe rather than merely justified.
4. The per-model hold queue is FIFO and per model key, scoped per run (`REQ-ORCH-151`), so two
   concurrent runs cannot starve each other of slots. Under one workspace store, "scoped per run" is a
   predicate rather than a partition — see the isolation obligation in the Decision.
5. The hard per-child timeout of 1200 s (`REQ-ORCH-088`), the visibility-only stall watchdog
   (`REQ-ORCH-089`, `REQ-MONITOR-117`) and the unresponsive-model fallback (`REQ-ORCH-090`) all read
   from the `MonotonicClock` port of ADR-0006, so `REQ-ORCH-156`'s controlled-clock conformance covers
   them.

6. **One crash domain replaces twenty small ones.** SR-4's own cost note applies here: a per-session
   directory lost one session's ledger at a time, and a workspace-scoped store is a single corruption
   domain for every session in that workspace. That is scoped rather than solved, and it is stated here
   rather than assumed.

## Revisit if

A requirement appears that needs children to be scheduled across runs — `REQ-ORCH-151` currently
forbids it; or the ledger's write rate at `REQ-MONITOR-285`'s maximum supported agent count makes the
per-transition commit a cost on the scheduling path, which is the trigger that replaces the withdrawn
debounce-dominance one and which nothing has measured; or a requirement gives a child state a meaning
across sessions, which would make the session-id predicate that now carries `REQ-ORCH-151`'s isolation
the wrong shape.

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
issue; a second expiry, or no fallback, fails the child with the `timeout` issue and the report
`Child timed out after <N>s`, as before. **The unresponsive model** (`run/turn.ts` `step`): while the fallback is
untried and `llm_response_timeout` (floored at 30 s) is below the child timeout, a timer on the clock port aborts
a call that produced no part of any kind — the backend now reports the first part through `TurnSink.started`,
so a tool-call-only step counts as an event — and the step re-runs on the fallback (`unresponsive_model_fallback`);
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
`REQ-CHAT-068/069`, `REQ-ORCH-030`; the stall watchdog's badge (REQ-ORCH-089) is not built either.

## Read back from a live run — 2026-09-12: the report's commands and edited files

*This record's Consequences claim "the report's bounded pass with its `summary_failure` fallback" as part of
what it decided, so the defect reports back here. The report's FIELD SCHEMA is not this record's: it is fixed
by `REQ-ORCH-108`..`REQ-ORCH-112` and the specification's "Child report artifact (behavioral schema)", and no
architecture record decides it.*

**Measured.** After a 22-minute run: the child `Create-Architecture-Documentation-Files` wrote five files and
ran eight terminal commands, and reported `edited_files: []` and `commands: []`. The child
`Design-Domain-Model` reported `edited_files: ["Memory: domain-design/core-domain (comprehensive domain model
specification)"]` — a sentence the summarising model composed, where the schema asks for paths.

**Found.** `children/report.ts` hardcoded `commands: []` at all three construction sites — the fallback, the
deterministic tester path and the shaped report — so a field the schema requires was populated nowhere in the
product. `edited_files` was whatever list the summarising model happened to write, and nothing checked it
against what the child had done.

**The falsified reason, kept beside its replacement.** The bounded pass was built on the reading that the
report is the SUMMARISER's account of the child, so every field of it is the model's to fill. That is right
for the summary, the findings, the next actions and the tags, and wrong for the two fields that are facts of
the transcript. It also fails exactly where the report matters most: `REQ-ORCH-110` requires a report even
when the summarising pass FAILED, and a field that only a successful model can fill is empty precisely then.
Restated: **what the child ran and what it wrote are derived from the transcript, not asked of a model.**

**Built.** Two pure functions in `children/report.ts`, applied at all three sites. `commandsFrom` takes the
command from each `terminal` tool-call's own arguments and the exit code from the `[terminal_diagnostic]`
block (`REQ-TOOLS-100`) of the result that answered it, matched by `callId` — null when the block carries
none, which is how `REQ-TOOLS-100` represents a background start or a refused request, and why the field is
nullable. `editedFilesFrom` takes the path of every `write_file`, `haet_edit` and `haet` call under either
argument name the file tools accept, and UNIONS the summariser's own list after it, so a genuine mention it
made survives while an invented one can no longer be the only thing the field holds. No new plumbing: the
call site already derived `toolsUsed` from the same messages.

**The bound, stated rather than hidden.** A context compression REPLACES the conversation
(`REQ-MONITOR-084`), so a child compressed mid-task no longer carries its earliest tool calls in the
transcript the report is built from, and the derived lists are of what survives there. The durable
tool-call record (`REQ-SESSION-133`) would not have that bound; reaching it is new plumbing and was not
taken here.

**Still not built from the schema:** detail payload, created files, artifacts, tests, escalation signal.
`commands` now has a value and no surface reads it yet.
