## Every iteration is sent the prompt the run was launched with

An iteration's first model call is built from `taskContent`, the content of the prompt that launched the run (its text
and attachments, or a continuation's handoff payload), whichever todo task the iteration selected. `iterate()` chooses
the task's text (`modelTask`), but `turn()`'s initial call reads `taskContent` first and never reads the task string
when it is set, and `Sessions.start` and every continuation always set it. So a prompt queued while the run was busy
(REQ-CHAT-040) becomes a todo task and is marked complete without ever reaching a model as itself, and the launch
prompt is worked once more in its place; a dead iteration's reopened task is likewise sent the newer prompt's payload.

Three flows depend on the launch content reaching an iteration whose task is not the run's own, and a repair must keep
them: **plan approval** (REQ-ORCH-154 — the continuation after `approve` first selects the gated run's own pending
`main:1`, and the approved plan is only in the payload); **improvement runs** (REQ-LIBRARY-059 — the executor's
instructions are the launch prompt and every todo task is a proposal id); and **a continue after a pause, a stop or a
message-limit pause** (REQ-ORCH-004 / REQ-SESSION-115 — the older pending task is selected first, and the handoff and
recent context are only in the payload). Sending a non-own task as its bare text, tried and reverted in
`PD-ORCH-005` phase 2, loses all three; the reviewer's proposal is the launch content as the base of every iteration
with the selected task's own text added as the task to work on.

A continuation's later iterations are re-sent the handoff as it was read at the continue: `PD-ORCH-005` clause 20's
artifact line (`latestArtifactText`) can by then name an artifact superseded since, or another agent's where the
resumed root published its first artifact after the continue (OQ-106; found by the review of clause 20's build,
2026-09-28).

The plan cycle `PD-ORCH-003` revision 2 holds after a resumed iteration is sent the same payload, read before the crash
was recorded, before clause 17 appended the continue's message as a task and before the resumed iteration worked. Its
"Authoritative session handoff" shows that iteration's task still in progress, leaves the message out and names the
artifact from before the resumed root published, while the preamble `parkAtPlanGate` puts before it — read from the
live todo — says the iteration closed and carried the message out (OQ-104, "The handoff after the preamble is the
continue's"; found by the merged revision 4 build's tenth review, 2026-09-28; pinned in `plan-gate-resume.test.ts`).

`PD-ORCH-005` clause 17 (revision 4) made the defect bite on its own new tasks: a continue's message a resumed iteration
left pending is taken up by the next iteration, which is often launched by a newer message — a later run's continue, or
a second continue by message on the same open iteration — so the message was selected and marked done without being
sent, and the newer message worked in its place and again under its own task. Its build (the iteration lane's fourth
review under R-065, OQ-102) repairs that case alone, along the reviewer's proposal above: a task marked as a continue's
message (`Task.message`) is sent to the fresh root that takes it up, after the launch content, whenever the launch
content's request is another. Every other task selected that is not the run's own is still sent only the launch
content.

Noticed 2026-09-27 by phase 2's re-review of `PD-ORCH-005`, whose repair of a crashed iteration puts that iteration's
task back to `pending`. Reproduced by driving the engine (`record.test.ts` and the reviewer's probes); not driven in
the built app.

## Specs

`REQ-CHAT-040` (every queued prompt becomes a task) and `REQ-ORCH-004` / `REQ-ORCH-135` (a resumed session carries its
todo on; the task stays anchored) — a task that is selected and never sent is neither worked nor anchored.

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()` (`modelTask`, `messageTakenUp`), `turn()`'s `initial ? (contentOverride ?? this.deps.taskContent)`, `firstMessage`.
- `packages/engine/src/run/todo.ts` — `appendTask`, which queued and continued prompts go through.
- `packages/engine/src/run/run.ts` — `parkAtPlanGate`, whose content after a resumed iteration is `resumedWorkSection` and then `taskContent`.
- `packages/engine/src/sessions.ts` — `planDecision`, `launchContinuation`, `buildContinuationPayload`; `apps/desktop/src/main/commands/improvements.ts` — the executor's launch prompt.

## Repaired — 2026-09-29

Repaired 2026-09-29 under R-067, along the reviewer's proposal. The launch content stays the base of every execution
iteration's first message, and the todo task the iteration selected, when it is not the run's own (`RunDeps.taskId`) and
its text is not the launch content's request, follows it as a text part naming it the task to work on:
`iterate()` records it (`Run.takenUp`, which replaces `messageTakenUp`), and `Run.firstMessage` adds it after the launch
content and before the offers list (`takenUpText`; a continue's message keeps clause 17's words). A plan cycle is sent
none. The three flows keep the launch content: plan approval's relaunch sends every iteration the approved plan, the
gated request's iteration nothing more and a later task's its own text after it; an improvement run's every iteration
the executor's instructions and then its own proposal; a continue after a pause the handoff and then the older task it
takes up, while the Continue action that restates a pending request is told nothing more. The handoff's staleness is
built to the readings OQ-104 and OQ-106 record — nothing rebuilds it per iteration — and those readings, OQ-102's
"Taking it up sends it" and OQ-107's "The re-sent handoff is left as it is" are corrected in place. What the build
decided beyond the specification (the words, a task repeating the launch request, a renamed own task, attachments) is
OQ-117.

Evidence: `run/iteration-task.test.ts` — a queued prompt, a request a pause put back and taken up by a later message's
run, an improvement run's two proposals, and a plan approval's gated and later task; the four that send a task fail on
the code before the repair, and the Continue action's case pins that a restated request is told nothing more.
`message-task.test.ts`, `record.test.ts` and `plan-gate-resume.test.ts` stay green (OQ-104's stale handoff still
pinned). In the built app `part-j-proof`'s queue scenario now reads the conversation record: the iteration that took
the queued prompt up was sent "first task" and then the queued prompt as its task, and the launch prompt's own
iteration was not; `plan-gate-proof`, `part-h-proof` and `improvements-proof` were run beside it.
