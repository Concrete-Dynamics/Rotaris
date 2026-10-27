[Product directives](../directives.md) › PD-ORCH-005

<a id="pd-orch-005"></a>

### PD-ORCH-005 — a continued session resumes the agents its last run left unfinished, from their full record

*Revision 7 (2026-10-06, [R-071](../requests.md#r-071)) — **two rulings on what the build left open**: clause 14 is replaced
(the fingerprint is of the persona's own definition, and a change is stated once, OQ-105) and clause 40 is added (a continue
resumes the paused iteration with the intent and tools it started with, OQ-162); `REQ-ORCH-005` and `REQ-ORCH-013` join the
Narrows list. The owner took both recommendations. Built as revision 6, with clause 23, on its branch,
and renumbered before landing, when the ratification of the readings OQ-100 to OQ-149 recorded took revision 6 and
clauses 23 to 39 on `main` first.*

*Revision 6 (2026-10-06, [R-071](../requests.md#r-071)) — **the readings the build proceeds under, ratified**: the owner
confirmed as built every reading OQ-100 to OQ-104, OQ-106 to OQ-108, OQ-117, OQ-118, OQ-124, OQ-128 to OQ-132, OQ-148 and
OQ-149 record. Clauses 23 to 39 are added, and the Narrows list names the requirements those readings depart from. No
earlier text is replaced, but two earlier clauses are qualified, and each carries a note saying so: clause 13's last
sentence ("settled as before") no longer holds for the agents a crash left, which clause 23 presents `paused` before the
crash is recorded; and clause 15's "whichever surface asks it" no longer holds on one surface, a persona window on the
run's own instance while the session rests, where clause 24 refuses the run's cancel.*

*Revision 5 (2026-09-29, [R-067](../requests.md#r-067)) — **two rulings on what the build left open**: clause 21 (the
status a stop persists, OQ-96) and clause 22 (a follow-up by `session_id` resumes a settled child, OQ-66's open part)
are added, and `REQ-SESSION-186` and `REQ-SESSION-073` join the Narrows list. Nothing is replaced. The owner took both
recommendations.*

*Revision 4 (2026-09-28, [R-064](../requests.md#r-064)) — **the owner's rulings on the questions the build raised**
(OQ-94 to OQ-99): clause 1's last sentence is replaced, clauses 13 to 20 are added, and the Narrows list names the
requirements the build departs from. Nothing else is replaced. The owner took every recommendation.*

*Revision 3 (2026-09-27, [R-061](../requests.md#r-061)) — **what a pause does not wait for, and what outlives it**:
clauses 9 to 12, added; nothing earlier is replaced. The owner ruled clause 9 and delegated clauses 10 to 12.*

*Revision 2 (2026-09-27, [R-060](../requests.md#r-060)) — **the full record**: every agent's conversation is kept as it
happens, and continuing resumes the same agents where they stood, in the iteration they stood in; clauses 1, 2 and 4
and the two closing paragraphs are replaced, and clauses 3 and 5 to 8 are adjusted to match. Revision 1 (2026-09-27,
[R-059](../requests.md#r-059)) is quoted below where it is replaced.*

**(1) Every agent's conversation is recorded as it happens.** The session record SHALL keep the full conversation of
every agent of a run — the iteration's root and every child at every depth — appended as it happens: each message sent
to and received from the model, each tool call with its arguments, and each tool result, under the agent's task id. The
root's task id is recorded with its iteration. This is the record a resume is made from. The session's transcript is
a second record of the same run, written as the run happens beside this one (revision 4).

> Revision 3 said, and no longer governs, clause (1)'s last sentence: "This is the record a resume is made from, and the
> same record a session's transcript is drawn from." The build kept the two as parallel records (OQ-95), and the owner
> ruled that they stay so.

**(2) A pause stops every agent where it stands.** An accepted whole-run pause SHALL let every in-flight tool call
finish, within REQ-ORCH-134's deadline, and then stop every agent before its next model step: no queued child starts,
no child summarises, and no model call is made after the pause is accepted. Every agent that has not reached a terminal
state is left in the child state **`paused`**, with its **interruption** recorded as `pause`, and the iteration is left
open: it is neither closed nor re-queued. The session persists `paused`.

**(3) A stop, a quit and a crash leave the same state; an explicit cancel is final.** A graceful stop, an application
quit and a crash likewise leave every agent that has not reached a terminal state `paused`, with interruption `stop`,
`quit` or `crash` (a crash is recorded when the session is next repaired or continued), and the iteration open. A tool
call cut off before its result arrived is recorded as interrupted, with whatever output it had produced. The cancel
control (REQ-MONITOR-126, "cannot be undone in this session") and the cancellation of one agent end their agents
`cancelled` as today, and those are never resumed.

**(4) Continuing resumes the iteration where it stood.** When a session whose last run left an open iteration is next
continued — the Continue action, a new message or a plan decision — that iteration SHALL resume before anything else
runs. Its root and every `paused` agent are restored from their record with their identity (task id, canonical name,
persona, parent, dependencies, background flag and write scope) and their conversation, and each carries on from its
last message; a `paused` agent moves back to the state it resumes into. A tool call recorded as interrupted is given to
its agent as a result stating that it was interrupted before it completed and was not re-run, so the agent decides
whether to issue it again. A continue made by a new message delivers that message to the resumed root as the user's
next message in its conversation. A conversation too long for its model is compressed as any conversation is. A resumed
agent's `child_timeout` starts afresh, and each agent keeps the place in every child limit it already held.

**(5) What is never resumed.** An agent that ended `succeeded`, `failed` (a timed-out child among them, whose route is
PD-ORCH-004's continuation offer), `blocked` (REQ-ORCH-048), or `cancelled`.

**(6) The user decides at each continue.** The Continue action SHALL state how many agents will resume, and SHALL offer
to continue without them; choosing that ends those agents `cancelled`, the open iteration closes as cancelled, and the
session continues as a new iteration, as today. Resuming is the default.

**(7) An iteration is resumed each time the user continues.** There is no cap: every resume follows a user's act of
continuing, and an iteration interrupted again after a resume is resumable in turn.

**(8) Opening a session is not continuing it.** Loading a session to view it SHALL change no agent record; settling,
recording interruptions and resuming happen only when a run of the session is about to start.

**(9) A pause does not wait on a person (revision 3).** A tool call suspended on an approval or a question when the run
comes to rest — by a pause, a stop, a quit or a crash — is not waited for. Its approval or question is **withdrawn**: it
leaves `pending_approvals` or `pending_questions`, the timeline records it as withdrawn by that interruption, and the
call is recorded as interrupted and never run. It is never recorded as denied, and no answer is replayed later. When the
agent resumes it sees the call as interrupted, and issuing it again asks afresh. Every other in-flight tool call still
finishes within REQ-ORCH-134's deadline and is recorded as interrupted if the deadline passes.

**(10) Background terminal sessions (revision 3).** A pause leaves the background terminal sessions its agents started
running while the application stays open. A stop ends them, and so do a quit and a crash (REQ-TOOLS-111). When an agent
resumes, it is told, for each background session it had started, whether it is still running (with its id) or ended and
by what, with its last recorded output.

**(11) The durable holds win (revision 3).** While the plan gate or the message-limit pause holds, no agent is
unfinished: a pause is refused, and a quit leaves the hold as it stands and records no interruption. Continuing from a
hold is what it is today.

**(12) The record's lifetime (revision 3).** The conversation record belongs to its session and is deleted with it.
Paging the transcript never touches it. Clearing the transcript clears the record of closed iterations only; an open
iteration's record is kept until the iteration closes. A compression is written into the record, so a resume sends the
compressed conversation.

**(13) A paused agent presents as paused (revision 4).** An agent in the child state `paused` SHALL present in a
presentation state of its own, `paused`, on every agent surface — the agent tree, the counters, the inspector, the
Mission view and a persona window — and SHALL keep its last activity. A session at rest SHALL NOT settle a `paused` agent
to the run's outcome for display; every other unfinished agent of a session at rest is settled as before.

> *Qualified by clause 23 (revision 6): the agents a crash left present `paused`, by `crash`, before the crash is recorded,
> and are not "settled as before".*

**(14) What the record keeps beside the conversation — revision 7.** Each agent's record SHALL also keep a fingerprint
of its persona's own definition: the persona's instructions, before anything the run adds to them (a playbook, the
session's context units, the MCP section), and the persona's tool declaration, not the listing a request offers. A
resumed agent runs with its persona's current instructions and tools; when its persona's definition differs from the
fingerprint, the run SHALL state, as a warning, which agent resumed under changed instructions, and the fingerprint then
becomes the definition it resumed under, so that each change is stated once.

> Revisions 4 to 6 said, and no longer govern, clause (14): "**(14) What the record keeps beside the conversation (revision
> 4).** Each agent's record SHALL also keep a fingerprint of the system instructions and the tool definitions the agent
> started with. A resumed agent runs with its persona's current instructions and tools; when they differ from the
> fingerprint, the run SHALL state, as a warning, which agent resumed under changed instructions." The build took "the
> system instructions" to be the whole system prompt a request carried and kept the first fingerprint for every
> comparison (OQ-105), so a playbook a new classification chose, a skill, the MCP section or a workspace instruction file
> warned for agents whose persona no one had edited, at every resume while it differed.

**(15) The stop and the explicit cancel (revision 4).** A forced stop is a stop: its agents come to rest as clause 3
says. A stop or a quit during a plan cycle ends the cycle's agents and records no interruption, and the plan gate keeps
its hold (clause 11). `/stop` SHALL be the stop, offered with the description "Stop the active run". Every confirmed
"Cancel the run?" is clause 3's explicit cancel, whichever surface asks it. In each case this directive decides:
- an iteration a pause, a stop or a quit leaves open SHALL NOT be closed; REQ-ORCH-135 governs the explicit cancel, a run
  the product ends on its own account, and a rest that finds nothing unfinished;
- REQ-MONITOR-130's cancelling of a run is the explicit cancel; a stop leaves its agents `paused`;
- a pause SHALL stop every agent before its next model step, in place of REQ-SESSION-108's outer-loop boundary;
- an approval dialog the application's quit closes SHALL answer nothing, and the quit withdraws the approval
  (clause 9). REQ-TOOLS-063's Deny governs every other close. A question the quit dismisses is PD-CHAT-002 revision 2's.

> *Qualified by clause 24 (revision 6): on a persona window on the run's own instance, a "Cancel the run?" confirmed while
> the session rests is refused, "The run is no longer cancellable.", so "whichever surface asks it" does not hold there.*

**(16) One paused child may be cancelled while its session rests (revision 4).** A `paused` child SHALL offer Cancel
wherever a live agent offers it. Confirmed as REQ-MONITOR-128 requires, naming the child and one line per paused
descendant, it and each paused descendant end `cancelled`, final as clause 3 says. The open iteration stays open, the
rest of its agents resume with it, and the Continue action's count drops by as many as were cancelled.

**(17) A continue's message is also a task (revision 4).** The message a continue delivers to the resumed root
(clause 4) SHALL also be appended to the session's todo as a task. That task closes with the resumed iteration: done
when the iteration succeeds, and left pending when it is cancelled or fails, so the next iteration takes it up.

**(18) A crash offers the same choice (revision 4).** A session a crash left — `interrupted` after a repair, or in
REQ-CHAT-008's recovery state before one — SHALL offer the Continue action and "continue without them" as a `paused`
session does, with the same count. Either choice records the crash first, as any continue does (clause 8).

**(19) The Continue action's count (revision 4).** The count clause 6 requires includes the root, which resumes with
the paused agents. "Continue without them" is offered beside the Continue action alone; a continue by message resumes.

**(20) The handoff's artifact (revision 4).** The artifact REQ-SESSION-115's handoff carries is the latest artifact the
iteration's root published that nothing supersedes and, when the root published none, the latest artifact of any kind
that nothing supersedes.

**(21) A stop persists `paused` (revision 5).** A stop the user made — graceful and clean, or forced — SHALL persist the
session status `paused`, as a pause does (clause 2), and SHALL NOT persist `stopped`. REQ-SESSION-186's stop control, its
two activations and the outcome it presents are unchanged. `stopped` remains the status of a run that exhausted a
configured budget (REQ-MONITOR-029), which REQ-SESSION-073's vocabulary keeps. A stop and a pause record the same stop
reason, `user_cancelled` (REQ-ORCH-069, REQ-MONITOR-301's closed set having no member for a pause), so a stop is told
apart from a pause only by the interruption it records on its agents and its iteration (`stop`, clause 3) and by the
timeline entries that name it.

**(22) A follow-up resumes a settled child (revision 5).** A `delegate` call whose `session_id` names a settled child of
the calling agent — a direct child that has reached a terminal state and that its `child_timeout` did not cut off —
SHALL resume that child from its record: its identity, as clause 4 restores it, and its conversation, with the call's
`task` appended as its next user message. The child keeps its task id, leaves its terminal state for the state it
resumes into, and ends and reports again as any child does. Clause 5 names what a continue resumes; a follow-up is the
parent's own act, and clause 5 does not bar it. A child its `child_timeout` cut off is still never resumed: its route is
PD-ORCH-004's `continuation_of`. What `session_id` names, and how a `session_id` naming no such child is refused, is
PD-TOOLS-006 revision 3.

**(23) The counters, the run-level agent and what a crash left (revision 6, OQ-100).** REQ-MONITOR-169's detail line SHALL
name the paused count between waiting and done — `running 1 · waiting 0 · paused 2 · done 1 · failed 0` — only while an
agent is paused, and read as REQ-MONITOR-169 words it otherwise. The run-level agent SHALL present `paused`, its activity
the run's summary and no interruption, while its session rests with an iteration open — `paused`, `interrupted`, or in
REQ-CHAT-008's recovery state — and as before otherwise. The agents a crash left SHALL present as the crash record will
leave them — `paused`, by `crash`, their activity kept — before the crash is recorded, in place of clause 13's "settled as
before" and REQ-MONITOR-211/213's settling; a session a store failure left busy (OQ-42) is not one a crash left, and
presents as before. A `paused` agent's state is shown in the transcript's "This task" without an elapsed time
(REQ-CHAT-069). A live agent's cancel confirmation and cascade note SHALL name every descendant the cancel ends, live and
paused, in words that say which ("Its live and paused descendants …", "Cancelling cascades to 2 live and paused
descendants."), where REQ-MONITOR-064 and REQ-MONITOR-128 count and list live descendants only.

**(24) Cancelling one paused child at rest (revision 6, OQ-101).** Clause 16's Cancel SHALL be offered for a `paused` child
only while its session rests with an iteration open, and never for the resting run-level agent, whose equivalent is clause
6's "continue without them". A persona window on the run's own instance keeps the Cancel REQ-SHELL-075(g) gives it; a
"Cancel the run?" it confirms while the session rests is refused, "The run is no longer cancellable.", which is the one
surface on which clause 15's "whichever surface asks it" does not hold. The cancel is written under the session's lock. A
child a crash left, the crash not yet recorded, is cancelled from the state it is stored in, and nothing of the crash is
recorded but the answers to its own calls the crash cut off; the next repair or continue records the rest. A cancelled
agent's background terminal sessions are left for the next stop, quit or crash, and an agent whose `depends_on` names it
stays counted and is blocked by the resumed run's first pass (REQ-ORCH-048). A refusal by the store, or by another live
process's lock, states the engine's words in place of REQ-MONITOR-128's "no longer cancellable", and a store error while
the lock is taken reads as the store's failure.

**(25) A continue's message (revision 6, OQ-102).** The task clause 17 appends SHALL be held `in_progress` by the resumed
iteration and close done only when that iteration ends `succeeded`; every other close leaves it pending, marked so that the
next iteration takes it up before any other pending task, and counting toward no retry limit (REQ-ORCH-077). Several
messages one iteration holds close together, in the order they were appended. The iteration that takes one up is sent its
text after the launch content; its images are not sent. A continue that states no new request — the Continue action,
"continue without them", and the message-limit resolution's 'continue' and 'double' — SHALL append no task while the todo
holds a task of its last request's text pending or held by the open iteration, and SHALL append the request again when
that task is complete or abandoned, or in progress with nothing holding it, so a finished request is re-run as a new task
(REQ-ORCH-004). A continue by message always appends its task.

**(26) Which sessions a crash left (revision 6, OQ-103).** A session is one a crash left when it is `interrupted`, or busy
while the one liveness predicate (REQ-SESSION-171) finds no process behind it. A busy session that is live, or whose
liveness is unknown, is refused a continue. A session a store failure left busy is not one a crash left: every continue,
and a paused child's Cancel, on a session whose store has failed is refused `store-failed` until the store is restored
and the session reopened, and the composer still draws them. A crash-left session SHALL draw the paused continues as
`PD-CHAT-001` revision 4 draws them on a `paused` session — the Continue action and the continue by message in the send
pill's place, the count and "continue without them" in the notices row, or the two continues and no count when nothing is
open — and no pause statement. A crash that left a durable hold offers that hold's own continues and nothing more. The
decline's words name the agents as the crash record will leave them.

**(27) The plan gate after a resumed iteration (revision 6, OQ-104).** `PD-ORCH-003` revision 3 states where the gate holds
a run that resumed an iteration, including one a crash left open, and what that plan cycle is told.

**(28) The handoff's artifact (revision 6, OQ-106).** Clause 20's "the iteration's root" SHALL be the root of the most
recent recorded iteration, open or closed — the one the new work follows — known by its task id. Where the latest plan
cycle opened its gate after that iteration opened, the new work follows the plan cycle, no root is preferred, and the
handoff carries the latest artifact of any kind that nothing supersedes; a plan cycle that ended before its gate leaves no
mark and changes nothing. A root with no recorded iteration or no tool port, and one whose every publish is superseded,
published none. A cancelled child's stub report counts as an artifact of any kind. The handoff is read once, at the
continue: a later iteration of the same run is re-sent it as it was built, its artifact line not read again.

**(29) Open offers (revision 6, OQ-107).** `PD-ORCH-004` revision 4's "once" SHALL mean once per root. The first message of
every execution iteration's root carries, in a text part of its own after the launch content, the open offers the launch
content does not already hold, newest ten with the elision line; an offer a list left out is held by that list. A root a
continue resumes is not told again what its record holds. A plan cycle's root is told none. A re-sent handoff's lines are
left as they are, and an offer taken up since is refused at admission.

**(30) A stop during a plan cycle, the board's quit, and the dock (revision 6, OQ-108).** An approval or a question pending in
a plan cycle when a stop lands SHALL be withdrawn by `stop`, as one pending when a quit lands is withdrawn by `quit`; the
cycle's agents end `cancelled`, nothing records an interruption, and the session persists `paused` with clause 32's
summary. A board run caught by the application's quit SHALL come to rest by `quit`, as every quit leaves a run, and a
later continue resumes it — in place of REQ-TRACE-464's "cancel the run"; it is ended, never orphaned. "No other control
stands outside the dock" governs the run-state notices and the strip's input controls: REQ-CHAT-021's "Command not run"
notice, the refusal line with "Open project setup" and REQ-CHAT-169's attachment list keep their places. `/stop` still
sends REQ-MONITOR-004's `cancel` op, read through clause 15.

**(31) What an iteration is told of its task (revision 6, OQ-117).** An execution iteration whose selected task is not the
run's own, and whose text is not the launch content's request, SHALL be sent after the launch content a text part naming
it the task to work on — "The task for this iteration is the task below, from the session's todo. …" — followed by the
task's content, not its name. A task whose text is the launch content's request, and the run's own task even when the user
renamed it, are told nothing more. Only the task's text is sent, never the images its prompt carried.

**(32) The end-of-run summary (revision 6, OQ-118).** REQ-ORCH-082's rule 1 SHALL read "The run came to rest at the user's
request." for every rest a person asked for — a pause, a stop, the explicit cancel — and say which it was nowhere in the
summary. The transcript's system row and the timeline say which rest it was, and the Continue action's count says what a
continue resumes.

**(33) Elapsed clocks (revision 6, OQ-124).** The elapsed figure of an agent not ended whose presentation state is running,
waiting or queued SHALL be shown and advance on the surface's tick, on every surface with a slot for it; an ended agent's is
fixed at completion. A `paused` agent SHALL show no figure — the tree its state, the inspector and the persona window's
context card their fallback — in place of REQ-MONITOR-107's and REQ-MONITOR-111's rule for an agent with a spawn
timestamp, since nothing runs for it.

**(34) A steering prompt at a rest, and at the run's end (revision 6, OQ-128).** A steering prompt pending for an agent a
rest leaves `paused` SHALL be delivered into that agent's record, after the answers to the calls the rest cut, as the marked
message its next step would have injected, and marked injected then, once. The run SHALL accept no steer once the rest is
recorded, once its teardown begins, or once it pauses at the message limit or parks at the plan gate, whichever comes
first. A prompt no step injected and no rest delivered SHALL be recorded as not delivered, with a timeline entry and a
transcript line naming the end it met, when the run stops stepping. A crash still loses what was pending. The timeline
word the record uses is the timeline vocabulary's ruling (OQ-157), not this clause's.

**(35) The optimistic cancel of one agent (revision 6, OQ-129).** The window that sent a cancel of one agent SHALL show that
agent and every unfinished descendant the cancel ends, live or paused, cancelled at once, with the activity "The user
cancelled this agent." and "Cancelled with <name>, which the user cancelled.", until the engine answers: a refusal removes
it and states the engine's words, and an acceptance holds it until the first whole-session update taken after it. Another
window shows the cancel when the engine's record reaches it. REQ-MONITOR-128's "each of its live descendants" is read as
live and paused.

**(36) No checkpoint for an iteration a recorded cancel closes (revision 6, OQ-130).** The iteration the record of an
accepted explicit cancel closes (clause 3, as OQ-103 was ruled) SHALL take no checkpoint capture: it is a close no run
made, outside REQ-GIT-051's "each iteration that closes". What the dead run wrote is captured by the next iteration's
capture.

**(37) What a follow-up does beyond clause 22 (revision 6, OQ-131).** A followed-up child SHALL resume into `queued` and
start as any queued child does, under REQ-ORCH-050's cap and REQ-ORCH-046's limit. Only the call's `task` is read; the
child keeps its recorded identity and claims its stored write scope again. "Cut off by its `child_timeout`" is read from
its stored report. A child the user cancelled is settled and may be followed up, clauses 3 and 16 being about a
continue's resume. A child that never started is given the payload it would have started with. The follow-up waits for an
execution still winding down, replaces the child's report when it reports again, and REQ-ORCH-088's fallback retry of it
starts from the child's payload.

**(38) An ask in the quit's gap (revision 6, OQ-132).** An approval or a question asked after main revoked the last
window's presenter for the quit and before the run host's shutdown SHALL be held unshown, published `brokered`, its budget
not running, and withdrawn by the quit as clause 9 says. It is not resolved by the headless policy (REQ-TOOLS-064), not
denied `presenter-error` (REQ-TOOLS-058), and not discarded as "could not be shown" (REQ-CHAT-094); the `timeout_seconds`
it announced is not the bound it waits under. A user treated as away (`PD-TOOLS-005`) is still resolved at once.

**(39) Model slots across sessions (revision 6, OQ-148, OQ-149).** The per-model count is the process's and the queue each
session's own: a session's held children are released in the order that session held them, and a slot freed in one session
is offered first to the other sessions, in the order they joined, and then to the freeing session. A child `paused` out of
`starting`, `running` or `summarizing` SHALL keep its slot while its session rests and resume into it, in place of
REQ-MONITOR-020's "only running and summarizing agents count" and REQ-CONFIG-094's "currently running". A session paused
by an earlier process holds no place until a run of it starts in this one, and a resting session's places do not lapse.

**(40) A continue resumes the paused iteration with the intent and tools it started with (revision 7, OQ-162).** An iteration a
continue resumes SHALL run under the intent in effect when it was left open — the newest intent the session recorded, a
continuation's or else the launch's — with that intent's grant to the entry role, the entry role's instructions as that
grant fits them (PD-ORCH-006), its playbook and its budget clamp, for its root and every agent it resumes or delegates.
The Continue action, and the resolution of a message-limit pause, bring no new request, and SHALL make no classification
call: the run carries the intent in effect, conveyed as continued from the previous run. A continue by message classifies
the message as any run does, and that classification SHALL take effect from the run's next iteration, once the resumed
iteration has closed; an iteration left open again keeps the intent it started with. A plan decision resumes nothing,
and its run classifies the session's request as before. The prior intent a classification inherits when its own is unusable
(REQ-ORCH-013) is the intent in effect.

**What is unchanged.** A continuation is still not a resume: a timed-out child is never resumed and earns no corrective
message (REQ-NOTIFY-112). The message-limit pause and the plan gate keep their durable holds. The run host is still
never re-forked, and a crashed session still needs repair or a continue before anything runs (ADR-0002). How a
continuation offer outlives its run is PD-ORCH-004 revision 3; how a resumed child re-claims its write scope is
PD-TOOLS-006 revision 2. A pause and a stop share one mechanism, so an agent paused while the application stays open
and an agent left by a quit resume the same way. How every later root learns of an open offer is PD-ORCH-004 revision
4, and how the plan gate meets a resumed iteration is PD-ORCH-003 revision 2 (revision 4).

**Why, and what it costs.** Every stop, pause, quit or crash ended every child, and the next run's root was told
nothing about them and could not address them: in run `2e21e324` the user stopped a run whose children had been
working for twenty minutes, and nothing of their work could be continued. Keeping every agent's full conversation is
how a paused or stopped run can pick up exactly where it stood, the way Claude Code and the Codex CLI resume a session
from the conversation they record. What it costs: a table of agent conversations that grows with every message; every
resumed agent sends its whole conversation to its model again, compressed when it no longer fits; a pause no longer lets
children finish their turn, so a paused agent has no report until it ends; and one child state (`paused`) and one
column (`children.interruption`) are added, with `children.write_scope` stored for PD-TOOLS-006.

**Why revision 4, and what it costs.** Building revisions 2 and 3 raised six questions the text did not decide, and the
build recorded the reading it proceeded under for each (OQ-94 to OQ-99). The owner took every recommendation. Most confirm
the reading built and make it traceable: the requirements the build departs from are now named, so a reader of each finds
this directive. Five change the product:
- a paused agent reads as paused, so an agent stopped mid-task no longer looks as though it never started;
- one paused child can be dropped while the rest resume, where the only choices were all or none;
- a continue's message survives an iteration that ends without addressing it;
- a crash offers the same choice as a stop;
- the handoff prefers what the root itself published.

What it costs:
- a presentation state that every agent surface must draw;
- a session command that works with no run behind it;
- one task per continue by message;
- a fingerprint beside each agent's record.

Until they are built, the product behaves as the readings in OQ-94 to OQ-99 recorded.

**Why revision 5, and what it costs.** The owner ruled two questions the build had left to the record ([R-067](../requests.md#r-067)).
REQ-SESSION-186 has a graceful, clean stop persist `stopped`, and REQ-SESSION-073's vocabulary glosses `stopped` with
that stop, while clause 3 has a stop leave the state a pause leaves, and REQ-MONITOR-029 and REQ-SESSION-093 persist
`paused`; the build persisted `paused`, and the directive now names both requirements it departs from, so a reader of
either finds it. And REQ-TOOLS-152's `session_id` — "reuse a previous
delegation's session for a retry or a follow-up" — had no meaning under the full record, so the field was accepted and
dropped, and a parent with a question for a child that had finished could only start a fresh child that rediscovers
everything. What it costs:
- `stopped` is never persisted for a user's stop, and a stop and a pause both record the stop reason `user_cancelled`, so
  a session tells a stop from a pause only by the interruption recorded on its agents and its iteration and by the
  timeline;
- a terminal child is no longer always final: REQ-MONITOR-300's table gains one exit from a terminal state, taken only by
  a follow-up the parent asks for;
- a follow-up sends the child's whole conversation to its model again, compressed when it no longer fits.

**Why revision 6, and what it costs.** Building revisions 4 and 5 raised questions the text did not decide, and the build
recorded the reading it proceeded under for each: OQ-100 to OQ-104, OQ-106 to OQ-108, OQ-117, OQ-118, OQ-124, OQ-128 to
OQ-132, OQ-148 and OQ-149. On 2026-10-06 the owner confirmed every one of them as built ([R-071](../requests.md#r-071)).
Clauses 23 to 39 state those readings, and the Narrows list names the requirements they depart from, so a reader of each
finds this directive. Nothing in the product changes. What the readings cost, now that they govern:
- the counters' line words itself one way while an agent is paused and another otherwise;
- an agent a crash left presents `paused` before anything has recorded the crash;
- a Continue action on a session whose last request is finished re-runs that request;
- a steering prompt can end recorded as not delivered, and a crash still loses one;
- a resting session holds its model slots against every other session for as long as it rests;
- an ask in the quit's gap announces a `timeout_seconds` it is not held to;
- the iteration a recorded cancel closes has no checkpoint of its own;
- a board run caught by the quit is resumable rather than cancelled.

**Why revision 7, and what it costs.** The owner ruled two questions the build had left open ([R-071](../requests.md#r-071)).
Every continue classified the intent again, the Continue action on the session's last prompt, which added up to 12 s to a
continue that brought nothing new; and the new classification governed the iteration it resumed, so the coordinator's
tools or playbook changed in the middle of its iteration (24 tools to 29 in the live run of 2026-10-01, finding a71-3;
three playbook lines in that of 2026-10-06, finding G1). Clause 14's fingerprint, taken of the whole system prompt and
the listing, then warned that the agent had resumed under changed instructions although no persona had been edited. What
it costs:
- `REQ-ORCH-005` asks that classification complete before the coordinator starts and be in effect from the first
  iteration; the Continue action classifies nothing, and a continue by message's first iteration runs under the intent it
  resumes, so the directive names it;
- `REQ-ORCH-013` carries the prior intent over only when a fresh classification was unusable; the Continue action carries
  it with no fresh classification at all;
- a persona whose definition is unchanged is never named, even when what it was instructed with changed — a workspace
  instruction file its own run edited, a skill loaded since, another MCP server — since those are the run's, not the
  persona's;
- a change is stated once, so a session resumed many times under a changed persona does not repeat the warning.

> Revision 1 said, and no longer governs, clause (1):
> **(1) The interruption is recorded on each unfinished child.** When a run comes to rest with children that have not
> reached a terminal state, each such child's record SHALL carry an **interruption**: `pause`, `stop`, `quit` or `crash`
> (a crash is recorded when the session is next repaired or continued). The child still ends `cancelled`, so every exit
> from an iteration still leaves every child record terminal and terminal states stay absorbing. Its report SHALL state
> that it was interrupted and by what, and its progress: the workspace paths its own file-writing calls changed, its last
> response and its tool-call count. A child that had not started (`queued`, `waiting_on_dependencies`,
> `waiting_on_model_slot`) is recorded the same way, with no progress.
>
> Clause (2):
> **(2) A pause holds.** An accepted whole-run pause SHALL stop every agent before its next model step, let in-flight
> tool calls finish within REQ-ORCH-134's deadline, start no queued child, and make no summarising or other model call
> after it is accepted. The run then comes to rest as it does today, and its unfinished children are recorded with
> interruption `pause`.
>
> Clause (4):
> **(4) Continuing resumes them.** When the session is next continued — the Continue action, a new message or a plan
> decision — then before the first iteration begins, every child the previous run left with an interruption SHALL be
> **resumed**: a new child record is created under that iteration's root with the same persona, task, background flag
> and write scope, and a `resumed_from` link to the record it resumes. Its payload is its original task and a **resume
> brief** assembled from its record within a fixed budget: that it is resuming and why it stopped, the paths it had
> changed, its own todo, its last response, and the tail of its transcript. Dependencies among resumed children carry
> over to the new records. The root's payload lists the resumed agents, and the root owns them as it owns any child it
> delegated: it may wait on them, read their results and cancel them. A resumed child gets a fresh `child_timeout` and
> counts toward every child limit of the run that resumed it.
>
> And:
> **What is unchanged.** A continuation is still not a resume: a timed-out child is never resumed and earns no corrective
> message (REQ-NOTIFY-112). The message-limit pause and the plan gate keep their durable holds. The run host is still
> never re-forked, and a crashed session still needs repair or a continue before anything runs (ADR-0002). How a
> continuation offer outlives its run is PD-ORCH-004 revision 3; how a resumed child re-claims its write scope is
> PD-TOOLS-006 revision 2.
>
> **Why, and what it costs.** Every stop, pause, quit or crash ended every child, and the next run's root was told
> nothing about them and could not address them: in run `2e21e324` the user stopped a run whose children had been
> working for twenty minutes, and nothing of their work could be continued. A continued session now brings its agents
> back unless the user declines. What it costs: a resumed child starts a fresh conversation and pays for its brief, so
> continuing a session whose agents were mid-way through is no longer free; a pause no longer lets children finish their
> turn and summarise, so a paused child's report is its progress, never its conclusion; and four columns are appended to
> the store (`children.interruption`, `children.resumed_from`, `children.write_scope`, and a task id on transcript rows).
>
> Revision 1 narrowed REQ-TOOLS-155; revision 2 does not, because a resumed child keeps its parent, and its
> back-pointer is removed. It extended REQ-ORCH-053, REQ-SESSION-065 and REQ-NOTIFY-121; revision 2 narrows them,
> because the settle no longer cancels a `paused` agent.

> **Narrows:** REQ-MONITOR-256, REQ-MONITOR-123, REQ-ORCH-072, REQ-ORCH-002, REQ-ORCH-052, REQ-MONITOR-300, REQ-ORCH-053, REQ-SESSION-065, REQ-NOTIFY-121, REQ-SESSION-115, REQ-SESSION-129, REQ-SESSION-025, REQ-TOOLS-054, REQ-TOOLS-111, REQ-ORCH-134, REQ-MONITOR-014, REQ-MONITOR-046, REQ-MONITOR-211, REQ-MONITOR-213, REQ-SESSION-078, REQ-SESSION-180, REQ-ORCH-135, REQ-MONITOR-130, REQ-SESSION-108, REQ-TOOLS-063, REQ-CHAT-029, REQ-MONITOR-063, REQ-ORCH-004, REQ-SESSION-186, REQ-SESSION-073, REQ-MONITOR-169, REQ-MONITOR-064, REQ-MONITOR-128, REQ-CHAT-069, REQ-MONITOR-107, REQ-MONITOR-111, REQ-TRACE-464, REQ-GIT-051, REQ-TOOLS-064, REQ-TOOLS-058, REQ-CHAT-094, REQ-MONITOR-020, REQ-CONFIG-094, REQ-ORCH-005, REQ-ORCH-013
> **Extends:** REQ-MONITOR-125

*Raised by the owner, 2026-09-27; logged as [R-058](../requests.md#r-058) and ruled as drafted, every fork as recommended,
by [R-059](../requests.md#r-059). Revision 2 logged as [R-060](../requests.md#r-060), revision 3 as [R-061](../requests.md#r-061),
revision 4 as [R-064](../requests.md#r-064), revision 5 as [R-067](../requests.md#r-067), revisions 6 and 7 as
[R-071](../requests.md#r-071).*

> **First execution of revisions 2 and 3, 2026-09-27, ruled by [R-060](../requests.md#r-060) and
> [R-061](../requests.md#r-061) and built under [R-063](../requests.md#r-063):** the mechanism was built as written, in a spike and seven phases, and each phase was
> reviewed adversarially until no blocking or should-fix finding remained. The text met the code in these places.
>
> **The spike** ([`../architecture/spikes/agent-resume.md`](../../architecture/spikes/agent-resume.md)) recorded one agent,
> paused it, restored it into a new conversation and continued it. It found five things no clause states:
> - the original request was read from the conversation's constructor only;
> - a stop dropped the results of the calls in its step that had completed;
> - a compression has to be written into the record as a replacement;
> - an agent's position is its record read with the ledger, since a parent waiting on its children resumes into waiting
>   and takes no model step;
> - `runTurn` needed a way to continue a history with no new message.
>
> Each was built.
>
> **(1) The record.** Store v23 appends `iterations`, `agent_messages` and `agent_terminals`, and
> `children.interruption`, `resume_state` and `write_scope`. Every agent's conversation is recorded as it changes, and a
> compression is one replacement entry, so a resume reads from the last replacement forward. The transcript's rows are
> written as before, and OQ-95 records how the build reads "the same record a session's transcript is drawn from".
> Building it found that a crashed iteration's number was reused by the next run. That is
> [`a-crashed-iteration-number-is-reused-by-the-next-run.md`](../../defects/fixed/a-crashed-iteration-number-is-reused-by-the-next-run.md),
> repaired.
>
> **(2) The rest (clauses 2, 3 and 8 to 11).** A pause, a stop and a quit leave every unfinished agent `paused` with its
> interruption, and leave the iteration open. A crash is recorded from the store at the next repair or continue, and
> never at a load.
>
> The text was silent in four places, and OQ-96 records each reading:
> - a model step already streaming when the pause lands finishes, and it is the last one;
> - a parent holding a child's unread report is unfinished;
> - no summarising call, retry, fallback or condensation follows the rest;
> - an execution that a stop's 30-second grace gives up on is detached.
>
> A paused agent presents as `queued` and is never settled for display. That departs from four requirements the
> directive does not name, and OQ-94 records it.
>
> Clause 3 also repaired two defects:
> [`a-pause-settles-children-instead-of-holding-them.md`](../../defects/fixed/a-pause-settles-children-instead-of-holding-them.md)
> and [`cancelling-one-child-does-not-stop-it.md`](../../defects/fixed/cancelling-one-child-does-not-stop-it.md).
>
> **(3) The resume (clauses 4, 5, 7 and 10).** Every continue resumes the open iteration first. The root and each
> paused agent carry on from their records under their identity. A call recorded as interrupted is handed back
> "not run", or "interrupted" with whatever output it had. A continue's message is recorded as the resumed root's next
> message at the continue. Each resumed child has a fresh `child_timeout` and re-claims its write scope in acceptance
> order. OQ-97 records the readings: the persona a resumed root runs as, what a resumed child's count holds, and the
> plan-decision route.
>
> **(4) The Continue action (clause 6).** It states the count: the root and every unfinished agent. The count is shown
> on a paused session, on one a crash left interrupted, and on one opened in REQ-CHAT-008's recovery state. "Continue
> without them" is offered on a paused session and is confirmed. OQ-98 records this, with two readings against
> PD-CHAT-001 and the short label `Message`, which is put to the owner.
>
> **What building it found against the build's own readings.** Both were found in the built app and repaired, and the
> falsified readings are kept beside their replacements:
> - Every confirmed "Cancel the run?" sent the stop, so the cancel was resumable. The composer's stop was itself
>   confirmed as a cancel. See [`every-run-cancel-surface-sends-the-stop.md`](../../defects/fixed/every-run-cancel-surface-sends-the-stop.md).
>   OQ-96 now names the surface each control belongs to.
> - A quit with an approval open recorded the call as denied, and the agent stepped on the denial, against clause 9.
>   REQ-TOOLS-063's "closing the window answers Deny" fired as the main window took its dialog down. A quit with a
>   question open was recorded as cancelled, through REQ-CHAT-101's cancellation on unload. A quit Electron starts
>   itself (SIGTERM, a logout, `app.quit()`) closed the dialog even before the window's guard. See
>   [`a-quit-denies-the-approval-it-should-withdraw.md`](../../defects/fixed/a-quit-denies-the-approval-it-should-withdraw.md).
>   Main now tells a quit apart (`QuitState`) and sends neither answer during one. OQ-96 records the departure from
>   REQ-TOOLS-063 and REQ-CHAT-101.
>
> The build repaired two further defects:
> - [`the-continuation-payload-says-no-artifact-is-recorded.md`](../../defects/fixed/the-continuation-payload-says-no-artifact-is-recorded.md),
>   with PD-ORCH-004 revision 3;
> - [`a-stale-settled-childs-report-is-never-an-artifact.md`](../../defects/fixed/a-stale-settled-childs-report-is-never-an-artifact.md),
>   and the decline, which had the same gap.
>
> Two defects were read and left unrepaired:
> - [`a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md`](../../defects/fixed/a-graceful-stop-persists-paused-where-one-requirement-says-stopped.md),
>   which is still the corpus's contradiction; *settled 2026-09-29 by revision 5's clause 21 ([R-067](../requests.md#r-067))*;
> - [`delegate-drops-session-id-and-suppress-auto-context.md`](../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md),
>   because the resume gives `session_id` no meaning. *Revision 5's clause 22 gives it one (2026-09-29); the note stays open until
>   it is built. Built and repaired the same day, recorded below.*
>
> Other defects noticed along the way are recorded in `docs/defects/`.
>
> **What was measured.** Unit and scripted end-to-end tests: more than a hundred cases in 29 test files cite this
> directive. Each phase ran a mutation pass over its new limbs, and each limb turned a test red, with the exceptions its
> commits name:
> - two guards removed as redundant;
> - the tool deadline's cancel at a run's exit, which is timer hygiene;
> - `track`'s change, which no test could observe while
>   [`a-child-whose-execution-raises-before-its-turn-stays-running.md`](../../defects/fixed/a-child-whose-execution-raises-before-its-turn-stays-running.md)
>   stood. *(2026-09-29, R-067: the note is repaired and still no test observes it, for a new reason: `executeSettling`
>   now settles a raise before `track` sees it, so an execution reaches `track` rejected only when that settle itself
>   raises.)*
> - main's `before-quit`, which only the built app reaches.
>
> In the built app, driven, one session went through three rests with one child (`bg_d5cb3784`):
> - **A pause with the child's write waiting on approval.** The approval was withdrawn by the pause, the call was
>   recorded "not run", and the Continue action read "2 agents will resume". The continue resumed the same child, and
>   its write asked for approval afresh.
> - **A stop during its next model step.** The child and the iteration were paused by `stop`, and the continue resumed
>   them.
> - **A quit by closing the window, with the write waiting on approval again.** The approval was withdrawn by the
>   quit, and nothing was recorded as denied. The relaunch, and then opening the session, changed no record. The
>   continue resumed the child, whose next answer quoted the first message and the last tool result of the request it
>   was sent. Both were written by the previous process, so the relaunched agent resumed its own conversation. The
>   iteration then closed `succeeded`.
>
>
> Three quits were driven on their own, each with a call waiting on a person: a window close with an approval open,
> SIGTERM with an approval open, and a window close with the question dock open. Each came to rest by the quit, with
> the approval or question withdrawn and the call recorded "not run".
>
> The reviews also drove the app:
> - a crash (`kill -9`), relaunch and continue by message: the count was shown, and the agents resumed;
> - the confirmed decline;
> - the confirmed run cancel from the Mission view and from a persona window;
> - the strip at seven window sizes.
>
> **What was not measured.**
> - No live run was made, so a real model has not yet resumed from its record. The live run of 2026-09-29 measured
>   one, recorded below revision 4's note.
> - Only Linux under Xvfb was driven.
> - The scripted model client restarts its script for every run
>   ([`the-scripted-client-restarts-its-script-for-every-run.md`](../../defects/fixed/the-scripted-client-restarts-its-script-for-every-run.md)),
>   so a driven agent's steps after a continue are the script's first steps again. Its record is what is resumed.
>   *(2026-09-29, R-067: repaired. A resumed agent now takes the step after the ones its own record holds, in the same
>   process or after a relaunch; `part-j-proof`'s steer-at-rest scenario pins it.)*
> - The driver's own quit is an immediate exit that skips the shutdown
>   ([`the-drivers-quit-skips-the-applications-shutdown.md`](../../defects/fixed/the-drivers-quit-skips-the-applications-shutdown.md));
>   the quit above was a window close.
>   *(2026-09-29, R-067: repaired. The driver's `quit` is now the application's quit unless it names the immediate exit,
>   and `driver-proof` quits a live run through it and reads the session at rest.)*
>
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 4, 2026-09-28, ruled by [R-064](../requests.md#r-064) and built under
> [R-065](../requests.md#r-065):** clauses 13 to 20 were built as written, in four lanes that ran in parallel, each on its own
> branch and worktree and each reviewed adversarially until no blocking or should-fix finding remained. The merged build
> was then reviewed across the lanes for fourteen rounds and driven in the built app. The text met the code in these
> places, and each reading is an open question:
> - **Clause 13** ([OQ-100](../../architecture/open-questions.md)). `paused` is a presentation state of its own on every agent surface, drawn in the waiting
>   colour (`--rt-wait`) with no pulse, and a paused agent keeps its task line as its activity; the Overview counts it on
>   its own. The run-level agent presents `paused` while its session rests, and the agents a crash left present `paused`
>   before the crash is recorded, so the tree agrees with the Continue action's count. That second reading departs from
>   the clause's last sentence and is put to the owner.
> - **Clause 14** ([OQ-105](../../architecture/open-questions.md)). Store v24 appends `agent_fingerprints`: the SHA-256 of the system prompt and of the tool
>   definitions each agent's first model request carried. A resume under a different pair states a
>   `resumed_under_changed_instructions` warning issue and one transcript row naming the agent. The issue kind is coined
>   beside REQ-ORCH-139's vocabulary, and the fingerprint covers the whole system prompt, so a changed pre-flight playbook
>   warns too; both are put to the owner.
> - **Clause 15** ([OQ-108](../../architecture/open-questions.md)). The audit found it built, with one exception: a board run caught by the application's quit
>   rested by `stop` ([`a-board-run-caught-by-a-quit-rests-as-a-stop.md`](../../defects/fixed/a-board-run-caught-by-a-quit-rests-as-a-stop.md),
>   repaired). A stop or a quit during a plan cycle now withdraws what waits on a person. `/stop` reads "Stop the active
>   run".
> - **Clause 16** ([OQ-101](../../architecture/open-questions.md)). `session.control`'s `cancelAgent` ends a paused child and its paused descendants `cancelled`
>   while no run is behind the session, under the session's lock, with the live cancel's report and artifact, and the
>   count drops. A child a crash left is cancelled from its stored state, and the crash is left for the next repair or
>   continue. The first cut wrote the whole crash record
>   ([`cancelling-one-crash-left-child-records-the-whole-crash.md`](../../defects/fixed/cancelling-one-crash-left-child-records-the-whole-crash.md),
>   repaired), and wrote against a failed store
>   ([`the-at-rest-cancel-writes-against-a-failed-store.md`](../../defects/fixed/the-at-rest-cancel-writes-against-a-failed-store.md), repaired).
> - **Clause 17** ([OQ-102](../../architecture/open-questions.md)). The message is a task the resumed iteration holds: done when the iteration succeeds, pending
>   on any other close and taken up by the next iteration. The Continue action, the decline and the message-limit
>   resolution append no second task while the todo holds the last request unfinished. That reading reaches beyond the
>   clause, into REQ-ORCH-004, and it repaired
>   [`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`](../../defects/fixed/the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md).
> - **Clause 18** ([OQ-103](../../architecture/open-questions.md)). A session a crash left offers both continues and the decline with the same count, and each
>   records the crash first; a session a store failure left busy is refused, since it did not crash. On a crash-left
>   session the two continues take the send pill's place as they do on a paused one.
> - **Clause 19** was already built; the audit added its tests.
> - **Clause 20** ([OQ-106](../../architecture/open-questions.md)). The handoff takes the latest artifact the most recent iteration's root published, known by
>   the root's task id, and falls back to the latest of any kind.
>
> **What building it found in the code before it.** Each was repaired, and each note is in `docs/defects/fixed/`:
> - a plan decision's relaunch appended the gated prompt as a second task, so every approved prompt was worked twice;
> - a request queued behind an open approval dialog was denied unshown after ten seconds. That repair's first cut left a
>   request queued behind a closing window to hang, which the orchestrator's own review found and repaired;
> - the composer's Pause stayed disabled after the first pause;
> - the status strip read "run Running" in the recovery state;
> - a persona window at rest could keep a first view without its transcript;
> - the Mission view offered Pause and Cancel with no run behind the session.
>
> The open defects noticed along the way are recorded in `docs/defects/`.
>
> **What was measured.** The gate went from 2418 to 2620 passing tests, with only the three known failures, and each new
> limb turned a test red when reverted. Thirteen scenarios were driven in the built app, each as the text says:
> - the `paused` presentation after a pause and after a stop;
> - one paused child cancelled at rest with its paused descendant, then the rest continued;
> - a crash-left session's presentation, and a crash-left child cancelled at rest;
> - the paused strip's `Continue` and `Send` with the count and decline in the notices row, and `/stop`;
> - a crash-left session in the recovery state and after a repair, "Continue without them", the Continue action, and a
>   continue by message;
> - a continue's message as a held task;
> - a resume under a changed persona's instructions, with its single warning;
> - the plan gate around a resumed iteration (`PD-ORCH-003` revision 2).
>
> **What was not measured.**
> - The four repairs of the last review round were checked in the built app by the round that made them; the independent
>   re-drive did not run, because the subagents' usage limit was reached.
> - Persona windows cannot be addressed by the driver, so their state was read from screen captures
>   ([`the-driver-cannot-address-persona-or-approval-windows.md`](../../defects/fixed/the-driver-cannot-address-persona-or-approval-windows.md)).
>   *(2026-09-29, R-067: repaired. The driver names a persona window, the approval dialog and the terminal window by
>   role, and `driver-proof` probes a persona window's state and answers an approval in its dialog.)*
> - Clause 14's orchestrator-instructions and tool-change variants were not driven.
> - Clause 20 is not observable with the scripted client; its evidence is the tests.
> - No live run was made with the build, and only Linux under Xvfb was driven; the live run of 2026-09-29 follows.
>
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Measured by the live run, 2026-09-29, under [R-066](../requests.md#r-066):** the built product against the owner's
> self-hosted endpoint (`qwen3.8-flash-next`, registered unmetered), in `pnpm live-run`'s throwaway workspace.
> - Every standard scenario passed. `edit` split its work between two children writing in parallel under declared
>   write scopes, `requirements` carried a card from release to done in a worktree of its own, and the fault ladder
>   and the stalled stream each ended `completed`.
> - A scenario of its own, `resume`, measured this directive against a real model:
>   - it paused a delegating run through the composer's Pause while two children ran, and the paused composer drew
>     both `paused` with "3 agents will resume" (clauses 6, 13 and 19);
>   - the Continue resumed the same iteration and both children under their own task ids, each record continuing
>     across the pause (3 entries before it, 15 and 17 after), and each child's next request carried what it had
>     recorded last (clauses 1 to 4);
>   - one child's first `read_file` had been cut off by the pause and recorded "not run"; resumed, the model read that
>     result in its own record, read the file again and wrote its note (clause 4);
>   - the iteration closed `succeeded`, and both notes were read back from disk.
> - It found two launches that fail as root, each repaired
>   ([`the-live-run-cannot-launch-as-root.md`](../../defects/fixed/the-live-run-cannot-launch-as-root.md),
>   [`the-code-intelligence-server-dies-when-the-app-runs-as-root.md`](../../defects/fixed/the-code-intelligence-server-dies-when-the-app-runs-as-root.md)). `main` had repaired both
>   independently (OQ-82 for the code-intelligence child), and its repairs stand.
>
> The evidence packs are under `.live-run/runs/`, outside the repository.

> **First execution of revision 5's clause 22, 2026-09-29, built under [R-067](../requests.md#r-067):** a `delegate` call
> whose `session_id` names a settled child of the caller resumes that child from its record. The build:
> - `IterationChildren.followUp` admits the call;
> - the writer's `followUpChild` makes REQ-MONITOR-300's one exit from a terminal state, in one transaction with the
>   follow-up's user message in the record;
> - the scheduler starts the child as any queued child;
> - `execute` finds the conversation in its record and carries on from it under the child's own task id.
>
> The child keeps its identity and its stored write scope, and it ends, reports and notifies its parent again. A child
> the timeout cut off is refused, and the reason names `continuation_of`.
>
> The text met the code in these places, and [OQ-131](../../architecture/open-questions.md) records the reading built for
> each:
> - **The state it resumes into is `queued`,** so the follow-up waits under REQ-ORCH-050's cap and REQ-ORCH-046's active
>   limit. It holds no place in either when it is followed up, unlike a paused agent that "keeps the place" it held.
> - **Only the call's `task` is read.** The child's identity is its record's.
> - **A child that never started has no conversation,** so it is given its payload first. REQ-ORCH-048's cascade does
>   not block it again.
> - **A follow-up waits for the child's execution to wind down.** Building it found that a child the user cancelled is
>   settled before its aborted execution returns. An execution that then found its record live again wrote over the
>   follow-up, which a case pins.
> - **The fallback retry starts from the payload** and loses the follow-up. That is put to the owner.
> - **A child the user cancelled is settled, and may be followed up.** Clause 3 says a cancelled agent is "never
>   resumed", and clause 16 calls a paused child's cancel "final as clause 3 says". Clause 22 names every terminal state
>   but the cut-off one, and says clause 5, which lists `cancelled`, does not bar a follow-up. The build reads clauses 3
>   and 16 as about a continue's resume, which a follow-up is not, so a parent can follow up a child the user cancelled
>   (REQ-MONITOR-128). The cancel race's case pins it. Refusing it would add a refusal PD-TOOLS-006 revision 3 does not
>   list; that is put to the owner.
>
> Three places of the resume path serve the follow-up unchanged:
> - clause 3's crash record and clause 2's rest pause a follow-up that has not started, from its record;
> - clause 4's resume starts it again from the record;
> - a case pauses one held behind a model slot and continues it.
>
> The defect note is repaired:
> [`delegate-drops-session-id-and-suppress-auto-context.md`](../../defects/fixed/delegate-drops-session-id-and-suppress-auto-context.md).
>
> **What was measured.** Fourteen cases in `children.test.ts` (twelve in the clause 22 describe, with the transition
> table's case and the writer's) and two in `agent-tools`' `delegation.test.ts`. The two tool cases and the first seven
> engine cases were red on the code before the repair. Each later case was red with its own limb removed. This report
> first said fifteen cases; that counted the two outer cases twice, and the case for a later iteration's root, added
> since, had not been written. **What was not
> measured.** No built-app or live run followed a child up. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported back 2026-10-13 (fin42, item N57):** the built app has followed a child up: `pnpm delegation-proof`'s `follow-up`
> launch, as `PD-TOOLS-006` revision 3's report-back gives it (one child row, the follow-up's task in its record once, a
> `child_resumed` entry, ended `succeeded` again). A live follow-up is asked by the default live run's `delegation` scenario,
> and is the orchestrator's to run.

> **The quit's gap, repaired 2026-09-29 under [R-067](../requests.md#r-067):** clause 9's withdrawal by a quit was built for
> what is pending when the run host's `shutdown` arrives, and main sends it only after `window-all-closed` has waited on
> REQ-GIT-101's checkpoint operation. The last window's presenter is revoked as it closes, so an approval asked in that
> gap met no presenter and was denied by the headless policy. Main now marks the revoke its quit causes (`quitting`, from
> `QuitState`), and the run host holds what is asked meanwhile — an approval unshown in `pending_approvals`, a present
> that crossed the close, a question — with no budget expiring on it, for the shutdown to withdraw by `quit`. The same
> hold keeps an approval asked before the quit from timing out into a denial while the checkpoint operation runs.
> [OQ-132](../../architecture/open-questions.md) states the reading against REQ-TOOLS-064, REQ-TOOLS-058, REQ-EVENTS-049 and
> REQ-CHAT-094. The note is repaired:
> [`an-approval-asked-after-the-last-window-closes-is-denied.md`](../../defects/fixed/an-approval-asked-after-the-last-window-closes-is-denied.md).
> **What was measured.** Eight unit cases across `gate.test.ts`, `questions.test.ts`, the run host's `tools.test.ts` and
> `dispatch.test.ts`; the first was red on the code before the repair, and each limb's cases were red with it removed.
> **What was not measured.** No built-app quit with a checkpoint operation in flight and an ask made during it was
> driven; main's `revokePresenter` is wiring no unit reaches. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).


> **First execution of revision 7, 2026-10-06, ruled by [R-071](../requests.md#r-071) and built on branch
> `fin20-continue-and-continuation`:** clauses 14 and 40 were built as written (as clauses 14 and 23 of a revision 6, renumbered
> before landing). The text met the code in these places:
> - **Where the carried intent comes from.** "The intent in effect" is the newest `run_continuation_intent` entry's, else the
>   launch audit's — the reading REQ-ORCH-014's status already took (`intentPayloadOf`). It is carried restated as carried
>   over (`carriedIntent`), so a fallback launch intent is carried as the category it fell back to, conveyed as continued
>   from the previous run, not as a fallback. A session with nothing recorded to carry classifies, since an intent must be
>   in effect (REQ-ORCH-005). An `ambiguous` intent in effect is carried as it stands: REQ-ORCH-013(b) carries over only a
>   category that is not `ambiguous`, but that clause decides what replaces an unusable new classification, and the Continue
>   makes none — clause 40 narrows it to "the intent in effect", whatever that is (stated at the verifier's review).
> - **The status does not read `classifying` for a carried intent.** REQ-ORCH-014 ties that phase to the classification
>   call, and the Continue action makes none, so the run is told its pre-flight carries (`RunDeps.preflightCarries`) and
>   publishes `classifying` only when it does not (found at the verifier's review; the Continue-action case pins it).
> - **The pre-flight still runs for a carried intent**, with no classification call: the run host resolves the grant, the
>   playbooks and the clamp for it (`PreflightContext.intent`, `runPreflight`), so a playbook override edited since is read
>   again, as every run reads it.
> - **A continue by message classifies at the continue**, as before, and the iteration it resumes runs under the carried
>   pre-flight (`RunDeps.resumedPreflight`, `Run.preflightInEffect`); the plan gate is settled on the run's own
>   classification, since it holds before the first new iteration (PD-ORCH-003 revision 2). The resumed iteration's entry
>   records the message's classification beside its own (`next_run_intent`), and once that iteration closes the
>   classification is recorded as a further entry and row (`nextIntentInEffect`). A plan decision resumes nothing and
>   classifies as before. A resumed iteration left open again (paused once more) keeps its carried intent, and the
>   message's classification is not taken up: the "run's next iteration" the clause names is this run's, and a later
>   Continue carries the intent in effect, which is still the one the iteration started with. A later continue by message
>   classifies afresh.
> - **The instructions follow the grant in effect.** `PD-ORCH-006` (OQ-202), which landed on `main` while this revision
>   was built, fits the entry turn's instructions to the run's grant (`entryInstructionsFor`), and read the run's own
>   pre-flight. Merged as written, a continue by message whose resumed iteration carried `none` and whose message classified
>   `explicit_trivial` would have told the resumed coordinator to do the work itself while it still held only the
>   coordinating tools — the mid-iteration change this clause removes (found at the verifier's second review, before
>   landing). The root's instructions now read `Run.preflightInEffect`'s grant, as its tools, playbook and clamp do, so the
>   clause names the instructions with them; the next iteration's root is the first given the message's. The fingerprint
>   stays the persona's prompt as written, never its grant-fitted form, so the change of form between iterations is no
>   change of definition and warns nothing. Clause 40 also said "a continue that brings a request — a message, or a plan
>   decision — classifies it"; a plan decision is not classified, its relaunch classifies the session's last request, so
>   the clause now says that (the same review).
> - **The persona's definition** is its own system prompt and its tool declaration (declared tools, `tool_restrictions`,
>   the `coordinatorOnly` and `readOnly` flags); the root's is the entry persona's. Digests are marked `persona:`, so a
>   fingerprint recorded before the ruling, of the whole request, is told apart and replaced with nothing stated. A
>   stated change replaces the row's digests in place, its iteration kept (clause 12's clear reads it). The issue kind
>   and the transcript line stay as built (OQ-105), the line now naming the persona's instructions or tool definitions
>   as "changed since it last ran".
>
> **What was measured.** Unit and scripted end-to-end tests: three cases in `packages/engine/src/run/preflight.test.ts`
> ("OQ-162 as ruled …"), each red on the code before the repair, and a fourth since the merge with `PD-ORCH-006` (a
> resumed coordinator that carried `none` keeps the coordinating prompt, the next iteration's root under the message's
> direct-work grant is told to do the work itself, and nothing is warned; red with the run's own grant read) — the live run's a71-3 and G1 shape (a launch that fell
> back, a Continue that would have classified otherwise: one classification, the resumed root's grant and playbook the
> launch's, no warning), a continue by message whose classification governs from the next iteration, and the prior
> intent; `apps/desktop/src/run-host/intent.test.ts` (a carried intent makes no classification request); and the clause
> 14 describe in `packages/engine/src/run/record.test.ts`, rewritten to the ruling, with a case in which a skill, the MCP
> section and the listing all changed across a pause and nothing is warned. In the built app, `pnpm part-j-proof`
> (pause, steer at rest and a quit's relaunch, each continued by the Continue action) recorded each Continue's intent as
> the launch's `moderate_feature` carried, with no classification, every fingerprint marked `persona:`, and no
> `resumed_under_changed_instructions` issue; `pnpm part-h-proof`'s continue by message still carried its intent over from
> an unusable classification. Both ran at a load average of 5 to 9 beside another plan's agents.
> **What was not measured.** No live run: the orchestrator's default run's `resume` scenario is the evidence still owed.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13:** the `resume` scenario of the orchestrator's default live run has since carried the intent
> across a pause and the Continue action against the owner's self-hosted endpoint. At `552d346` (pack
> `2026-10-13T07-25-27-766Z`) the launch's classification timed out at 12 s and fell back to `moderate_feature`, and the
> Continue logged "intent: moderate_feature" and "Intent classified: moderate_feature (continued from previous run)": the
> intent carried was the fallback's. At `0bc3eee` (pack `2026-10-13T12-18-40-282Z`) the launch classified `small_feature`
> (0.72) through `json_schema`, and the Continue carried `small_feature` "(continued from previous run)". In both, the
> paused iteration resumed (clause 4) and closed `succeeded`. The fingerprint's "no warning" half was not separately read
> from the live packs. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Clause 9's crash half for a question, first executed 2026-10-13 (fin41, `fin41-restore-and-session`).** A crash withdrew
> the approvals its record could read from the store and no question, because no question was stored: the prompts lived in
> each tool port's registry, and the record of a crash is written later, from the store alone
> ([`../../defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md`](../../defects/fixed/a-crash-with-a-question-pending-records-no-withdrawal.md)).
> The run host now mirrors the session's pending prompts to `sessions.pending_questions` (v35) each time one is put or
> ends, as the session's whole list, and `recordCrash` writes one `question_withdrawn` entry per prompt it lists — "The
> ask_questions call was withdrawn by a crash before the user answered; it was not run.", `{tool, persona, interruption:
> 'crash'}`, the gate's own words and fields — and empties the list; the cut call is answered and its row settled as every
> call a crash cut is. Revision 3's "never restored on reload" is untouched: the mirror is never read back as pending.
> The same column gives REQ-SESSION-031's listing its question half (`awaitingInput`). **What was measured:** `crash.test.ts`,
> `sessions.test.ts`, the run host's `tools.test.ts` (each red before) and `store.test.ts`'s v34 → v35 migration.
> **What was not measured:** no built-app proof or live run kills a run host while a question waits; the live scenario
> that would show it is written in the row in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
>
> **Reported in place 2026-10-14 (fin43, `fin43-notices-and-config`):** the approvals half now has the same shape. Each port
> wrote its own registry's list to `pending_approvals`, so two agents waiting at once overwrote each other and a crash then
> withdrew only the last writer's
> ([`../../defects/fixed/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md`](../../defects/fixed/pending-approvals-holds-one-agents-list-when-two-agents-wait-on-approvals.md));
> the gate now writes the run's list over every port (`Run.pendingApprovals`). Measured by the run host's `tools.test.ts`
> with two real ports, red before, and the engine's `children.test.ts` (a root and two children, every port handed all
> three approvals, red with the gathering or its wiring removed); not driven in the built app.
