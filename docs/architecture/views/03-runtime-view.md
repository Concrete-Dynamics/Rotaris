# Runtime view — a run from prompt to terminal result, and everything that reaches into it

The run host owns the run. A prompt from the composer becomes a session, the session's configuration is
resolved from the files with the screen's live state on top, the run iterates the todo, every iteration is a
turn loop of model steps and tool dispatches through the gate, and the run ends in one durable terminal
transaction. Controls, queued prompts, steering, the supervisor and the pause reach into the loop at fixed
points. The store is written by one ordered writer per session (ADR-0008); every event is recorded before it
is forwarded (ADR-0009/0010).

| Read this section when you are | Section |
|---|---|
| changing what happens before the first model call | [§1 Start](03-runtime-view/01-1-start.md#1-start) |
| changing the run loop or an iteration boundary | [§2 The loop and one iteration](03-runtime-view/02-2-the-loop-and-one-iteration.md#2-the-loop-and-one-iteration) |
| changing a model step, a tool dispatch or a hook slot | [§3 Inside a turn](03-runtime-view/04-3-inside-a-turn-runturn-one-agent-conversation.md#3-inside-a-turn-runturn-one-agent-conversation) |
| touching delegation | [§4 Children](03-runtime-view/07-4-children-adr-0012.md#4-children-adr-0012) |
| adding or changing a control operation | [§5 Controls reaching in](03-runtime-view/09-5-controls-reaching-in-adr-0010-1.md#5-controls-reaching-in-adr-0010-1-sessionscontrol) |
| changing teardown, or acting on a session no run holds | [§6 End](03-runtime-view/11-6-end.md#6-end) and [§6a](03-runtime-view/12-6a-the-session-browsers-actions-reaching-a.md#6a-the-session-browsers-actions-reaching-a-record-no-run-holds-part-u) |
| adding a table or a column | [§7 The store the run writes](03-runtime-view/13-7-the-store-the-run-writes.md#7-the-store-the-run-writes-packagesstoresrcschemats-v35) |
| adding a configuration key | [§8 Configuration's three tiers](03-runtime-view/15-8-configurations-three-tiers-adr-0037-as-they.md#8-configurations-three-tiers-adr-0037-as-they-touch-the-run) |
| drawing something from a publication | [§9 What a surface does with a publication](03-runtime-view/16-9-what-a-surface-does-with-a-publication-adr.md#9-what-a-surface-does-with-a-publication-adr-0046-adr-0045-part-z) |

Flows this view does **not** own — startup, approval, the board — are in [`06-sequences.md`](06-sequences.md).

## Parts

Since 2026-10-26 the rest of this document is in [`03-runtime-view/`](03-runtime-view/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](03-runtime-view/01-1-start.md) | 1. Start |
| [02](03-runtime-view/02-2-the-loop-and-one-iteration.md) | 2. The loop and one iteration |
| [03](03-runtime-view/03-2-the-loop-and-one-iteration-2.md) | 2. The loop and one iteration *(continued, from "A continue's message is also a task (PD-ORCH-005 clause 17; OQ-102).")* |
| [04](03-runtime-view/04-3-inside-a-turn-runturn-one-agent-conversation.md) | 3. Inside a turn (`runTurn`, one agent conversation) |
| [05](03-runtime-view/05-3-inside-a-turn-runturn-one-agent-conversation-2.md) | 3. Inside a turn (`runTurn`, one agent conversation) *(continued, from "The ladder over every model step (Part Q — `run/ladder.ts`, `run/resilience.ts`, …")* |
| [06](03-runtime-view/06-3-inside-a-turn-runturn-one-agent-conversation-3.md) | 3. Inside a turn (`runTurn`, one agent conversation) *(continued, from "The MCP surface (Part S; ADR-0033/0034).")* |
| [07](03-runtime-view/07-4-children-adr-0012.md) | 4. Children (ADR-0012) |
| [08](03-runtime-view/08-4-children-adr-0012-2.md) | 4. Children (ADR-0012) *(continued, from "Which personas a delegation may name (OQ-228, OQ-229, ruled 2026-10-07 under R-072; …")* |
| [09](03-runtime-view/09-5-controls-reaching-in-adr-0010-1.md) | 5. Controls reaching in (ADR-0010 #1, `Sessions.control`) |
| [10](03-runtime-view/10-5-controls-reaching-in-adr-0010-1-2.md) | 5. Controls reaching in (ADR-0010 #1, `Sessions.control`) *(continued, from "A **paused** session has no live run: `session.continue {action}` is a session command …")* |
| [11](03-runtime-view/11-6-end.md) | 6. End |
| [12](03-runtime-view/12-6a-the-session-browsers-actions-reaching-a.md) | 6a. The session browser's actions reaching a record no run holds (Part U) |
| [13](03-runtime-view/13-7-the-store-the-run-writes.md) | 7. The store the run writes (`packages/store/src/schema.ts`, v35) |
| [14](03-runtime-view/14-7-the-store-the-run-writes-2.md) | 7. The store the run writes (`packages/store/src/schema.ts`, v35) *(continued, from "Table \| Holds \| Written by \|")* |
| [15](03-runtime-view/15-8-configurations-three-tiers-adr-0037-as-they.md) | 8. Configuration's three tiers (ADR-0037) as they touch the run; Post-run improvement state |
| [16](03-runtime-view/16-9-what-a-surface-does-with-a-publication-adr.md) | 9. What a surface does with a publication (ADR-0046, ADR-0045; Part Z) |
