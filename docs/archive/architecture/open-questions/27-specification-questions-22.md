# Archived open questions — Specification questions (22 of 27)

The ruled, closed, resolved and withdrawn entries of [part 27](../../../architecture/open-questions/27-specification-questions-22.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-127"></a>

**OQ-127 — What counts as "an outcome that produced no output within `child_stall_timeout`" when the stall watchdog never cancels, and what does the watchdog count, write and call?** *(REQ-NOTIFY-111, REQ-NOTIFY-112, REQ-NOTIFY-100, REQ-NOTIFY-105, REQ-ORCH-089, REQ-MONITOR-117 to REQ-MONITOR-120, REQ-MONITOR-285, REQ-CONFIG-108, REQ-CONFIG-113, REQ-ORCH-144, REQ-ORCH-139 and REQ-SESSION-133. Raised 2026-09-29 by building the watchdog and the corrective message under R-067, the repair of [`a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md`](../../../defects/fixed/a-child-that-produces-no-output-is-never-given-its-one-corrective-message.md). Raised as OQ-109 on its branch, renumbered there to OQ-126 when OQ-109 to OQ-125 had been taken on `main`, and renumbered OQ-127 at the merge, OQ-126 having been taken on `main` meanwhile. Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** as recommended, with OQ-157 — the `stall` issue is written only with the throttled warning (revision 2 of [`PD-MONITOR-005`](../../../product/directives/pd-monitor-005.md#pd-monitor-005), which narrows REQ-MONITOR-119), and the three facts are timeline entries under the words OQ-157's ruling adds: `waiting_on_tools` (REQ-MONITOR-118), `stall_recovered` (REQ-MONITOR-120) and `corrective_message` (REQ-NOTIFY-111). A session-log line that records an intended state — the wait on tools, OQ-173's wait the run imposes, the recovery, and the children the user's own pause, stop or quit leaves paused (PD-ORCH-005 clause 2) — is written at `INFO`; REQ-MONITOR-119's stall warning, and the corrective-message line, which follows a failed step, stay at `WARNING` (`stallRecords` and `recordCorrectiveMessage` in `packages/engine/src/children/stall.ts`).

The requirements pull two ways:
- REQ-NOTIFY-100 names `runtime.child_stall_timeout` as the bound on "a child task producing no output". It says that
  exceeding a bound "ends only the operation that bound governs".
- REQ-ORCH-089 makes the stall watchdog "visibility only", and it never cancels work. REQ-MONITOR-285 says the stall
  timeout "affects only what is reported and never terminates anything".
- REQ-NOTIFY-112 makes "it produced no output within `runtime.child_stall_timeout`" a recovery-eligible **outcome**
  of a child that "did not reach `succeeded`". REQ-NOTIFY-111 says such a child "does not end as a failure: it
  receives a corrective instruction and resumes from where it stopped".

None of them says what ends a silent child's step so that there is an outcome to recover from.

**What the build proceeds under** (`packages/engine/src/children/stall.ts`, wired in `IterationChildren.execute`).

- **Nothing is cancelled by the watch.** REQ-ORCH-089 and REQ-MONITOR-285 govern. A silent model step is ended by its
  own bounds: the model-call timeout, REQ-ORCH-090's unresponsive timer, or the child's own `child_timeout`. No new
  one is added.
- **The outcome.** A child's turn that ended `failed` is eligible when:
  - its failed model step came after no output for at least the threshold, the bound inclusive;
  - no tool call was in flight.

  *Output* is a token of an answer, of reasoning or of a tool call. An error the provider answered with, a usage figure
  or a finish is a model event, which ends the watch's stall, but it is not output. The silence counts from the last
  output, or from the latest moment the run handed the child something to answer: the attempt's start, a tool call's
  result returning to the child, and every turn the run starts for it — its payload or record, its children's reports
  when it is resumed with them, REQ-ORCH-095's re-prompt, and the corrective message.

  *Corrected in place, 2026-09-29, by the verifier's second round.* The first form counted from three events only: the
  attempt's start, a tool call's result and the corrective message. A child that delegated, answered, and then waited on
  its own children longer than the window therefore began its resumed step already "silent" for the whole window, and a
  resumed step that failed at once was given the corrective message and told it "produced no output for 120 seconds"
  when it had been asked for no output in that time. REQ-NOTIFY-112's condition is that *it* produced none. The turn the
  run starts is now the fourth event (`children.test.ts`, "a child that waited on its own child past the window …"). The
  watch's own warnings and issues during such a wait are a separate question
  ([`a-child-waiting-on-its-own-children-is-reported-stalled.md`](../../../defects/fixed/a-child-waiting-on-its-own-children-is-reported-stalled.md)),
  since 2026-09-30 OQ-155's: the watch counts no silence between the child's turns.
- **The outcomes that earn nothing, as a failed step carries them:**
  - `cancelled`: the child's own abort or the run's;
  - `blocked`: such a child never runs;
  - an authentication failure: HTTP 401 or 403;
  - a quota exhaustion: HTTP 402 or 429;
  - a validation error: the `validation` code;
  - the child's own `child_timeout` expired.

  A refusal by the permission policy is a tool result and never fails a turn. A turn that ended `partial` (its step
  allowance spent with an answer in hand) is not eligible either: the child it ends reaches `succeeded`
  (`reportStatusToState`), and REQ-NOTIFY-112's outcome is one where the child "did not reach `succeeded`". Also
  excluded, as outside what an instruction addresses:
  - loop supervision's escalation (REQ-NOTIFY-112's "separately from loop supervision");
  - a run coming to rest, since PD-ORCH-005 allows no model call then;
  - an answer-only route (REQ-ORCH-015's `answer`).
- **"Resumes from where it stopped".** The corrective message follows the conversation the failed turn left, as a user
  message that the conversation record keeps. It is sent within the same execution, under the `child_timeout` already
  running, and a delegation it leads to is waited for as any turn's is.
- **The instruction.** It is composed from the condition: the silence, the window and the failure's headline, then a
  request to carry on. REQ-NOTIFY-111's fixed read-then-edit instruction stands in only where there is no condition to
  compose from. The stall condition always has one, so the fixed instruction is built and unit-tested and is never sent
  by this build.
- **Once per child task.** This holds across REQ-ORCH-088's fallback retry, whose second attempt is the same child task
  (`ladder.test.ts`), and across PD-ORCH-005's resume after a pause, a stop, a quit or a crash, which is a new execution
  of the same task. A resumed execution reads whether the task already had its message from what the task was told: a
  corrective message (the composed one's `[Corrective message]` mark, or the fixed instruction) as a user message
  anywhere in its conversation record, the messages a compression or the retry's restart replaced included
  (`hadCorrectiveMessage`, `ConversationRecord.everRecorded`; `children.test.ts`, "across PD-ORCH-005"). The record is
  the durable fact, so no store column is added; a task whose record is gone has nothing to be resumed from either.

  *Corrected in place, 2026-09-29, by the verifier's second round.* The first form held the count in a variable of one
  execution and claimed "once per child task" having shown only the retry. A child given its message, paused mid-turn
  and continued, whose resumed step went silent and failed again, was given a second message (the verifier reproduced
  two, against REQ-NOTIFY-112's "a second such message is never sent to the same child however often the outcome
  recurs").
- **The third recovery (REQ-NOTIFY-105's escalation) is unreachable.** Of REQ-NOTIFY-112's four conditions, only the
  stall is detected, and it is recovered once per child. The other three are not built:
  - a single tool call or shell command exceeding its own bound while the child's own is unspent;
  - incomplete work with the iteration allowance spent;
  - a repeated read-then-edit cycle without a commit.

  Nothing therefore counts to three.
- **The watchdog.** The threshold is the role's `stall_timeout`, else `runtime.child_stall_timeout`, else 90 s. The
  cadence is REQ-MONITOR-117's. Every evaluation that finds the silence with no tool call in flight writes a `stall`
  issue at warning severity (REQ-MONITOR-119's "every stall evaluation"), which writes its own `issue` timeline entry.
  It carries the active tools (none, by REQ-MONITOR-119's own condition), the names of the last five tool calls, the
  last model event's type and the silence so far. The warning, on the run's warning channel in REQ-ORCH-089's words
  with REQ-MONITOR-119's "still waiting on it", is written only at stall entry and at each repeat REQ-MONITOR-120
  allows, since that requirement bounds "the warning itself" and nothing else.

  *Corrected in place, 2026-09-29, by the verifier's first round.* The first form wrote the issue only with each
  throttled warning, "because an issue ring written every 5 s through a twenty-minute stall would evict the session's
  other issues". That narrowed an explicit clause rather than reading an ambiguous one, and a change to a clause is
  the owner's. The clause is now built as written (`stall.test.ts`, and `children.test.ts`'s "a `stall` issue at every
  stall evaluation"), and **the eviction is the question left for a ruling**: REQ-SESSION-133 keeps the newest 500
  issues, and at the default 5 s cadence one child stalled from its 90 s threshold to its 1200 s `child_timeout`
  writes more than 220 `stall` issues, so two such children, or one with its fallback retry, can evict every other issue the
  session had. Recommendation: keep one issue per evaluation, and let a ruling say whether the ring counts a stall's
  repeated issues against the cap.
- **The timeline words, which REQ-ORCH-139's vocabulary does not have.** REQ-ORCH-139 names every timeline event "only
  from the timeline-event vocabulary" of domain 01's Data & Formats "and MUST NOT use any name outside" it. That list
  has no word for three things this build records, and neither has any other domain's list or any directive:
  - REQ-MONITOR-118's informational message for a silence with tool calls in flight, which the requirement says the
    watchdog "logs";
  - REQ-MONITOR-120's recovery, which "must be logged and notified";
  - REQ-NOTIFY-111's corrective message, which no requirement says how to record.

  *What the build proceeds under.* No timeline word is minted. As OQ-76 did for the user's presence, the three are
  written to the session log (REQ-SESSION-142) through the run's `warn`: `ChildrenDeps.warn` is the run's own
  `deps.warn`, the channel `presence.ts` records OQ-76's two transitions through. The lines read
  `child waiting on tools: …` (REQ-MONITOR-118, at entry and at each repeat the throttle allows),
  `child stall recovered: …` (REQ-MONITOR-120) and `child corrective message: …` (REQ-NOTIFY-111). The corrective
  message itself is also in the child's conversation record (REQ-ORCH-140), as the user message it is. The lines are
  written at the log's `WARNING` level, which misstates REQ-MONITOR-118's *informational* message; that is the price of
  minting no word, and a ruling removes it. *What a ruling decides.* Whether domain 01's list gains three words for
  these facts (they would then be timeline entries), or whether the session log is their record, and at which level.
  Recommendation: three words in domain 01's list, since the timeline is what an autopsy reads first and the export
  reaches it (REQ-SESSION-199); the log is neither. *(Added 2026-10-01: OQ-157 asks the same of every timeline name the product
  writes that no list has, and recommends one ruling for all of them and for these three.)*
  *(Added 2026-10-03, the live run at `1763f7f`, an all-PASS run: REQ-MONITOR-118's line ×4 and REQ-MONITOR-120's ×1 were
  written at WARNING again, and a further case of the same level sits outside these three records —
  `iteration 1: 2 child(ren) left paused by pause (PD-ORCH-005)`, written through the run's `warn` when the user's own
  pause rests the children, as PD-ORCH-005 clause 2 says it does
  ([`the-users-own-pause-is-logged-at-warning.md`](../../../defects/fixed/the-users-own-pause-is-logged-at-warning.md)). What the
  build proceeds under: every one of these lines keeps its level until the owner rules; a ruling on the level of an
  intended state answers this case with the three.)*

  *Corrected in place, 2026-09-29, by the verifier's second round.* The first round wrote them as the timeline entries
  `child_waiting_on_tools`, `child_stall_recovered` and `child_corrective_message`, for this reason, kept here as the
  falsified one: "a child's execution reaches the log only through the run's warning channel, and none of the three is
  a warning … The channel the children would need is handed to them where `Run.turn` builds `IterationChildren`, which
  this round does not edit." The warning channel is OQ-76's own channel and reaches the session log with `Run.turn`
  untouched, and a line at a level that overstates it is a smaller departure than a name REQ-ORCH-139 forbids
  ("MUST NOT use any name outside those vocabularies"). The same closure is already crossed
  elsewhere in the engine
  ([`the-run-writes-timeline-events-outside-its-closed-vocabulary.md`](../../../defects/fixed/the-run-writes-timeline-events-outside-its-closed-vocabulary.md)).
- ~~**The stall callback fires on every evaluation, and no host listens.** No badge, activity text or countdown is drawn
  ([`a-stalled-child-is-never-shown-stalled.md`](../../../defects/fixed/a-stalled-child-is-never-shown-stalled.md)). The run's own root agent is not watched: REQ-MONITOR-117
  says "each agent", and REQ-ORCH-089's threshold is a child's. Whether the root is watched, and against which
  threshold, is left open in the same note.~~ *Corrected in place, 2026-09-30 (R-067, acceptance finding A6): the callback
  reaches the agent's record and every agent surface draws the stall, the root is watched, and a stall evaluation wakes an
  agent waiting on its children for a pending steer. The readings are **OQ-153**.*
- ~~**A child waiting on its own children reads as stalled.** It has no model step and no call in flight while it waits,
  and the requirements tell a wait from a stall only by active tool calls. The build reports it stalled; whether the
  wait pauses the watch or counts as waiting on N children is recorded in
  [`a-child-waiting-on-its-own-children-is-reported-stalled.md`](../../../defects/fixed/a-child-waiting-on-its-own-children-is-reported-stalled.md).~~
  *Corrected in place, 2026-09-30, by the repair of acceptance finding A7:* the watch counts no silence between the
  child's turns, so a wait on its own children is neither a stall nor a wait on calls; the reading, and what a ruling
  decides, is OQ-155's.

<a id="oq-128"></a>

**OQ-128 — What becomes of a steering prompt still pending when the run comes to rest, or ends?** *(REQ-MONITOR-133, "the
prompt is pending until injected"; REQ-MONITOR-134, "all pending steering prompts for an agent are delivered into its
conversation … marked injected exactly once"; REQ-MONITOR-136; REQ-ORCH-094; `PD-ORCH-005` clauses 2 and 4. Raised
2026-09-29 by the repair of
[`a-steering-prompt-pending-at-a-rest-is-lost.md`](../../../defects/fixed/a-steering-prompt-pending-at-a-rest-is-lost.md)
under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-122, renumbered OQ-127 when main had
taken OQ-122 to OQ-126, and renumbered OQ-128 at the merge, OQ-127 having been taken on `main` meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 34: a prompt pending for an agent a rest leaves `paused` is delivered into its record; steering closes once the rest is recorded, teardown begins, or the run pauses at the limit or parks at the gate; a prompt nothing delivered is recorded as not delivered; and a crash still loses what was pending. The timeline word for that record is the timeline vocabulary's ruling (OQ-157), not this one's.

A prompt is pending until the step of its agent that injects it. Clause 2 stops every agent before its next model step,
so a prompt submitted while its agent's step or call was under way, and still pending at the pause, a stop or a quit,
met no step to inject it. It lived only in the run's memory, and the run ended with it: acknowledged with an identifier
and never delivered. Neither requirement says what a rest, or the end of a run, does with a pending prompt, and the
specification has no word for a prompt that was not delivered.

**The reading built.**

- **At a rest, delivered into the record.** A prompt pending for an agent the rest leaves `paused`, whose conversation
  record holds something to carry on from, is delivered into that record as the marked message its next step would have
  injected (`[Steering prompt] …`), after the answers to the calls the rest cut, and is marked injected then, once
  (`steering_injected`, its metadata naming the rest). The resumed agent carries on from its record (clause 4), so the
  prompt is the last message of its first request, which is a step: a root that had answered and was waiting takes one,
  and a child restored `summarizing` resumes `running` to take it, as one told of its background sessions does
  (REQ-MONITOR-136's "another round").
- **Steering closes when no agent takes another step.** The run accepts no steer once the rest is recorded (after the
  delivery above), once its teardown begins, or once it reaches either end that is not a termination and never enters
  teardown — the pause at the message limit (REQ-ORCH-085/087) and the park at the plan gate (REQ-ORCH-153) — whichever
  comes first, so none is acknowledged that nothing could deliver: a steer in that window is refused (REQ-MONITOR-005's
  `false` outcome).
  *Falsified first reading, kept:* the first build closed steering only at the end of teardown and recorded "from that
  moment the run accepts no steer, so none is acknowledged that nothing could deliver". Its review found that false: a
  steer submitted after the rest, while teardown ran the `session_end` hooks, was acknowledged, never reached the record
  of the `paused` agent it named, and was reported undelivered, although that agent resumes on the continue.
- **At the run's end, recorded as not delivered and said so.** A prompt no step injected and no rest delivered — its
  agent had not started and has no record, had ended, or was cancelled; or a prompt for the entry role pending when a
  rest came at an iteration boundary, where no iteration is left open — is recorded when the run stops stepping: when
  teardown begins, at the message-limit pause, or at the plan-gate park, each before anything is awaited. Only a run
  that parks meets the park: a plan cycle stopped, quit, or ended on a failed turn ends in teardown, and is recorded as
  the run ending. It is a `steering_not_delivered` timeline entry naming it, and a transcript line saying it was not
  delivered (REQ-MONITOR-134's own verb) and which end it met (the run ended, paused at the message limit, or was held at
  the plan gate). Like the transcript line each of those two ends writes of itself ("Paused: …", "A plan is ready …"), it
  is written as that end begins, before the end's durable record; a recording failure at that record ends the run with
  both lines in a history that is incomplete from that point (REQ-EVENTS-088). The first build called it "withdrawn"
  (`steering_withdrawn`), borrowing clause 9's word; the glossary gives that word to an approval or a question only, so
  it is no longer used for a prompt.
  *Falsified second reading, kept:* the second build recorded it only "when teardown begins", and said an acknowledged
  submission was never lost without a word. Its third review found that false for the pause at the message limit and the
  park at the plan gate, which end the run without teardown: a root steer pending at the limit was acknowledged, dropped
  with no entry, and never delivered after the continue.
  *Falsified third build, kept:* the third build closed at the park as soon as the plan cycle's turn returned, above the
  two branches that end the run in teardown instead. Its fourth review found a steer pending when a plan cycle was
  stopped, quit, or ended on a failed turn recorded as "held at the plan gate", a gate that never opened; the reading
  above named the end the run met, and the build now does.
- **At a crash, lost.** A crash still loses what was pending, since only the run's memory held it. A crash can also fall
  between the two writes a delivery at a rest makes — the prompt appended to the agent's record, then its
  `steering_injected` entry — leaving a prompt the resumed agent reads that the timeline never marked injected.

**What a ruling decides.** Whether a prompt for a child that has not started should instead be kept, durably, for its
first step when it resumes; whether the entry role's prompt pending at an iteration boundary should reach the next
iteration's root after a continue; whether a prompt should be persisted at submission so a crash does not lose it; and
what a prompt that was never delivered is called, since the specification's vocabulary has no word for it (the build
describes it by REQ-MONITOR-134's verb, `steering_not_delivered`, and names no new state); and whether a steer after the
rest should instead be accepted and kept for the resumed agent, rather than refused.

<a id="oq-129"></a>

**OQ-129 — What is the optimistic cancel of one agent: which activity line, on which surfaces, and until when?** *(REQ-MONITOR-128, "optimistically shown as cancelled, with an activity line stating that the user cancelled them"; REQ-MONITOR-296, "eventually overwritten by the authoritative final read"; REQ-MONITOR-006(b); REQ-MONITOR-038; PD-ORCH-005 clause 16 and OQ-100/OQ-101, whose cascade counts paused descendants; the reading below departs from REQ-MONITOR-128's "each of its live descendants" by showing paused descendants cancelled too, as OQ-100 and OQ-101 depart from it. Raised 2026-09-29 by the repair of [`cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md`](../../../defects/fixed/cancelling-one-agent-is-not-shown-cancelled-until-the-engine-answers.md) under [R-067](../../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-128 on its branch and renumbered OQ-129 at the merge, OQ-128 having been taken on `main` meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built, and `PD-ORCH-005` revision 6 states it in clause 35: the activity lines, the cascade's set (live and paused), the sending window alone, and the overlay held until the first whole-session update after the engine's acceptance. REQ-MONITOR-128 joins the directive's Narrows list.

The requirement names an optimistic state and a line. It does not say where the line is drawn, whether it outlives the
engine's answer, or which windows show the state before the engine does.

**What the build proceeds under** (`packages/ui/src/cancel-overlay.ts`, written by the renderer's `cancelAgent`):
- **The line is the agent's activity text.** The agent the user cancelled reads "The user cancelled this agent.", and
  each descendant cancelled with it reads "Cancelled with <name>, which the user cancelled.", in every surface that
  draws an agent's activity. The engine's republished record keeps the delegated task as the activity, so the line
  lasts only until that record arrives. What outlives it is the timeline's `child_user_cancelled` entry and the report
  ("The user cancelled this child."). No transcript row is added in the renderer.
- **The set is `cancelCascade`'s.** It holds the agent and every unfinished descendant, live or paused, which is the
  set the engine ends and the confirmation names (OQ-100, OQ-101). A paused child's at-rest cancel is shown at once too,
  and the Continue action's count drops with it.
- **Only the window that sent the cancel shows it early.** The overlay is per window, beside the replica and never
  written into it (ADR-0043). In that window, every agent surface shows it: the Workspace, Mission, Overview and a
  persona window. Another window shows the cancel when the engine's record reaches it.
- **Until when.** Until the engine answers, the overlay is laid over whatever record the replica holds, so an unrelated
  publication does not bring the agents back. A refusal removes it and states the engine's words, or "That agent is no
  longer cancellable.". An acceptance pins it to every record the replica took up to that moment, and the first
  whole-session update taken after it overwrites it. The window numbers each record its replica takes, in order
  (`witness`, from the replica's subscription in `shell.ts`), so a reader drawing an older record than the replica's
  newest, as a persona window's copy coalesced up to 120 ms behind does (REQ-SHELL-076), still shows the cancel. An
  agent the engine's record already shows finished is never overlaid. *Until the verifier's finding of 2026-09-29, an
  acceptance pinned the overlay to the one record the replica held at that moment, and "the next whole-session update
  overwrites it". That reason was falsified before merge: the engine publishes its cancelled record and answers inside
  one coalesce interval, so a persona window drawing the record before it lost the overlay and showed its agents
  `running` again until its next delivery.*

<a id="oq-130"></a>

**OQ-130 — Is a checkpoint captured for the iteration the record of an accepted explicit cancel closes?** *(REQ-GIT-051,
"Exactly one capture SHALL be attempted for each iteration that closes, at the moment it closes"; REQ-GIT-045;
`PD-ORCH-005` clause 3 with OQ-103's last question, ruled under [R-067](../../../product/requests.md#r-067). Raised 2026-09-29 by
the repair of
[`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`](../../../defects/fixed/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md).
~~Open.~~ Ruled 2026-10-06. Raised as OQ-129 on its branch and renumbered OQ-130 at the merge, OQ-129 having been taken on `main`
meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** confirmed as built: no checkpoint is captured for the iteration the record of an accepted explicit cancel closes, a close no run made, and the next iteration's capture records what the dead run wrote. `PD-ORCH-005` revision 6 states it in clause 36 and narrows REQ-GIT-051.

The ruling has the next repair or continue close an iteration whose explicit cancel was accepted and never carried out.
The close is written from the store alone (`recordAcceptedCancel`), by the repair — `Sessions.repairOne`, which holds no
checkpoint port and runs no Git — or by a continue before its run exists. REQ-GIT-051 asks for one capture attempt at every
iteration's close, and the run's own close of a cancelled iteration makes one; an iteration a crash left open and the user
declined is captured too, by the run that closes it (`closeLeftOpenIteration`).

**The reading built.** No capture is attempted for it: the close records `iteration.end` and the row's `cancelled`
outcome, and the session's checkpoints hold none for that iteration. Whatever the dead run wrote to the tree is still
there, and the next iteration's capture records it, credited to that iteration.

**What a ruling decides.** Whether the close should attempt the capture — at a continue by handing it to the run the
continue launches (which would hold the checkpoint port), and at a repair by giving the repair a port of its own — or
whether an iteration a recorded cancel closes is outside REQ-GIT-051's "each iteration that closes", as a close no run
made.
