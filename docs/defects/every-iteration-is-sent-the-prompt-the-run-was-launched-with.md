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
resumed root published its first artifact after the continue (OQ-79; found by the review of clause 20's build,
2026-09-28).

Noticed 2026-09-27 by phase 2's re-review of `PD-ORCH-005`, whose repair of a crashed iteration puts that iteration's
task back to `pending`. Reproduced by driving the engine (`record.test.ts` and the reviewer's probes); not driven in
the built app.

## Specs

`REQ-CHAT-040` (every queued prompt becomes a task) and `REQ-ORCH-004` / `REQ-ORCH-135` (a resumed session carries its
todo on; the task stays anchored) — a task that is selected and never sent is neither worked nor anchored.

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()` (`modelTask`), `turn()`'s `initial ? (contentOverride ?? this.deps.taskContent)`.
- `packages/engine/src/run/todo.ts` — `appendTask`, which queued and continued prompts go through.
- `packages/engine/src/sessions.ts` — `planDecision`, `launchContinuation`; `apps/desktop/src/main/commands/improvements.ts` — the executor's launch prompt.
