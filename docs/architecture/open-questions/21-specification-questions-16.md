# Open questions — Specification questions (16 of 27)

Part 21 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-103.

**OQ-103 — Which sessions has a crash left, and what does the Continue action offer on one with nothing to resume?** *(`PD-ORCH-005` clause 18 (revision 4), with clauses 8, 11 and 19; clause 3, whose "those are never resumed" of the cancel control's agents the reading below departs from for a run whose explicit cancel was accepted but not carried out when its host died, and REQ-MONITOR-126 ("cannot be undone in this session"), which it departs from for the same run; REQ-MONITOR-125 as clause 18 extends it; REQ-CHAT-008, REQ-GIT-093, REQ-SESSION-171, REQ-SESSION-060, REQ-GIT-094, REQ-CHAT-006, REQ-ORCH-004, REQ-ORCH-085, REQ-ORCH-087 and REQ-SESSION-110, which the directive does not name; and `PD-CHAT-001` revision 4 ("The strip" and "The paused continues"), with REQ-CHAT-005 as it narrows it, which the reading below departs from by drawing the two continues in the send pill's place on a session that is not paused. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../product/requests.md#r-065). Numbered OQ-76 while it was built; renumbered when it reached `main`, where OQ-76 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the questions this entry left open after the ruling of 2026-09-29 are confirmed as built, and `PD-ORCH-005` revision 6 states them in clause 26: a crash-left session draws the two continues in the send pill's place, as `PD-CHAT-001` revision 4 draws them on a paused session; a busy session of unknown liveness is refused; no pause statement is drawn; a durable hold offers its own continues alone; the continues are drawn and refused `store-failed` on a session whose store failed; and the Continue action on a session with nothing open and its last request finished re-runs that request.

Clause 18: "A session a crash left — `interrupted` after a repair, or in REQ-CHAT-008's recovery state before one — SHALL
offer the Continue action and 'continue without them' as a `paused` session does, with the same count. Either choice
records the crash first, as any continue does (clause 8)." The clause names the two states. It does not say how the
engine tells the recovery state apart from a session another process is still running. It does not say what a
crash-left session offers when no iteration is open, or whether the pause's statement is drawn on it. And it does not
say what the decline's wording means before the crash is recorded.

**What the build proceeds under.**

- **Which sessions a crash left.** `Sessions.continueSession` accepts a session whose status is `interrupted`. It also
  accepts one whose status is still busy when REQ-GIT-093's liveness predicate calls it `not-live`, the one predicate
  REQ-SESSION-171 and the repair already use. A busy session that is `live`, or whose liveness is `unknown`, is refused
  (`run-active`), because another process may still be running it. The renderer reads the same two states as
  `crashLeft`: `interrupted`, or busy with `needsRecovery` (the session list's `stale`). `paused_message_limit` and
  `awaiting_plan_decision` are durable holds, not busy statuses, so a crash does not make them crash-left. They keep
  their own continues (clause 11).
- **A session the store's failure left busy is not one a crash left.** A run that ends on a recording failure (OQ-42)
  leaves the durable status busy and this process's lock with no run behind it, so the liveness predicate reads
  `not-live`, the session list marks it `stale`, and the renderer's `crashLeft` draws the two continues on it. It did not
  crash, and nothing can be recorded of it. `Sessions.continueSession` therefore refuses every continue on it
  `store-failed` ("The workspace store requires recovery before continuing work"), as `Sessions.prompt` and the plan
  decision already do, so the Continue action, the decline and the continue by message all refuse the same state the
  same way. The guard stands first in `continueSession`, so a `paused` session under a store failure is refused too,
  where it was accepted before. The recovery is OQ-42's: restore storage and reopen the session, which rebuilds the
  writer. After the reopen the session is busy with nothing running it, which is REQ-CHAT-008's recovery state, and a
  continue then records the crash as for any other. The renderer does not tell this state apart: it knows nothing of
  the writer's failure beyond the recording-failure notice, whose action is the reopen. The engine does not call it
  crash-left anywhere else either: a projection read under the failure names none of its agents crash-left and states
  nothing to resume (`Sessions.restingOf`, OQ-100), and the at-rest cancel of a child is refused, writing nothing, as
  the continues are (OQ-101). In the process whose run failed the projection is frozen at the run's last live record
  (OQ-42), whose count the composer still draws beside the two continues, with the decline, all refused the same way.
  The projection withholds only for a busy status (`storeLeftBusy`). An `interrupted` or `paused` session whose store
  fails while it is followed keeps its count, its decline and a paused child's Cancel, and the engine refuses each
  (`store-failed`; the cancel's `store_failed`, whose words the surface states). Nothing is written, and the reopen is
  the recovery, as above. Recorded at the merged build's twelfth review round.
  *Until the merged build's review the projection named such a session's agents crash-left and the cancel wrote a crash
  record against the failed writer
  ([`the-at-rest-cancel-writes-against-a-failed-store.md`](../../defects/fixed/the-at-rest-cancel-writes-against-a-failed-store.md)).* *The first build accepted such a
  session and reported `{resumed: true}` against the failed writer, where the same call had been refused `not-paused`
  before clause 18; the round-2 review found it.*
- **A run whose explicit cancel was in flight when it crashed.** The run-level explicit cancel (REQ-MONITOR-126, the
  reserved run id's `cancelAgent`, which every confirmed "Cancel the run?" sends, clause 15) writes nothing durable
  when it is accepted: `Run.cancelAgent` raises the final stop in memory, and the agents end `cancelled` and the
  iteration closes only in the teardown, once the root's turn returns. A host that dies in that window — a call that
  ignores the abort until its deadline, the quit's shutdown bound running out while the cancel settles, or the process
  killed — leaves the store as any mid-run crash does: busy, the open iteration's interruption NULL, the unfinished
  agents where they stood. The build cannot tell it apart, and treats it as crash-left: its agents present `paused` by
  `crash` (OQ-100), the Continue action counts them (clauses 6 and 19), and the repair or a continue records the crash
  and pauses them, so the Continue action resumes work the user confirmed as final. That departs from clause 3's "those
  are never resumed" and from REQ-MONITOR-126's "cannot be undone in this session", for a cancel that was requested and
  never carried out. The stop's `cancelling` status is written at once but is not final, so it cannot tell the two
  apart either; a single child's cancel is durable at once and is not affected. The alternative — a durable mark
  written when the explicit cancel is accepted, read by `crashLeftOf`, `resumableOf`, `recordCrash` and
  `continueSession`, so that the next repair or continue ends those agents `cancelled` and closes the iteration — needs
  a stored field and a reading of what the repair then records, so it is not built ahead of a ruling
  ([`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`](../../defects/fixed/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md)).
  At the base the case was reachable only by a continue by message. *Recorded at the merged build's thirteenth review
  round; until then this question did not name it.* *Replaced 2026-09-29: the ruling below withdrew this reading, and
  its repair was built the same day (R-067) — the build now tells the case apart by the cancel's durable mark, and no
  longer treats it as crash-left. What this bullet says the build does is kept as the reading that stood until then.*
- **The actions at the message limit.** A crash-left session is not at the message limit, so it takes `action` as a
  manually paused session does. `continue` and `double` continue it; `cancel` leaves it as it is.
- **Nothing open to resume.** A crash-left session with no open iteration draws the two continues where the send pill
  stood, with no count and no decline, as a `paused` session with nothing to resume does. Its Continue action continues
  the last request, which is REQ-MONITOR-125's "resumed from the composer". Where the todo holds that request
  unfinished, OQ-102's no-append rule keeps the Continue from appending it again. It does not always hold it unfinished.
  If the host dies after an iteration closed `succeeded` and before the run's teardown settled the status, the session
  is left busy with nothing open and its last request `complete`. A `paused` session reaches the same state with no
  crash: a pause, a stop or the application's quit (`application_shutdown`, which rests `paused` as the stop does,
  clause 15) the run accepts after the iteration closed, while its checkpoint is captured, its `iteration_end` hooks
  fire or its events drain *(corrected 2026-10-13, fin41, N68: the hooks fire first and the checkpoint is captured after
  them, REQ-HOOKS-082; the window this sentence names is the same)*, is met at the loop head, which comes to rest before the stop conditions run. Only a pause,
  a stop or a quit accepted during the turn puts the iteration's task back to pending. A third route is the plan mode's:
  a resumed iteration closes the continue's message `complete` (clause 17), the gate then holds before the first new
  iteration (`PD-ORCH-003` revision 2), and a plan Cancel, or a stop or a quit during that plan cycle (clause 15, which
  pairs the two), leaves `paused` with nothing open and the continue's message, the last user row, finished (OQ-104,
  "What a cancel leaves"). The quit is the likeliest way there: the user closes the application while the plan is being
  drafted, and on relaunch the Continue action appends the finished message again. A fresh hold does not reach it,
  because the gated request's task is still pending. A fourth route is the message limit's, and it needs no directive:
  the limit is checked as each iteration closes, before the stop conditions and the gate (REQ-ORCH-085/087), so a limit
  reached as the iteration that finished the last request closes leaves `paused_message_limit` with nothing open and
  that request `complete` — after a resumed iteration that carried out the continue's message (clause 17), where the
  limit wins over the gate (OQ-104), and after any iteration that finished the request its run was launched with, as at
  the base. The resolution's 'continue' and 'double' (REQ-SESSION-110) reach `continueSession` as the Continue action
  does. On every route the build appends the finished request again as a new task (REQ-ORCH-004: OQ-102's rule covers
  only a request held unfinished), and a new iteration re-works a request that already succeeded, so the crash-left
  session does here what a `paused` one does, as clause 18 has it. Measured in `run/crash.test.ts`: "…nothing open and
  the last request finished…", for the recovery state and for `interrupted`, and "…accepted after the iteration
  closed…", for a pause, a stop and a quit; and in `run/plan-gate-resume.test.ts`, "after the hold that follows a
  resumed iteration, …", for a plan Cancel and for a stop and a quit during the plan cycle, and "the message-limit
  resolution …", for 'continue' and 'double' after a resumed iteration and after a fresh run's only iteration. *Until
  the merged build's sixth review round this bullet said no `paused` session reaches the state, so clause 18's "as a
  `paused` session does" had no counterpart for it, and the ruling question below named the crash-left session alone.
  Until the eighth it named two routes and not the plan mode's, which is the likeliest in `plan` mode. Until the tenth
  it said "The message-limit resolution does not reach this state: a crash-left session is not at the limit, and the
  pause and the stop leave `paused`, not `paused_message_limit`", which is false of the limit's own pause. Until the
  twelfth it named the pause and the stop on the first and third routes and not the application's quit, which reaches
  both the same way.*
- **The two continues take the send pill's place.** A crash-left session with an iteration open draws the Continue
  action and the continue by message (`Send`) in the strip where the send pill stood, and the count and "Continue
  without them" in the notices row, as a `paused` session does (`crashLeft` in `WorkspaceView`); with nothing open it
  draws the two continues and no count ("Nothing open to resume", above). `PD-CHAT-001` revision 4 prescribes that
  layout "on a paused session" alone ("the send pill, or on a paused session the two continues that take its place"; "On
  a paused session the send pill's place is taken by two continues"), and REQ-CHAT-005's send pill as it narrows it
  governs everywhere else. Clause 18 grants a crash-left session "the Continue action and 'continue without them' … as a
  `paused` session does"; it names neither the strip nor the continue by message. The build reads clause 18's "as a
  `paused` session does" to carry the paused session's presentation of those continues, and draws the continue by
  message beside them because the send pill it would otherwise keep sends a continue by message on that session too
  (`Sessions.prompt` records the crash first, as every continue does). Drawing it there departs from `PD-CHAT-001`
  revision 4's strip sentence and from REQ-CHAT-005 for a session neither directive governs; the alternative — keep the
  send pill, with the Continue action and the decline beside it in the notices row — was not taken, because the strip
  would then draw two different controls for the same pair of continues depending on why the session rests. *Until the
  merged build's eighth review round this was stated only in passing, in the bullet "Nothing open to resume" above, and
  not asked.*
- **No pause statement.** "Paused. Run controls need the run continued…" stays on a paused session only. A crash-left
  session is not paused, and its run state already says what it is (REQ-CHAT-008's "Run needs recovery", or the
  interrupted presentation). REQ-CHAT-006's chip reason in the recovery state is left as it stands. The Continue action
  belongs to the composer, not to the run controls.
- **The decline's wording before the crash is recorded.** In the recovery state the agents the count names are still
  `running` in the store, yet the decline says "The N paused agents end cancelled". The text is kept. The crash record
  pauses them first (clause 8), then the decline cancels them, so the words describe the act at the moment it happens.
  The wording agrees with how those agents present: before the crash is recorded they present as the crash record will
  leave them, `paused` by `crash` (OQ-100's reading, `crashLeftOf`), so the agent tree, the count and the decline name
  the same agents in the same state.
- **Either choice records the crash first, in one place.** Every continue passes `Sessions.launchContinuation`, which
  records the crash before the stale-child settle and before it resumes or declines the open iteration. So the Continue
  action, the continue by message (`Sessions.prompt`) and the decline need no crash-specific path.
- **The lock.** `Sessions.prompt` tries to re-claim a lock it no longer holds, but it cannot: `resume` returns early for
  a session already live in this process. A probe placed in that branch was never reached on any crash-left path, so
  `continueSession` does not copy it
  (`docs/defects/fixed/a-continue-by-message-cannot-re-claim-a-lock-it-no-longer-holds.md`). *Repaired 2026-09-29
  (R-067), and this bullet reported back in place: every continue — `prompt`, `continueSession` and `planDecision` —
  now claims the lock before its first write and the run it launches holds it (`holdForContinue`, through the at-rest
  cancel's `claimLockReaping`), so a crash-left session's continue reaps the dead local holder its crash left, or
  refuses with REQ-SESSION-048's words while another live process holds the lock. The dead branch in `prompt` is gone.
  ADR-0005's section "the lock a continue takes back" records the first execution.*

**What a ruling decides.** Whether a crash-left session's strip should draw the two continues in the send pill's place,
as built, or keep the send pill (REQ-CHAT-005) with the Continue action and the decline in the notices row, since
`PD-CHAT-001` revision 4 prescribes the paused continues on a paused session only. Whether a busy session of unknown
liveness should also be continuable, for example after a confirmation, rather than refused. Whether a crash-left session
should state something of its own in the notices row, where a paused session states its pause. Whether a crash that left
a durable hold should offer anything beyond that hold's own continues. Whether the composer should withhold the
continues on a session the store's failure left busy, or on an `interrupted` or `paused` one whose store failed while it
was followed (and the surfaces a paused child's Cancel there), rather than draw them and have the engine refuse them.
Whether the Continue action on a session with nothing open and its last request finished — crash-left, `paused` by a
pause, a stop or the application's quit accepted after its iteration closed, `paused` by a plan Cancel, a stop or a quit
of the plan cycle held after a resumed iteration that carried out the continue's message, or `paused_message_limit` by a
limit reached as the iteration that finished it closed, whose resolution's 'continue' and 'double' take the same path —
should re-run that request as built, append nothing and run nothing, or not be offered at all, which for the crash-left
session would narrow clause 18's "SHALL offer". Whether a run whose explicit cancel was accepted but not carried out
when its host died is one a crash left, as built, so that clause 18's Continue action resumes its agents, or whether
clause 3's "those are never resumed" governs it, so that the cancel is made durable when it is accepted and the next
repair or continue ends its agents `cancelled` and closes the iteration.

**Ruled 2026-09-29 — the last question, [R-067](../../product/requests.md#r-067).** The owner took the recommendation: clause 3's
"those are never resumed" governs a run whose explicit cancel was accepted but not carried out when its host died. The
cancel is made durable when it is accepted — a stored mark, written by an **appended** store migration — and read where
the build reads a crash: the next repair or continue ends those agents `cancelled` and closes the iteration, the Continue
action counts none of them, and clause 18's Continue does not resume them. REQ-MONITOR-126's "cannot be undone in this
session" then holds across the host's death. No directive text changes: clause 3 already says it, and the reading above,
which departed from it, is withdrawn by this ruling. The other questions of this entry stay open. Nothing is built by the
ruling; the repair is owed to
[`a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md`](../../defects/fixed/a-crash-during-the-explicit-cancel-leaves-the-cancelled-run-resumable.md).

*Built 2026-09-29 (R-067), and its first execution reported here.* The mark is `iterations.cancel_accepted_at` (store
**v27**, appended): the reserved run id's `Run.cancelAgent` writes it on the iteration open in the store at the moment the
cancel is accepted, at the stronger durability setting, and `Run.turn` writes it on an iteration it opens after the cancel
was accepted. The run's own close keeps it as history, so only an OPEN row carrying it is a cancel never carried out. The
crash record reads it before anything else (`recordCrash` → `recordAcceptedCancel`): the calls a dead step left
unanswered are answered and counted as for a crash, every agent of the iteration not in a terminal state — `paused` ones
included, where the cancel overtook a rest — ends `cancelled` with its report stored and materialised
(REQ-LIBRARY-092), and the iteration closes `cancelled` with its task back to `pending` in the same transaction
(REQ-ORCH-135), recorded by the vocabulary's `iteration.end`, and `iterations_completed` moved past it; the close is
warned to the session log (OQ-76's channel) and no timeline word is minted for it, since REQ-ORCH-139's vocabulary is
closed and names none (the build first wrote an `iteration_cancelled` timeline entry, withdrawn at verification); the
stored approvals and the background sessions are recorded as for any dead run. `crashLeftOf` names none of those agents,
`resumableOf` states nothing to resume, `cancelLeftOf` names them while no run carries the cancel out so every surface
presents them `cancelled` and ended with the run, and a continue is set up as the entry role. The run-level agent the
surfaces synthesise is presented the same way: in REQ-CHAT-008's recovery state with nothing to resume, `runLevelAgent`
(`packages/ui/src/agents.ts`) presents it `cancelled` and not live, as the repair's `interrupted` then leaves it, and
offers it neither Steer nor Cancel. The build first left it drawn `running` and live there, since `resumableOf`'s null
took it out of `runLevelResting` and nothing else stopped it — a presentation `main` already gave a crash between
iterations, which the same change ends (found at verification, pinned in `packages/ui/src/agents.test.ts`). So the repair closes the
iteration, and the Continue action and a continue by message resume nothing of it: the session goes on as a new
iteration, which takes the cancelled task up as REQ-ORCH-135 anchors it — as a send after a cancel carried out does.
What the ruling left to the build, read here: the repair still writes REQ-SESSION-060's `interrupted`, so the session is
one a crash left under clause 18 with nothing open to resume ("Nothing open to resume", above) — the ruling bars
resuming the cancelled agents, not the Continue action. That is what a cancel carried out by its own run leaves too:
`resilience-proof`'s `cancel` launch rests `paused` with nothing open to resume (its iteration closed `cancelled`), and
the next send takes the cancelled task up as a new iteration, as here. One reading departs from a requirement and is raised as
**OQ-130**: no checkpoint is captured for the iteration the record closes (REQ-GIT-051). The first execution — the unit
tests in `run/crash.test.ts` ("PD-ORCH-005 clause 3 with REQ-MONITOR-126 (OQ-103 ruled): …", at the store and at
`Sessions`: the mark at acceptance and at an iteration opened after it, the repair, and the Continue action, "continue
without them" and a continue by message from the recovery state and from `interrupted`) — found the repair holding on
every path the note named, and one thing the ruling did not name: a paused agent the record cancels keeps its `interruption` and
`resume_state`, as clause 6's decline leaves one (`Run.cancelPausedAgents`), which the runtime view's `children` row
already records. Thirteen of its fourteen cases fail with the repair's reads and writes withdrawn. In the built app,
`resilience-proof`'s `cancel` launch — "Cancel the run" confirmed from the wait header — wrote the mark on a store the app
had migrated to v27, and the run's own close kept it; no proof kills the host between the cancel and its teardown, so
the record's half is shown by the unit cases alone.
