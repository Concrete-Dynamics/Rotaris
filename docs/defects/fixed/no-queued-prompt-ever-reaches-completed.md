## No queued prompt ever reaches COMPLETED

`SessionWriter.completeQueuedPrompt` and its DAL statement existed and nothing called them, so every prompt stopped at
`TRIGGERED` with its task `complete` and its session `completed`. Two tests pinned the unfinished state, asserting `TRIGGERED`
after the run had ended.

Measured 2026-10-30 on `3ed01f9f`: `grep -rn completeQueuedPrompt packages apps` named only the definitions, and a drained
prompt's row read `TRIGGERED` after a `completed` run.

**Repaired 2026-10-30.** The iteration that completes a task hands its name to `SessionWriter.completeQueuedPromptOfTask`, which
finds the TRIGGERED prompt the name's eight characters identify (REQ-CHAT-089 names that lookup) and moves it. A task given up
on or re-queued moves nothing. The two tests now assert `COMPLETED`.

## Specs

REQ-CHAT-038: a status "progressing `QUEUED → TRIGGERED → COMPLETED`".

## Relevant files

- `packages/engine/src/session-writer.ts`: `completeQueuedPromptOfTask`, `QUEUED_PROMPT_TASK_NAME`
- `packages/engine/src/run/run.ts`: the iteration's success branch
- `packages/engine/src/control.test.ts`: `moves a queued prompt to COMPLETED only once its task has finished`
