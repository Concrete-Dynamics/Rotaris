## Every iteration is sent the prompt the run was launched with

An iteration's first model call is built from `taskContent`, the content of the prompt that launched the run (its text
and attachments, or a continuation's handoff payload), whichever todo task the iteration selected. A run that works
more than one task therefore sends every later task's root the launch prompt again: a prompt queued while the run was
busy (REQ-CHAT-040) becomes a todo task and is marked complete without ever reaching a model as itself, and the
launch prompt is worked once per task. `iterate()` already chose the right task text (`modelTask`), but `turn()`'s
initial call reads `taskContent` first and never reads the task string when it is set, and `Sessions.start` and every
continuation always set it.

Noticed 2026-09-27 by phase 2's re-review of `PD-ORCH-005`, whose repair of a crashed iteration puts that iteration's
task back to `pending`: the reopened prompt was worked with the new prompt's payload. Reproduced by driving the engine
(`record.test.ts`); not driven in the built app.

## Specs

`REQ-CHAT-040` (every queued prompt becomes a task) and `REQ-ORCH-004` / `REQ-ORCH-135` (a resumed session carries its
todo on; the task stays anchored) — a task that is selected and never sent is neither worked nor anchored.

## Relevant files

- `packages/engine/src/run/run.ts` — `iterate()` (`modelTask`), `turn()`'s `initial ? (contentOverride ?? this.deps.taskContent)`.
- `packages/engine/src/run/todo.ts` — `appendTask`, which queued and continued prompts go through.

## Repaired — 2026-09-27

In `PD-ORCH-005` phase 2. `iterate()` sends the run's own task as it was launched (`taskContent`, with its
attachments and a continuation's handoff) and every other task it selects as its own text, passed as the turn's
content. Evidence: `record.test.ts` ("the same repair when the dead iteration was a continued prompt's…"), red when
the content override is removed. A queued prompt's own attachments are not carried by the queue today; nothing here
changes that.
