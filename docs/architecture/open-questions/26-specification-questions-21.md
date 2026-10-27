# Open questions — Specification questions (21 of 27)

Part 26 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-119 – OQ-126.

**OQ-119 — May the task the report summariser keeps as its start be longer than REQ-ORCH-110's 2,000 characters per event?** *(REQ-ORCH-110, "2000 characters for any one event"; OQ-111's ruling, whose kept start is "the task as given"; REQ-TOOLS-154, whose payload carries the task last. Raised 2026-09-29 by the repair of D1 under [R-067](../../product/requests.md#r-067), from the branch's verification; raised as OQ-118 on its branch and renumbered at the merge, OQ-117 and OQ-118 having been taken on `main`. ~~Open.~~ Ruled 2026-10-06.)*

OQ-111's first build kept the transcript's first event as its start. That event is the child's whole REQ-TOOLS-154
payload, which puts the workspace root, the write scopes, the sibling index, the attached artifacts and the inherited
reports ahead of the task, so the per-event cut kept those blocks and lost the task's tail. In the duress live run of
2026-09-29 (pack `2026-09-29T07-18-48-658Z`, session `b4a768a2`), every one of the six summarising requests began
`user: Workspace root: …` and was cut inside the task, 297 to 3,017 of its characters omitted. A payload with a sibling
index and inherited reports ahead of the task lost the task entirely. The repair keeps the ledger row's task itself as
the start, with the blocks ahead of it replaced by a marker stating their size. The delegations in that run carried
tasks of 105 to 3,447 characters, and six of the twelve were longer than 2,000.

**What the build proceeds under.** The start is one event, so REQ-ORCH-110's per-event cut applies to it: a task longer
than 2,000 characters keeps its first 2,000 (the marker ahead of it included), and the rest is marked omitted like any
event's. The task's closing sections are the ones lost.

**What a ruling decides.** Whether the task as given is exempt from the per-event cap, so its whole is kept within the
12,000 total. That would narrow REQ-ORCH-110's per-event figure for this one event. The alternative is that the cut stands.

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the task is exempt from the per-event cap within
the 12,000-character total, so the summariser sees the whole brief. Carried by
[`PD-ORCH-007`](../../product/directives/pd-orch-007.md#pd-orch-007), which narrows REQ-ORCH-110. The reading taken where the ruling leaves a
detail open: the exemption is the task's alone (the marker standing for the payload's blocks ahead of it included), every
other event keeps the 2,000; and a task that alone fills the total keeps its head within it, cut and marked, with every later
event marked omitted. **Built 2026-10-06 (fin20):** `reportTranscript` (`packages/engine/src/children/report.ts`), two cases
in `children/report.test.ts`, red on the code before.

**OQ-120 — How large may the facts given to the report summariser be, and which are kept when they are larger?** *(OQ-111's ruling, which gives the pass the report's deterministic facts and no bound on them; REQ-ORCH-110, "The report-producing pass MUST be bounded"; REQ-ORCH-109. Raised 2026-09-29 by the repair of D1 under [R-067](../../product/requests.md#r-067), from the branch's verification; raised as OQ-119 on its branch and renumbered at the merge. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the facts are bounded by REQ-ORCH-110's two figures as their own — each command to 2,000 characters, the block to 12,000 — and a block cut keeps its head, the edited files and the earliest commands.

The ruling adds the edited files and the commands with their outcomes to what the pass reads, and says nothing of their
size. A child that ran many long commands would make the pass unbounded, which REQ-ORCH-110 forbids.

**What the build proceeds under.** REQ-ORCH-110's two figures, borrowed: each command is cut to 2,000 characters, and the
block to 12,000 from its head, which keeps the edited files and the earliest commands. In the duress live run of
2026-09-29 no block came near either figure.

**What a ruling decides.** Whether those figures are the facts' own, or the facts count within the transcript's 12,000;
and, where the block is cut, whether it keeps the earliest commands or, as the transcript does, the most recent.

**OQ-121 — Does the explicit cancel's drain wait past the stop's 30 s?** *(REQ-ORCH-080, "wait up to the shutdown-drain
timeout (default 120 s; 0 disables) for still-running background children without cancelling them"; REQ-SESSION-092,
"if the loop has not reached a stop check within 30.0 seconds, a hard cancel follows"; REQ-MONITOR-129; `PD-ORCH-005`
clause 3, which keeps the explicit cancel "as today", and OQ-96's "The explicit cancel and a child summarising". Raised
2026-09-29 by the repair round of
[`a-root-call-that-ignores-the-stop-holds-the-run-open.md`](../../defects/fixed/a-root-call-that-ignores-the-stop-holds-the-run-open.md)
under [R-067](../../product/requests.md#r-067). Numbered OQ-119 on its branch; renumbered OQ-121 at the merge, origin/main's OQ-119 and OQ-120 having taken the numbers first. ~~Open.~~ Ruled 2026-10-06.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built, since it follows REQ-ORCH-080: the explicit cancel's drain is REQ-ORCH-080's own bound and runs after the 30 s grace, whether or not the root returned, so it can take 150 s at the defaults; the 30 s still bounds how long any one execution is awaited, and a stop or a quit drains nothing.

A stop that brings the run to rest leaves the background children `paused` and drains nothing (`PD-ORCH-005`). The
explicit cancel cancels them, so REQ-ORCH-080's drain applies to it: the run waits up to the drain timeout for them,
records the drain-timeout issue for what is left and then cancels it. REQ-SESSION-092 bounds the same stop at 30 s, after
which a hard cancel follows, and REQ-ORCH-080's default is four times that. The two requirements do not say which
bound governs when both apply. The first build of the root's bound hid the question: a root that returned drained, and
one the grace gave up on skipped the drain, so the same cancel waited up to 120 s or not at all depending on the root
(found by the verifier of that build).

**The reading built.** The drain is REQ-ORCH-080's own bound, not the grace's, and it runs whether the root returned or
was given up on at the grace (`Run.turn`): the explicit cancel with active background children can take the grace and
then the drain timeout, 150 s at the defaults. The 30 s stays the bound on how long any one execution is awaited: once
the drain is over, a child execution still running past the grace, counted from the first stop request, is detached
(`IterationChildren.outlast`), so it writes nothing into the finished session (REQ-SESSION-094). A stop
and a quit drain nothing and end within the one 30 s. The application's quit (REQ-MONITOR-131, REQ-MONITOR-283) is a
stop, so its 30 s force exit is not met by a drain.

**What a ruling decides.** Whether the explicit cancel's drain should be bounded by REQ-SESSION-092's 30 s (the drain
given what is left of the grace, or the drain replaced by the grace for the cancel), or run after it as built; and
whether REQ-ORCH-080's drain should still apply to the explicit cancel at all, now that `PD-ORCH-005` has a stop leave
the background children paused rather than cancelled.

**OQ-122 — May the window open the setup dialog before the open's resolution, and what does a skip answered in that interval record?** *(REQ-WORKSPACE-083, REQ-WORKSPACE-084, REQ-WORKSPACE-086, REQ-WORKSPACE-088, REQ-WORKSPACE-102, REQ-WORKSPACE-105, REQ-WORKSPACE-111, REQ-WORKSPACE-141; ADR-0064, "On Linux as root — 2026-09-28". Raised 2026-09-29 by repairing `../../defects/fixed/a-skip-answered-before-the-open-resolves-swallows-the-background-task.md` under [R-062](../../product/requests.md#r-062). Raised as OQ-109 on its branch, then renumbered OQ-118 on the branch, OQ-109 to OQ-117 having been taken on `main` meanwhile, and renumbered OQ-122 at the merge, OQ-118 to OQ-121 having been taken on `main` by then.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the window may open the setup dialog before the open's resolution, and a skip answered in that interval performs the open's one automatic resolution first, recording every given id except one the live run is attempting or one already completed.

The window reads the initialization state as it mounts. REQ-WORKSPACE-105 makes the prompt due "exactly when at least
one consent-requiring task is pending and no run is in progress", and the mount read's values say so, so the window
opens the dialog. Main's one automatic resolution comes later, in REQ-WORKSPACE-141's interactive slot, 800 ms after the
workspace is acknowledged. But REQ-WORKSPACE-083 makes the prompt request a **product of that resolution**, and the same
resolution starts the background tasks "regardless of whether a prompt is also due". A skip answered between the two
meets clauses that pull apart:

- REQ-WORKSPACE-086 records "every given pending task id as skipped", and REQ-WORKSPACE-111 persists "the listed task
  ids". The dialog lists the runnable tasks (REQ-WORKSPACE-083, REQ-WORKSPACE-106), `code-intelligence-setup` among them.
- REQ-WORKSPACE-088 says that task "starts by itself when the workspace opens". A skip recorded before the resolution
  leaves it resolved, so the resolution starts nothing, now or on any later open.
- REQ-WORKSPACE-084 owes an **attempted** task exactly one outcome. ADR-0064's finding (2) leaves such a task out of a
  skip on that ground. A task not yet started is not attempted.

Readings:

- **the dialog waits for the resolution**: the window auto-opens the dialog only once the open's resolution has produced
  the prompt request. That needs a signal beside REQ-WORKSPACE-105's nine values, which that clause says are "exactly"
  what the interface works from. The composer gate of REQ-WORKSPACE-112 would also stay off until then.
- **the skip brings the resolution forward**: the dialog opens on the values. A skip that arrives before the open's one
  automatic resolution performs that resolution first, or waits for the one under way. The background task it starts
  is then attempted, and finding (2)'s reading applies. The slot then finds the resolution made (REQ-WORKSPACE-102).
- **the skip withholds the owed task**: a pending background task is left out of the skip until the resolution has
  started it. This contradicts REQ-WORKSPACE-086 and REQ-WORKSPACE-111 for an id that is given and listed. It was built
  first on the repairing branch and withdrawn before it merged.
- **literal**: the skip records every given id, and the background task never starts on that open or any later one.
  This contradicts REQ-WORKSPACE-083 and REQ-WORKSPACE-088.

**What the build proceeds under:** the second reading (`InitializationCoordinator.skip` and `resolve` in
`apps/desktop/src/main/initialization.ts`). It keeps REQ-WORKSPACE-105's values as they are. It records every given
id except one the live run is attempting, which is the exception ADR-0064 already rests on REQ-WORKSPACE-084, and one
already recorded completed, which is not pending (REQ-WORKSPACE-086; added 2026-09-29 by the repair of
`../../defects/fixed/a-skip-can-move-a-completed-task-into-skipped.md`). It runs the
open's resolution once, and only when the window has plainly accepted input, since the skip is the window's own
answer (REQ-WORKSPACE-102). **A ruling would decide** whether the dialog may precede the resolution at all. If it may
not, the first reading replaces the second, and the skip path then never meets an unresolved open.

**OQ-123 — Which run does REQ-WORKSPACE-105's "no run is in progress" mean: any run, or one that answers the setup prompt?** *(REQ-WORKSPACE-083, REQ-WORKSPACE-103, REQ-WORKSPACE-105, REQ-WORKSPACE-106, REQ-WORKSPACE-107, REQ-WORKSPACE-110, REQ-WORKSPACE-112; ADR-0064, "On Linux as root — 2026-09-28". Raised 2026-09-29 by repairing `../../defects/fixed/the-setup-dialog-takes-a-background-run-as-its-own.md` under [R-062](../../product/requests.md#r-062). Raised as OQ-110 on its branch, then renumbered OQ-119 on the branch, OQ-109 to OQ-117 having been taken on `main` meanwhile — `main`'s OQ-110 already stood when this one was raised under that number — and renumbered OQ-123 at the merge, OQ-118 to OQ-121 having been taken on `main` by then.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: REQ-WORKSPACE-105's "no run is in progress" means a run that answers the setup prompt — one the user started — so a background run neither withdraws the prompt nor is drawn in its dialog until Initialize is pressed.

REQ-WORKSPACE-105 makes the setup prompt due "exactly when at least one consent-requiring task is pending and no run is
in progress", and its nine values carry one in-progress flag. On a fresh workspace with a consent task, the open's
resolution produces the prompt request **and** starts the background tasks "regardless of whether a prompt is also due"
(REQ-WORKSPACE-083). So a background run is in progress while the prompt it was raised beside is still unanswered. The
clauses pull apart:

- REQ-WORKSPACE-107 closes an auto-opened, unanswered dialog without a skip "when the underlying prompt request
  disappears". REQ-WORKSPACE-112 gates the composer "while the setup prompt is unanswered".
- REQ-WORKSPACE-110 says "Pressing Initialize while a run is already live SHALL start nothing and flip the dialog to its
  in-progress state". That describes a dialog still in its prompt state, with Initialize to press, while a run is live.
  On one window the only such run is a background run.
- REQ-WORKSPACE-103: background tasks start "without any dialog and without blocking the interface; nothing renders
  their progress live".

Readings:

- **any run**: while the background run is live the prompt is not due. An auto-opened dialog closes unanswered
  (REQ-WORKSPACE-107), the composer gate lifts, and when the run ends the prompt is due again, but the dialog has
  already had its one automatic opening (REQ-WORKSPACE-105). The user meets the gate with the dialog shut. This reading
  leaves REQ-WORKSPACE-110's case unreachable.
- **a run that answers the prompt**: a run the user started, which runs the listed consent tasks. A background run
  answers nothing, so the prompt stays due beside it, the gate stays on, and the dialog stays in its prompt state until
  the user skips, or presses Initialize and so flips it to the live run (REQ-WORKSPACE-110).

**What the build proceeds under:** the second reading. The state carries `backgroundRun` beside the report and the
nine values, unchanged (`packages/contracts/src/initialization.ts`). `setupPromptDue` (`packages/ui/src/ProjectSetupDialog.tsx`)
is the one answer that the window's auto-open and the composer gate read. The dialog draws a background run's report
only once Initialize has been pressed (`dialogReport`). Before this, the built product followed neither reading
consistently: the window lifted the gate for any run, as the first reading does, but kept the dialog open and drew the
background run inside it. **A ruling would decide** which run REQ-WORKSPACE-105 means. If it is any run, the dialog closes
on the background start and the composer gate goes with it.

**OQ-124 — Which agents' elapsed clocks advance: REQ-MONITOR-045's "live", or every agent neither ended nor paused?** *(REQ-MONITOR-107, "While the agent is live the figure advances"; REQ-MONITOR-045, "An agent is \"live\" exactly when its presentation state is running"; REQ-MONITOR-064, whose "live (running, waiting, or queued)" uses the word in a second, wider sense; REQ-MONITOR-110/111 with resolution item 25 of `docs/spec/resolutions/02-run-monitoring-steering.md`, "A surface holding a spawn timestamp and showing a fallback … is now a defect"; OQ-100, whose reading keeps a `paused` agent's figure off "This task". Raised 2026-09-29 by the repair of
[`a-waiting-agents-elapsed-time-is-not-shown.md`](../../defects/fixed/a-waiting-agents-elapsed-time-is-not-shown.md)
under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-122 and renumbered OQ-124 at the merge, main having
taken OQ-122 and OQ-123.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built, and `PD-ORCH-005` revision 6 states it in clause 33: the figure of a running, waiting or queued agent advances, and a `paused` agent shows none. REQ-MONITOR-107 and REQ-MONITOR-111 join the directive's Narrows list.

REQ-MONITOR-107 has the figure advance "while the agent is live" and fixed "once the agent is terminal", and says nothing of
an agent that is neither. Read with REQ-MONITOR-045's definition, a waiting or queued agent is not live, so the
requirement does not ask its figure to advance; but REQ-MONITOR-111 forbids the fallback wherever a spawn timestamp was
recorded, so the figure must be shown, and a figure measured from the spawn timestamp that stood still while the agent
waited would be neither its elapsed time nor its time at completion. REQ-MONITOR-064 already calls a running, waiting or
queued agent live.

**The reading built.** The clock has its own predicate, `clockAdvances` (`packages/ui/src/AgentTree.tsx`): an agent not
ended, holding a parseable spawn timestamp, whose presentation state is running, waiting or queued — REQ-MONITOR-064's
live set. Its figure is shown and advances on the surface's one-second tick on the four surfaces with a slot for it (the
tree meta, the Mission table, the inspector meta, the persona window's context card); an ended agent's is fixed at
completion minus spawn. `AgentRecord.live` keeps REQ-MONITOR-045's running-only sense and still drives the pulse, the
motion and the inspector's writability. A `paused` agent keeps OQ-100's reading (no figure; the tree reads its state,
the inspector and the context card their fallback), since nothing runs for it and REQ-CHAT-008's recovery state keeps
the tick going. The tick condition (REQ-MONITOR-110) needed no change: it runs while the followed session is busy, and a
running, waiting or queued agent is presented only then (a session at rest settles or pauses every unfinished agent).
One case is not covered by that sentence, found at the verification of this repair: a session whose persisted status is
literally `idle` is not reconciled (`reconcile` in `packages/engine/src/sessions.ts` excludes `idle`), so a non-terminal
child held there would keep its running, waiting or queued state while the tick stands, and its figure would show without
advancing. No path is known to leave a child unfinished under an `idle` session; it is stated, not built for.

**What a ruling decides.** Whether a waiting or queued agent's figure advances (as built) or stands, and whether a
`paused` agent should show a figure — fixed at its pause, or advancing — rather than OQ-100's fallback, which
REQ-MONITOR-111's "a surface that has a spawn timestamp and shows a fallback … is a defect" reads against.

**OQ-125 — What does an agent surface's artifact link open, and which artifacts does it list as an agent's?** *(REQ-MONITOR-052 and REQ-MONITOR-069, "artifact links", which name no target; REQ-MONITOR-044, "artifacts (name, producer, ready flag), produced and received artifact ids"; REQ-MONITOR-068's persona-wide card; REQ-LIBRARY-102, which lets "actions" deep-link to the Library's artifacts tab; REQ-LIBRARY-131's modeless, per-window artifact inspector; REQ-LIBRARY-136, which hides superseded artifacts from the Library's table. Raised 2026-09-29 by the repair of
[`the-inspector-says-no-artifact-store-and-no-tools.md`](../../defects/fixed/the-inspector-says-no-artifact-store-and-no-tools.md)
(live-run finding K1) under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-123 and renumbered OQ-125 at
the merge, main having taken OQ-122 and OQ-123.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: in the main window a link opens the Library on its Artifacts tab with the artifact inspector on that artifact, and in a persona window it opens the inspector in place; a superseded artifact is listed nowhere.

The specification asks for artifact links on three agent surfaces and says what an agent carries about its artifacts,
but not what following a link does, nor whether a superseded artifact is still one of an agent's.

**The reading built.** In the main window a link deep-links to the Library on its Artifacts tab and opens the artifact
inspector on that artifact (REQ-LIBRARY-102's deep-link, REQ-LIBRARY-131's inspector, re-raised when already open). A persona
window has no route to the main window's Library, so there a link opens the artifact inspector in the persona window itself
— REQ-LIBRARY-131 makes the inspectors per window. An agent PRODUCED an artifact whose producer (`created_by`, else the
record's canonical name — REQ-LIBRARY-136's "producer") is its name, and RECEIVED one whose consumers name it. The
run-level agent is matched by the entry persona and by each root's two names from the session (`SessionRecord.entryRoots`:
the name its rows carry and its canonical name). A root publishes and reads under its canonical instance name
(REQ-LIBRARY-093). *As first built, the run-level agent was matched by the entry persona alone, "which is the name the
root publishes under". The repair of
[`a-roots-publish-names-its-persona-as-its-author.md`](../../defects/fixed/a-roots-publish-names-its-persona-as-its-author.md)
(2026-09-29, R-067) made that false for a persona id the canonicaliser rewrites. The links read the roots' names since
[`the-run-level-agent-is-known-by-its-entry-persona-alone.md`](../../defects/fixed/the-run-level-agent-is-known-by-its-entry-persona-alone.md).
A plan cycle's root, which no iteration row records, is named by its publishes; one that published nothing is named only
while its run is live
([`a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md`](../../defects/fixed/a-plan-cycles-root-that-publishes-nothing-is-named-only-while-its-run-is-live.md),
open). Reported back 2026-10-01, at the repair's first execution (acceptance A22, R-067): no longer true — every plan
cycle's root is recorded when its turn starts (`plan_roots`, store v30) and named from there, whether or not it
published, so what such a root read is the run-level agent's received link at the gate and after it.* A superseded artifact is listed nowhere, as the Library's table lists it nowhere. The ready flag is stated in
words: "ready" (REQ-LIBRARY-136), else the status.

**What a ruling decides.** Whether a link should open the Library (as built in the main window), an inspector in place
(as built in a persona window) or something else; and whether an agent's links should keep its superseded artifacts.

**OQ-126 — Is a step that only called tools a message for REQ-ORCH-101's raw count?** *(REQ-ORCH-101, whose raw-count
trigger counts "tool calls" and "messages" against their thresholds; REQ-ORCH-100, the message-count threshold 60;
REQ-ORCH-104, whose raw-count fallback declares a loop from "repeated identical assistant messages". Raised 2026-09-29 by
the repair of live-run finding D3,
[`tool-only-steps-read-as-three-identical-messages.md`](../../defects/fixed/tool-only-steps-read-as-three-identical-messages.md),
under [R-067](../../product/requests.md#r-067). ~~Open.~~ Ruled 2026-10-06. Raised as OQ-124 and renumbered
OQ-126 at the merge, main having taken OQ-124 and OQ-125.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: every model step counts toward REQ-ORCH-101's message count, a tool-only step included, while REQ-ORCH-104's evidence compares the last three messages that carry text.

The turn observes every model step as a message carrying its text, and a step that only called tools carries none
(`runTurn`'s `observe({ kind: 'message', text: report.text })`). The repair of D3 reads such a step as **no assistant
message** for REQ-ORCH-104's evidence — three tool-only steps are not three identical messages — which is what "never from
counts alone" requires. The same event still counts toward the message threshold of REQ-ORCH-101's raw count, so the message
count reaches sixty after sixty model steps whether or not any of them said anything. Neither requirement says whether a
step with no text is a message.

**The reading built.** Unchanged: every step counts toward the message count, a tool-only step included; only the fallback's
evidence reads a message that normalises to nothing as none.

**What a ruling decides.** Whether a step with no assistant text counts toward REQ-ORCH-101's message count (and so toward
the `weighted` score), or only a step that said something does — which would make the reading the same in both places.
And, for REQ-ORCH-104's "last 3" identical messages: whether a tool-only step between three identical texts breaks the
run. The reading built says it does not — the last three messages that carry text are compared — so three identical texts
with tool-only steps between them now declare a loop where the code before the repair, which compared the last three
events whatever they held, did not.
