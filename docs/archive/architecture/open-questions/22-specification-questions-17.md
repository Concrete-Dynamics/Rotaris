# Archived open questions — Specification questions (17 of 27)

The ruled, closed, resolved and withdrawn entries of [part 22](../../../architecture/open-questions/22-specification-questions-17.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-104"></a>

**OQ-104 — Where does the gate hold a run that resumed an iteration, and what does that plan cycle plan?** *(`PD-ORCH-003` revision 2, with `PD-ORCH-005` clause 18; REQ-ORCH-152, which the directive narrows for an iteration a rest left open (`PD-ORCH-005` clause 4), and which the reading below that an iteration a crash left open resumes unheld too departs from for an iteration the directive does not govern; REQ-ORCH-153, whose gate that reading also departs from for the same iteration; and REQ-ORCH-021, REQ-ORCH-067, REQ-ORCH-069, REQ-ORCH-073, REQ-ORCH-085, REQ-ORCH-154, REQ-CHAT-040, REQ-SESSION-115 and REQ-TOOLS-010, which it does not name. Raised 2026-09-28 by building `PD-ORCH-003` revision 2 under [R-065](../../../product/requests.md#r-065). Numbered OQ-77 while it was built; renumbered when it reached `main`, where OQ-77 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is confirmed, and [`PD-ORCH-003`](../../../product/directives/pd-orch-003.md#pd-orch-003) revision 3 states them, with `PD-ORCH-005` revision 6's clause 27 pointing there: the unheld resume reaches an iteration a crash left open once the crash is recorded; a requeued resumed task is a new iteration and is held; the answer group is exempt; the plan cycle plans every pending task (the first twenty); it is sent the handoff the continue built; a revise is not told again what became of the message; a Continue action after a cancel at this hold re-runs a message the resumed iteration carried out; and no surface offers the re-arm on a paused session.

Revision 2: a continue that resumes an open iteration "SHALL run that iteration without holding it at the gate … When
the gate would hold that run … it SHALL hold before the first new iteration the run begins." The paragraph places the
hold and leaves open what happens at the edges of that point, what the plan cycle held there is asked to plan (the
launch content is the continue that resumed the iteration, whose work that iteration may or may not have finished),
and what the answer at that gate launches.

**What the build proceeds under.**

- **The hold falls where a new iteration would begin.** After the resumed iteration closes, the loop checks the stop,
  the pause, the queued prompts (REQ-CHAT-040) and the stop conditions (REQ-ORCH-069) as it does before every iteration,
  and holds only when they found work left. A run with nothing pending, or at its iteration or time limit, ends as it
  would have, with no gate. The message-limit pause reached as the resumed iteration closes wins (REQ-ORCH-085), and so
  do a pause or a stop accepted during it. The hold is then set before the park turn builds anything, so that turn's
  tool listing, its hooks, its children and its supervisor are all the held segment's (REQ-TOOLS-010, PD-ORCH-001), and
  a pause during it is refused and a stop records no interruption (`PD-ORCH-005` clauses 11 and 15).
- **An iteration a crash left open resumes unheld too, once the crash is recorded.** The revision names "an iteration a
  rest left open (`PD-ORCH-005` clause 4)"; it does not name one a crash left. Clause 18 has either continue of a
  crash-left session record the crash first, which writes the open iteration's interruption `crash` — the record a rest
  would have left, by another cause — and then resume it as a paused session's continue does. The build takes the
  revision to reach that iteration: it runs unheld, and the run holds before its first new iteration, by the same route
  and whichever continue resumed it (`plan-gate-resume.test.ts`, "left by a crash and resumed by …"). The alternative —
  hold the crash-left iteration at the gate, since the revision's words name only a rest — was not taken, because once
  the crash is recorded nothing in the run tells the two apart, and holding would put the work already under way behind
  a plan cycle that clause 18's continue does not otherwise meet. Because the revision governs only a rest's iteration,
  running a crash-left one unheld under `plan` departs from REQ-ORCH-152 ("In `plan` mode the gate of REQ-ORCH-153
  applies") and REQ-ORCH-153 beyond the revision, as the provenance above states. ADR-0062's amendment and the engine
  glossary's Plan gate entry cite this reading. Recorded at the merged build's review, which found both citing it here
  before it was stated.
- **Any iteration after the resumed one is new.** A resumed iteration that ends `partial` requeues its task
  (REQ-ORCH-073), and the next iteration would take it up again under a new number; that iteration is held too, since the
  directive's line is the iteration, not the task.
- **The answer group is exempt, as at the start of a run.** The intent is the pre-flight's classification of the
  continue — its message, or the last request for the Continue action — and a run whose intent is in REQ-ORCH-021's
  answer group is not held, so whether a run will be held stays answerable without knowing more than at the start.
- **What the plan cycle plans.** It is told the plan request, then that the run resumed the iteration, which has closed,
  and the tasks still pending in the order the run takes them up (the first twenty, the count the handoff shows of its
  todo under REQ-SESSION-115, each cut to 500 characters rather than the handoff's 80, since here a task's text is the
  work to plan and not a display title), then the launch content as the session's context. What it is told of the
  continue's message follows what `PD-ORCH-005` clause 17 made of it: carried out when the resumed iteration succeeded;
  not finished, among the pending tasks and taken up first, when it closed otherwise; and nothing when the resumed
  iteration held no message. The messages meant are every one the resumed iteration held — this continue's, and one an
  earlier continue by message delivered to it before it came to rest again, which a Continue action then resumed — and
  "carried out" is said only when all of them closed done. *The first build told it the message was already dealt with
  in every case, which contradicted the pending list after a `partial` close and after a Continue action (found by the
  lane's second review); the second read only the message this run's own continue delivered, so a Continue action that
  resumed an iteration holding an earlier continue's message was told nothing of it (found by the iteration lane's third
  review).* The pending tasks are what the first new iteration would have selected, so the approved plan is about the
  work it releases. The iteration is said to have been left open, not what left it: a crash-left session's continues
  take the same path as a paused one's (`PD-ORCH-005` clause 18), and the revision's "a rest left open" is the case it
  names, not a line it draws. *The second build said a rest had left it open, which is false on the crash route (found
  by the iteration lane's fourth review).*
- **The handoff after the preamble is the continue's.** The launch content that follows the preamble is the payload
  `Sessions.prompt` or `continueSession` built before `launchContinuation` ran: before the crash was recorded, before
  clause 17 appended the message's task and before the resumed iteration did any work. Its "Authoritative session
  handoff" is therefore stale by the time this plan cycle reads it: its todo shows the resumed iteration's task
  `in_progress` and not the continue's message, its artifact line (clause 20, OQ-106) was read before the resumed root
  published anything, and its progress and recent iterations are from before the close — while the preamble, read from
  the live todo, says that iteration has closed and, when it succeeded, carried the message out. The payload's own
  opening ("Prior session context is authoritative") leaves the role two statements of the todo that disagree. This is
  the staleness OQ-106 reads for a later iteration of the same run ("The handoff is read once"), met here by the first
  turn after the resumed iteration; nothing rebuilds the payload for the plan cycle, and the pending tasks the preamble
  lists are what the approved plan releases. The repair of
  [`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../../../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)
  (2026-09-29) keeps this: it adds an execution iteration's own task after the launch content and rebuilds no
  handoff, and a plan cycle is sent no iteration task. *Until that repair this bullet called the staleness the behaviour
  that defect records; the repair left it, so it stands on this reading and the ruling question below.* Measured in
  `plan-gate-resume.test.ts`, "the plan cycle held after a resumed iteration is sent the handoff the continue built
  before that iteration ran". Recorded at the merged build's tenth review.
- **What the answer launches.** A plan decision's relaunch appends no task: the held run's stored todo already carries
  every task — the gated work, and after this hold the continue's message too, which `PD-ORCH-005` clause 17 made a task
  of its own and closed with the resumed iteration, `complete` or `pending` and taken up first — so appending the last
  request again would duplicate it. *The first statement of this reason said the resumed iteration had dealt with the
  message, which is false after a `partial` close, and after a Continue action, whose last request is an earlier one
  (found by the iteration lane's third review); the behaviour was right and is unchanged.* The same append had made
  every approved prompt a second task, worked twice; that is repaired with it
  ([`a-plan-decision-appends-the-gated-prompt-as-a-second-task.md`](../../../defects/fixed/a-plan-decision-appends-the-gated-prompt-as-a-second-task.md)).
  The approved run is set up as any run is: the resumed root's persona covered the work already under way (OQ-97), and
  no iteration is open when the plan is decided, so the work after the gate runs as the entry role configured then.
- **A revise is launched as any revise is.** After this hold the run has closed the resumed iteration, so the revise's
  relaunch resumes nothing: its plan cycle is told the plan request, the handoff built for it — whose "Latest user
  request" is the continue's message and whose todo shows that message `complete` (or `pending`) beside the tasks still
  pending — and the plan and the changes the user stated. It is not told `resumedWorkSection` again; the record keeps no
  mark that the hold followed a resumed iteration, and the handoff's todo states the same work.
- **"Continue without them" is unchanged.** It resumes nothing, so its run is held before its first iteration, as any run
  that resumes nothing is.
- **What a cancel leaves.** A plan Cancel at this hold, or a stop or the application's quit during its plan cycle
  (`PD-ORCH-005` clause 15, which pairs the two), leaves the session `paused` with no iteration open, as at any hold.
  When the resumed iteration succeeded, the continue's message — the last user row — is `complete` (clause 17), so the
  next Continue action finds no unfinished task of its text and appends it again beside the pending work (OQ-102 appends
  a completed request as before). The plan cycle that run is held at is asked to plan the message as its latest request,
  and approved, the message is worked a second time. A cancel at a fresh hold does not do this: the gated request's task
  is still pending, so the Continue action appends nothing. OQ-103's "Nothing open to resume" records it beside the other
  routes to the same state, and its ruling question covers it. Measured in `plan-gate-resume.test.ts`, "after the hold
  that follows a resumed iteration, …", for a plan Cancel and for a stop and a quit during the plan cycle. Recorded at
  the merged build's eighth review; the quit, the likeliest of the three (the user closes the application while the plan
  is drafted), at the twelfth. The message-limit pause that wins over this hold (above) leaves the same state at
  `paused_message_limit`: nothing open and the message `complete`, so the resolution's 'continue' and 'double' append it
  again as the Continue action does ("the message-limit resolution's …", in the same file). Recorded at the merged
  build's tenth review.
- **No surface re-arms the gate on a paused session.** The revision holds a resumed run "because the session holds no
  release and the mode is `plan` or the release was re-armed", and the re-arm is the user choosing `plan` on the run-start
  control, which the composer disables on a paused session and in the recovery state (REQ-CHAT-006,
  `CHIPS_DISABLED_STATES`). `Sessions.planRearm` accepts a rested session, so a re-arm before a continue is reached only
  by command, or by a mode chosen before the pause. The build leaves the chip as REQ-CHAT-006 draws it. Found by the
  built-app drive of the merged build, which re-armed through `session.planRearm`.

**What a ruling decides.** Whether the revision's unheld resume reaches an iteration a crash left open once clause 18
has recorded the crash, as built, or only one a rest left, so that a crash-left iteration is held at the gate like a new
one; whether a requeued resumed task should count as work already under way rather than a new iteration; whether the
answer-group exemption should reach this hold; whether the plan cycle should plan only the first pending task or all of
them; whether this plan cycle should be sent a handoff rebuilt after the resumed iteration closed, rather than the
continue's, or be told that the handoff predates that iteration; whether a revise after this hold should be told again
what became of the continue's message; and whether a Continue action after a Cancel, a stop or a quit at this hold, or
the message-limit resolution after the limit won over it, should re-run a message the resumed iteration carried out, as
built, or continue with the pending work alone (with OQ-103's ruling on the same state); and whether the run-start control should offer the re-arm on a paused session.

<a id="oq-105"></a>

**OQ-105 — What is an agent's fingerprint taken of, when is it compared, and where is the warning stated?** *(`PD-ORCH-005` clause 14 over OQ-95's reading; REQ-SESSION-029, REQ-SESSION-132, REQ-SESSION-134, REQ-SESSION-135, REQ-ORCH-019, REQ-ORCH-088, REQ-ORCH-095, REQ-WORKSPACE-047, REQ-WORKSPACE-050, REQ-WORKSPACE-058, REQ-WORKSPACE-060, REQ-TOOLS-010, REQ-TOOLS-053, REQ-TOOLS-069, REQ-MCP-101, REQ-CONFIG-166 and REQ-MONITOR-305, which the directive does not name; and REQ-ORCH-139, whose issue-kind vocabulary has no kind for the warning, which the reading below departs from by coining `resumed_under_changed_instructions`. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../../product/requests.md#r-065). Numbered OQ-78 while it was built; renumbered when it reached `main`, where OQ-78 had been taken meanwhile. **Ruled 2026-10-06.**)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** the fingerprint is taken of the persona's own
definition alone — its instructions before a playbook, the context units and the MCP section are appended, and its tool
declaration rather than the listing a request offered — and a change is warned once: the fingerprint is then replaced by
the definition the agent resumed under. When and where the warning is stated (a `resumed_under_changed_instructions`
warning issue and one transcript line, at the resumed execution's first model step) stays as built. By
[`PD-ORCH-005`](../../../product/directives/pd-orch-005.md#pd-orch-005) revision 7, clause 14.

Clause 14 has each agent's record keep "a fingerprint of the system instructions and the tool definitions the agent
started with", and has the run state, as a warning, which agent resumed under changed instructions when its persona's
current ones differ. It does not say what the instructions are — the persona's own text, or everything the request's
system prompt carries — nor when the comparison is made, how often a warning is repeated, or where the run states it.
REQ-MONITOR-305's warnings surface, where a warning would naturally be listed, is not built.

**What the build proceeds under.**

- **What the request carried.** The fingerprint is two SHA-256 digests (`agent_fingerprints`, v24): the system prompt
  exactly as the agent's first model request carried it — the persona's instructions, its playbook (REQ-ORCH-019), the
  session's context units (REQ-WORKSPACE-060) and the MCP section (REQ-MCP-101) — and the tool definitions that request
  offered (REQ-TOOLS-010), in name order with every object's keys sorted, so the order a listing was assembled in is not
  a change. A digest, not a copy: the instructions are not stored twice (REQ-SESSION-029). The consequence is stated
  here because it is wider than "its persona" alone: a continue whose pre-flight classifies a different intent (a
  different playbook), a skill force-loaded since, a changed MCP server, or a permission mode that changes the listing
  also warns, since each changes what the agent is instructed with or offered. The first is common: every continue
  runs the pre-flight again with its own message (`launchContinuation`), so a continue by message classified as a
  different intent warns for every resumed agent whose role has a playbook, though no persona was edited. The model is
  not part of it.
- **The workspace's own files are in it too.** The context units include REQ-WORKSPACE-047/050's workspace context — the
  instruction files (`AGENTS.md` and the like) merged from the run's execution root, the tree the agents write to — and
  the skill catalog block. So an agent that edits `AGENTS.md` as part of its task changes what every agent resumed after
  it is instructed with, and each is named "resumed under changed instructions: its system instructions differ",
  although no persona changed and the change is the run's own. Whether it is named depends on whether the merge was read
  again: REQ-WORKSPACE-058 holds it per workspace root until a rescan or a session creation clears it
  (`SkillRegistry.workspaceContext`), so a continue in the same process after nothing else happened is still handed the
  cached merge and states nothing, while the same continue after the app is relaunched, or after any session is created
  in that workspace, is handed the edited file and warns for every resumed agent. The warning is true of what the
  request carried in both cases; which of the two the agent is given is REQ-WORKSPACE-058's, not this build's. A lesser
  case of the same kind: `ask_questions` is listed only while the run host holds a live presenter (`userPromptChannel`,
  attendedness under REQ-TOOLS-053/069), so an agent that started during a lapse in the presenter and is resumed with
  one live is named for its tool definitions.
- **The first is kept.** The fingerprint is recorded at an agent's first model step and never replaced. Every resume
  compares against it, so each resume under instructions that still differ warns again; a resume under the instructions
  it started with states nothing.
- **Compared at the resumed execution's first model step**, just before the step goes out, once per execution — after
  the tool port is ready, so an MCP listing is complete. Any later execution of a task id that has a fingerprint is a
  resume (a task id is never executed twice otherwise). REQ-ORCH-088's fallback retry and REQ-ORCH-095's re-prompt run
  within one execution and compare nothing, and neither does a root re-entered with its children's reports, although
  REQ-CONFIG-166 re-reads the context units at every turn: a skill loaded mid-run is not a resume. A resumed root
  waiting on its children is compared when it next steps; one that never steps again never ran under the changed
  instructions and is not named.
- **An agent with no fingerprint** — recorded before v24, or paused before its first model step — has one recorded at
  its resumed first step and nothing is stated (REQ-SESSION-132).
- **Stated as a warning issue and a transcript line.** A `resumed_under_changed_instructions` issue at warning severity
  — a kind coined by this build: the specification's issue-kind vocabulary ("Issue kinds (session diagnostics)" in
  `docs/spec/01-run-orchestration.md`) has none for it — its actor the agent's canonical name, with its timeline entry
  (REQ-SESSION-134/135), and one `system` row in the transcript: "Agent <canonical name> (<task id>) resumed under
  changed instructions: its system instructions | tool definitions | system instructions and tool definitions differ
  from the ones it started with." The issue's metadata carries the task id, the iteration and which of the two changed.
- **Every agent**, the root and every child at every depth, each under its task id and its own iteration (the root's
  iteration number, a child's `children.iteration`). The fingerprint is part of the agent's record for clause 12: it is
  deleted with its session, and the transcript clear removes closed iterations' fingerprints with their conversations
  (`fingerprints_removed` in `transcript_cleared`'s metadata), so an open iteration's are kept however many iterations
  closed before it.

**What a ruling decides.** Whether "the system instructions" should be the persona's own definition only, so a changed
playbook, skill, MCP server, workspace instruction file (one the run's own agents may have edited) or presenter-bound
tool does not warn; whether a warning should be stated once per change (replacing the
fingerprint after a warned resume) rather than at every resume while it differs; and whether the warning should also
reach REQ-MONITOR-305's warnings surface once that is built, or be stated at the continue rather than at the agent's
first step; and what the issue kind is called, since the specification's vocabulary has none for it.

*Built 2026-10-06 (fin20, `fin20-continue-and-continuation`).* `ConversationRecord.fingerprint` takes the persona's
definition (`personaDefinitionOf`: the persona's own system prompt, and its declared tools, `tool_restrictions` and
`coordinatorOnly`/`readOnly` flags), the root's from the entry persona and a child's from its own, and each digest is
marked `persona:`. A warned resume replaces the row's digests in place, its iteration kept (`SessionWriter.replaceAgentFingerprint`,
`StoreDal.replaceAgentFingerprint`); a fingerprint recorded before the ruling, unmarked, is replaced the same way and nothing
is stated. The warning reads "Agent <name> (<task id>) resumed under changed instructions: its persona's instructions |
tool definitions | instructions and tool definitions changed since it last ran." Pinned by
`packages/engine/src/run/record.test.ts`'s clause 14 describe, among it "OQ-105 as ruled (live-run findings a71-3 and G1): a
resume whose playbook, skills, MCP section or tool listing changed, with no persona edited, states nothing".
