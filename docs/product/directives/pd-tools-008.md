[Product directives](../directives.md) › PD-TOOLS-008

<a id="pd-tools-008"></a>

### PD-TOOLS-008 — a todo list that itself marks two tasks in progress is refused without naming an active task

*Revision 4 (2026-10-15, [R-072](../requests.md#r-072)) — **a task a delegation has served is outside the single-active count, before
and after its child ends**, a section added after revision 3's; the ruling of [OQ-333](../../archive/architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333)
under the owner's delegation. It replaces revision 2's "A task a running delegation holds is never counted against such a write",
quoted below, and keeps revision 2's falsified cost line beside its replacement. Revision 3's close rules, protections and four
kept-reasons are unchanged; the Narrows line is unchanged.*

*Revision 3 (2026-10-13, [R-072](../requests.md#r-072)) — **a `replace` closes a delegated item once its child has ended, and
names every task it restores**, a section added after revision 2's; the ruling of
[OQ-255](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-255) under the owner's delegation. It replaces revision 2's "REQ-TOOLS-146's
protection is otherwise unchanged", quoted below; the Narrows line is unchanged.*

*Revision 2 (2026-10-07, [R-072](../requests.md#r-072)) — **a task a running delegation holds is outside the single-active
count**, a section added after revision 1's text; the ruling of [OQ-249](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-249) under the owner's
delegation. It replaces revision 1's "at most one task is `IN_PROGRESS`", quoted below, and adds REQ-TOOLS-146 to the Narrows
line.*

When a `todo` `replace` is rejected under REQ-TOOLS-145's single-active rule because **the submitted list itself** marks
more than one task `IN_PROGRESS` while no task is active, the violation message SHALL NOT be REQ-TOOLS-145's sentence,
which names an "Active task" that does not exist in that case. It SHALL be:

`Only one task can be IN_PROGRESS at a time. The submitted list marks <n> tasks IN_PROGRESS ('<name>', '<name>', …), so the
replace was rejected and nothing was saved. Send it again with at most one task IN_PROGRESS.`

naming each task the list marked `IN_PROGRESS` by the name it was sent with, in the list's order, and no task id. The list
is still rejected whole and nothing of it is stored.

Everything else REQ-TOOLS-145 fixes still governs, as revisions 2 and 4 bound it below: every other violation — an `add_task` or
`update` that would make a second unserved task active, and REQ-TOOLS-146's `replace` that marks another task while an unserved
protected active task exists — still answers in REQ-TOOLS-145's own sentence, naming the stored active task. *(Until 2026-10-15
this read "as revision 2 bounds it below", "a second unheld task" and "an unheld protected active task"; revision 4 counts the
unserved ones.)*

**A task a running delegation holds is outside the count (revision 2).** An `IN_PROGRESS` task is **held** while a
non-terminal child of the list's owner records it as its `todo_item` (`PD-TOOLS-006` revision 6); non-terminal is that
revision's set, queued to paused. REQ-TOOLS-145's bound and REQ-TOOLS-146's protection count only the tasks no such child
holds:
- **The bound.** At most one `IN_PROGRESS` task may be unserved (revision 4; "may be unheld" until then), and the bound is checked only on a write that marks a task
  `IN_PROGRESS`: an `add_task` or `update` that marks one, or a `replace` whose incoming list marks `IN_PROGRESS` a task that
  is not already a protected `IN_PROGRESS` task. A task a child of the list's owner serves, running or ended, is never counted
  against such a write (revision 4 below).
- **What is never refused.** A write that marks no task `IN_PROGRESS` is never refused under the rule, however many
  `IN_PROGRESS` tasks the list keeps; a protected task a `replace` restores never counts against that `replace`.
- **REQ-TOOLS-145's sentence** names the first unserved `IN_PROGRESS` task (revision 4; unheld until then).
- **This directive's sentence** counts the unserved tasks the submitted list marks (revision 4; unheld until then). For a caller whose resolved tool set holds
  `delegate`, it adds: `Leave the items you will delegate PENDING: a delegate call that names one in todo_item marks it
  IN_PROGRESS.`
- **REQ-TOOLS-146's protection** is otherwise as revision 3 below states it.

> Revision 2 said, and no longer governs since revision 4: "A task a running delegation holds is never counted against such a
> write.", "**REQ-TOOLS-145's sentence** names the first unheld `IN_PROGRESS` task." and "**This directive's sentence** counts the
> unheld tasks the submitted list marks."

> Revision 2 said, and no longer governs since revision 3: "**REQ-TOOLS-146's protection** is otherwise unchanged: a protected
> task is restored by id with its state intact."

**A `replace` closes a delegated item once its child has ended, and names every task it restores (revision 3).** A task is
**served** when a child of the list's owner, terminal or not, records it as its `todo_item` (`PD-TOOLS-006` revision 6).
- **Served and ended.** A served IN_PROGRESS task that no non-terminal child holds takes the state a `replace` sends for its id
  when that state is COMPLETED or ABANDONED.
- **The count.** Such a task, closed by the `replace`, is not the active task against which REQ-TOOLS-146 rejects a list that
  marks another task IN_PROGRESS: the bound is evaluated on the tasks the resulting list leaves unheld and active.
- **Protections that stay.** COMPLETED and ABANDONED tasks are restored. A held task is restored over any state. A
  served-and-ended or own IN_PROGRESS task is restored when the list sends it PENDING. The agent's own unserved IN_PROGRESS task
  is restored over any state. An omitted protected task is kept in place.
- **The observation.** When a `replace` restores a task whose incoming state differed from the one kept, the success
  observation names each such task by name and id, with the state kept and one of these reasons: `a running delegated agent
  holds it`, `finished work is never reopened`, `your active task is closed with update`, `an active task is never set back to
  PENDING`. It then ends `Change a task's state with update.` This comes before the `Todo state:` summary; REQ-TOOLS-147's
  summary is unchanged. A task sent with no state, and an omitted task, differ from nothing and are not named.

**A task a delegation has served is outside the count, before and after its child ends (revision 4).** REQ-TOOLS-145's bound,
REQ-TOOLS-145's sentence, this directive's sentence and REQ-TOOLS-146's rejection SHALL count only the `IN_PROGRESS` tasks that
are not **served**, served as revision 3 defines it: a child of the list's owner, terminal or not, records the task as its
`todo_item`. Every held task is served, so held is a subset and revision 2's exemption is kept whole.
- **What it means for a delegated item.** An item the run marked IN_PROGRESS when its delegation was admitted (`PD-TOOLS-006`
  revision 7) never refuses the owner's next write that marks a task, while its child runs or after it has ended.
- **What it does not do.** The run never closes such an item: the owner closes it, with `update` or with revision 3's closing
  `replace`, and `PD-TOOLS-006` revision 11 tells the owner, in the message that resumes its wait, which reported child's item is
  still IN_PROGRESS.
- **What stays.** Revision 3's close rules, its protections and its four kept-reasons are unchanged; held still decides which
  served task a `replace` may close and when the reason is `a running delegated agent holds it`. With no served set, the tool
  behaves as before this revision.

> Revision 1 said, and no longer governs: "Everything else REQ-TOOLS-145 fixes still governs: at most one task is
> `IN_PROGRESS`, enforced when marking a task and on wholesale state changes".

**Why, and what it costs.** In the default live run of 2026-10-01 the orchestrator's first call was such a `replace`, and
REQ-TOOLS-145's sentence named "Active task: 3c55ec35 (Create friction-probe.txt)", an id the rejected list had minted and
never stored. The orchestrator did as the message said, `update 3c55ec35 COMPLETED`, was told the id was unknown, and spent
a turn working out that its list was empty; the run of 2026-10-03 repeated it with two failed calls. What is given up: the
message is no longer the one sentence REQ-TOOLS-145 fixes for every violation, so a caller matching that sentence meets a
second one in this case.

**Why revision 2, and what it costs.** A coordinator running two delegated children at once could record only one of their
items as in progress. In the default live run at `a68f121` (session `52aea43a`, edit) `#14`'s mark of the running tests
child's item was refused in REQ-TOOLS-145's sentence, which advised marking the running implementer's item COMPLETED or
ABANDONED, and the plan recorded the item `PENDING` while its child ran; the duress runs at `c2fdd6a` (`#305`) and `a68f121`
(session `e6747bd0`, `#20`, `#42`, `#113`, `#246`, `#404`) kept parallel items `PENDING` for most of the run, and REQ-TOOLS-147
makes that plan the run's primary progress display. OQ-163's case, which revision 1 ruled, had no delegation. What it costs:
- several active rows while children run;
- a stale active row between a child's end and the coordinator closing its item, which then counts against the next write that
  marks a task — *falsified 2026-10-15 and replaced by revision 4 ([OQ-333](../../archive/architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333)): the
  stale row still stands until the coordinator closes it, but it counts against no write, and the resume line of `PD-TOOLS-006`
  revision 11 names it;*
- the `todo` tool now depends on the run's child records, read through a port at each call.

**Why revision 3, and what it costs.** Revision 7 of `PD-TOOLS-006` sets a delegated item IN_PROGRESS without the coordinator
writing it, and once the child has ended the item fails every part of REQ-TOOLS-146's stated reason: the agent is not working on
it, nobody holds it, and closing it adds no second active task. As built it was restored over a closing `replace` that still
answered success. Revision 7's first execution met this on the scripted coordinator ("`replace` cannot complete an active
item"), and on a live run the open plan sends PD-ORCH-015's correction, whose text names only "the todo tool", and then
REQ-ORCH-075's re-queue of a met request. What it costs:
- a second read through the run, the items served by any child of the owner, terminal children included;
- four classes of protected task (finished, held, the agent's own active task, served-and-ended sent PENDING);
- a longer observation on a `replace` that restores something;
- the agent's own IN_PROGRESS task is still closed only by `update`, one step the observation now names.

**Why revision 4, and what it costs.** In the default live run at `3c03287` (session `3e4b7210`, delegation-swarm, finding F9) the
coordinator's `update verify101 IN_PROGRESS` (`#26`) was refused naming impl101, an item the run had marked at its delegation
(`#7`) and whose child had ended about 2.5 s before; the coordinator then closed its three delegated items one by one (`#27` to
`#29`), four calls and about 7 s, before delegating the verifier. The same refusal stood in the two default packs before it
(requirements `#50`, crlf `#22`), against OQ-249's target of 0, and it was revision 2's accepted cost. An item a child served is
that child's work, not the coordinator's own active task, whether or not the child still runs. What it costs:
- a stale active row the Agent plan strip can show from a child's end until the coordinator closes its item;
- one more narrowing of REQ-TOOLS-145, whose one-active rule now counts only the owner's unserved tasks;
- fin38's limit (revision 3's first execution) now reaches the count too: the served set is the current iteration's ledger, so
  after a REQ-ORCH-075 re-queue or a resume an earlier iteration's served item still counts against the next mark.

> **Narrows:** REQ-TOOLS-145, REQ-TOOLS-146

*Raised by the owner, 2026-10-06, ruling OQ-163 as recommended; logged as [R-071](../requests.md#r-071). Revision 2 ruled under the
owner's delegation, [R-072](../requests.md#r-072), from OQ-249 (the consortium's question P3, the final live runs' findings P3 and
D7). Revision 3 ruled under the same delegation from [OQ-255](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-255) (the consortium's
question RC1, from revision 7's first execution). Revision 4 ruled under the same delegation from
[OQ-333](../../archive/architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333) (finding F9 of fin46's final acceptance, the default live run at `3c03287`).*

> **First execution, 2026-10-06, built under [R-071](../requests.md#r-071) (fin21):** the rule held as written. The case it
> names is exactly the second of `todo`'s two `replace` checks (`packages/agent-tools/src/tools/todo.ts`): the first
> answers REQ-TOOLS-146's case whenever a protected active task exists and the list marks another, so the second meets
> only a list whose own tasks are the two. **What was measured.** One case in `tools.test.ts`, red on the code before the
> build: the live run's list refused in the new sentence with nothing stored and no id named, REQ-TOOLS-146's case still
> answered in REQ-TOOLS-145's sentence, and the list accepted when re-sent with one task in progress. **What was not
> measured.** No live run has met the case since; `pnpm live-run`'s `frictions` and `duress` scenarios now check that no
> `todo` call was sent to an id a refusal named and never stored (`lib/tool-frictions.mjs`). *fin23, 2026-10-06:* since
> `760394c` that check runs no longer in those two scenarios but once, at the run's end, over every session the run keeps
> (`checkToolRecord` in `apps/desktop/scripts/live-run.mjs`, over `runWideReadings`), naming each finding by its session
> and ordinal:
> [`the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`](../../defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md).
> The note is repaired:
> [`a-rejected-todo-replace-names-an-active-task-it-never-stored.md`](../../defects/fixed/a-rejected-todo-replace-names-an-active-task-it-never-stored.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First live execution, 2026-10-07 (the final default live run at `a68f121`, pack `2026-10-07T06-48-50-123Z`):** the case
> met a real model for the first time, in the edit session: its coordinator's `todo replace` (`#5`) marked both parallel
> children's items `IN_PROGRESS` and was refused in this directive's sentence ("…marks 2 tasks IN_PROGRESS ('Add
> clearCompleted to src/todos.js', 'Add tests for clearCompleted'), so the replace was rejected and nothing was saved"),
> naming no id. The wording held: the next accepted write (`#10`) re-listed the plan with one task in progress, and no later
> call in the pack targeted an id a refusal never stored (`checkToolRecord`'s run-wide reading, PASS). **Found**, as the
> pack's finding P3 and not against this directive's text: REQ-TOOLS-145's single `IN_PROGRESS` itself, which this directive
> narrows only in its message, cannot record two parallel delegations as both in progress, so the plan recorded the running
> tests child's item `PENDING` (`#14`, refused again). The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-13, ruled under [R-072](../requests.md#r-072) ([OQ-249](../../archive/architecture/open-questions/53-spikes-and-later-questions-20.md#oq-249)),
> built by fin33 (`fin33-delegation-targets-and-plan`):** built as written, and the text met the code in two places.
>
> - **The held set is read at each call, through the run.** `todoTool` takes `TodoToolOptions.held`
>   (`packages/agent-tools/src/tools/todo.ts`), which the run host fills from `ToolPortContext.heldTodoItems`, and both
>   `toolsFor` closures in `packages/engine/src/sessions.ts` answer it from `IterationChildren.heldTodoItems`: the `todo_item`
>   of every non-terminal child the caller owns, of any persona, every root's children one plan as `owns` reads them. A
>   read-only child naming an item holds it here, where revision 6's held-item refusal counts implementation children only:
>   the bound is about the plan's owner, not the child's tools.
> - **The hint needs the caller's resolved set, known only after the port's one resolution.** `delegates` is read lazily, so
>   the sentence carries the hint exactly when the agent's callable set holds `delegate`.
>
> With no held set the tool behaves exactly as before (the pre-revision cases in `tools.test.ts` pass unchanged). The
> falsified single-active reason is kept beside its replacement in the tool's description comment.
>
> **What was measured.** Five cases in `packages/agent-tools/src/tools/tools.test.ts` ("a task a running delegation holds"),
> each red on the code before the build: two held tasks marked beside the agent's own; a second unheld mark refused in
> REQ-TOOLS-145's sentence naming the unheld task; a `replace` that marks nothing accepted while ended holders' items stay
> IN_PROGRESS, and a fourth mark then refused naming the first unheld one; this directive's sentence counting unheld tasks only,
> with the hint for a `delegate` holder alone; the description. `apps/desktop/src/run-host/tools.test.ts` drives the port with
> two parallel delegations and the coordinator's own mark beside them. **What was not measured.** No live run: the next default
> run's edit session should show no refused `update` like `#14` and both parallel items active, and the harness's
> `heldItemReading` (`apps/desktop/scripts/lib/coordinator-todo.mjs`) counts items read PENDING while held and single-active
> refusals (target 0). The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 3, 2026-10-13, ruled under [R-072](../requests.md#r-072) ([OQ-255](../../archive/architecture/open-questions/54-spikes-and-later-questions-21.md#oq-255)),
> built by fin37 (`fin37-replace-closes-delegated`):** built as written, and the text met the code in three places.
>
> - **The served set is a second read through the run, beside the held one.** `todoTool` takes `TodoToolOptions.served`
>   (`packages/agent-tools/src/tools/todo.ts`), which the run host fills from `ToolPortContext.servedTodoItems`; both `toolsFor`
>   closures in `packages/engine/src/sessions.ts` answer it from `IterationChildren.servedTodoItems`, the same children
>   `heldTodoItems` reads without its non-terminal filter. With no served set the tool restores every IN_PROGRESS task as before.
> - **A close is decided before the REQ-TOOLS-146 rejection, not after it.** The tasks the list closes (`closes`) are left out
>   of the protected active task, so a list that closes an ended item and marks another is accepted, which the ruling added to
>   B's text; the resulting-list count needed nothing, since a closed task is no longer IN_PROGRESS.
> - **"Incoming state differed" needs a reading for a task sent with no state.** The schema lets a task carry no `state`; such a
>   task, like an omitted one, differs from nothing and is not named. The four reasons are chosen in this order: finished work,
>   a running holder, an active task sent PENDING, the agent's own active task sent closed (`keptReason`).
>
> **What was measured.** Eight cases in `packages/agent-tools/src/tools/tools.test.ts` ("a replace after a delegated child has
> ended"), seven red on the code before (the eighth, nothing named when nothing differed, held of both): the ended holders'
> items closed COMPLETED and ABANDONED; a whole-list close keeping and naming the agent's own active task; a held item kept and
> named, then closed once its child ended; a served-and-ended item and a finished task sent PENDING, named in list order; a close
> and a mark in one list accepted while the agent's own active task still bars one; no served set; the description.
> `apps/desktop/src/run-host/tools.test.ts` drives the port with two parallel delegations: a close while one child runs keeps and
> names its item, and once both ended one whole-list COMPLETED `replace` stores the plan closed (red before).
> `children/children.test.ts` pins the served set through the `toolsFor` closures, the ended children's items included (red
> before). In the built app, `pnpm mission-proof` item 1e (2026-10-13, load 2.2 at the start and 3.9 at the end on 4 CPUs): the
> scripted coordinator waits for alpha and delta to end and closes with one `replace` sending both items COMPLETED
> (`donereplace`); both `todo` calls were `ok`, the close answered "Replaced the todo list: 1 phase, 2 tasks." with nothing kept,
> the stored plan ends COMPLETED, and the run completed in one iteration with no PD-ORCH-015 correction logged. **What was not
> measured.** No live run: the next default run's edit session, when its coordinator closes with a `replace` after its children
> ended, should store the delegated items COMPLETED with no correction and no "items not done" `system` row; a `replace` sending
> COMPLETED for a held item or the coordinator's own active item should name it and be followed by an `update`. The harness's
> `heldItemReading` counts `restoredOverClose` (target 0) and `namedRestores` (a NOTE). The note is repaired:
> [`a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md`](../../defects/fixed/a-todo-replace-cannot-close-a-delegated-item-and-hides-the-restore.md).
> **A known limit, written down by fin38 (fin37's review):** the served set has the held set's scope, this iteration's ledger
> (`IterationChildren.servedTodoItems` reads `ChildLedger.all()`, the children of the current iteration). After a REQ-ORCH-075
> re-queue or in a resumed session, an item an earlier iteration's child served is not served, so a `replace` sending it
> COMPLETED restores it IN_PROGRESS and names it as the agent's own active task, to be closed with `update`. That is the
> revision-2 behaviour, safe and named, not the close revision 3 allows; no live run has met it.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**.
>
> - **Revision 2: PASS in all three packs.** Parallel delegations left their items IN_PROGRESS together with no single-active
>   refusal (at `552d346` edit `#8` and resume `#3`, two each, and three in the duress run after `#17`; at `0bc3eee` edit,
>   resume and requirements, two each), and the harness counted 0 `replace` calls refused for marking more than one task in
>   progress. `a68f121`'s P3 (2 refused `todo` calls and a refused `delegate`, about 19.5 s) did not recur.
> - **The restore revision 3 repairs was latent at `552d346`:** 6 `replace` calls across both packs, each the opening write of
>   a plan, every close an `update`; 0 restored COMPLETED items, 0 s.
> - **Revision 3: NOT REACHED at `0bc3eee`.** Its 5 `replace` calls were again opening writes and every close an `update`;
>   `restoredOverClose` read 0 and `namedRestores` named none, neither discriminating. The next default run whose coordinator
>   closes with a `replace` after its children end is still the measure.
> - *Since fin41 (item N65) the default run asks for it:* the `edit` scenario's prompt tells its coordinator to close the plan with
>   ONE `replace` sending both tasks COMPLETED once both children have reported, `heldItemReading` counts the closes asked
>   (`closes`), and a run with none prints a NOTE that revision 3 was unasked instead of the PASS `0bc3eee` printed over nothing
>   ([`the-live-runs-closing-replace-check-passes-with-no-closing-replace.md`](../../defects/fixed/the-live-runs-closing-replace-check-passes-with-no-closing-replace.md)).
>
> Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 4, 2026-10-15, ruled under [R-072](../requests.md#r-072) ([OQ-333](../../archive/architecture/open-questions/62-spikes-and-later-questions-29.md#oq-333)),
> built by fin47 (`fin47-classifier-and-todo`):** built as written, and the text met the code in two places.
>
> - **One exempt set, held inside served.** `todoTool` computes `exemptNow`, the union of the served and held reads
>   (`packages/agent-tools/src/tools/todo.ts`), and every single-active read takes it: `TodoList.active`, `add_task`'s and
>   `update`'s checks, and in `replace` `newlyMarked`, `activeProtected` and `actives`. The union keeps a caller that passes `held`
>   alone exactly where revision 2 left it, so "with no served set the tool behaves as before" needs no branch. `closes` and
>   `keptReason` still read the held set alone, as revision 3 states.
> - **The limit reaches the count.** The served set is the iteration's ledger (`IterationChildren.servedTodoItems`), so an earlier
>   iteration's served item counts again after a REQ-ORCH-075 re-queue or a resume; a case pins it rather than leaving it to a
>   reader.
>
> **What was measured.** `packages/agent-tools/src/tools/tools.test.ts` ("a task a delegation has served", four cases): the
> coordinator's `update` and `add_task` beside three served-and-ended items, a second unserved mark still refused naming the
> unserved task, and a `replace` marking the next task with a served-and-ended item kept IN_PROGRESS, each red on the code before;
> the fourth pins the limit and holds on both. The description's case changed with its sentence (red before).
> `apps/desktop/src/run-host/tools.test.ts` replays the swarm shape through the port — three delegations naming `impl101`,
> `test101` and `doc101` marked, all three ended, then `update verify101 IN_PROGRESS` answers `ok` (red before: "Active task:
> impl101"). In the built app, `pnpm mission-proof` (2026-10-15, every item, exit 0, load 1.8 to 2.7 on 4 CPUs) still passes item 1e:
> the scripted coordinator's two `todo` calls answer `ok`, its closing `replace` stores both items COMPLETED and names nothing kept.
> No proof drives the resume line: item 1e closes its items before the run resumes it. **What was not measured.** No live run: the
> next default run's coordinating sessions (delegation-swarm, requirements, crlf) should count 0 `todo` calls refused under
> REQ-TOOLS-145 or this directive and record no `tool_error` issue from that cause.
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
