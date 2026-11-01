# Archived open questions — Specification questions (15 of 27)

The ruled, closed, resolved and withdrawn entries of [part 20](../../../architecture/open-questions/20-specification-questions-15.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-102"></a>

**OQ-102 — How does a continue's message close with the resumed iteration, and which continues make one?** *(`PD-ORCH-005` clause 17 (revision 4); REQ-ORCH-004, which the clause narrows for a continue's message alone and which the reading below departs from for the continues the clause does not govern — the Continue action, "continue without them" and the message-limit resolution's 'continue' and 'double', none of which appends its request while the todo holds it unfinished, where REQ-ORCH-004's back-pointer keeps "Every other new top-level task is appended as stated" (the plan decision's relaunch, OQ-104, is not among them: it states no new top-level task, the held run having appended the gated work already, so appending none keeps REQ-ORCH-004); and REQ-ORCH-067, REQ-ORCH-069, REQ-ORCH-072, REQ-ORCH-077, REQ-ORCH-135, REQ-MONITOR-125, REQ-SESSION-110, REQ-ORCH-086, REQ-ORCH-087 and REQ-ORCH-153, which it does not name. Raised 2026-09-28 by building `PD-ORCH-005` revision 4 under [R-065](../../../product/requests.md#r-065). Numbered OQ-75 while it was built; renumbered when it reached `main`, where OQ-75 had been taken meanwhile.)*

**Ruled 2026-10-06 by the owner ([R-071](../../../product/requests.md#r-071)):** every reading built is confirmed, and `PD-ORCH-005` revision 6 states them in clause 25: only `succeeded` closes the message done; a `partial` close leaves it pending and counts toward no retry limit; a message left pending is taken up first; it is sent as text after the launch content, without its images; and a continue that states no new request appends nothing while its last request is unfinished and appends it again when it is complete, recognised by its text.

Clause 17: "The message a continue delivers to the resumed root (clause 4) SHALL also be appended to the session's todo
as a task. That task closes with the resumed iteration: done when the iteration succeeds, and left pending when it is
cancelled or fails, so the next iteration takes it up." The clause names two closes of an iteration that has four
outcomes and several ways to close, and does not say what state the task is in while the iteration is open, whether
leaving it pending counts against it, how it meets the one-task-per-iteration rule, or which continues deliver a
message.

**What the build proceeds under.**

- **Only `succeeded` is done.** An iteration that ends `partial` — its own task requeued, or abandoned at the retry
  limit — is neither a success nor a cancel; it did not finish, so the message is left pending. So is every other close:
  failed, raised, cancelled by the explicit cancel or by a pause that found nothing unfinished, declined by "continue
  without them", closed because the run that owned it died, and the explicit cancel after a rest or during the
  continue's pre-flight. A rest does not close the iteration, so the task stays with it and is resumed with it.
- **While the iteration is open the task is in progress, held by it.** It is appended `in_progress` beside the
  iteration's own task, as REQ-ORCH-072's selected task is, so the Todo pane shows it active and no selection takes it
  while its iteration is open. The binding is the iteration's number on the task (`heldBy`), stored in the planner todo
  document itself, so no store column is added and the binding survives a rest, a quit and a crash with the todo.
- **Left pending is not a requeue.** No consecutive retry is counted: REQ-ORCH-077's count is an iteration's own task
  failing to finish, and the message was not the task the iteration selected.
- **The message is held, not selected.** REQ-ORCH-067's "one task" is the task an iteration selects; the resumed
  iteration selected its own before the rest, and it answers the message because clause 4 delivers it.
- **Left pending, it is the next iteration's.** The clause says the next iteration takes it up, so a message left
  pending is marked (`nextUp`, in the todo document) and selected before every other pending task, the resumed
  iteration's own requeued or reopened task included; that iteration may be a later one of the same run or the first of
  a later run. Several messages released together are taken up in the order they were appended. Once an iteration
  begins it, it is an ordinary task: requeued, it goes back to its place in the todo (the `Continued Prompts` phase).
  *The first build selected it in its place in the todo, after every task before it, so a partial close or a decline
  had the next iteration take the resumed iteration's own task instead (found by the iteration lane's second review).*
- **Taking it up sends it.** An iteration's first message is the launch content, whose latest request is whatever
  launched the run
  ([`every-iteration-is-sent-the-prompt-the-run-was-launched-with.md`](../../../defects/fixed/every-iteration-is-sent-the-prompt-the-run-was-launched-with.md)),
  so a message taken up by a later run's iteration, or by the iteration after a continue by a second message, would be
  selected and marked done without ever being sent as the request, and the newer request worked in its place and again
  under its own task. So a task that is a continue's message (`message`, set when it is appended and kept for good, in
  the todo document) is sent to the fresh root of the iteration that selects it, as a text part after the launch content
  naming it the iteration's task and the latest request a separate one — unless the launch content's request is that
  same text, when the launch content already says it. It is sent only to an iteration's root: a plan cycle is not an
  iteration and has no iteration task (REQ-ORCH-153), so the plan cycle held after a resumed iteration whose own task
  was a message is not told it (found by the iteration lane's fifth review). Only the message's text is sent; its images
  are not, as the task holds its text only. Every other task an iteration selects that is not the run's own, and whose
  text is not the launch content's request, is sent the same way since the recorded defect's repair (2026-09-29, under
  [R-067](../../../product/requests.md#r-067)), in words that name it a task of the session's todo rather than an earlier
  message. *Until that repair every other task kept the recorded defect's behaviour — sent only the launch content —
  which this reading did not repair.* *The second build selected the message and sent it nothing of it (found by the
  iteration lane's fourth review).*
- **Several continues on one open iteration.** Each continue by message that resumes the iteration appends its own task,
  held by it; they close together, in the order they were appended.
- **Which continues make one.** Only a continue that delivers a message: a continue by message (`Sessions.prompt`), with
  text, images or both. A message of images alone makes a task whose text is empty, as a continued prompt's does. The
  Continue action and a plan decision deliver none and append none for a message.
- **A continue that states no new request appends no second task.** The Continue action, "continue without them", and
  the message-limit resolution's 'continue' and 'double' (REQ-SESSION-110, REQ-ORCH-086/087 — the dialog and the palette
  entry reach the same `continueSession`) continue from the last request (REQ-MONITOR-125) and append it as a task
  (REQ-ORCH-004); while the todo still holds a task of that request's text pending, or in progress and held by the open
  iteration (its own task, or a message it holds) — a continue's message a resumed iteration left pending or holds, or
  any request whose task a rest put back — they append none, and the run takes that task up as it stands. A request
  whose task is complete or abandoned is appended as before — a `paused` session holds its last request complete when
  its pause, stop or quit was accepted after its iteration closed, or when the plan cycle held after a resumed iteration
  that carried out the continue's message was cancelled, stopped or quit, and a `paused_message_limit` one when the
  limit was reached as the iteration that finished it closed, a resumed one included (OQ-103, "Nothing open to resume";
  OQ-104, "What a cancel leaves") — and so is one whose task is in progress with no iteration holding it: a selection
  takes only pending tasks, so nothing would take that task up, and the run would end at once with the request not done.
  A message a closed iteration still holds, and an iteration's own task its closed iteration left in progress (see "What
  a death leaves"), are judged as the run will take them: each is settled first, as the run settles it before it
  selects, so one returned to pending is not appended a second time and one completed is appended as any completed
  request is. *Until 2026-09-29 only the message was settled, so an own task a death left in progress was appended
  again beside itself and stayed in progress for good.* A continue by message is never judged so: it states a request, so
  it appends its task even when a task of the same text is still pending (REQ-ORCH-004), and the request is worked once
  for each time it was sent (pinned by the iteration lane's sixth review). *The fourth build judged such a message
  unheld, so a Continue action after the death appended it beside the task the run then returned to pending, and the run
  worked it twice (found by the iteration lane's fifth review).* *The second build counted any task in progress, which
  ended such a continue `no_pending_tasks` (found by the iteration lane's third review); the stranded task itself was
  [`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`](../../../defects/fixed/an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md),
  repaired 2026-09-29.*
  This repairs
  [`the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md`](../../../defects/fixed/the-continue-action-appends-the-last-prompt-again-while-its-task-is-pending.md),
  which the clause had widened: a message left pending is the last user row, so a Continue action appended it beside its
  own task and the run worked it twice. *The first build closed only "continue without them" on an iteration that holds
  a message, and left the Continue action undecided (found by the iteration lane's second review).* *Until the iteration
  lane's seventh review the record named only the Continue action and the decline, though the guard covered the
  message-limit resolution from the second build: a session paused at its limit with the last request's task still
  pending appended it a second time on 'continue' or 'double' at the base, and appends none now.*
- **What a death leaves.** The todo is saved with the run's `starting` save, so a run host that dies during the
  pre-flight keeps the task as the root's record keeps the message. A task held by an iteration that is no longer open —
  a death between the iteration's close and the save that recorded the release — closes when the next run is built as
  the record says its iteration closed: `complete` when the iteration's row reads `succeeded`, since the clause's "done
  when the iteration succeeds" is decided by the outcome and not by which save landed, and `pending` otherwise, so it is
  never left in progress with nothing to close it and a message its iteration carried out is never worked again. Since
  2026-09-29 the close no longer leaves that window: an iteration's close commits the todo its task and held messages
  were closed in, in the transaction that records `iteration.end` (`SessionWriter.endIteration`), ahead of the capture
  and the hooks, on both closes (`iterate()` and `closeOpenIteration`). A store an earlier build wrote is still settled,
  and an iteration's own task such a death left in progress with it — as the latest row naming it closed: `succeeded`
  complete, `partial` requeued, `failed` or `abandoned` abandoned, `cancelled` pending (`Todo.settleStranded`; the repair
  of
  [`an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md`](../../../defects/fixed/an-iterations-own-task-is-left-in-progress-by-a-death-before-the-todo-save.md)).
  *Until then only a held message was settled, and the save came after the capture and the hooks.*

**What a ruling decides.** Whether a `partial` resumed iteration should close the message as done, since the root
answered it; whether leaving the message pending should count toward REQ-ORCH-077's limit, so a message no iteration
can finish is abandoned rather than taken up forever; whether a message left pending should be taken up before the
resumed iteration's own unfinished task, as built, or after it; whether a continue that states no new request may
append nothing while its last request is unfinished — a departure from REQ-ORCH-004 that no directive governs, since
clause 17 speaks only of the message a continue delivers — and, if so, whether it should recognise that request's task
by more than its text, and whether it should append a request whose task is already complete (OQ-103's ruling on the
same state, the message-limit resolution's included); and whether a message taken up by a later iteration
should be sent with its images, or become that iteration's launch content in place of the latest request.
