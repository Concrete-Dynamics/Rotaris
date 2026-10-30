## A prompt queued during teardown waits under a completed run

`createQueuedPrompt` was accepted until the run's end was written, but the last boundary has already passed when teardown
begins, and teardown awaits the background sessions, the child completions and the `session_end` hooks. A prompt submitted in
that span was stored QUEUED and the composer said "Message queued for the next iteration.", with no iteration to follow: the run
then reported completion while the prompt waited.

Found by reading `Run.teardown` on 2026-10-30, and reproduced by holding teardown at `childCompletionsSettled` in a test.
Steering already closes at this point for the same reason (REQ-MONITOR-133/134, `closeSteering`).

**Repaired 2026-10-30.** `Run.acceptsQueuedPrompts` is false from the moment the run stops stepping, and the operation is refused.
The composer's existing failure path then gives the text back with "Message could not be queued because the run is no longer
active.", REQ-CHAT-035's own wording for this case.

## Specs

REQ-CHAT-040: "a run that has finished every task it holds MUST NOT report completion while prompts remain QUEUED for it".
REQ-CHAT-035: the failure limb, "the run no longer accepts prompts".

## Relevant files

- `packages/engine/src/run/run.ts`: `acceptsQueuedPrompts`, `teardown`
- `packages/engine/src/sessions.ts`: `control`, `createQueuedPrompt`
- `packages/engine/src/control.test.ts`: `refuses a prompt queued once the run has stopped stepping`
