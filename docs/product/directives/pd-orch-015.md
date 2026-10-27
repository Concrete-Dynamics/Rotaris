[Product directives](../directives.md) › PD-ORCH-015

<a id="pd-orch-015"></a>

### PD-ORCH-015 — a root that answers with its plan open is corrected in its own conversation; a held answer is carried to the next root and announced

When the coordinating root of an execution iteration answers `succeeded` while items of its own plan that its task answers
for are still open (REQ-ORCH-029, REQ-ORCH-075 under `PD-ORCH-012`), the run SHALL send it a plan correction in its own
conversation before its task is re-queued, up to **the larger of 1 and the validation-retry setting**
(`runtime.auto_retries_validation`) times, so a setting of 0 no longer means no correction. Where an earlier turn of the
same execution wrote an answer, the correction SHALL say that the answer has been shown to the person, and in every case it
SHALL ask the root to record each item's true state with the todo tool, `COMPLETED` where the work is done and `ABANDONED`
where it will not be done, without redoing done work or repeating its answer. The validation-retry setting itself, and what
it counts for validation-class model failures (REQ-ORCH-092, REQ-CONFIG-120, REQ-NOTIFY-100), are unchanged.

Where the corrections are spent and the task is still re-queued (REQ-ORCH-075) or given up on (REQ-ORCH-077) for an open
plan, the run SHALL write one `system` row in the transcript saying that the coordinator answered with items of its plan not
done, naming them, and that the task was not marked complete and returned to the queue, or given up on at the retry limit.
A re-queued task's continuation payload SHALL carry, beside the marker block, the answer the held iteration wrote (the
longest answer of its root's execution), cut to 6,000 characters and labelled as the previous iteration's answer the person
was shown; only the same task's next fresh root receives it, it is kept with the task until then, and it is dropped when
the task completes or is given up on. The run SHALL never mark a plan item itself.

**Why, and what it costs.** OQ-225, from finding P1 of the final default live run at `a68f121`: a coordinator answered its
request in full while its plan's "report" item still read `PENDING`. With REQ-ORCH-078's default of 0 the hold sent the item
past the one agent that held the evidence to a fresh root that REQ-ORCH-072, REQ-ORCH-075 and REQ-TOOLS-155 keep blind;
it redid the whole task, told the person the report was never delivered, and could have ended a met request `failed` at
REQ-ORCH-077's limit. The correction was already built and pinned for a positive setting; a floor of one at the correction
site is the smallest change that lets a met request close `succeeded`, and keeping it off the shared setting's default
leaves validation retries as they were. What it costs: one more model call, carrying the root's whole conversation, on every
iteration whose root answers with an item open, which REQ-ORCH-029's todo clause under OQ-213 now makes common; a reply that
may restate the whole answer; a weak model that may tick an item it did not do to satisfy the correction (the same exposure
the marker already had); a setting of 0 no longer turns the correction off; and up to 6,000 more characters in a re-queued
root's first message, carrying a wrong answer as it stands.

> **Narrows:** REQ-ORCH-078
> **Extends:** REQ-ORCH-075

*Raised under the owner's delegation, 2026-10-07, ruling OQ-225 (the consortium's ruling P1 of the final default live run);
logged as [R-072](../requests.md#r-072).*

> **First execution, 2026-10-07, built under [R-072](../requests.md#r-072) (fin31):** the directive was built as written, at the
> correction site the G5 repair had already pinned for a positive setting. **(1) The count** is `max(1,
> RunConfig.validationRetries)` in `Run.turn`'s correction closure (`packages/engine/src/run/run.ts`); `ladder.ts` and
> `RUN_CONFIG_DEFAULTS` are untouched, so validation-class model failures still retry 0 times by default. **(2) The answer**
> is the closure's `answer`: the first non-empty text a turn of the execution wrote, replaced only by a longer one, so a
> correction answered "Recorded." (or a `todo` write and no text) keeps the answer the person saw as the iteration's report,
> summary and held answer. The ruling's text said both "the last non-empty text" and "replaces it only when it is longer";
> the build reads the second, which is what its own step 5 tests ("Recorded." keeps the answer). **(3) PD-ORCH-009 revision
> 2** is the re-prompt's condition `answer === ''`. **(4) The fallback**: `Task.heldAnswer` (`todo.ts`), cut to
> `HELD_ANSWER_LIMIT` (6,000), stored beside `planLeftOpen` and deleted wherever it is; `planCarryText(open, heldAnswer)`
> labels it; `planHeldRowText` writes the `system` row for a re-queue and for a give-up. **Found:** nothing against the text.
> **What was measured.** `packages/engine/src/run/coordinator-plan.test.ts`'s block "a root that answers with its plan open is
> corrected in its own conversation; a held answer is carried and announced", eight cases, seven red on `a68f121` (the eighth,
> a setting of 2 sending two corrections, guards the count): the default-configuration case closes `['succeeded']` in four
> model requests with no `ANSWER_REPROMPT` and no `incomplete_execution` issue; a correction answered "Recorded." keeps the
> answer as the summary; a root asked once more and still silent is corrected without "has been shown"; an ignored
> correction gives `partial, succeeded`, one `system` row and a fresh root handed the held answer; the answer survives a later
> run and reaches no other task; it is cut at 6,000; a root that never finishes is corrected once per iteration, given up on,
> and the give-up announced. The existing G5 cases were re-scripted with a root that ignores its correction, and still pin
> the re-queue. `run-pure.test.ts` pins the three texts. In the built app, `pnpm part-h-proof`'s new `plan-correction` launch
> (scripted `planopen,report,plandone`, no `delegation_strategy`) closed one iteration `succeeded`, `completed` /
> `tasks_complete`, with the warning "a correction is sent into its conversation (1 of 1, REQ-ORCH-078, PD-ORCH-015)" in its
> log and no held-answer row; with the floor removed it read `partial`, `succeeded` (load average 12–17 on 4 CPUs, beside
> sibling plans). **What was not measured.** The live terminal scenario: the next default live run (the orchestrator's) should
> show iteration 1 closing `succeeded` after at most one correction step (one `todo` write, about 5–15 s), one "a correction
> is sent" warning, no second iteration, no re-delegation and no `background_output` refusal, and the session ending
> `completed` / `tasks_complete` inside the 420 s wait. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **NOT REACHED** in any
> of the three. Every root closed its own plan before it answered: 0 of 174, 199 and 215 requests carry "of your plan not
> complete" or "previous iteration on this task", and every iteration closed `succeeded` on the first try. At `552d346`
> terminal's coordinator closed both items itself (`#20`, `#21`) before answering, so no correction was owed; at `0bc3eee` it
> ran the shapes itself. Found nothing, because nothing met the case. Evidence:
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> *fin42, the same day:* the terminal outcome the measure above names held at `552d346` — one iteration, `completed` /
> `tasks_complete` inside the wait — by the model's own behaviour, not through the correction, so the live measure stays owed
> and a default run cannot be relied on to owe it; fin42 adds the opt-in `plan-open` scenario, which asks for it.

> **The held answer in the built app, and the live scenario written, 2026-10-13 (fin42, the survey's N56).** `pnpm
> part-h-proof`'s new `plan-held` launch (scripted provider, free) drives the path the `plan-correction` launch above does not:
> a coordinating root that answers with its report item `PENDING` and answers its one correction with text again
> (`planopen,report,report,plandone,report`). The iterations read `partial` then `succeeded`; one correction warning; one `system`
> row, "Iteration 1: the coordinator answered with 1 item of its plan not done: Report the scripted work. The task was not marked
> complete and was returned to the queue."; and iteration 2's fresh root, read from its stored conversation (`agent_messages`),
> was handed the marker and "Your previous iteration answered as follows, and the person was shown it:" with iteration 1's answer
> in its first message; it recorded the item and the session ended `completed` / `tasks_complete` (the whole proof 2 min 39 s at
> a load of 6 to 7 on four CPUs beside the sibling plan). **Found nothing against the text.** The live half is written, not run:
> the opt-in `plan-open` scenario (`live-run.mjs --only=plan-open`, `lib/plan-open-reading.mjs`) asks a real model for a
> three-item plan answered with the third item `PENDING`. Its `plan-open` launch should show one "a correction is sent" warning,
> the correction in the root's own conversation saying the answer was shown, no answer re-prompt, no held row, one iteration
> `succeeded` and `completed` / `tasks_complete`; its `plan-held` launch, told to answer a correction with one word, should show
> the held row, the next root's first request carrying the marker and an answer of the session, and its outcome. A model that
> closes its plan before answering makes either launch a NOTE, "not reached". The run is the orchestrator's. The row is in
> [`../architecture/first-executions.md`](../../architecture/first-executions.md).
