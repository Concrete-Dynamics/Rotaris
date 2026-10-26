# Open questions — Specification questions (26 of 27)

Part 31 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-147, OQ-151 – OQ-155.

**OQ-147 — What exit status does a soft-paused command report when it ended without printing its own?**
*(REQ-TOOLS-098, whose advice is to interrupt a paused command with `C-c` and `is_input=true`; REQ-TOOLS-179, which
names −1 for a soft pause in the foreground and for a kill in the background, and otherwise the command's real outcome.
Raised 2026-09-30 by the verification of acceptance finding A10,
[`keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md`](../../defects/fixed/keystrokes-left-without-enter-leak-a-paused-commands-end-marker-into-the-next-output.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-144 on its branch, renumbered OQ-147 at the merge,
OQ-143 to OQ-145 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a soft-paused command that ended without printing its own status is handed over with exit −1, its reason as an `execution_error`, and its output up to the next call's start marker. *(Measured on Windows 2026-10-15, Windows 11 ARM64, pwsh 7.6.6 and 5.1: there a poll after C-c finds no end — OQ-168's ruling writes nothing to look for one — so it stays the soft pause, and the next command hands over "with no exit status of its own", which is this reading reported one call later.)*

An interactive `sh` that takes the interrupt abandons the rest of the wrapper's line, so the paused call's end frame,
which carries `$?`, never prints. The shell reaches the next call's line only once the paused one is done, so that
call's printed start marker is where the paused call is known to have ended (~~that call's end frame~~, the first
repair's reading, falsified by A10's second verification: the paused call went on collecting until then, and a long
next call scrolled the cut off its screen). Its real status is not in the stream. The shell's
`$?` at that moment would say it (130 under `sh` for an interrupt), but the next wrapper's first statement replaces
it before anything prints. No requirement names a status for a foreground command that ended and reported none: −1
is the soft pause's in the foreground and the kill's in the background, and 0 or another number claims an outcome
nobody measured. Before A10's repair the paused call borrowed the next call's status, 0 for `echo AAA`.

**What the build proceeds under:** the poll that hands such a call over reports it the way a kill from the terminal
window is reported: exit −1, not a soft pause, with the reason as its error ("the paused command ended without an exit
status of its own: the shell abandoned the rest of its line, as an interrupt (C-c) makes it do, before the next command
ran"), so its `failure_kind` is `execution_error`. Its output is what it wrote up to the next call's start marker:
collection stops there, and the echo of that call's wrapper is dropped whole. `terminal.test.ts`'s cases
"REQ-TOOLS-098/127/179 (A10): a soft-paused command interrupted with C-c …", "REQ-TOOLS-098/127 (A10): after C-c, a
next call longer than …" and "REQ-TOOLS-127 (A10): the echo of a next call wider than the screen …" pin it. *(Since 2026-10-01 the next call that closes such
a paused call hands it over itself, under OQ-164's reading. Its observation's detail says the paused command
ended "with no exit status of its own", and what the command wrote follows the detail. The poll's reading above still
holds for a poll that closes it. The A10 cases now read the hand-over from that call. A soft pause queued behind the
interrupted one, OQ-164's arrangement, briefly re-opened this question's defect: the poll looked for the end only of the
polled call, which is queued behind the interrupted one, and read "still running" over a dead command. It was corrected
before its merge: the poll looks at every open paused call, its no-op line closes them all, and a line the interrupt
discarded is reported as never run (OQ-164's reading). ~~Its no-op line closes them all~~ was still false while the
interrupt marked the interrupted call alone: when that command survived the interrupt and ended on its own, the queued
call, unmarked, read "still running" on every poll. Found by the second verification on 2026-10-01 and corrected before
the merge: the interrupt marks every open paused call.)*

**What a ruling decides.** Which exit status and outcome that poll carries: −1 with the reason, as built; a status
the product recovers from the shell (which would need the wrapper to carry the previous `$?`, on both backends); or a
dedicated value. ~~A poll made after the `C-c` but before any next call still reads "still running", because nothing in
the stream says the line is done; that is recorded as a defect, not this question~~
([`a-poll-after-c-c-says-the-interrupted-command-is-still-running`](../../defects/fixed/a-poll-after-c-c-says-the-interrupted-command-is-still-running.md)).
*(Repaired 2026-10-01: a poll after an interrupt submits one no-op line once the shell holds its terminal again, and that
line's printed start marker closes the paused call as a next call's does, so the poll hands it over with this reading;
whether the product may write that line is OQ-168, raised with it built.)*

**OQ-151 — Does a retry that restarts a child's conversation carry REQ-ORCH-047's prior-agent-context block again?**
*(REQ-ORCH-047, "prepend exactly once (never re-prefixed on later state hops …)"; REQ-TOOLS-154, which places the block
ahead of item (1) of the payload; REQ-ORCH-088's fallback retry; PD-ORCH-005 clause 4. Raised 2026-09-30 by the repair of
acceptance finding A25,
[`a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md`](../../defects/fixed/a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-148 when it was raised, renumbered OQ-151 at merge
once origin/main's OQ-148 to OQ-150 had landed.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: REQ-ORCH-047's block is given once per conversation a payload starts, so a retry, in the first run or a later one, renders it again from its dependencies as they read at the retry.

REQ-ORCH-088's retry starts the child's conversation again from its payload, so whatever the first attempt was given is
gone from what the retry's model reads. Within the run that started the child, the retry has always reused the block the
first attempt rendered, so a dependent child's retry reads its dependencies' findings again. A child PD-ORCH-005 resumed in
a later run found `children.context_injected` set by the first run and rendered none, so its retry read none. "Exactly once"
could mean once per child task, which the retry breaks in both runs, or once per conversation the payload starts, which
the resumed retry broke the other way.

**What the build proceeds under:** once per conversation a payload starts. A resumed execution's retry renders the block
again from its dependencies' rows, as a retry within the first run reuses it; no state hop re-prefixes it, and a resumed
child's first attempt, which carries on from its record, is not given it again. A dependency followed up (PD-ORCH-005
clause 22) between the first payload and a later run's retry is rendered as it reads at the retry. The case
"REQ-TOOLS-154 with PD-ORCH-005 (the repair of a-resumed-childs-retry-payload-loses-its-attachments-and-inherited-context):
…" in `packages/engine/src/run/ladder.test.ts` pins it.

**What a ruling decides.** Whether a retry is given the block again (as built, in both runs) or never (in neither run,
which a retry within the first run would then also have to change), and, if again, whether a dependency's report is read
as it stood at the first payload or as it stands at the retry.

**OQ-152 — Does a child that never started owe REQ-ORCH-098's teardown entries?** *(REQ-ORCH-098, "Whatever terminal
state a child reaches, and whether or not its execution raised, that child MUST be fully torn down: its conversation is
closed, a `child_conversation_closed` timeline event is emitted for it, …"; REQ-ORCH-048, whose cascade settles a child
`blocked` before it starts; REQ-ORCH-052's finalize sweep. Raised 2026-09-30 by the repair of acceptance finding A16,
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](../../defects/fixed/a-child-that-never-started-gets-no-teardown-timeline-entries.md),
under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: every terminal child is torn down alike, a child that never started included, whose `child_conversation_closed` records that it will have none.

A child the cascade blocks, or one the finalize sweep cancels while it waits on its dependencies, in `queued` or on its
model slot, reaches a terminal state without its execution ever starting, so it never had a conversation. The build
first read that as nothing to close, and wrote no `child_end`, `child_result` or `child_conversation_closed` for it; that
reading was stated only on the fixed note
[`a-child-blocked-by-its-dependency-gets-no-report.md`](../../defects/fixed/a-child-blocked-by-its-dependency-gets-no-report.md).
The requirement's "whatever terminal state" does not except a child that never started, and it does not say what closing a
conversation that was never opened means.

**What the build proceeds under:** every terminal child is torn down alike. A child the scheduler settles itself —
`blocked` by the cascade, or `cancelled` by the finalize sweep, started or not — gets the three entries in the same words
and order as a child whose execution settles it, with its report's status and summary, before the terminal callbacks
resume its parent (`SchedulerDeps.teardown`, `writeTeardown` in `children/orchestration.ts`; the two cases "REQ-ORCH-098,
the repair of a-child-that-never-started-gets-no-teardown-timeline-entries" in `children/children.test.ts`). For a child
that never started, `child_conversation_closed` records that it will have none; no conversation is created to be closed.
Since 2026-10-01 the same holds on every path that settles a child `cancelled` outside its execution. These are the
user's cancel, the cancel at rest, "continue without them", the crash record of an accepted cancel and the stale-child
settle (`writeCancelledTeardown`; `writeTeardown` now lives in `children/ledger.ts`). That change is the repair of
[`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`](../../defects/fixed/a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md).

**What a ruling decides.** Whether a child that never started is torn down as built, or is excepted from the clause (its
`child_end` and `child_result` kept, its `child_conversation_closed` dropped, or all three dropped), and whether the words
of its `child_conversation_closed` should then say it never had one.

**OQ-153 — What does a host do with the stall callback, which agent is watched, and what does a stall evaluation inject?**
*(REQ-ORCH-089, "a stall callback fires on each evaluation with stalled/recovered so a UI badge can update";
REQ-MONITOR-117, "each agent is evaluated for a stall"; REQ-MONITOR-118 to REQ-MONITOR-122; REQ-MONITOR-135, injection
"opportunistically from stall evaluations … while a conversation is running"; REQ-MONITOR-047; ADR-0010 reading (d);
OQ-127. Raised 2026-09-30 by the repair of acceptance finding A6,
[`a-stalled-child-is-never-shown-stalled.md`](../../defects/fixed/a-stalled-child-is-never-shown-stalled.md), under
[R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the stall badge (`stalled Ns`, `tag-wait`) on the agent trees, the Mission table, the persona window and the inspector; the recovery notified by the republished record alone; the root watched against the one stall timeout; and an evaluation waking an agent that waits between its turns on its own children to inject a pending steer. Whether the recovery also gets a timeline word is the timeline vocabulary's ruling (OQ-127, OQ-157), not this one's.

The requirements name a callback, a badge, a host countdown and a recovery that is "notified", and say nothing of what
this product's surfaces draw (REQ-SHELL-023's surfaces have no stall clause; REQ-TUI-139's activity text belongs to the
retired terminal domain). They say each agent is watched, and fix the threshold only as "the stall timeout (default 90
seconds, overridable per persona)". And they place an injection in the stall evaluation without saying what can be
injected into a conversation whose model step or tool call is in flight.

**What the build proceeds under.**
- **The callback reaches the record.** Every evaluation hands the host the agent's silence while it finds it stalled, and
  null otherwise. The figure is kept beside the agent's tool activity (`AgentActivity.stalled`) and carried as
  `AgentRecord.stalledSeconds`, and the entry agent's as `SessionRecord.entryStalledSeconds`. The record is republished
  whenever the figure changes (`ProjectionOwner.refreshRecord`, coalesced with the child and tool events of the interval):
  at every evaluation of a stall, since the figure advances, so the countdown advances at the watch's cadence and not on a
  surface's clock (REQ-MONITOR-119); and once at the recovery, when it clears.
- **The badge.** The Workspace and Mission agent trees, the Mission table and the persona window draw `stalled Ns` in the
  design system's `tag-wait`, as the mockup's agents panel qualifies a waiting row; the inspector's meta line ends with the
  same words. The activity text is left as REQ-MONITOR-047 fixes it.
- **"Notified".** The recovery is logged as OQ-127 reads it, and notified by the republished record, whose badge is gone.
  No notice and no timeline word is minted for it (REQ-ORCH-139; OQ-127 asks the owner for the words). *(Since OQ-127's
  ruling, 2026-10-06, [R-071](../../product/requests.md#r-071): the recovery is also a `stall_recovered` timeline entry, a
  word of [`PD-ORCH-014`](../../product/directives/pd-orch-014.md#pd-orch-014) given under OQ-157, and its session-log line is at `INFO`,
  both written by `stallRecords` in `packages/engine/src/children/stall.ts`
  ([`PD-MONITOR-005`](../../product/directives/pd-monitor-005.md#pd-monitor-005) revision 2) — the "no timeline word" above no longer holds;
  still no notice. A correction of the build's state, not a ruling of this question.)* ~~A stall still
  under way when the watch is disarmed — the agent's attempt or execution has ended — is over, and is logged recovered and
  cleared then (`StallWatch.stop`).~~ *(Corrected 2026-09-30 by acceptance round 1's verifier: that line was false for the
  commonest way a stall ends without the agent resuming — a cancel or a stop of the stalled run — and for a pause, a
  REQ-MONITOR-121 hard timeout and a failed turn; REQ-MONITOR-120's recovery is "when activity resumes".)* A stall still
  under way when the watch is disarmed, or when the agent's turn has ended and it is between turns, is over and its figure
  cleared; it is logged recovered only when the agent was active after the evaluation that last found it stalled — a model
  event that is not an error, or something the run gave it (`StallWatch.endStall`). An error part, the call's own abort or
  timeout among them, is not activity. The live run found the recovered case: its root answered on the retry and ended
  before the next evaluation, and the first form left that stall with no recovery line.
- **The root is watched**, over its whole execution, against its role's `stall_timeout`, else `runtime.child_stall_timeout`,
  else 90 s — the one stall timeout the configuration has. It writes a child's warning and `stall` issue in REQ-MONITOR-119's
  words for "the agent" (`agent appears stalled: …`), and the two session-log lines likewise. It gets no corrective message:
  REQ-NOTIFY-112's is a child task's. Between its turns, while it waits on its own children, no silence is counted against
  it (`StallWatch.betweenTurns`), since the run asks it for nothing then — the reading another branch of this round
  records for a child waiting on its own children, and whose mechanism this build shares. That covers the resumed root
  too: a root resumed into waiting (PD-ORCH-005 clause 4) takes no step until a child's report, so it is between its turns
  from the moment its watch is armed (found by acceptance round 1's verifier, whose case read 23 `stall` issues against
  such a root while its child worked).
- **The injection.** Within a turn, a steer already joins the conversation at the agent's next step, and nothing may join
  a conversation between a call and its result or under a step in flight, so an evaluation injects nothing there. What an
  evaluation adds is the agent that has no next step coming: one waiting between its turns on its own children. An
  evaluation that finds a steer pending for such an agent wakes it, and the step it takes injects the steer, before any of
  its children ends; it then waits again. Every delivered steer restarts the watch's silence ("each successful injection
  refreshes the agent's last-activity timestamp"), wherever it was delivered.

**What a ruling decides.** Which surfaces draw the stall and in what words; whether the recovery is also a notice or a
timeline entry *(the timeline entry is settled by OQ-127's ruling of 2026-10-06, see "Notified" above; the notice by
this question's own ruling the same day, which confirms the recovery notified by the republished record alone)*;
whether the root is watched against the child threshold or one of its own; and whether REQ-MONITOR-135's evaluation
leg means waking a waiting agent, as built, or something a step in flight could receive.

**OQ-154 — Does a child that ends where no run's lifecycle hooks are live fire `child_completed`, and when?**
*(REQ-HOOKS-003, "`child_completed` once a delegated child agent has finished, whatever its final state"; REQ-HOOKS-076,
whose order is `session_start`, `child_completed`, …, `session_end` "matching where each occurs"; REQ-HOOKS-080, which runs
lifecycle hooks in line with the run loop; `PD-ORCH-005` clauses 3 and 16. Raised 2026-09-30 by the repair of acceptance
finding A15,
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](../../defects/fixed/a-child-settled-outside-its-execution-fires-no-child-completed-hook.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-151 when it was raised, then OQ-152, and renumbered OQ-154
at merge once origin/main's OQ-151 to OQ-153 had landed.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the build's behaviour is accepted, and the specification now says so: `child_completed` fires only while a run's lifecycle hooks are live, after its `session_start` and before its `session_end` begins. None of the five paths above fires it, then or later, and no later run owes it; on the fifth path the cancel of the paused child is still accepted and the child ends `cancelled` with its report and teardown. [`PD-HOOKS-001`](../../product/directives/pd-hooks-001.md#pd-hooks-001) narrows REQ-HOOKS-003. The note of the fifth path, [`a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`](../../defects/fixed/a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md), closes with this ruling.

A run's hooks are resolved at its start and live until its teardown (ADR-0015; `Sessions` builds one hook port per run),
and every lifecycle event the specification orders falls between that run's `session_start` and its `session_end`. Three
paths end a delegated child outside that window, and a fourth ends one inside a run that never opens it:

- the cancel of one paused child while its session rests (`PD-ORCH-005` clause 16, `Sessions.cancelPausedAtRest`): no run
  exists, and no hook port;
- the explicit cancel that lands after its run has come to rest (`Run`'s teardown, `closeOpenIteration` after the run's
  `session_end` has fired): the port is still held, but the run has announced its end;
- the record of an accepted explicit cancel whose run host died (`recordCrash`'s `recordAcceptedCancel`), written from the
  store by a repair, which has no run, or by the next continue before its run exists;
- the stale settle (REQ-ORCH-053) of a run that ends before its `session_start` — a stop requested while its pre-flight
  runs (`Run`'s `teardown` ahead of the hook), or a raise before that point: the settled children's fields are handed to
  the run (`RunDeps.settledBeforeStart`) and fired only after its `session_start`, so they are never fired, and the next
  run does not fire them either, because they are already terminal. *(Added 2026-09-30 by the second verification of the
  repair.)*

REQ-HOOKS-003 says the event fires once a child has finished and names no exception; REQ-HOOKS-076 and REQ-HOOKS-080 place
it inside a run. Firing at the moment would run hooks with no `session_start` before them or after the `session_end`
they follow, and at rest would need a hook port resolved for no run. Firing at the next run would announce, possibly much
later, a child a run that never saw it ended, and never if the session is not continued.

**What the build proceeds under:** none of the four fires `child_completed`. The paths the specification places inside a
run all do: the cascade (REQ-ORCH-048), the finalize sweep (REQ-ORCH-052), the user's cancel of one child in a live run
(REQ-ORCH-133), the stale settle (REQ-ORCH-053, fired after the settling run's `session_start`), and the decline of a
resumable iteration (`PD-ORCH-005` clause 6, after the continuing run's `session_start`).

**What a ruling decides.** For each of the four paths: fire at the moment, through a port resolved for the purpose
(and, after `session_end`, out of REQ-HOOKS-076's order); owe it to the next run of the session, after its
`session_start`; or fire none, as built.

**A fifth path** *(added 2026-10-01 by the repair of
[`a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`](../../defects/fixed/a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md),
under [R-067](../../product/requests.md#r-067))*: the user's cancel of one paused child (REQ-ORCH-133) that lands while the
run's own `session_end` hooks run, or after them and before the run has ended. `Run.cancelAgent` accepts it until then, the
port is still held, and the run has announced its end; until this repair its `child_completed` fired after `session_end`.
**What the build proceeds under** for it is this question's built reading: the cancel is accepted, the child ends
`cancelled` with its report and teardown, and no `child_completed` fires (`IterationChildren.endLifecycle`, called by the
teardown once it has awaited the outside hooks and before `session_end`). A ruling on this path chooses among the same
answers, plus one the other four do not have: refuse the cancel of one child once the teardown has reached that point, as
`steeringClosed` refuses a steer and `cancelWindowClosed` a late explicit cancel, so the child stays `paused` and is
cancelled at rest (clause 16, the first path) instead.

**OQ-155 — Is a child waiting on its own children silent, for the stall watchdog?** *(REQ-ORCH-089, "when active tool
calls exist, the condition is reported at informational level as waiting on N active tool calls instead of as a stall";
REQ-MONITOR-117 to REQ-MONITOR-120, "each agent is evaluated for a stall"; REQ-NOTIFY-112; OQ-127. Raised 2026-09-30 by
the repair of acceptance finding A7,
[`a-child-waiting-on-its-own-children-is-reported-stalled.md`](../../defects/fixed/a-child-waiting-on-its-own-children-is-reported-stalled.md),
under [R-067](../../product/requests.md#r-067). ~~Open;~~ ruled 2026-10-06; numbered OQ-152 when it was raised, renumbered OQ-154 at
the merge once origin/main's OQ-152 and OQ-153 had landed, and OQ-155 at the next merge once origin/main's OQ-154 had.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a child between its turns — waiting on its own children, or resumed into that wait — is outside its stall watch, so an evaluation there reports no stall and no wait, and each child it waits on is watched for its own silence; no word is added to REQ-ORCH-139's vocabulary. Read literally this departs from REQ-MONITOR-119 (the wait is "the same silence with no tool call in flight"), so it is carried by [`PD-MONITOR-005`](../../product/directives/pd-monitor-005.md#pd-monitor-005), which narrows REQ-MONITOR-118 and REQ-MONITOR-119 to the silence of a model step the agent has in flight.

A child that delegated, and then waits for its children's reports before the run resumes it (REQ-ORCH-055 to
REQ-ORCH-059), or that the run resumes into that wait from its record (PD-ORCH-005 clause 4), has no model step and no
tool call in flight while it waits. The requirements tell a stall from a wait
only by "active tool calls", so read literally the wait is "the same silence with no tool call in flight", and
REQ-MONITOR-119 asks every evaluation to warn that the child "appears stalled" and to write a `stall` issue. Through a
wait on a child that works for twenty minutes, that is some 240 warning-severity issues about a child working as
designed, each carrying the words "no model event or token", which describe a step it is not taking.

**What the build proceeds under.** The watch measures the silence of the child's model steps. Once a turn ends and
until the run starts its next — which is exactly the wait on its own children, or the end of its execution — the run
asks the child for no output, so no silence is counted against it: an evaluation there reports no stall and no wait,
and calls the callback with *not stalled*; ~~a stall under way when the turn ended is reported recovered, the turn's end
being read as REQ-MONITOR-120's "activity resumes" — the step the silence was counted against has answered, whether
with its final event or by settling.~~ *Corrected in place 2026-09-30, at the merge with origin/main (found by the
verifier's review):* a turn that settles because it was cancelled, paused, timed out or failed is not activity resuming,
and OQ-153 already reads REQ-MONITOR-120's recovery as "only when the agent was active". A stall under way when the turn
ended is over at the first evaluation between turns, and its figure cleared; it is logged recovered only when the agent
was active after the evaluation that last found it stalled (`StallWatch.endStall`; `stall.test.ts`, "REQ-MONITOR-120
(OQ-155 with OQ-153): a stall under way when the turn ends is over …"). The next turn
the run starts counts from its start, as OQ-127 already reads for REQ-NOTIFY-112's recovery. Each child it waits on has
its own watch, which reports that child's own silence (`StallWatch.betweenTurns`; `stall.test.ts` and `children.test.ts`,
"a child waiting on its own child between its turns is not reported stalled"). A child the run resumes into waiting
(PD-ORCH-005 clause 4: its record ends on its own answer) takes no step until a child of its own reports, so its watch
is between turns from the start of that execution (`execute`, when its start is resumed and waiting; `children.test.ts`,
"a child resumed into waiting on its own child is not reported stalled"). *Corrected in place 2026-09-30:* the reading's
first build marked the watch only as a turn settled, which such an execution never reaches before its wait, so a child
paused while waiting and continued had a `stall` issue at every evaluation of the wait (found by the verifier's review).

**What a ruling decides.** Whether the wait is outside the watch (as built), or is reported at REQ-MONITOR-118's
informational level as "waiting on N active children", which would need words no requirement has and, while REQ-ORCH-139's
vocabulary has none, a session-log line in the manner OQ-127 records.
