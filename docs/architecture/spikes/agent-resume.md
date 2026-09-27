# Spike — resuming an agent from its recorded conversation (PD-ORCH-005)

- **Date:** 2026-09-27
- **Question:** `PD-ORCH-005` revisions 2 and 3 have every agent's conversation recorded as it happens and a paused,
  stopped, quit or crashed run resumed from that record. Before designing the store table, the pause and the
  resume, does the smallest slice work end to end — record one agent's conversation, pause it, restore the record
  into a new `Conversation`, continue against the scripted backend — and what does the code make of it that the
  directive's text does not say?
- **Scope:** the first act of building the directive, on its own branch. Two product changes were made, both of
  them the seams the build needs anyway: `Conversation` takes an optional recorder that sees every `push` and every
  `replace`, and `runTurn` accepts a `null` task, which continues the history it is given with no new message.
  Everything else is `packages/engine/src/run/resume.spike.test.ts`.
- **Verdict, in one line:** the slice works — a paused turn's record is exactly its conversation, and a new turn
  built from that record alone sends the model the whole record and nothing more — and the spike found five things
  the build has to do that no clause states.

## What was run

`pnpm vitest run packages/engine/src/run/resume.spike.test.ts`, four cases, all passing on this branch:

1. **Record, pause, restore, continue.** The scripted model asks for one tool call; the pause is accepted while that
   call is in flight; the call finishes and the turn stops before its next model step (`paused: true`, one model
   request made). The record holds `user, assistant, tool` and equals the turn's own `messages`. A second
   `runTurn(…, null, record)` over a new `Conversation` sends the model exactly the record (the request's messages
   after the system message are the record, element for element) and records only what it adds.
2. **A call cut off by a stop.** Of two calls in one step, the first completes and the stop arrives during the
   second.
3. **A compression.** A `replace` reaches the recorder as a replacement of the whole conversation.
4. **The price of the record.** 1,000 messages of 4,205 bytes (a tool result carrying 4 KiB of output), each in its
   own transaction on the store the run already writes: **0.072 ms per message** on this container (Linux, Node
   22.22.2, the store's own `openStore` settings, a scratch file on the container's disk).

## What it found

1. **`originalRequest` was captured from the constructor's array only.** REQ-MONITOR-082 needs the first `user`
   message to survive compression character for character, and `Conversation` found it once, in its constructor.
   Pushing the first message after construction — which is what a recorded conversation does, since the record
   sees the push — left it `null`. The spike captures it on the first `user` push as well. A restored conversation
   finds it in the array it is built from, which is right: the original request is the record's first `user`
   message, not the payload of the run that resumed it.
2. **A stop loses the results of the calls that DID complete.** When the run signal aborts mid-step, `runTurn`
   returns without pushing the step's `tool` message at all, so the conversation ends on an `assistant` message whose
   calls have no results — including the call that completed. The restore owes a result for every call of that
   message (a provider rejects a tool call with no result: the shape ADR-0060's cut rule already guards against),
   and it should hand back the completed call's real result rather than an "interrupted" one. The turn therefore
   has to push the `tool` message on every exit mid-step: completed calls with their results, the call that was cut
   off and the calls never started as interrupted. A crash is the one case where the record ends on an unanswered
   `assistant` message, and the continue that records the crash is where those results are written.

   > **Built in phase 3 (2026-09-27).** `runTurn` now pushes the step's `tool` message on every exit mid-step, and the
   > crash record writes the missing one (`run/crash.ts`). The spike's second case asserted the pre-build shape — the
   > `tool` message lost — so it was removed when the turn changed; `run/interruption.test.ts` asserts the built
   > behaviour in its place (a stop mid-step, a pause and its deadline, a withdrawn approval, the landing unchanged).
3. **A compression must be written into the record, not beside it.** `replace` swaps the whole array (ADR-0060). If
   the record only appended, a resume would re-send what was compressed away, which clause 12 forbids. The record
   takes the replacement as an entry of its own, and a resume reads from the last replacement forward — the full
   history stays in the table, and the conversation a resume sends is the compressed one.
4. **An agent's position is more than its conversation.** Read from `IterationChildren.runWithChildren`, not
   exercised here: a parent whose turn has ended and which is waiting for its children has a record ending on its
   own final `assistant` message. Resuming it with a model step would be wrong; it has to re-enter the resume loop
   — wait for its children, then be resumed with their reports — and make no model call until one of them ends. The
   position is therefore derived from the record together with the ledger: a record ending on `tool` results (or on
   a `user` message) needs a model step; one ending on the agent's final answer resumes into the loop.
5. **`runTurn` always appended a new user message.** A resume by the Continue action has nothing new to say, so the
   turn has to be able to continue a history as it stands; a resume by a new message delivers that message as the
   next `user` message; a resume after children ended delivers their reports. `task: string | null` is the seam.

## What it did not measure

- No built app, no run host, no second process: the record lived in memory, and only its append cost was measured
  against a real SQLite file. Durability across a quit is the build's to show.
- The price above is one container's; `commit-on-the-publish-path.md` measured the publish path's commits on the
  Windows development machine, and this figure is not comparable to it.
- The system prompt is not part of the conversation — it is rebuilt from the persona when the agent is built — so a
  persona edited between the pause and the resume gives the resumed agent its new instructions. Not exercised.
