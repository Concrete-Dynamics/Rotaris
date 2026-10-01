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

The **ledger is the primary representation**: one **row per delegated child**, carrying the fields
`REQ-ORCH-043` and `REQ-MONITOR-022` enumerate, in the workspace database of ADR-0058, written through
the session writer of ADR-0008.

**The run's root execution record is not a row here, and that is a decision rather than an omission**
(recorded 2026-09-13, when `REQ-ORCH-072` was amended for item A4 of the accepted review). The ledger's
membership is what a `delegate` call created; the root is what the run created for itself. Keeping it out
is what makes the counters mean what they say — `REQ-ORCH-046`'s depth, total and active limits count
delegated work, and `REQ-ORCH-050`'s per-model slots are held by agents the scheduler admits — and a root
row would silently consume one of each on every iteration of every run, a `single` run included, where
`REQ-ORCH-025` promises exactly zero delegated children. The surfaces already read it that way:
`REQ-MONITOR-043` and `REQ-MONITOR-089` call it the run's synthetic root and `REQ-CHAT-068` withholds the
delegation-context header from it. What the root does carry is an identity of the same shape — a
canonical name and a task id in this namespace — so a lookup naming it resolves rather than reporting it
unknown, with the parent-scoping of `REQ-TOOLS-155` and `REQ-TOOLS-156` unchanged. SR-4's table names "the delegated-child ledger" among the session data a row holds,
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

*Corrected 2026-09-30 under [R-067](../../product/requests.md#r-067), the claim above kept as it was built:* "the
path of every … call" listed a write whatever answered it. A write a sibling's claim refused (`PD-TOOLS-006`), one
the permission gate or a pre-tool hook refused, or a `haet_edit` whose find text matched nothing changed nothing,
and still reached `edited_files`, the fallback's "Files touched" and, since OQ-111, the facts the pass is told never
to deny. `editedFilesFrom` now skips a write call the record answers as refused, and the summariser's own list cannot
name a path whose every write was so answered
([`a-reports-edited-files-counts-refused-writes`](../../defects/fixed/a-reports-edited-files-counts-refused-writes.md)).
A call no result answers — which the turn never leaves — is still listed. *Falsified by the repair's verification and
kept beside its correction:* this correction first said a write call answered with any error (`isError`) was skipped,
which took a call a rest, a stop or a crash cut off for a refusal. A call that was under way when it was cut off is
answered with an error even when its write had landed (the turn cuts a dispatch that returned `ok` after the pause's
tool deadline), so a call whose result is the `ran` statement of `interruptedResult` (`ranBeforeItWasCut`) is still
listed; only a call cut before it started, or whose approval was withdrawn, is skipped with the refusals.

**The bound, stated rather than hidden.** A context compression REPLACES the conversation
(`REQ-MONITOR-084`), so a child compressed mid-task no longer carries its earliest tool calls in the
transcript the report is built from, and the derived lists are of what survives there. The durable
tool-call record (`REQ-SESSION-133`) would not have that bound; reaching it is new plumbing and was not
taken here.

**Still not built from the schema:** detail payload, created files, artifacts, tests, escalation signal.
`commands` now has a value and no surface reads it yet.

## Read back from a live run — 2026-09-16: the ceiling's graceful arm had never run

`REQ-ORCH-088` names three acts on expiry and this decision built two of them. The fallback retry was
measured at the fourth execution above. The **graceful pause** — the requirement's first clause — was
never built at all, and it took a run on a real endpoint to notice, because every proof of the ceiling
until now asserted the *outcome* (`failed`, a `timeout` issue, the parent still completing) and none of
them asserted what the child got to say on its way out.

**What the run showed.** Run `a26918e8`, 2026-09-16: a `codebase-analyst` child made 96 tool calls,
reached 1200 s, and was aborted where it stood. Its report carried an empty last response and an empty
final response, and its parent — blocked in a `wait_for_tasks` that `REQ-TOOLS-156` deliberately leaves
unbounded — read that as "the work did not happen" and started delegating it again.

**The falsified reason, kept beside its replacement.** The ceiling was built as a cancellation, on the
reading that a child past its budget has nothing further to contribute and the cheapest end is the
safest one. That is wrong in the one way that matters: **the child's account of what it did is produced
at the end of a step, so cutting it mid-step destroys the only thing a timeout was ever going to yield.**
Restated: the ceiling ends the child's *work*, not its *turn* — the turn ends itself, one step later,
and the hard cancel is the backstop for a turn that will not.

**Built.** The ceiling now raises the same `shouldPause` flag `REQ-MONITOR-123`'s pause raises, so the
turn stops before its next model step with its text intact (`run/turn.ts`); the abort is armed
`STOP_GRACE` behind it. `timedOut` is still set at the ceiling and not at the backstop, so the retry
limb and the `Child timed out after <N>s` report are reached identically whether the child landed or had
to be cut. The report's extraction now falls back to the last assistant message that **carried text**
rather than stopping at the last assistant message, which on any tool-using child is the one that spoke
last before opening a call. `REQ-ORCH-110`'s final/last distinction is unchanged and is decided on the
plain last message, so a landed child's words reach `last_response` and never `final_response`.

**The change is observable from outside, which the old proofs were not.** `run/ladder.test.ts`'s
`REQ-ORCH-088` test — written before this and untouched in substance — stopped passing: it advanced the
clock to the ceiling and waited for the run, and the run no longer ended there, because a child holding on
a promise that never resolves is now ended by the backstop rather than by the ceiling. It passes again with
the grace advanced too. That the existing test had to learn the second figure is the measurement: the
ceiling alone had been the whole mechanism.

**One defect found while building it, and it is the kind a test would not have caught.** The window was
first written as `export const CHILD_LANDING_GRACE = STOP_GRACE` in `children/orchestration.ts`, taking
`run.ts`'s constant. `run.ts` imports `children/orchestration.ts`, so across that cycle the constant is
`undefined` at module-initialisation time; the timer was armed with `undefined`, its deadline computed
as `NaN`, and `NaN <= target` is false, so **the backstop never came due and a child asked to land was
never cut off at all**. It was found by the backstop's own regression test hanging. ADR-0014's one 30 s
allowance now lives in `run/grace.ts`, which neither file imports the other to reach.

**Still true, and still not a defect.** The wait remains unbounded and partial results remain
unavailable: `REQ-TOOLS-156` forbids a deadline in those words and `REQ-ORCH-064` blesses the long
block. What this execution changes is what the block is worth at the end of it.

## First execution of the inherited-context path — 2026-09-28: a field the ledger stored and nothing read

`REQ-TOOLS-152`'s `inherited_context` — "ids of already-completed sibling tasks whose reports are carried into the
child without imposing any ordering" — had been accepted by the tool, written to `children.inherited_context` by
this ledger, and resolved by nothing since the ledger was first executed on 2026-09-03. `childPayload` had no place
for `REQ-TOOLS-154`'s item (5); an id naming no task was accepted where the requirement refuses the call. It was
found by reading, while the payload order was being repaired (R-054), and is recorded as
`docs/defects/fixed/the-inherited-context-reports-never-reach-the-child.md`.

**Where the rule was put, and why here.** The refusal is admission's, so it lives in `spawn` after `REQ-ORCH-046`'s
dependency checks and before its cycle check (5), beside the empty-entry refusal that had stood alone: an unknown id
creates no record and issues no id, as every refusal of this ledger does. Existence is asked first, of the session's
child records and of the root execution record, which carries an id in the same namespace (`REQ-ORCH-072`: "a lookup
naming the root resolves to it rather than reporting it unknown"); only an id no task has is refused as referring to
nothing. An id naming a task that exists and has not completed — the root, the caller's own task, or any task that
failed, was cancelled or is still under way, whoever owns it — is ignored, which is what `REQ-TOOLS-152` says of every
such task. The caller's own completed children are carried, since the requirement's own word is "sibling". A completed
task that is not the caller's child is refused, but for ownership, naming its parent as the `depends_on` refusal does
and never as nonexistent; that it is refused rather than carried or ignored is a reading, raised as **OQ-81** (OQ-76 on its branch, renumbered at the merge, OQ-76 to OQ-80 having been taken on `main`).
"Completed" is read as this record already reads it for a dependency: `succeeded` with the report stored, since the
report is the thing carried.

**The first reading, falsified by verification the same day.** The rule was first built as a lookup over the caller's
own children alone, every other id refused with `inherited_context id '<id>' refers to nothing: no task of yours has
that id`, on the argument that every delegation lookup here is parent-scoped (`REQ-TOOLS-155`). The independent
verifier showed three real, unfinished tasks refused that way — the root naming its own id, a depth-1 child naming the
root, and that child naming itself. That falsified the argument twice over: `REQ-TOOLS-152` ignores an id naming an
unfinished task without asking whose it is, and `REQ-ORCH-072` rules that an agent asking about a record it does not
own "is refused for that reason and never told the root does not exist". Parent scoping decides what may be *carried*;
it does not decide what *exists*. The
rendering reuses `reportBlock`, so a child inherits the same block its parent read on the resume, and the block is
rendered at the call — a terminal child's report does not change — and remembered per task id on the same in-memory
terms as the attachment list, so `execute` gained one argument and nothing else while `PD-ORCH-005` rewrites it.
*(Falsified 2026-09-30 — see "First execution of a resumed child's retry payload" below: the in-memory terms held only
while a child could not outlive the run that accepted it. `PD-ORCH-005` let it, and a resumed child's retry in a later
run lost both the block and the attachment list. Both are now stored with the child's record, store v28.)*

**What the first run showed.** Against the scripted model with the session artifact store in place, the `build`
child's payload read (1) the workspace root, (3) the sibling-artifact index the `survey` report had become, (5) the
survey's report block, (6) the task — the first time items (3) and (5) were both present in one payload, and they
stood in `REQ-TOOLS-154`'s order without further change. **Nothing in the mechanism was found wrong**; what the
execution corrected was the test written for it, which had assumed `childrenOf` returns rows in spawn order (it does
not, and no requirement says it should), and which had first been written without knowing the harness holds an
artifact store — the block it expected immediately after the workspace root stood after the index instead, which is
where the requirement puts it. **What it could not show:** the refusal under a real model, and an earlier iteration's
*root* execution record, which is held in memory by the run and not in the store, so an id naming one finds no task
and is refused as referring to nothing; an earlier iteration's children are in the store and are found.

## First execution of a resumed child's retry payload — 2026-09-30: what the launch held in memory

*`REQ-TOOLS-154` fixes the payload a child starts from; this record's inherited-context section above kept item (5)'s
block, and the delegation kept item (4)'s attachment list, per task id in memory "for as long as the run lives". Since
`PD-ORCH-005` a child outlives that run: a paused child is resumed by a later run, whose `IterationChildren` is new. The
first execution of `REQ-ORCH-088`'s fallback retry for such a child reports here, under R-067
(`docs/defects/fixed/a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`, acceptance A25).*

**What the execution found.** A case in `run/ladder.test.ts` drives it through `Sessions` over a real store and the
session's artifact store: a `survey` child succeeds with its report stored; a `slow` child that depends on it, names it in
`inherited_context` and attaches its report is paused mid-step; the Continue action resumes it; its hard timeout expires
and the fallback retries it. The first payload carried REQ-ORCH-047's prior-agent context, the attached report's
`PRIOR AGENT CONTEXT (FULL)` block and the inherited-context block. The retry's payload carried the workspace root, the
sibling index and the task — **none of the three**, and nothing told the child or its parent. The inherited block and the
attachments were in the old run's memory; the prior-agent context was guarded by `children.context_injected`, which the
first run had set, so the retry's `execute` rendered none, where a retry within the first run reuses the block it
rendered.

**What was changed.** Store **v28** appends `children.attach_artifacts` (the call's references as given) and
`children.inherited_context_block` (the block rendered at the call, since a sibling ignored then as unfinished may
complete later and the ids alone would not say which counted). `ChildLedger.spawn` writes both; `IterationChildren`'s
`attached` and `inherited` maps are removed, and `execute`'s `payload()` and `startingPayload` read the row. A resumed
execution's retry renders the prior-agent context again from its dependencies' rows: the block is still given once in the
conversation the payload starts, and never re-prefixed on a state hop (the reading is **OQ-151**). The same case, run
against the unrepaired code,
fails on all three blocks; repaired, the retry's payload equals the first payload exactly. `store.test.ts` pins the
migration and the round trip.

**What was not measured.** No live run: the live-run scenarios never pause a child that attached an artifact and then
time it out on a fallback, and the case above is the whole of the evidence. The `resume` scenario, run against `katalyst`
from this build, passed as regression evidence only: the built app migrated to v28 and resumed two paused children, which
attached and inherited nothing and were not retried. A row written before v28 carries neither, and
its retry in a later run carries none, as before. A dependency followed up (`PD-ORCH-005` clause 22) between the first
payload and a later run's retry is rendered as it now reads. The row is in
[`../first-executions.md`](../first-executions.md).

## First execution of the stall watchdog — 2026-09-29: consequence 5's watchdog, and the message it makes possible

*Consequence 5 names the visibility-only stall watchdog (`REQ-ORCH-089`, `REQ-MONITOR-117`) beside the hard timeout,
reading from the `MonotonicClock` port. It was never built until now: the paragraph above records its badge as unbuilt,
and `a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md` recorded the watchdog and
`REQ-NOTIFY-111/112`'s recovery as unbuilt too. So its first execution reports here, under R-067.*

**What was built.** `children/stall.ts`'s `StallWatch` runs once per attempt of a child's execution, beside the hard
timer, on the clock port. It reads the threshold consequence 5 names: the role's override, else
`runtime.child_stall_timeout`. It never cancels. REQ-NOTIFY-112's recovery reads the same watch: a child whose turn
failed after no output for the whole window is given one corrective message and carries on. The readings, including
what ends a silent step when the watch cancels nothing, are OQ-127.

**What the execution found.** The decision held: consequence 5's premise was true, and the watchdog needed nothing but
the clock port and the child's own events. Three things the record did not anticipate:
- **No port carried a model event.** The model's sink reported text, reasoning, usage and the first part of a step
  only, so a model streaming a long tool call's arguments would have read as silent. `TurnSink` gained an optional
  `event` for every part, the one change outside the engine.
- **Every tool call's start** had no hook either. `TurnDeps.onToolStarted` was added, since REQ-MONITOR-118 tells a
  wait on tools from a stall only by the calls in flight.
- **Once per child is not structural.** Within one attempt, a single corrective turn follows the first. REQ-ORCH-088's
  fallback retry is a second attempt of the same child task, though, so the once-per-child count is state the execution
  keeps across attempts. The ladder test that pins it fails without that state.

**What was measured.** Unit cases over `FakeClock` in `stall.test.ts`. End-to-end cases through `Sessions`, six in
`children.test.ts` and two in `ladder.test.ts`: the stall warned while the child runs, the message and the success
that follows, no second message, the window at 29 s against 30 s, waiting on a tool call, the recovery, the fallback
retry and the role's window. Each positive case fails with its limb reverted.

**What was not measured.** No built app and no live run: the live run's `faults` scenario stalls the root's stream,
not a child's. The badge the callback exists for is not wired to any host. The root is not watched. The row is in
[`../first-executions.md`](../first-executions.md).

**Corrected in place by the verifier's first round, 2026-09-29.** The build first wrote the `stall` issue only with
each throttled warning, on the reasoning that an issue every 5 s would evict the session's other issues from
REQ-SESSION-133's ring. That reasoning narrowed REQ-MONITOR-119's "every stall evaluation", whose throttle
(REQ-MONITOR-120) bounds only "the warning itself", so it is kept here as the falsified reason: the issue is now
written at every evaluation, and the eviction is left to a ruling in OQ-127. The same round recorded in OQ-127 that
three of the timeline words the watch and the recovery write are outside REQ-ORCH-139's closed vocabulary.

**Corrected in place by the verifier's second round, 2026-09-29.** Two claims above were narrower than they read.
"Once per child … state the execution keeps across attempts" is true of REQ-ORCH-088's retry and false of PD-ORCH-005's
resume, which is a new execution of the same task: a paused and continued child was given a second message. The count
is now read, at a resumed execution's start, from the task's whole conversation record. And the silence the recovery
reads started again only at the attempt's start, a tool result and the corrective message, so a child that waited on its
own children past the window was blamed for the wait; every turn the run starts for the child now starts it again.
Neither changes the decision: the watch still reads only the clock port and the child's own events. The three timeline
words are no longer written: they are session-log lines through the run's `warn`, as OQ-76's are, the reason for
minting them (that the log was out of reach without editing `Run.turn`) having been false. `children.test.ts` now has
nine cases, `stall.test.ts` twelve, and `record.test.ts` one more.

**Repaired in place by acceptance finding A7, 2026-09-30.** The watch's own evaluation still read the time since the
child's last event, so a child waiting on its own children between its turns had a `stall` issue at every evaluation
past the window, and the warning, while it worked as designed. The turn's end is now fed to the watch too
(`betweenTurns`), and until the run starts the next turn no silence is counted. The decision stands: the watch still
reads only the clock port and the child's own events. The reading is OQ-155's; `children.test.ts` has ten cases for the
watch and `stall.test.ts` fourteen, each new one failing with the limb reverted. *Corrected in place the same day:* an
execution resumed into waiting (PD-ORCH-005 clause 4) ends no turn before its wait, so the turn's end never marked it and
the wait was still counted; `execute` now marks such an execution between turns as its watch is armed, and
`children.test.ts` has eleven cases for the watch.

## First execution of the process-wide count — 2026-09-30: the cap was one iteration's

This record put the ledger in **one session's rows** and said nothing of a count across sessions; `REQ-CONFIG-094` counts
every child on a `models:` entry "across the whole process … children belonging to any other session running in the same
process". The run host holds every live session at once (ADR-0013), so the two disagree the moment two sessions run.
Acceptance round 1 (finding A13) confirmed it by driving it: two sessions in one `Sessions`, one key with `max_parallel`
1, the first session's child holding its slot — the second session's child started and ran to `succeeded` beside it
(`packages/engine/src/children/children.test.ts`, "acceptance A13 …", red before the repair).

**What changed, and what did not.** The ledger is still one iteration's rows and the held-child queue is still each
session's (`model_slot_queue`). What the cap is judged against is now the process's count: `ModelSlots`
(`packages/engine/src/children/model-slots.ts`, held by `Sessions`) is joined by every run for as long as it is under way,
each run answering how many of its own children hold a slot on a key (`ChildLedger.slotsInUseHere`), and
`ChildLedger.slotsInUse` adds the others' (`slotsHeldElsewhere`). A child's terminal state wakes every other run's
scheduler for one pass (`onSlotFreed`), and so does a run's end — without the wake, a session whose root is waiting on its
held child never passes again, which the case pins (it times out with the wake removed). The count is process state,
held in memory: a slot is a live child, and no child outlives its process (REQ-ORCH-053).

**Corrected in verification, the same day: a paused child keeps its place.** The paragraph above said `ModelSlots` "is
joined by every run for as long as it is under way", each run answering for children in `starting`, `running` or
`summarizing`. That was falsified by the branch's own verifier: a `paused` child was counted by nothing, and a run coming
to rest left `ModelSlots`, so with `max_parallel` 1 a paused session's slot went to another session's child, and a
Continue then resumed the paused child into `running` beside it — two slots on a key capped at 1, the defect this repair
exists for, reached through PD-ORCH-005's pause and continue. PD-ORCH-005 clause 4 says each resumed agent "keeps the place
in every child limit it already held", so the replacement reads it literally (**OQ-149**): a child `paused` out of
`running` or `summarizing` (its `resume_state`) holds its slot while its session rests (`holdsModelSlot` in
`children/ledger.ts`, which `ChildLedger.slotsInUseHere` now uses), and it is **each session**, not each run, that joins
`ModelSlots`: `Sessions` joins a session when a run of it starts or continues, answers for it from its store (every child
of the session that holds a slot), and lets it go only when no run of it is under way and none of its children holds a
place. A decline (clause 6) or a cancel at rest (clause 16) gives the place up and wakes the others. Three cases beside
the first two pin it (`children.test.ts`, "PD-ORCH-005 clause 4 / 6 / 16 …"), each red with its half of the repair
removed. A paused session therefore holds its places until it is continued, declined or cancelled; a session paused by
an earlier process holds none until a run of it starts in this one (OQ-149 states both).

**Three edges the count leaves, recorded rather than repaired.** (1) The key is the string alone: sessions of two
workspaces whose configurations define different entries under one key share a count, each judged against its own
session's cap (**OQ-150**). (2) A promoted child that `startOne` refuses on `maxActive` sits `queued`, which holds no
slot, so another session's pass in the same wake may take the slot — the edge one session already had, now across
sessions. (3) Every `slotFree` check reads each other joined session's children from its store: one query per session
per scheduling decision, which is nothing at today's scale.

**What was not measured.** No built app or live run starts two sessions at once: the live run's scenarios are one session
each and one endpoint is registered. `pnpm mission-proof`, whose scenario holds children behind a `max_parallel: 1` cap in
one session, shows that path unchanged. The release order across sessions is **OQ-148**. The rows are in
[`../first-executions.md`](../first-executions.md).

## First execution of REQ-ORCH-098's teardown for a child the scheduler settles — 2026-09-30

*The first execution above lists "REQ-ORCH-098's teardown entries" under the child's execution, and the cascade and the
finalize sweep under the scheduler. A child the scheduler settles has no execution to end, so it was never torn down.
Acceptance round 1 found it (finding A16,
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](../../defects/fixed/a-child-that-never-started-gets-no-teardown-timeline-entries.md)),
and its repair reports here, under R-067.*

**What the execution found.** Two cases through `Sessions` over a real store: a child blocked by its dependency's failure,
and the explicit cancel's finalize sweep over a child held on its model slot and one mid-step. On the unrepaired code
none of the three children got a `child_end`, `child_result` or `child_conversation_closed`. The third was not in the
note: the sweep can cancel a child whose execution is still returning, and that execution, finding its record terminal,
writes nothing. The decision held: the teardown belongs with the settle, and the scheduler's two settles lacked it.

**What was changed.** `SchedulerDeps.teardown`, called by both settles after the report is stored and before the terminal
callbacks, the order a child's own settle keeps. `IterationChildren` answers it with `writeTeardown`, now the one writer of
the three entries for every settle. The reading, that a child that never started is torn down as any, is **OQ-152**.

**What was not measured.** No built app or live run: none reliably blocks a child or cancels one held on its slot. The
cancel paths outside the scheduler and the execution still write no teardown, and are a note
([`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`](../../defects/a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md)).
The row is in [`../first-executions.md`](../first-executions.md).

## The stall callback reaches a host — 2026-09-30: the watchdog's badge, the root's watch and the steer

*The first execution of the stall watchdog above left three things unbuilt: its callback reached no host, so no badge drew;
the root was not watched; and REQ-MONITOR-135's stall-evaluation leg (ADR-0010 reading (d)) had nothing to hang on.
Acceptance round 1 found them together (finding A6,
[`a-stalled-child-is-never-shown-stalled.md`](../../defects/fixed/a-stalled-child-is-never-shown-stalled.md)), and their
first execution reports here, under R-067.*

**What was built.** Every evaluation hands the host the agent's silence while it is stalled, else null; it is kept beside
the agent's tool activity and carried as `AgentRecord.stalledSeconds`, the root's as `SessionRecord.entryStalledSeconds`,
and the record is republished whenever it changes (`ProjectionOwner.refreshRecord`). The agent trees, the Mission table,
the persona window and the inspector draw it. `Run.turn` arms a watch for the root over its whole execution. An evaluation
that finds a steer pending for an agent waiting on its own children wakes it to take a step. The readings are **OQ-153**.

**What the execution found.** The decision held: the callback needed only a place to put the figure and a way to publish
it, both of which the activity tracker and the projection owner already had. Three things the record did not anticipate:
- **The root's wait on its children is not silence.** A root watched over its whole execution reads every wait on its
  children as a stall. The watch counts nothing between the root's turns (`betweenTurns`, the mechanism another branch of
  this round builds for a child's own wait).
- **Within a turn, an evaluation has nothing to inject.** The step boundary already delivers a steer at the next step, and
  nothing may join a conversation between a call and its result. What the evaluation leg adds is the agent with no next step
  coming: one waiting on its children.
- **A stall can end with the watch.** The live run's root answered on the retry and its turn ended before the next
  evaluation, so its stall was never logged recovered. ~~`StallWatch.stop` now reports a stall under way as recovered.~~
  *(Corrected 2026-09-30 by acceptance round 1's verifier: reported so, a cancelled, stopped, paused or timed-out stalled
  agent was logged "active again after a stall", which it was not.)* `StallWatch.stop` ends a stall under way and reports
  it recovered only when the agent was active after the evaluation that last found it stalled — a model event that is not
  an error, or something the run gave it; the same holds at an evaluation that finds the agent between its turns.
- **A resumed root can begin between its turns.** A root resumed into waiting (PD-ORCH-005 clause 4) takes no step until a
  child's report; its watch, armed as its execution began, counted that wait as silence until `Run.turn` marked it between
  turns from the start (found by acceptance round 1's verifier).

**What was measured.** Four end-to-end cases through `Sessions` in `children.test.ts`: a child's figure published at 90, 95
and 100 s and cleared; the root's warning, `stall` issue, figure and recovery; a root waiting on a working child writes no
`stall` issue; a steer to the waiting root lands at the next evaluation, before its child ends. Three fail on the
unrepaired engine, and the fourth fails with `betweenTurns` removed from the root. `stall.test.ts` pins the refresh a
delivered steer makes and the recovery at `stop` — reported only after activity since the stall (the verifier's
round added a cancelled stalled root with no recovery line and a root resumed into waiting with no `stall` issue to the
end-to-end cases); `agent-clock.test.ts` and `agents.test.ts` the badge on each surface. The
live run's `faults` scenario against `katalyst` (packs `2026-09-30T21-36-48-442Z` and `2026-09-30T21-42-06-872Z`) stalls
the root's stream: the root's watch wrote its `stall` issues from 94 s, inside the product's 120 s idle bound, where before
nothing was written until the bound fired. The second pack, built after the `stop` repair, logs the recovery 30 s later, and
its photograph at 115 s shows the inspector following the root with `running · 1m 53s · 0 tool calls · stalled 104s`. The
line broke between `stalled` and its figure, so the badge's text now joins them with a no-break space; that change came
after the pack and is pinned by `agent-clock.test.ts` only.

**What was not measured.** No live scenario stalls a child's stream, so a child's badge is shown by the cases alone. No live
scenario steers an agent waiting on its children. The row is in [`../first-executions.md`](../first-executions.md).
