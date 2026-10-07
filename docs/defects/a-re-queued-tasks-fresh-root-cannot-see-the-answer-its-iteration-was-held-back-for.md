## A re-queued task's fresh root cannot see the answer its iteration was held back for

A coordinator that answers its request in full while an item of its own plan still reads `PENDING` (here the plan's last
item, "Report one line per command") has its iteration held back by REQ-ORCH-029's hold, as the G5 repair built it. With
REQ-ORCH-078's default of 0 corrections no message goes into the conversation that holds the evidence; the task is returned
to the queue (REQ-ORCH-075), and the next iteration's fresh root (REQ-ORCH-072) receives only the task and the continuation
marker. It does not receive the answer just written, it cannot reach the finished child (REQ-TOOLS-155's parent scoping of a
new root), and `todo` has no read operation. So it redoes the whole task and tells the person, under the answer they were
already shown, that the report was never delivered. Nothing in the transcript or the timeline says the task was returned to
the queue: the warning is in the session log alone. Left to run, the same plan shape re-queues again, and REQ-ORCH-077 gives
the task up at the third pending outcome, so a request answered in full can end `failed`.

Live-run finding: P1 of the final default live run at origin/main `a68f121` (2026-10-07), the pack's one FAIL ("the terminal
run reached its result inside the wait").

## Specs

- `REQ-ORCH-029`: the coordinator "does not report the run successful while a todo item is non-terminal or while a todo
  item's recorded state disagrees with what happened". The hold is faithful to it.
- `REQ-ORCH-075`: the re-queue's continuation payload is the stripped base payload plus the marker block; nothing in it
  carries what the held iteration answered.
- `REQ-ORCH-078`: "Todo-correction retries MUST reuse the validation-retry setting (default 0): with 0, an incomplete-todo
  success re-queues without an in-conversation retry". The default sends the open item past the one agent that holds the
  evidence.
- `REQ-ORCH-072` (a fresh root per iteration) and `REQ-TOOLS-155` (a new root is refused the previous root's children).
- `REQ-ORCH-067`: iteration boundaries visible in the transcript; the re-queue is not.
- `REQ-ORCH-077`: the give-up at the third consecutive pending outcome.
- `REQ-SESSION-115`: the follow-up payload already carries agent rows, the precedent for carrying an answer.

No requirement is contradicted by the code: the gap is in what the specification gives the re-queued root. Raised as
[OQ-225](../architecture/open-questions.md) and ruled the same day under the owner's delegation (R-072), recorded as
[`PD-ORCH-015`](../product/directives.md#pd-orch-015) and `PD-ORCH-009` revision 2.

## Evidence

Default pack `2026-10-07T06-48-50-123Z` of the `live` worktree at `a68f121` (git-ignored; the registered self-hosted
endpoint), session `5df89df3` (terminal):

- Traffic #24, `fin: stop`: the coordinator answered with the full per-command report, 3,080 characters; transcript row 48
  holds its 14 numbered lines. Its plan still read "Report one line per command" `PENDING` (the `#21` observation).
- `session.log` 07:07:05.136, WARNING: "iteration 1: the coordinator answered with 1 item of its plan not done: Report one
  line per command; its task is returned to the pending queue (REQ-ORCH-029)"; `iteration.end` `partial`. No correction was
  sent: traffic #25 opens a new conversation.
- Traffic #25 holds the system prompt, the task and REQ-ORCH-075's marker only. Tool call `#25`, `background_output` on the
  finished child, was refused: "not found among your children" (a `tool_error` issue).
- Traffic #28's reasoning: it could not turn the prior report into honest one-liners "without the raw transcript", so it
  delegated the 14 commands again. The wait ran out 104 s into that repeat (230,484 in / 8,187 out tokens).
- Transcript row 54, under the answer already shown: "The prior run executed the sequence but never delivered the
  one-line-per-command report."
- Iteration 2's plan (`#26`) again ended with the report item `PENDING`.

## Relevant files

- `packages/engine/src/run/run.ts` — `turn()`'s `correction` closure (the count, the re-prompt, the answer it followed);
  `iterate()`'s plan-open branch (the re-queue, the give-up); `firstMessage` (the continuation marker).
- `packages/engine/src/run/stop-conditions.ts` — `planCorrectionText`, `planCarryText`, `planNotDoneSummary`.
- `packages/engine/src/run/todo.ts` — `Task.planLeftOpen`, beside which a held answer would be kept.
- `packages/engine/src/children/orchestration.ts` — `runWithChildren`'s `followUp`, where the correction is asked.
- `docs/defects/fixed/the-run-records-success-while-the-coordinators-own-plan-holds-a-pending-item.md` — the G5 repair,
  whose "Cost" paragraph foresaw this repeat.
