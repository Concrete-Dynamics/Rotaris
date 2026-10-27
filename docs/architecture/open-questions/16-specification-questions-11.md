# Open questions — Specification questions (11 of 27)

Part 16 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-95, OQ-96.

**OQ-95 — Is the transcript drawn from the conversation record, and what of a model exchange does the record hold?** *(`PD-ORCH-005` clauses 1 and 12; REQ-MONITOR-248, REQ-SESSION-196, REQ-CHAT-046 and REQ-SESSION-029, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revision 2 under [R-060](../../product/requests.md#r-060). Numbered OQ-68 while it was built; renumbered when it reached `main`, where OQ-68 had been taken meanwhile.)*

Clause 1 calls the conversation record "the record a resume is made from, and the same record a session's transcript
is drawn from". Read as an instruction, it would have the transcript's rows derived from the agents' conversations.
Read as a statement, it says the two come from one session record. Clause 12 separates them in the same breath —
paging the transcript never touches the conversation record, and clearing the transcript clears only closed
iterations' records — which an instruction to derive one from the other would make meaningless. REQ-SESSION-029, which
the directive does not name, promises that "no part of a session's content exists in two places where the two could
disagree", and the record and the transcript's rows now carry the same messages twice.

Clause 1 also says the record keeps "each message sent to and received from the model". Two parts of every request are
not messages of the conversation: the system prompt and the tool definitions, which the product rebuilds from the
persona each time an agent is built. And one part of a response is received but never sent back: streamed reasoning
(REQ-CHAT-163), drawn in its own row.

**What the build proceeds under.**

- **The statement.** The conversation record is a new part of the session's record (`agent_messages`, v23), written as
  each agent's conversation changes; the transcript's rows are written exactly as before (REQ-MONITOR-248,
  REQ-CHAT-046), and nothing re-derives either from the other. REQ-SESSION-029's promise is kept in its consequence:
  the two cannot disagree about what an agent was sent, because the transcript is not what a resume reads.
- **The conversation, not the request.** The record holds the messages of the conversation — everything a request
  carries after its system message — and not the system prompt, the tool definitions or streamed reasoning. A resumed
  agent is built from its persona as any agent is, so a persona edited between the rest and the resume gives it its new
  instructions and tools.
- **Clause 12's two rules as stated.** Paging releases transcript rows and leaves the record alone; a transcript clear
  removes the conversation entries of every iteration that is not open, in the clear's own transaction, and keeps an
  open iteration's until the next clear after it closes (the record is not cleared at the close itself). A plan cycle
  (iteration 0) has no open row, so a clear during a live plan cycle removes that cycle's record too; a plan cycle is
  never resumed (clause 11). The clear's acknowledgement is unchanged; the count removed is in `transcript_cleared`'s
  metadata.

**What a ruling decides.** Whether the transcript should be rebuilt from the conversation record — which would make the
record's content and the transcript's rows one fact with one writer, at the price of rewriting the transcript's
projection — or whether the two stay parallel records of the same run, as built; and whether the record should also
keep the system prompt and tool definitions each request carried, so a resume replays the instructions the agent had
rather than the persona's current ones.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, [R-064](../../product/requests.md#r-064).** The owner took both recommendations. The transcript
and the conversation record stay two records of one run, each written as the run happens, and clause 1's last sentence
is replaced to say so. Each agent's record also keeps a fingerprint of the instructions and tools it started with; a
resumed agent runs with its persona's current ones, and the run states, as a warning, when they changed (clause 14).
Until that is built, a resume says nothing of a changed persona.

**Built 2026-09-28 under [R-065](../../product/requests.md#r-065).** Store v24 keeps each agent's fingerprint
(`agent_fingerprints`), and a resume under changed instructions or tools states a warning naming the agent. Building it
raised OQ-105.

**OQ-96 — Which control is a stop and which the final cancel, and what does a rest do at the edges the directive does not reach?** *(`PD-ORCH-005` clauses 2, 3, 8, 9, 10 and 11; REQ-MONITOR-009, REQ-MONITOR-126, REQ-MONITOR-130, REQ-MONITOR-092, REQ-SESSION-092, REQ-SESSION-108, REQ-SESSION-186, REQ-SESSION-025, REQ-ORCH-080, REQ-ORCH-135, REQ-GIT-094, REQ-TOOLS-063 and REQ-CHAT-101, which the directive does not name. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../../product/requests.md#r-060) and [R-061](../../product/requests.md#r-061). Numbered OQ-69 while it was built; renumbered when it reached `main`, where OQ-69 had been taken meanwhile.)*

Clause 3 leaves every unfinished agent `paused` after "a graceful stop" and keeps "the cancel control
(REQ-MONITOR-126, 'cannot be undone in this session')" final. The product has one stop control and one cancel. The stop
control is REQ-SESSION-186's: its first activation requests REQ-SESSION-092's graceful stop, and a second activation
while that is pending forces it; the engine receives both as the `cancel` operation. The cancel is REQ-MONITOR-126's
confirmed control, which reaches the engine as the cancellation of the run's reserved agent id (REQ-MONITOR-009). The
directive does not say whether a forced stop is still a stop. Nor does it say what becomes of a run the product ends on
its own account, or of a plan cycle a stop reaches. It also leaves open several edges of a rest: a model step in flight
when the pause is accepted, a rest that finds nothing unfinished, and what a crash can withdraw.

**What the build proceeds under.**

- **The stop and the cancel.** The `cancel` operation is the stop, graceful or forced alike, and brings the run to rest
  (`stop`, or `quit` for the application's shutdown). The reserved run id is the explicit cancel: its stop request is
  marked final (`StopRequest.final`), and it ends every agent `cancelled` and closes the iteration, as before. A stop the
  run raises on its own account (`agent_session_aborted`: a recording failure, the headless abort hook, a supervisor
  escalation) is no user's act and ends its agents as before.
- **Which surface sends which.** The composer's stop control ("Stop run", then "Force stop") sends the stop, and asks
  no confirmation: it ends nothing, and REQ-SESSION-186 asks for none. Every confirmed "Cancel the run?" — the
  inspector's cancel of the run-level agent, the Mission view's run row, the wait header's "Cancel the run" and a
  persona window's Cancel on the run's own instance — sends the reserved run id, the final cancel, so REQ-MONITOR-126's
  "cannot be undone in this session" is true of it; a persona window's Cancel of a child confirms it as REQ-MONITOR-128
  asks and cancels that child (REQ-SHELL-075(g), REQ-MONITOR-130's "an auxiliary window"). *Phase 5's second repair
  left the persona window's unconfirmed Cancel the stop, reasoning that a final cancel without a confirmation would
  break REQ-MONITOR-126; REQ-SHELL-075 forbids no confirmation, so the reason was a false choice, and the button now
  confirms and cancels (found by phase 5's third review).* `/stop` stays the stop: it asks nothing, and REQ-CHAT-029's
  "MUST cancel that run" is read as met by the run ending, though its description reads "Cancel the active run" — put
  to the owner below. *Until phase 5's repair every one of these
  surfaces sent the stop, and the composer's stop was itself confirmed by the "Cancel the run?" dialog, so the reading
  above — that the confirmed control reaches the engine as the reserved run id — was false of the built product: a
  confirmed "cannot be undone" left every agent paused and resumable, and the final cancel was reachable from no
  surface (found by phase 7's built-app rehearsal).*
- **A plan cycle is never at rest.** Clause 11 says no agent is unfinished while the plan gate holds, and a plan cycle
  runs while it holds. A stop or a quit during a plan cycle ends the cycle's agents as before and records no
  interruption, and a crash during one leaves no open iteration: a plan cycle has no `iterations` row, and its children
  are settled by REQ-ORCH-053 at the continue.
- **The step in flight.** A model step already streaming when the pause is accepted finishes (REQ-MONITOR-123: "the
  current step finishes"), and it is the last one. The calls it asks for were not in flight when the pause was
  accepted, so none of them starts; each is recorded as never run. A stop aborts that step, as REQ-SESSION-092 always has.
- **Nothing unfinished.** When a pause or a stop finds the root finished and no child unfinished, there is nothing to
  hold, and the iteration closes as REQ-MONITOR-123 and REQ-ORCH-135 have it close: `cancelled`, its task pending.
- **Background sessions (clause 10).** A session is its starting agent's, by task id. Its "last recorded output" is its
  last 2,000 characters. Its end is recorded once: a stop records `stop` before it ends the session, and the `killed`
  that the stop's kill then produces is refused. A quit records `quit` for the sessions this process still holds. A
  session still recorded `running` that this process does not hold ended with the process that did, and the crash
  record marks it `crash`.
- **What a crash can withdraw (clause 9).** The approvals a dead run left listed in `pending_approvals` are withdrawn by
  the crash record, one `approval_withdrawn` entry each, and the list is emptied. ~~Pending questions are not persisted
  in this build (REQ-SESSION-025's question half is owed), so a crash leaves none to withdraw.~~ *Since 2026-10-13
  (fin41) the questions are too: the run host mirrors the session's pending prompts to `pending_questions` (v35), and the
  crash record writes one `question_withdrawn` entry for each and empties the list. REQ-SESSION-025's question half is
  reconciled with `PD-ORCH-005` revision 3 (withdrawn at rest, never restored), so nothing of it is owed; ADR-0010's
  fourth execution says so in place.*
- **Cancelling one paused agent.** The cancellation of one agent is a control on a live run, as it is today. A session
  at rest has no run, so a paused agent is ended by clause 6's "continue without them" or resumed; it cannot be
  cancelled on its own while the session rests.
- **Loading is not continuing (clause 8).** Loading a session no longer runs the stale-child settle. Every settle, and
  the crash record before it, happens when a run of the session is about to start, and at a repair. The load's answer
  no longer carries a settled count.
- **Listing checkpoints is not continuing either (clause 8, REQ-GIT-094).** The checkpoint listing repairs the
  session's status first, as REQ-GIT-094 requires, and that repair records no crash: viewing a session's checkpoints
  changes no agent record. The crash is recorded by the repair the user asks for and by the continue.
- **Requirements the directive does not name.** Five requirements the Narrows list omits say otherwise where clauses 2,
  3 and 9 decide, and the build follows the clauses. REQ-ORCH-135 closes an iteration cancelled mid-run `cancelled`; a
  pause, a stop or a quit with an agent unfinished leaves it open, and REQ-ORCH-135 still governs the explicit cancel, a
  run the product ends on its own account, and a rest that finds nothing unfinished. REQ-MONITOR-130 settles every
  non-terminal agent `cancelled` when a run is cancelled; the build reads its cancel as REQ-MONITOR-126's explicit
  cancel, which still does exactly that from every surface, and a stop leaves the agents `paused` as clause 3 says.
  REQ-SESSION-108 puts the pause at the outer-loop boundary so that no agent is part-way through execution and no model
  request is outstanding; clause 2 stops every agent before its next model step instead, and the build reads "part-way
  through execution" as executing: once the pause has landed a paused agent executes nothing and no request is
  outstanding. REQ-TOOLS-063 has closing the approval dialog answer Deny, "no exit path leaves the request
  unanswered", and REQ-CHAT-101 has closing the window emit the question's cancellation. At a quit, clause 9 withdraws
  both instead, so main sends neither when the application's quit closes the surface (`exit.ts`'s `QuitState`): the
  approval or question stays pending until the run host's `shutdown` withdraws it. A quit Electron starts on its own
  account (SIGTERM, the desktop's logout, `app.quit()`) first closes the main windows through their guards, all or
  none, so no dialog closes before every main window's close is confirmed. While the application stays, both requirements govern unchanged.
  *Until phase 7's repairs the quit's close sent the Deny and the cancellation first, and the agent stepped on them
  (`docs/defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md`).*
- **No model call after the pause, wherever one is made (clause 2).** The step in flight is the only model call that
  finishes, and its report stands: a transient failure of it is not retried, no fallback model is tried, a context
  rejection is not condensed, and a provider limit it meets is not waited on. An agent already parked on a provider limit
  stops waiting at once and makes no further request, so a pause during the wait on an exhausted provider completes;
  the turn checks the rest again after supervision and after compression, so neither leads to another step; the manual
  compression is refused, a departure from REQ-MONITOR-092 ("given at least one live agent conversation, manual
  compression compresses every one of them") that clause 2's "no model call is made after the pause is accepted"
  decides; and no child starts a summarising pass. A child's summarising call already in flight when
  the pause is accepted is a step in flight: it finishes, and a usable answer is the child's report, since the child
  then finished before the rest. An unusable one is not retried; the pass is cut short, and the child is left `paused`
  to summarise when it resumes. The same holds from a stop's acceptance, which also aborts the step in flight, so a
  child summarising when the stop lands is left `paused` the same way. The status reads `pausing` throughout, as
  REQ-MONITOR-124 has it.
- **Calls in flight at a stop or a quit (clauses 3 and 9).** Clause 9's last sentence gives every other in-flight call
  REQ-ORCH-134's deadline, and read alone it would give it on a stop and a quit too. Clause 3 has a stop's call "cut off
  before its result arrived", and REQ-SESSION-092's stop aborts at once, so the deadline is the pause's: a stop and a quit
  cut every call in flight at once, each recorded as interrupted with what it had produced.
- **A child that times out or raises during a rest.** "What is unchanged" keeps a timed-out child failed and never
  resumed. A child whose `child_timeout` fires while the run is coming to rest ends `failed` as it would have without
  the rest. Clause 2 permits no summarising call, so its report is the unsummarised one, whose `summary_failure` says
  the run was coming to rest. An agent whose execution raises while the run comes to rest is left `paused`, the root
  and a child alike. A raise mid-rest is most often the rest's own abort surfacing through a tool. The call it raised
  out of is answered in its record as interrupted, and its row settles (`answerOpenCalls`), so it resumes from a
  record whose every call has its result. A call that completed earlier in the same step keeps what it returned, read
  back from its settled row: clause 3 records as interrupted only a call "cut off before its result arrived" (found by
  phase 3's fourth review, which saw a finished write presented as undone). REQ-ORCH-073 (a child that raises ends `failed`) and REQ-ORCH-135 (an
  iteration that raises closes `failed`) still govern a raise outside a rest.
- **An execution the stop's grace gives up on.** A stop or a quit waits for its executions within REQ-SESSION-092's
  30 s. One still running after that is detached. It is left `paused` where it stood, and the call it never returned
  from is answered in its record as interrupted, its row settled; a call of the same step that completed keeps its
  result, as above. When the execution returns, the engine writes nothing
  more for it (REQ-SESSION-094's straggler clause). What the call's own tool gate or a streaming model step writes as it
  finishes is not stopped; `docs/defects/fixed/a-detached-call-still-writes-through-its-tool-gate.md` records it. A root's call
  has no such bound (`docs/defects/fixed/a-root-call-that-ignores-the-stop-holds-the-run-open.md`, which predates the
  build). *Reported back 2026-09-29 ([R-067](../../product/requests.md#r-067)): that last sentence no longer holds. The root
  is awaited within the same 30 s, counted from the first stop request whether or not it was forced, and one still in a
  call past it is detached as a child execution is: left `paused` by a stop or a quit, with its open call answered as
  interrupted, or under the explicit cancel with that call answered as cut off, naming no rest. The rest that follows
  is given what is left of the grace, counted from the first request, so the stop ends within the one 30 s rather than
  the root's time and then a second 30 s for the children. Under the explicit cancel, which rests nothing, the child
  executions still running once their records are settled are detached with the root, and a root given up on still
  drains the background children, bounded by REQ-ORCH-080's own timeout (OQ-121)
  (`docs/defects/fixed/a-root-call-that-ignores-the-stop-holds-the-run-open.md`). *First reported as "A rest that
  follows a detached root waits for no child execution again", which was true and not enough: a root that returned at
  29 s still gave the rest a fresh 30 s, and under the explicit cancel the children stayed attached and the drain was
  skipped (found by the verifier of the repair, corrected the same day).*
  *Reported back 2026-09-29 ([R-067](../../product/requests.md#r-067)): the sentence "What the call's own tool gate or a
  streaming model step writes as it finishes is not stopped" no longer holds either. Teardown closes every tool port the
  run built before anything terminal is written: a call its gate still has open settles then, as failed with the rest's
  interrupted statement, and the gate writes nothing after it. A model step the rest detached streams no row, settles
  none and counts no usage when it returns, and so does one the explicit cancel leaves running past the grace: the
  cancel's children are awaited within what is left of it after their records are settled, and detached past it
  (`docs/defects/fixed/a-detached-call-still-writes-through-its-tool-gate.md`). *First reported without that last
  clause, when only a rest detached: a child step that ignored the explicit cancel still wrote its row and usage after
  `result` (found by the verifier of the repair, corrected the same day).*
- **A call cut by no rest.** A call cut by its agent's limit, by the cancellation of that agent or by the explicit
  cancel is recorded as cut off, and its statement names no rest. Only a pause, a stop, a quit or a crash is named as
  what interrupted a call.
- **A child finished and unreported is unfinished work.** A child that reached its terminal state but whose report its
  parent has not received leaves the parent unfinished: the parent is left `paused`, and a root in that state leaves the
  iteration open, so the report is delivered when the parent resumes instead of being lost with a closed iteration.
- **The explicit cancel meanwhile.** A rest waits for every execution — a pause as long as the steps in flight take, a
  stop or a quit within REQ-SESSION-092's 30 s. The explicit cancel that arrives in that window is final: every agent
  the rest had paused ends `cancelled` and the iteration closes. So is one that arrives later, while teardown ends
  background sessions or runs the `session_end` hooks. Before the run's result is built, the iteration *this run* left
  open closes `cancelled` with every agent it paused, each told the user cancelled the run, and the background
  sessions a pause had left running end. A continue holds the iteration an earlier rest left open from its start,
  whether it resumes or declines it, so a cancel during its pre-flight or its `session_start` hooks closes that
  iteration the same way, and the agents it would have resumed end `cancelled` (found by phase 4's review). *Phase 3's
  third review had read the opposite — "an iteration an earlier run left open, which this run had not yet resumed or
  declined, is not this run's to close" — while every continue still declined such an iteration at its first
  iteration; once a continue resumes it before anything else, leaving it open would have the next Continue resume what
  the user cancelled.* A cancel that lands after that point would find nothing left to close, so it is refused rather
  than accepted and lost.
- **The explicit cancel and a child summarising (REQ-ORCH-080).** The explicit cancel does not abort a summarising
  pass. REQ-ORCH-080's drain waits for background children "without cancelling them", and clause 3 keeps the cancel "as
  today", so a child summarising when it lands writes its report during the drain. Only a rest's abort, a stop's or a
  quit's, ends the pass.
- **A pause accepted in the pre-flight.** The plan hold is not known until the pre-flight answers. A pause accepted
  before that is refused once the hold is known (`run_pause_refused`), and its tool deadline goes with it, even one
  that had already passed.
- **Background sessions at the other ends (clause 10).** The explicit cancel is a stop made final, so it records `stop`
  and ends them as a stop does. A run the product ends on its own account and a stop or a quit during a plan cycle do
  not come to rest, and record nothing of them, as before the build.

**What a ruling decides.** Whether a forced stop should be final, as REQ-SESSION-186's persisted `paused` for a forced
stop hints (a forced stop and a cancel persist the same status). Whether a stop during a plan cycle should leave the
cycle's agents to be resumed, which clause 11's durable hold arguably forbids. And whether one paused agent should be
cancellable while its session rests. Whether `/stop`, which REQ-CHAT-029 describes as "Cancel the active run" and says
"MUST cancel that run", should be the final cancel (and then confirmed) rather than the stop, or be reworded. Whether
REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108, REQ-TOOLS-063 and REQ-CHAT-101 should join the Narrows list, as the
build reads them. Each would change a control's reach, a surface's offer or the record's traceability, and
none is decided by the directive.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4 and [`PD-CHAT-002`](../../product/directives/pd-chat-002.md#pd-chat-002) revision 2, [R-064](../../product/requests.md#r-064).** The owner took every
recommendation (clauses 15 and 16).
- A forced stop is a stop.
- A stop during a plan cycle ends the cycle's agents, and the plan gate keeps its hold.
- One paused child may be cancelled while its session rests, confirmed as REQ-MONITOR-128 requires; REQ-MONITOR-063 is
  narrowed.
- `/stop` is the stop and is described as "Stop the active run"; REQ-CHAT-029 is narrowed.
- REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108 and REQ-TOOLS-063 join the Narrows list, as the build reads them.
- REQ-CHAT-101 is already narrowed by `PD-CHAT-002`, so its quit case is that directive's revision 2.

**Built 2026-09-28 under [R-065](../../product/requests.md#r-065).** The audit of clause 15 found it built, except for a
board run caught by the quit, which rested by `stop` and was repaired; a stop or a quit during a plan cycle now
withdraws what waits on a person. One paused child is cancellable while its session rests, and `/stop` reads "Stop the
active run". Building it raised OQ-101 and OQ-108.

Until they are built, a paused child is not cancellable at rest, and `/stop` keeps its old description.

**Ruled 2026-09-29 — by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 5, [R-067](../../product/requests.md#r-067).** The
status a stop persists, which the build had read and not settled: a graceful user stop persists `paused`, as built, and
so does a forced one (clause 21). REQ-SESSION-186's "A run stopped gracefully and cleanly by the user persists
`stopped`" no longer governs a stop the user made; REQ-SESSION-186 joins the Narrows list and carries the back-pointer.
So does REQ-SESSION-073, whose vocabulary glosses `stopped` with "the user stopped it from the interface,
REQ-SESSION-186": `stopped` stays in the vocabulary for a run that exhausted a configured budget (REQ-MONITOR-029), and
the rest of that requirement governs as written. REQ-MONITOR-029 and REQ-SESSION-093, which already persist `paused` for
an interrupted or cancelled run, are unchanged. A stop and a pause both record the stop reason `user_cancelled`
(REQ-MONITOR-301's closed set has no member for a pause), so clause 21 tells them apart only by the interruption recorded
on the agents and the iteration (`stop` or `pause`) and by the timeline entries that name it.
`a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md` is settled by this ruling and is in
`docs/defects/fixed/`. Nothing is built by it: the code already persists `paused` (`statusForResult`,
`packages/engine/src/run/stop-conditions.ts`).
