## A delegated child's re-prompt is followed by the stuck corrective in the same request

A delegated child that ends its turn with neither text nor a tool call is re-prompted once by REQ-ORCH-095 ("Carry out the task
now, using your tools where the task needs them, then answer with what you did."). The same empty turn is REQ-ORCH-096's stuck
report (`runTurn` calls `observeStuck()`), so the re-prompt's turn takes the stuck trigger at its first `check()` and appends the
loop supervisor's corrective message after the re-prompt: the child's request ends [task, empty turn, re-prompt, corrective], two
instructions in one request. It is the shape the live run at `ce5f952` found for the entry role (finding F1), which
[`PD-ORCH-009`](../product/directives.md#pd-orch-009) revision 3 removed for the root alone ([OQ-282](../architecture/open-questions.md#oq-282)),
naming every delegated child as unchanged. Noticed 2026-10-14 by fin43 (`fin43-live-findings`) while building revision 3; raised as
[OQ-283](../architecture/open-questions.md#oq-283). Not repaired: which message stands is the ruling's.

## Specs

REQ-ORCH-095 asks for one re-prompt and REQ-ORCH-096 for "one corrective message"; together they send two. REQ-ORCH-104's
stuck-mode clause ("ALWAYS recover") is what puts the corrective there. No requirement says which wins when both are owed by the
same empty turn.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the REQ-ORCH-095 re-prompt (`turn('Carry out the task now, …', outcome.messages)`).
- `packages/engine/src/run/turn.ts` — `observeStuck()` on an empty reply with no call; `check()` before each step injects the corrective.
- `packages/engine/src/run/supervisor.ts` — `LoopSupervisor.observeStuck`, `withdrawStuck` (revision 3's, used for the root only).
- `packages/engine/src/children/children.test.ts` — "REQ-ORCH-096 with PD-ORCH-009 revision 3: a delegated child's empty turn still arms stuck", which pins the shape as found.
