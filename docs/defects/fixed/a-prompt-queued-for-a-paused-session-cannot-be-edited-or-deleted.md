## A prompt queued for a paused session cannot be edited or deleted

A prompt still QUEUED when its run comes to rest stays in the panel, but `Sessions.control` answered every queue operation
with `{ok: false}` once `run.isEnded`, so Edit and Delete failed on it. The panel then raised REQ-CHAT-037's toast, "Queued
message was already picked up and cannot be edited.", which was untrue: the prompt had not been picked up.

Measured 2026-10-30 on `3ed01f9f` in the engine, by a queued prompt, a pause, `editQueuedPrompt`: `{"ok":false}` with the row
still `QUEUED`.

**Repaired 2026-10-30.** `editQueuedPrompt` and `removeQueuedPrompt` take a route of their own while no run is live
(`Sessions.editQueuedAtRest`), under the lock a stored todo edit takes (ADR-0005). `control.test.ts` drives a pause, an
edit, a delete and the continue that consumes the edit, and the same over a second `Sessions` on the same store (REQ-CHAT-041).

## Specs

REQ-CHAT-040: a paused run's prompts "remain visible and editable in the panel of REQ-CHAT-036". REQ-CHAT-037's toast is for a
prompt already picked up.

## Relevant files

- `packages/engine/src/sessions.ts`: `control`, `editQueued`, `editQueuedAtRest`
- `packages/engine/src/control.test.ts`: the at-rest and second-process cases
