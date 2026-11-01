[Product directives](../directives.md) › PD-ORCH-009

<a id="pd-orch-009"></a>

### PD-ORCH-009 — an entry role that ends its turn without an answer is asked once more, and the person is told if it still writes none

*Revision 2 (2026-10-07, [R-072](../requests.md#r-072)) — **no re-prompt after an answer**, the ruling of OQ-225 beside
[`PD-ORCH-015`](pd-orch-015.md#pd-orch-015). The first sentence is narrowed below and its revision-1 text quoted beside it. Revision 1
(2026-10-06, [R-071](../requests.md#r-071)) is otherwise unchanged.*

*Revision 3 (2026-10-13, [R-072](../requests.md#r-072), ruling [OQ-282](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-282), the
consortium's E1) — **the re-prompt is the root's only message for that turn**: one paragraph is added after the re-prompt's,
which narrows REQ-ORCH-104's stuck-mode clause for the one turn the re-prompt answers. Revision 2's paragraph is quoted beside
it, unchanged; everything else stands as revisions 1 and 2 wrote it.*

*Revision 4 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283) and
[OQ-284](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-284), both ruled by the consortium and written on 2026-10-14) — **the run's own follow-up
is the only message it adds for the turn it follows**: revision 3's last sentence is replaced and its case widened from the
entry role's re-prompted turn to three turns — that one, a delegated child's empty turn that REQ-ORCH-095's re-prompt answers
(OQ-283), and an execution iteration's root turn that REQ-ORCH-078's plan correction follows (OQ-284). Revision 3's replaced
sentence and its case are quoted beside their replacements; everything else stands as revisions 1 to 3 wrote it.*

*Revision 5 (2026-10-14, [R-072](../requests.md#r-072), ruling [OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296), ruled by the
consortium and written on 2026-10-14) — **a parent's silent wait on its children is no stuck report**: the case is widened by a fourth turn,
(d), a parent's empty turn the run follows by waiting and resuming the parent with its children's reports (REQ-ORCH-055..057).
Revision 4's two sentences that named this turn as governed by REQ-ORCH-104 as written — "a root resumed with a child's report
after an empty turn among them" and "a root's empty turn the run follows with a child's report included" — are replaced, and
quoted beside their replacements; everything else stands as revisions 1 to 4 wrote it.*

When the entry role of an execution iteration ends its turn with neither text nor a tool call — its last model step wrote
nothing for the person — and the run is not stopping, pausing or coming to rest, the run SHALL send it one further message
in its own conversation asking it to answer, and SHALL let it take that turn as it takes any — **revision 2:** only where no
earlier turn of the same execution of the root wrote an answer. A turn that follows a plan correction (REQ-ORCH-078,
`PD-ORCH-015`) after an answer is never re-prompted, and the answer it followed stays the iteration's answer.

> Revision 1 said, and no longer governs: "When the entry role of an execution iteration ends its turn with neither text
> nor a tool call — its last model step wrote nothing for the person — and the run is not stopping, pausing or coming to
> rest, the run SHALL send it one further message in its own conversation asking it to answer, and SHALL let it take that
> turn as it takes any." It was written when a plan correction followed only a positive validation-retry setting; under
> `PD-ORCH-015` every root that answers with its plan open is corrected, and a correction answered by a `todo` write and no
> text would have been asked for a second copy of the answer the person had already been shown.

**Revision 3:** The re-prompt is the one message the run adds for that turn. The empty turn it answers is not a stuck report
to loop supervision: no classification is asked, no corrective message joins the re-prompt, no `loop_supervisor_activation` is
written, and the consecutive-activation count is unchanged. **Revision 4:** the same holds for two more follow-ups the run
itself sends, each the one message the run adds for the turn it follows: REQ-ORCH-095's single re-prompt of a delegated child
whose turn ended with neither text nor a call ("Carry out the task now, …"), and REQ-ORCH-078's plan correction
(`PD-ORCH-015`) of an execution iteration's root. In each of the three, only a pending stuck trigger the turn armed is
withdrawn — a repetition, cycle or raw-count trigger the same turn armed is kept — and the withdrawal leaves the
consecutive-activation count unchanged. The plan correction is also REQ-ORCH-105's todo-correction message, so, as that
requirement already says, it restarts the consecutive-activation series. **Revision 5:** a parent's turn — an execution
iteration's root, or a delegated child acting as parent — that ends with neither text nor a call while a direct child of its is
pending, or has ended with a report the parent has not seen, is REQ-ORCH-055's wait and no stuck report. When the run takes the
parent into that wait it withdraws the stuck trigger the turn armed, so the children's reports are the only message the run adds
for that turn. As in the other three, only a pending stuck trigger is withdrawn — a repetition, cycle or raw-count trigger the
same turn armed is kept — and the consecutive-activation count is neither moved nor reset: a report is no user instruction under
REQ-ORCH-105. Every other trigger, every other empty turn and every other turn of a delegated child stay as REQ-ORCH-096 and
REQ-ORCH-099..107 say.

> Revision 4's last sentence said, and no longer governs: "Every other trigger, every other empty turn — a root resumed with a
> child's report after an empty turn among them ([OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296)) — and every other turn of a
> delegated child stay as REQ-ORCH-096 and REQ-ORCH-099..107 say." As built under it, a root that delegated in the background and
> ended its turn silent was resumed with the child's report followed, in the same request, by the stuck corrective ("Pause and
> reassess …"), with one stuck activation; and a root that waited so across three batches reached its third consecutive
> activation and escalated, the session ending `agent_session_aborted` with "child aborted after repeated activations".

> Revision 3's last sentence said, and no longer governs: "Every other trigger, every other empty turn and every delegated
> child stay as REQ-ORCH-096 and REQ-ORCH-099..107 say." As built under it, a delegated child's re-prompt was followed in the
> same request by the stuck corrective — [task, empty turn, re-prompt, "Pause and reassess the current task."] — with a stuck
> classification and activation for the child (OQ-283); and a stuck trigger a root's unanswered empty turn left pending was
> taken by the request a later plan correction led, the corrective following the correction (OQ-284). OQ-284's ruling, made
> beside OQ-283's, named delegated children as unchanged; OQ-283's ruling of the same day brings the child's re-prompted turn
> in, and revision 4 carries both.

> Revision 2's paragraph above stands unchanged, and revision 3 adds only the paragraph after it. Revision 2 said nothing of
> loop supervision, and as built the empty turn the re-prompt answers was also REQ-ORCH-096's stuck report: the stuck
> trigger it armed was taken at the re-prompt's first step, so the request the re-prompt leads to ended [prompt, empty turn,
> re-prompt, "Pause and reassess the current task. …"] — the re-prompt was not the model's last instruction, and a classifier
> was asked over an empty excerpt (the live scenario run at `ce5f952`, `empty-answer` and `empty-once`, finding F1).

The re-prompt SHALL be asked once in
each execution of the iteration's root, never twice. Where the turn that message leads to still ends without an answer, the
iteration SHALL close as it would have, and the run SHALL tell the person once, in a `system` row in the transcript and a
warning `incomplete_execution` issue naming the entry role: where the run ends after that iteration (REQ-ORCH-069's stop
conditions), that **the run** ended without an answer; where it does not — another task is taken up, the run parks at
the plan gate, or it pauses (at the message limit, at the user's request or at a quit) or is cancelled — that **the
iteration** ended without an answer. An answer written in reply to that message is an answer, even when a later correction's turn (REQ-ORCH-078)
writes none. A plan cycle's root (REQ-ORCH-153) is not asked: the plan it produces is the plan gate's to judge.

**Why, and what it costs.** A run asked "Read README.md … and tell me its first heading" read the file, globbed the
workspace and ended its turn with reasoning and no text (run 2 of `slice-proof`, 2026-10-03, OQ-199). The run completed
`tasks_complete` with only "The run completed." in the transcript: the person was given no answer and no warning, and a
completed run with no answer misleads. A delegated child in the same state is already re-prompted once (REQ-ORCH-095), and
the root now is too. What it costs: one more model call for a root that wrote nothing, and a row and an issue when even
that fails; a root that wrote nothing on purpose is asked anyway.

> **Extends:** REQ-ORCH-069
> **Narrows:** REQ-ORCH-104

*Revision 4's case, stated exhaustively:* REQ-ORCH-104's stuck-mode clause ("for stuck-mode triggers, ALWAYS recover with a
deterministic corrective message") on three turns, and no others: (a) the one turn of an execution iteration's entry role
that this directive's re-prompt answers — the empty turn that earned it; (b) a delegated child's empty turn (category
`no_activity`, neither text nor a call) that REQ-ORCH-095's single re-prompt answers; (c) the turn of an execution
iteration's root that the run follows with REQ-ORCH-078's plan correction (`PD-ORCH-015`); **(d), since revision 5,** the turn
of a parent — an execution iteration's root, or a delegated child acting as parent — that ends with neither text nor a call
while a direct child of its is pending or terminal-but-unobserved, which the run follows by waiting and resuming the parent with
its children's reports (REQ-ORCH-055..057). On each, a stuck trigger the turn armed is withdrawn before the run's message is
sent — in (d), as the parent is taken into the wait — so the clause has nothing to recover. Outside those four turns
REQ-ORCH-104 governs as written.

> Revision 4's case ended, and is widened by revision 5: "Outside those three turns REQ-ORCH-104 governs as written — a root's
> empty turn the run follows with a child's report included (OQ-296)."
[`PD-ORCH-016`](pd-orch-016.md#pd-orch-016) narrows the same requirement's raw-count clause ("≥ 4 consecutive same-tool calls"); the two
cases are disjoint — a repetition, cycle or raw-count trigger the same turn armed is kept, and revisions 4 and 5 withdraw only
a stuck one — as [README.md](../README.md) ("Two directives on one requirement") requires of two narrowings.

> Revision 3's case said, and is widened by revision 4: "REQ-ORCH-104's stuck-mode clause […] on the one turn of an
> execution iteration's entry role that this directive's re-prompt answers — the empty turn that earned it. There no stuck
> trigger stands, so the clause has nothing to recover. Outside that one turn REQ-ORCH-104 governs as written."

*Revisions 3 and 4 cite without changing:* REQ-ORCH-095 (the child's single re-prompt, still sent once), REQ-ORCH-096 (an
empty reply with no call is the runtime's stuck report — still so for every turn but the three above), REQ-ORCH-078 (the plan
correction, sent as before), REQ-ORCH-099, REQ-ORCH-102 (the activation counter, which a withdrawal does not move),
REQ-ORCH-105 (the plan correction is its todo-correction message, which restarts the consecutive series as written; no
directive is needed for that), REQ-NOTIFY-102 and REQ-NOTIFY-103. *Revision 5 cites without changing:* REQ-ORCH-055..059
(the parent waits and is resumed with its children's reports, as before), REQ-ORCH-096 (still the stuck report for every turn but
the four above), REQ-ORCH-102 (the counter, which the withdrawal does not move), REQ-ORCH-105 (a report is no user instruction,
so the consecutive series is not reset) and REQ-ORCH-106 (the escalation, unchanged for a parent that is truly stuck).

*Raised by the owner, 2026-10-06, ruling OQ-199 as recommended; logged as [R-071](../requests.md#r-071). Revision 3 ruled under
the owner's delegation, 2026-10-13; logged under [R-072](../requests.md#r-072), the ruling of
[OQ-282](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-282) (the consortium's E1). Revision 4 ruled under the owner's delegation
and written, both 2026-10-14; logged under [R-072](../requests.md#r-072), the rulings of
[OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283) and [OQ-284](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-284). Revision 5 ruled
under the owner's delegation and written, both 2026-10-14; logged under [R-072](../requests.md#r-072), the ruling of
[OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296). Revisions 4 and 5 read "ruled … 2026-10-13, and written 2026-10-14" — a ruling date a day before
their questions were raised — until fin46 (`fin46-accept1-12`) corrected them on 2026-10-14 from the consortium's ruling
record, which dates both sittings 2026-10-14 (by 04:58 and by 10:14 UTC).*

*Renumbered before landing: built as `PD-ORCH-006` on its branch, it took the next free number, `PD-ORCH-009`, when
`PD-ORCH-006` to `PD-ORCH-008` (OQ-202, OQ-119, OQ-116) landed on `main` first; its citations followed.*

> **First execution, 2026-10-06, built on branch `fin20-continue-and-continuation`:** the directive was built as written,
> through the follow-up REQ-ORCH-078's correction already used (`IterationChildren.runWithChildren`'s `followUp`, asked where
> the root would otherwise be left idle, so a delegation the re-prompt leads to is waited for as any turn's is). The text
> met the code in three places. **(1) "Neither text nor a tool call"** is read off the turn's report: a turn ends only on a
> step with no tool call, so a turn that returned `succeeded` with empty text is the case. **(2) The same terms as the
> correction** (`correctionDue`): only an execution iteration's root, only a `succeeded` turn, never once the run is
> stopping, pausing or coming to rest — a rest that cut the turn is not an unanswered question. The re-prompt is asked
> before any plan correction, once per execution of the root, so a resumed root may be asked again in its new execution.
> **(3) Telling the person** is a `system` row, "The run ended without an answer: <role> ended its turn without writing one,
> even when asked once more.", and an `incomplete_execution` warning issue — the vocabulary's kind for an ending that did
> not do what was asked (REQ-ORCH-095's), so no issue kind is coined. The run then completes as before. With no delegation
> port the root's turn now always runs the follow-up loop, which before ran only with validation retries configured.
> **Corrected before landing (the verifier's review of the first form).** The first form wrote that row as soon as the
> root's turn returned, so a silent iteration the run went on from (a queued prompt's, or its own task re-queued) was
> reported as the run's end while the run carried on: the directive's own "the run completes as REQ-ORCH-069 says" was
> true only of the run's last iteration. It now says what is true where it is known (`Run.tellUnanswered`): "The run ended
> without an answer: …" at the teardown of a run that ends, and "Iteration <n> ended without an answer: …" before the run
> takes up another iteration, parks at the plan gate or pauses at the message limit, or at the teardown of a run that only
> paused or was cancelled (REQ-MONITOR-301's `interrupted`); the issue's metadata says which (`run_ended`). The same review
> found that a root which answered when asked, and whose later plan correction (REQ-ORCH-078) ended without text, was
> reported as answerless: only the turn the re-prompt itself led to is now read.
> **What was measured.** `packages/engine/src/run/answerless.test.ts`, three cases: a root that read and then wrote nothing
> is asked once in its own conversation and its answer is the run's; one that stays silent is asked once, never twice,
> and the person is told; one that answers is not asked (the first two red on the code before). Two more since the
> correction, both red on the first form: a run whose first iteration is silent and whose queued prompt's iteration
> answers says only that iteration 1 ended without an answer; one whose both iterations are silent says so of iteration
> 1 and then that the run ended without one. `packages/engine/src/run/coordinator-plan.test.ts` pins the root that answers
> when asked and is then silent after a plan correction: nothing is said (red on the first form). `slice-proof`'s answerless
> path now requires the row (`toldNoAnswer`, `apps/desktop/scripts/lib/live-answers.mjs`, with its case). In the built
> app, `pnpm part-h-proof`, `pnpm part-j-proof` and `pnpm plan-gate-proof` passed: no scripted root there ends silent, so
> they show the re-prompt asks nothing of a root that answers. **What was not measured.** No built-app or live run met a
> silent root: `slice-proof`'s question against the live endpoint is where one was seen, and it is the orchestrator's to
> run. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-07 (fin31):** built with [`PD-ORCH-015`](pd-orch-015.md#pd-orch-015), whose first execution
> records it: the re-prompt now fires only while the execution's answer is empty. Pinned by the case "at the default
> configuration a root that answers with an item pending is corrected once, records it, and the iteration closes succeeded
> with no re-prompt" in `packages/engine/src/run/coordinator-plan.test.ts` (red on `a68f121`, where no correction was sent);
> `answerless.test.ts`'s five cases and the case "PD-ORCH-009 beside REQ-ORCH-078" stay green. Found nothing against the
> text.

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Revision 2's re-prompt was owed nowhere: 0 requests carry it, and every root's last request ended with text.
> Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> *fin42, the same day:* a default run cannot be relied on to produce a silent root, so the live measure stays owed; fin42
> adds the opt-in `empty-answer` scenario, in which the recording proxy gives the coordinating root an empty completion.

> **The silent root in the built app, and the live scenario written, 2026-10-13 (fin42, the survey's N56).** The scripted client
> gains a `silent` step (a call that ends `stop` with neither text nor a tool call; `scripted-client.test.ts`), and `pnpm
> part-h-proof` two launches: `answerless` (`silent,silent`) — the root asked once, logged once and once in its conversation,
> then "The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more." and one
> warning `incomplete_execution` issue with `reprompted` and `run_ended`, the session `completed`; `answer-when-asked`
> (`silent,report`) — asked once, its answer in the transcript, and neither row nor issue. **Found nothing against the text**, of
> revision 1 or 2: the first built-app run to meet a silent root. The live half is written, not run: the recording proxy's new
> `empty` rule (`lib/model-traffic.mjs`, pinned by `model-traffic.test.ts`, including that the product's own model client reads
> its answer as a `stop` with no text and no tool call) answers the coordinating root's completions — the requests whose
> instructions open "You are the orchestrator.", the classifier's excluded — with an empty completion, and the opt-in
> `empty-answer` scenario should show, with both of the root's calls emptied, exactly one re-prompt sent and logged, the row and
> the issue; with the first only (`empty-once`), one re-prompt, the model's own answer, and neither. The run is the
> orchestrator's. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-14 (fin43, `fin43-live-findings`):** built as ruled. `LoopSupervisor.withdrawStuck()`
> (`packages/engine/src/run/supervisor.ts`) clears a pending trigger only when it is `stuck` and leaves the consecutive-activation
> count alone; `Run.turn`'s `correction()` calls it on the root's supervisor immediately before it returns `ANSWER_REPROMPT`.
> **What was measured.** `supervisor.test.ts`'s three `withdrawStuck` cases (a stuck trigger withdrawn and the next `check()`
> continuing with no classifier call; a raw-count trigger kept; the count unchanged) and `answerless.test.ts`'s two revision-3
> cases with a supervisor and a scripted classifier (silent then an answer; silent then silent, the person told once): the
> re-prompt request ends with `ANSWER_REPROMPT`, the classifier is not called and no `loop_supervisor_activation` is written —
> all five red on `29dbc4e`. `children.test.ts` pins the edge: a delegated child's empty turn still arms stuck and its
> REQ-ORCH-095 re-prompt request carries the corrective (REQ-ORCH-096 unchanged; raised as OQ-283). In the built app, `pnpm
> part-h-proof`'s `answerless` and `answer-when-asked` launches, with `circuit_breaker.enabled: true`, show 0 loop
> classifications and 0 stuck activations beside the row, the issue and the answer as before (load about 1.5 on 4 CPUs); on a
> build without the `withdrawStuck` call the same proof failed at `answerless` with one stuck activation ("Pause and reassess
> the current path. …", `activation_count` 1). **Found beside it, not decided:** a stuck trigger a root's last empty turn leaves
> pending is taken by its next turn after a plan correction (OQ-284; two `coordinator-plan.test.ts` cases); the next iteration's
> root is a fresh supervisor and does not take it. **What was not measured:** the live `empty-answer` and `empty-once` scenarios,
> which now also check that no stuck classification was asked and no stuck activation written; the run is the orchestrator's.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-14 (fin44, `fin44-supervision-and-match`):** built as ruled. `withdrawStuck()` gains
> two callers: `IterationChildren.execute` (`packages/engine/src/children/orchestration.ts`) immediately before a delegated
> child's REQ-ORCH-095 re-prompt, and `Run.turn`'s `correction()` (`packages/engine/src/run/run.ts`) immediately before it
> returns a plan correction, where it also calls `noteUserInstruction()` — REQ-ORCH-105's todo-correction message, which the
> build had never told the supervisor of. **What was measured.** `children.test.ts`, "PD-ORCH-009 revision 4 (OQ-283)": silent
> then an answer, and silent twice (the child `failed` with `no_activity`, no activation, no escalation), both red on `a3be56c`;
> `coordinator-plan.test.ts`, "PD-ORCH-009 revision 4 (OQ-284)": the two cases that pinned OQ-284 flipped (the correction last,
> no classification, no activation) and the REQ-ORCH-105 reset (activations counted 1, 2, then 1, no escalation), all three
> red on `a3be56c`, and a guard that a raw-count trigger the answered turn armed is kept, green before and after. In the built
> app, `pnpm part-h-proof` (load 3.0 to 3.5 on 4 CPUs) with two new launches, both with `circuit_breaker.enabled: true`:
> `silent-correction` (`planopen,silent,silent,plandone,report`) — the correction sent once and followed by the root's own step,
> 0 stuck activations, 0 loop classifications, one `succeeded` iteration; `silent-child` — the child's re-prompt sent once and
> followed by its own step, 0 and 0, the child `succeeded`. **Found beside it:** the route revision 4 leaves out, a root silent
> while its background child runs, takes the stuck corrective after the child's report (pinned as found in `children.test.ts`;
> [OQ-296](../../archive/architecture/open-questions/60-spikes-and-later-questions-27.md#oq-296)). **What was not measured:** a build without the calls through the new
> launches (the unit cases are the red evidence), and any live run — the `empty-answer` scenario with the plan open and a
> delegation scenario meeting a silent child are the orchestrator's. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 5, 2026-10-14 (fin45, `fin45-supervision-and-quit`):** built as ruled. `withdrawStuck()` gains a
> fourth caller: `IterationChildren.runWithChildren` (`packages/engine/src/children/orchestration.ts`), unconditionally, in the
> branch where a child of the parent is pending or unobserved, before the wait — keyed by the agent the loop runs (the root's id
> `Run` passes in, or a delegated child's task id), so one placement covers the root, a delegated child acting as parent, the
> REQ-MONITOR-135 steering-wake step and a child already ended unobserved. `noteUserInstruction()` is not called. **What was
> measured.** `children.test.ts`, "PD-ORCH-009 revisions 4 and 5": the as-found case flipped (the report ends the resumed request,
> no classification, no activation); a root that delegates and waits silently across three batches completes with no
> `circuit_breaker_escalation`; a delegated child silent while its own background child runs takes no stuck activation; and a
> root silent again after its last report, nothing pending, is still sent `ANSWER_REPROMPT` as the last message of its request
> with no activation — all four red on `ee586d3`; a guard that a raw-count trigger the silent turn armed (message threshold 2) is
> kept and taken after the report, green before and after. In the built app, `pnpm part-h-proof`'s new `silent-wait` launch
> (`plan:3`, then three times a background delegation and a silent root turn, then `done` and the answer; `circuit_breaker.enabled:
> true`): 3 reports, each the last message before the root's next step, 0 stuck activations, 0 escalations, 0 loop
> classifications, the session `completed` / `tasks_complete` (load 0.8 to 3.0 on 4 CPUs). On a build without the call the same
> launch failed: three stuck activations, the third an escalation, "Pause and reassess delegate around …" after each of the first
> two reports, and the session `failed` / `agent_session_aborted`. **Found beside it, not against the text:** the stuck
> classification is not what the launch's classification count discriminates — on the red build it was also 0, because the
> activation budget (REQ-NOTIFY-106, 2 s from when the trigger was armed) is spent while the root waits on its child, so the
> deterministic corrective is sent without a classifier call; the stuck-activation count is the discriminating check. **What was
> not measured:** a live run, the orchestrator's. Written for it: the opt-in `empty-answer` group's third launch, `empty-wait`,
> in which the recording proxy's `empty` rule (since fin45 its `when` and `unless` may be lists; `model-traffic.test.ts`) empties
> the root's request right after an admitted background delegation; it should show the child's report as the final message of
> the request that resumes the root, nothing behind it, no `Trigger: stuck` classification, no root stuck activation and no
> `agent_session_aborted` (`waitReading`, `lib/plan-open-reading.mjs`, pinned by `plan-open-reading.test.ts`). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
