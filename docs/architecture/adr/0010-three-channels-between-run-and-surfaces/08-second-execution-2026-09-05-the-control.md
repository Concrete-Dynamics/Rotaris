# ADR-0010 — Three channels between the run host and its surfaces — Second execution — 2026-09-05, the control channel's operations (Part J)

Part 8 of 10 of [ADR-0010](../0010-three-channels-between-run-and-surfaces.md), which indexes every part.

## Second execution — 2026-09-05, the control channel's operations (Part J)

*Recorded under GD-10. The twelfth defect of ADR-0058 consequence 17's pattern, and one finding against the skeleton.*

**Built and run:** channel 1 with REQ-MONITOR-004's operations behind it (`packages/engine/src/sessions.ts`
`control`, `run/run.ts`, `run/turn.ts`): queued prompts as a session-owned table (store v6) whose
`QUEUED → TRIGGERED` move is one conditional update, consumed at every iteration boundary into a "Queued Prompts"
phase before completion is judged (REQ-CHAT-038/040); steering pending per conversation and injected as a marked
user message at the agent's next step, with the extra round for an agent that was finishing (REQ-MONITOR-133..136);
the graceful whole-run pause — `pausing` written only after the run accepted, the turn stopping before its next
model step, the task left pending, the session `paused` with its interruption row (REQ-MONITOR-123..125,
REQ-MONITOR-296); the message-limit pause recorded durably with the count and the limit before the loop stops and
the host told (REQ-ORCH-085/087), its three resolutions (REQ-SESSION-110) and the dialog in its own modal window
(REQ-ORCH-086, REQ-SESSION-109); todo edits; the entry model and reasoning switch applied from the next
iteration with its system row (REQ-MONITOR-142); the shutdown announce. The string value is populated for exactly
the two prompt-creating operations (REQ-MONITOR-005); every operation with no mechanism behind it answers `false`.
Six built-app scenarios (`pnpm part-j-proof`) and six engine tests.

**Found against the skeleton — the operation list was the runtime's, not the requirement's.** The skeleton fixed
twenty-one names "REQ-MONITOR-004's" that were nothing of the kind: `start`, `resume`, `detach`,
`releaseSession`, `requestCheckpoint`, `restoreCheckpoint`, `recheckSandbox`, `setDelegationStrategy`,
`setDelegationDepth`, `pauseAgent`, `reorderQueuedPrompt` — session commands and live-state settings dressed as
controls on a live run — while the requirement's todo edit, model and reasoning switch, compression, transcript
clear, verification skip, shutdown announce and the four terminal operations had no name. `contracts/src/control.ts`
now carries the requirement's twenty-two, in its order; the contracts test that pinned "21" pinned the wrong list.
Caught by building the operations against the requirement, not by execution.

**Found — the steer's peek drained the queue (the twelfth).** At an agent's finish the turn asked "is a steer
pending?" through the same port that delivers steering, which drains on read; the answer was yes, the queue was
then empty, no message was injected and no timeline entry written, and the agent took a spurious extra round with
nothing new to say — the steer was lost. Caught by the proof (the timeline held `steering_submitted` and no
`steering_injected`; the transcript held an unexplained second answer). The injection is the one read now.

**Readings recorded.** (a) The closed stop-reason set has no `paused`: a manual pause ends the run as
`user_cancelled` (terminal result `interrupted`, status `paused` by REQ-MONITOR-029's mapping) with a row that
names the pause; the continuation is Part H's route without a new user row. (b) The message-limit pause writes
no terminal pair: the session is paused, not ended, the writer keeps its lock in-process, the next run start in
this process continues on the same writer, and a relaunch reaps the dead pid's row (REQ-SESSION-047) — measured
in the proof. (c) `editQueuedPrompt` is REQ-MONITOR-004's "edit a queued prompt"; the queue has no reorder.
(d) The stall-evaluation leg of REQ-MONITOR-135 waits on the stall detector. *2026-09-29: a delegated child's stall
detector exists (`children/stall.ts`, REQ-ORCH-089), and the leg is still not built: nothing injects from a stall
evaluation, and the root has no detector ([`a-stalled-child-is-never-shown-stalled.md`](../../../defects/fixed/a-stalled-child-is-never-shown-stalled.md)).*
*2026-09-30 (R-067, acceptance finding A6): the leg's first execution. The root has a watch too, and an evaluation that
finds a steer pending for an agent waiting between its turns on its own children wakes it; the step it takes injects the
steer before any child ends, and every delivered steer restarts the watch's silence. Within a turn nothing is injected by
an evaluation, since the step boundary already delivers at the next step and nothing may join a conversation under a step
or between a call and its result. The waiting root's case fails without it (`children.test.ts`, "REQ-MONITOR-135 /
REQ-MONITOR-122: a steer to the root while it waits on its children …"). The reading is OQ-153; the row is in
[`../first-executions.md`](../../first-executions.md).*

**Not exercised:** the terminal-stream operations (ADR-0021), structured questions, compression, verification
skip, a steer to a child agent in the app (the unit path is tested), REQ-MONITOR-132's two-run quit warning.
