# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 4. Children (ADR-0012)

Part 7 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 4. Children (ADR-0012)

`delegate` is a tool call admitted through five checks in order (role known — since OQ-228 and OQ-229 "a delegation target
of the caller", `resolveDelegationTarget` in `children/personas.ts`; depth, total, active, dependencies)
into the **ledger** (one row per child, every transition one transaction with its `child.transition` event);
the **scheduler** is a pass to quiescence triggered by a state change, never a timer (cascade `blocked`, admit
on `succeeded` + report stored, promote one held child per freed model slot, claim starts); a child runs its own
turn loop under its persona's tools, model, credential and supervisor; its **report** comes from a bounded summarising pass on `default_summary_model` (REQ-CONFIG-065) or the entry model,
which reads the task as given (the ledger row's, the payload's blocks ahead of it marked omitted) and the most recent
part of the transcript within 12,000 characters, the omission marked between them, beside the report's deterministic
facts — edited files (a write the record answers as refused, or cut before it started, is not one; a write cut off
while under way is; since fin32 a code-intelligence EDIT-tier call is a write, its path read from the argument the binding
manifest's `editArguments` names — `writtenPathsOf`, PD-ORCH-004; since fin35 a cross-file one's files are those its result
part's `observedPaths` names, listed whatever it returned, and one with none is said in the Edited files line rather than
"(none)" — `writeReadingOf`, OQ-245), commands and exit codes (OQ-111; OQ-120 asks the facts' bound). The task is kept whole within the
12,000, exempt from the 2,000 per event every other event keeps (OQ-119 as ruled, `PD-ORCH-007`). For a child the runner
settled other than `succeeded`, the facts open with an **Outcome line** — "Outcome of this agent, not of the session:" (since
fin32, the a68f121 duress run's D9), the status, the end reasons the run recorded and, for a child cut off while making
progress, PD-ORCH-004's statement (`ReportInput.cutOffStatement`) — and the ask, naming the agent, tells the pass to state it
first as what happened to the agent, never as the run or the session failing, and never to call the task completed; a pass can never raise such a child's status (`shape`; OQ-217,
R-072). A succeeded child's request is as it was;
the parent resumes with the report. Every exit from an iteration leaves every child record terminal — except a rest
(PD-ORCH-005), which leaves every unfinished child `paused`.

**The per-model count is the process's (REQ-CONFIG-094, acceptance A13, 2026-09-30).** A ledger sees one iteration of one
session, and the run host runs every live session at once, so the cap a spawn and a promotion are judged against is
`ChildLedger.slotsInUse` — this iteration's children that hold a slot (`slotsInUseHere`) plus the slots every other
session holds on that key (`slotsHeldElsewhere`). A child holds a slot from `starting` through `running` and
`summarizing`, and while it is `paused` out of `running` or `summarizing`: PD-ORCH-005 clause 4's resumed agent "keeps the
place in every child limit it already held" (`holdsModelSlot`, **OQ-149**). `Sessions` holds one `ModelSlots`
(`children/model-slots.ts`, in memory) that a **session** joins when a run of it starts or continues and stays in while
the run is under way or while it rests with a paused child keeping its place; it answers from its store (every child of
the session that holds a slot), and it leaves when neither is true, or when it is evicted or deleted. A child's terminal
state, a run's end, a decline (clause 6) and a cancel at rest (clause 16) wake every other session's run for one scheduler
pass (`Run.wakeForFreedSlot`), so a child another session holds `waiting_on_model_slot` is promoted when the slot frees
rather than when its own run next changes. The held-child queue stays each session's (`model_slot_queue`); the release
order across sessions is **OQ-148**, and the key is the string alone whichever workspace defines it (**OQ-150**). Each
`slotFree` check reads every other joined session's children from its store — one query per session per scheduling
decision.

**A child's name is never a root's (REQ-ORCH-044 with OQ-158, acceptance A23, 2026-10-01).** `ChildLedger.spawn` names a
child under REQ-ORCH-044's rule against a set that holds, beside its parent's children's canonical names, its root's
canonical name and the entry persona it runs as, and the persona and canonical name of every root the session has recorded
(`recordedRootNames`, `children/naming.ts`: each iteration's, and each publishing root no iteration records — the sources
`entryRootsOf` reads), at every depth. The surfaces give the run-level agent every row and artifact carrying a root's name
(§3, `SessionRecord.entryRoots`), so a child carrying one was drawn as both; until this only the root's direct children were
kept off its canonical name
([`a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md`](../../../defects/fixed/a-child-named-like-a-root-is-presented-as-the-run-level-agent-too.md)).
A root named like an earlier child is still drawn as both
([`a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md`](../../../defects/fixed/a-root-named-like-an-earlier-child-is-presented-as-that-child-too.md)).

**The eleventh state (PD-ORCH-005).** `CHILD_TRANSITIONS` admits `paused` from every non-terminal state and leaves it
for exactly the state the child resumes into (`RESUME_STATES`, `resumeStateFor`: where it waited, `queued` again for a
child claimed but not started, `running`, `summarizing`); either settling path still ends it. It presents as `paused`,
a presentation state of its own (`presentationChildState`; PD-ORCH-005 clause 13 narrows REQ-MONITOR-046), and
`toAgentRecord` never settles a `paused` child to the run's outcome for presentation (clause 13 narrows REQ-MONITOR-211/213
and REQ-SESSION-078/180), keeps its activity, shows it no active tool and carries its `interruption`. The agents a crash
left unfinished present the same before the crash is recorded — `crashLeftOf`, read once per projection from the store
and the one liveness predicate, names them, never for a session a store failure left busy (`Sessions.restingOf`,
OQ-103) — so every surface agrees with the Continue action's count; this departs from clause 13's last sentence, which
settles every unfinished agent not `paused` as before (**OQ-100**).
A rest moves it there (`IterationChildren.rest`, and `execute` for a child that was running: it resumes `summarizing`
only when its turn truly finished, else `running`), and so does the crash record. A continue moves it back
(`resumePaused`, §2); the continue that declines it ends it `cancelled`.

**Cancelling one child (REQ-ORCH-133 / REQ-MONITOR-128; the repair of `cancelling-one-child-does-not-stop-it.md`).**
Each child execution holds its own `AbortController`. `IterationChildren.cancel` settles the child and every live
descendant `cancelled`, stores each report and `child_user_cancelled`, and aborts each execution; an execution that
finds its record terminal writes nothing further, so the cancellation's report stays.

**A child settled without its turn (REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-108; repaired 2026-09-29).** The cascade
stores each blocked child's `blocked` report (`blockedReport`, naming the dependency and how it ended) with its
artifact before the terminal callbacks resume its parent. Both start paths run a child through
`IterationChildren.executeSettling`: the scheduler's `runChild`, and `resumePaused`, whose record load is guarded the
same way and whose settle is tracked as `runChild`'s execution is, so a rest waits for it. A raise that `execute`'s own `try` did not catch goes to `settleRaised`. That covers the stretch that builds
the turn's persona, tool port, compression and fingerprint, the settle after the turn, and a resumed record that does
not decode. The child ends `failed` with a `child_exception` issue and a report naming the raise, and the teardown the
settle in `execute` writes (REQ-ORCH-098): `child_end`, `child_result`, `child_conversation_closed` and
`child_completed`. So no child is left `running` with no execution behind it.
Since 2026-09-30 a child the scheduler settles without an execution — one the cascade blocks, or one the finalize sweep
cancels, started or not — is torn down too: `SchedulerDeps.teardown` writes the same three entries through
`writeTeardown`, after its report and before the terminal callbacks (REQ-ORCH-098; OQ-152; the repair of
[`a-child-that-never-started-gets-no-teardown-timeline-entries.md`](../../../defects/fixed/a-child-that-never-started-gets-no-teardown-timeline-entries.md)).
Since 2026-10-01 so is a child every other path settles `cancelled` — the user's cancel of one child and its live
descendants (`IterationChildren.cancel`, after each one's `child_user_cancelled`), the cancel of a paused child at rest
(`Sessions.cancelPausedAtRest`), "continue without them" (`Run.cancelPausedAgents`), the crash record of an accepted
cancel (`recordAcceptedCancel`) and the stale-child settle (`settleStaleChildren`) — each through `writeCancelledTeardown`
with the report it stored. `writeTeardown` lives in `children/ledger.ts` beside `storeChildReport`, and takes its time from
the writer's clock (`SessionWriter.wall`), because the last two run from the store alone. A cancelled child's execution
that returns later finds its record terminal and writes none, so each end is torn down once (the repair of
[`a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md`](../../../defects/fixed/a-child-cancelled-outside-its-execution-gets-no-teardown-timeline-entries.md)).

**A settle's hook runs in line (REQ-HOOKS-076 / REQ-HOOKS-080; repaired 2026-09-29).** Both settles, the one at the end
of `execute` and `settleRaised`, make the terminal move and write the teardown. Then they run the `child_completed` hook
before they tell the scheduler (`scheduler.settled`), which wakes a parent waiting on the child. From the hook's start
until that call, the child is held in `IterationChildren.settles`. A parent that finds the child ended on its own first
waits until none of those children is settling (`settlesOf`):
- in `runWithChildren`, before it takes its newly ended children;
- in `wait_for_tasks`, before it checks its set, and again after the wait.

`settlesOf` looks again whenever the settles it waits on end, because another child can end meanwhile and start its
own hook. A child settles once, so the wait ends. An agent whose loop ends while a child of its own is still settling
waits the same way before it returns. This happens, for example, when its turn failed. A rest and a stop await the
settles as executions. So the hook finishes before the parent is given the report, and before `iteration_end` and
`session_end`. Before this repair, a normal end did not wait for a settle: a parent took a child's report as soon as it
found the child ended. The repair's first form waited only on the settles running when each wait began, so a second
child that ended during the wait was taken while its hook ran (found by the verifier's fifth round). Both are recorded
in [`a-child-completed-hook-can-finish-after-its-iteration-ends.md`](../../../defects/fixed/a-child-completed-hook-can-finish-after-its-iteration-ends.md).

**A child settled outside its execution fires the hook too (REQ-HOOKS-003 / REQ-ORCH-048 / REQ-ORCH-052 / REQ-ORCH-053 /
REQ-ORCH-133 / PD-ORCH-005 clause 6; repaired 2026-09-30).** `IterationChildren` listens to every terminal move the
scheduler is told of; one its own settle did not make — the cascade, the finalize sweep, the user's `cancel` of one
child — fires `child_completed` through `completedOutside`, one hook after another in the order the children settled,
each child held in `settles` until its hook is done, and tracked as an execution. Its fields are taken as the scheduler is
told and carried to the hook, so a hook queued behind another sends the end that queued it even when a follow-up (clause
22) has moved the record on meanwhile — the first form read the record when the hook started and sent the follow-up's
state, found by the second verification. The listener tells a settle's own terminal move by `tellingOwnSettle`, not by a
`settles` entry, which a queued outside hook holds too. The run waits for all of them after the
finalize sweep (`completionsSettled`), before `iteration_end`. The stale settle's children are handed to the run
(`RunDeps.settledBeforeStart`) and fired after its `session_start`; the decline fires one for each agent it cancels, after
the continuing run's `session_start`. A child ended where no run's hooks are live — cancelled at rest (clause 16), by the
explicit cancel's close after `session_end`, or by the record of an accepted cancel — fires none, nor does a stale-settled
child whose run ends before its `session_start` (OQ-154). A settle
ends only its own `settles` entry (`beginSettle`), ~~so a child followed up while an earlier end's hook still runs (clause
22) fires the hook once for each end~~ so a child followed up while an earlier end's hook still runs (clause 22) is still
settling, to a parent's `settlesOf`, until the later end's hook is done — the parent in the resume loop or in
`wait_for_tasks` takes it as ended only then (REQ-HOOKS-080). *(Corrected 2026-09-30, the third verification: firing
once per end now comes from `tellingOwnSettle`, not from this guard.)* An outside hook holds its child as settling the
same way, so a parent the cancel, the cascade or the sweep wakes waits for that hook before its next model step. ~~At a stop or a quit these hooks are awaited as executions within what is left of
the 30 s grace and then given up on with them, as a settle's own hook is (REQ-SESSION-092), bounded by the per-hook
timeout.~~ *(Corrected 2026-09-30, the fourth verification: a rest waited on a snapshot of the executions, so a hook the
user's cancel queued while it waited ended after `session_end`.)* A rest waits for these hooks as executions, looking
again until none is left (`IterationChildren.drained`): a pause for as long as each hook's own timeout allows, a stop or
a quit within what is left of the 30 s grace, after which they are given up on with the executions, as a settle's own
hook is (REQ-SESSION-092). Before `session_end` the run waits again for every one the last iteration's children queued
(`Run.childCompletionsSettled`) — within what is left of the grace after a stop — so a paused child cancelled once the
rest is recorded has its hook end first. From that wait on the run's `session_end` has begun
(`IterationChildren.endLifecycle`): a paused child the user cancels after it — `cancelAgent` accepts one until the run has
ended — ends `cancelled` and fires no `child_completed`, which would follow `session_end` (OQ-154's fifth path, under its
built reading; the repair of `a-child-cancelled-while-session-end-runs-fires-child-completed-after-it.md`, 2026-10-01).
The explicit cancel's sweep is awaited (`completionsSettled`) before `outlast`,
bounded only by each hook's timeout. The note is
[`a-child-settled-outside-its-execution-fires-no-child-completed-hook.md`](../../../defects/fixed/a-child-settled-outside-its-execution-fires-no-child-completed-hook.md).
Since 2026-09-30 both settles end through one tail, `IterationChildren.afterTerminal`, which tells the scheduler in a
`finally`: a raise out of the teardown or the hook port no longer leaves a parent waiting on a child that has ended
(REQ-ORCH-048, REQ-TOOLS-156). A raise out of the hook port reduces to a warning and the settle goes on (REQ-HOOKS-079);
one out of the teardown is re-raised after the scheduler is told, and `settleRaised`, finding the child terminal, only
warns. Recorded in
[`a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md`](../../../defects/fixed/a-raise-after-a-childs-terminal-transition-never-releases-its-parent.md).

**The stall watch and the corrective message (REQ-ORCH-089, REQ-MONITOR-117..120, REQ-NOTIFY-111/112;
`children/stall.ts`; OQ-127).** Each attempt of a child's execution runs a `StallWatch` on the clock port. Its
threshold is the role's `stall_timeout`, else `runtime.child_stall_timeout`, 90 s by default, and it is the same window
as the progress rule's. It evaluates every `max(1, min(threshold/6, 5))` seconds and never cancels anything. It is fed:
- every streamed part (`TurnSink.event`, then `TurnDeps.onModelEvent`), each piece of a tool call's streamed arguments
  among them (`tool-input`, since 2026-10-07), which is output for `quietFor` as the text, the reasoning and the complete
  call are (`OUTPUT_EVENTS`): before it a child streaming a long `write_file` was warned stalled and given a `stall` issue
  while the provider streamed at full speed (the duress live runs at `c2fdd6a` and `c2a9444`; the repair of
  [`a-child-streaming-a-long-tool-call-is-reported-stalled.md`](../../../defects/fixed/a-child-streaming-a-long-tool-call-is-reported-stalled.md));
- each tool call's start and end (`onToolStarted`, `onToolCompleted`);
- every turn the run starts for the child (the `turn` closure in `execute`): its payload or record, its children's
  reports, a re-prompt, the corrective message — so a wait on its own children is not counted in the silence
  REQ-NOTIFY-112's recovery reads (`quietFor`);
- the end of each of those turns (`betweenTurns`, when the turn's promise settles): until the run starts the next, the
  child is waiting on its own children or ending, and an evaluation counts no silence — no stall, no wait on tools, the
  callback *not stalled* — so a wait on its own children is not reported as its stall (OQ-155, ruled as built in `PD-MONITOR-005`; the repair of
  [`a-child-waiting-on-its-own-children-is-reported-stalled.md`](../../../defects/fixed/a-child-waiting-on-its-own-children-is-reported-stalled.md)).
  Each child it waits on is watched by its own watch;
- the start of an execution resumed into waiting (PD-ORCH-005 clause 4, `execute`, as the watch is armed): the child
  takes no step until a child of its own reports, so it is between its turns from the start. (Corrected 2026-09-30: the
  bullet above was first read as covering this path too, but no turn settles before such a wait, so it was counted as
  silence.)
- each wait the run itself holds the agent in between two model steps (`StallWatch.imposedWait`, through
  `TurnDeps.onImposedWait` and `LadderDeps.imposedWait`; OQ-173, ruled as built in `PD-MONITOR-005`; the repair of
  [`a-provider-wait-or-a-compression-is-counted-as-a-stall.md`](../../../defects/fixed/a-provider-wait-or-a-compression-is-counted-as-a-stall.md),
  2026-10-01): `resilientStep`'s transient or validation backoff and its suspended wait on a provider limit, and a
  context compression's own model call, automatic or on a rejection (`runTurn`'s `compressing`). While one is held, an
  evaluation past the threshold reports the wait and no stall — the callback *not stalled* — and its release restarts the
  silence, as a call's result does.

What it writes (`stallRecords`, one function for a child's watch and the root's; OQ-127's ruling, 2026-10-06):
- a silence of the threshold with no call in flight: a warning at entry and then every `max(threshold, 30)` s
  (REQ-MONITOR-120), and beside each warning, and only then, a `stall` issue (REQ-MONITOR-119 narrowed by
  `PD-MONITOR-005` revision 2: before it, an issue at every evaluation could evict the session's other issues from
  REQ-SESSION-133's ring);
- the same silence with calls in flight: a `child waiting on tools: …` line at `INFO` (REQ-MONITOR-118) and a
  `waiting_on_tools` timeline entry, at entry and then every `max(threshold, 30)` s;
- the same silence while the run holds the agent in a wait of its own: a `child waiting on a provider limit: …` line
  (or `a retry backoff`, `a context compression`) at `INFO`, at entry and then every `max(threshold, 30)` s, in
  REQ-MONITOR-118's manner (OQ-173), and no timeline entry; the suspended wait's own notice and `model_wait` issue
  (REQ-NOTIFY-083..087) are unchanged;
- activity resuming after a stall: a `child stall recovered: …` line at `INFO` (REQ-MONITOR-120) and a `stall_recovered`
  timeline entry — only when the agent was active
  after the evaluation that last found it stalled (a model event that is not an error, or something the run gave it). A
  stall that ends otherwise — a cancel, a stop, a pause, a hard timeout, a failed turn, at the watch's `stop` or at an
  evaluation between its turns — clears the figure with no line (`StallWatch.endStall`, OQ-153).

The lines go to the session log (REQ-SESSION-142) and the application log: the warning through the run's `warn`, the
waits and the recovery through its `info` (`RunDeps.info` and `ChildrenDeps.info`, which `Sessions` wires to the session
log at `INFO` and to `SessionsDeps.log`; absent, `warn`), since each records an intended state. A session log at its
default `WARNING` level (REQ-SESSION-142) therefore keeps neither the waits nor the recovery: REQ-MONITOR-120's "logged"
is met by the `INFO` line, which the application log keeps (`PD-MONITOR-002`) as does a session log set to `INFO`, beside
the `stall_recovered` entry the timeline keeps at any level. The corrective message
below is a `corrective_message` timeline entry of severity `warning` and a `child corrective message: …` line at `WARNING`
(`recordCorrectiveMessage`), since a failed step precedes it (the entry took the writer's default, `info`, until 2026-10-06,
finacc3 finding F11). *(Until 2026-10-06 every one of these lines went through
`warn`, and none was a timeline entry, because REQ-ORCH-139's closed vocabulary had no word for them; OQ-127 and OQ-157
were ruled together that day.)*

Its per-evaluation callback reaches the host (REQ-ORCH-089, REQ-MONITOR-119/120/122; OQ-153; the repair of
[`a-stalled-child-is-never-shown-stalled.md`](../../../defects/fixed/a-stalled-child-is-never-shown-stalled.md), 2026-09-30):
`IterationChildren.stallEvaluated` keeps the silence of a stalled evaluation, else null, beside the agent's tool activity
(`AgentActivity.stalled`), and `ProjectionOwner.refreshRecord` republishes the record whenever the figure changes — at every
evaluation of a stall, and once at its recovery. The figure is `AgentRecord.stalledSeconds`, which the agent trees, the
Mission table and the persona window draw as a `tag-wait` badge (`stalled Ns`) and the inspector's meta line ends with. The
same evaluation serves REQ-MONITOR-135: an agent waiting between its turns on its own children with a steer pending
(`ChildrenDeps.steeringPending`, a read that takes nothing) is woken (`wakeForSteering`), and the step `runWithChildren` then
starts for it injects the steer; every delivered steer restarts the watch's silence (`refreshing`). **The root is watched
too**: `Run.turn` arms a `StallWatch` over the root's whole execution, against its role's `stall_timeout`, else
`runtime.child_stall_timeout`, else 90 s, fed as a child's is, with no silence counted between its turns
(`betweenTurns`) — a root resumed into waiting (PD-ORCH-005 clause 4) is between its turns from the start. It writes the same warning, `stall` issue, log lines and timeline entries naming `agent`, and its figure is
`SessionRecord.entryStalledSeconds` (`Run.entryStalledSeconds`), which the run-level agent carries. It gets no corrective
message. A child's turn can end `failed` after no output for the whole window,
with no call in flight. Unless the outcome is one REQ-NOTIFY-112 excludes, that child is given one corrective message:
the next user message of the conversation the failed turn left, run through the resume loop. It is given once per
child task: across the fallback retry, and across PD-ORCH-005's resume, whose execution reads the task's whole
conversation record (`ConversationRecord.everRecorded`) for a message it was already given. That read skips a row that
does not decode, so it never fails a resume that `load`, which reads from the last replacement on, allows.

**Write scopes (PD-TOOLS-006; `children/write-scope.ts`).** A `delegate` call may carry `write_scope`, path
patterns in the `glob` tool's dialect (the one compiler, `kernel/glob.ts`). `IterationChildren.delegate` validates
them before admission (an empty, absolute or root-escaping pattern is a `rejected` delegation with no record; so,
since revision 3, is a scope for a known persona, or an alias of one, that cannot write files — `writesFiles`:
`write_file`, `haet_edit` or `haet` surviving `coordinator_only`, `read_only` and the `tool_restrictions` lists the
persona's own map and the delegating persona's map give its name (OQ-145) — whose reason names the catalogue's
writers that caller's map lets write, `fileWriters`) and,
once the ledger has accepted the child, records its **claim** in `WriteClaims` — in memory, in acceptance order —
together with the child's **disclosure**: its own scope and the live scopes of the others as they
stand at that moment. The disclosure is rendered as a block immediately after the workspace-root line of the child's
payload (`childPayload`) — since `PD-TOOLS-006` revision 10 (OQ-334, fin47) after one fixed sentence that every payload carries
between the root line and the scopes (`CHILD_REPORT_ARTIFACT_SENTENCE`, `children/notify.ts`): the run keeps the child's report as an
artifact, and that report meets a request to publish when the child holds no tool that publishes artifacts. A claim is live while its child's ledger state is non-terminal, read at every query, so
it lapses on every terminal path without a hook of its own. The refusal is the **gate's**: each agent's
`ToolPortContext.writeClaimFor` is bound to that agent's task id and reaches `Run.writeClaimFor` →
`IterationChildren.writeClaimFor`, which answers with the earliest live claim matching the path unless the caller
is that claim's child or one of its descendants (a walk up the ledger's parent links). `Gate.dispatch` asks it for
`write_file` and `haet_edit`/`haet` after the schema parse and ahead of the permission resolution, with the path
resolved by the fence, so a claimed write settles `blocked` (`failure_kind: write_scope_claimed`) without costing
the user an approval. `terminal`, `git_commit`, MCP and plugin tools are not fenced: that is the directive's stated
cost. Since PD-TOOLS-006 revision 2 the declared patterns are also stored with the child's record
(`children.write_scope`, v23, written at spawn), so a child resumed under PD-ORCH-005 can claim them again; the claim
itself stays in memory and belongs to one run.

**What `delegate` tells its caller (PD-TOOLS-006 revision 4, OQ-216; `run-host/tools.ts`).** The `delegate` executor is
built per agent in `createToolPort`, and its description carries that agent's catalogue: every persona the resolver knows
(the built-in table where none resolved), each with the REQ-TOOLS-001 facets of the native tools a child of this agent
would be granted — computed by `resolveAgentGrant`, the function the child's own port applies (not the entry, coordinating,
under this agent's `tool_restrictions` map, with this run's prerequisites; the plan gate not applied) — and the aliases
whose targets exist, then the instruction to ask a persona only for work its tools allow and to hand command output on
through `depends_on` or `inherited_context` (`renderDelegateCatalogue`, `agent-tools`). It is computed once, at port
creation. The coordinator's routing table (`ROUTING`, `children/personas.ts`) carries REQ-ORCH-028's two capability clauses
for `codebase-analyst` and `librarian`; a configured `system_prompt` replaces it, and not the description. Since `PD-TOOLS-006`
revision 8 (OQ-250) the table closes with one fixed sentence (`ROUTING_WORK_SENTENCE`) that names no persona's tools and sends the
work a route implies to a persona whose catalogue entry allows it, so the prompt stays the constant `entryInstructionsFor`
recognises; the catalogue's closing instruction also forbids a brief offering a command or tool the persona's entry lacks.
Since revision 9 (OQ-257, fin38) the description's write-scope sentence (`WRITE_SCOPE_SENTENCE`, `agent-tools`) ties file work to a
persona whose entry writes workspace files and says a scope given to any other is refused, and the `write_scope` field carries the
same in the offered schema (`WRITE_SCOPE_FIELD_SENTENCE`, through `z.toJSONSchema`); a sentence after it (`HAND_OFF_SENTENCE`) says
what `depends_on`, `inherited_context` and `attach_artifacts` each carry, with the hand-off budget (`HAND_OFF_BUDGET`, `kernel`).
Since revision 10 (OQ-334, fin47), where the caller's run holds an artifact store (`delegateTool`'s `artifactStore`, the same
prerequisite the catalogue's grants are resolved under), a sentence after that one (`REPORT_ARTIFACT_SENTENCE`) says the run keeps an
ended child's report as a `child_report` artifact and that a child is asked to publish only where its entry says it publishes
artifacts; and the catalogue adds a fourth computed word, "publishes artifacts", to an entry whose resolved grant holds
`artifact_write` (`catalogueWords`) — the persona's own `can_publish_artifacts` with the store (OQ-212), so no built-in entry
carries it under the defaults.
