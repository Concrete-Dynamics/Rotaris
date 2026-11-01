## A delegated child's re-prompt is followed by the stuck corrective in the same request

A delegated child that ends its turn with neither text nor a tool call is re-prompted once by REQ-ORCH-095 ("Carry out the task
now, using your tools where the task needs them, then answer with what you did."). The same empty turn is REQ-ORCH-096's stuck
report (`runTurn` calls `observeStuck()`), so the re-prompt's turn takes the stuck trigger at its first `check()` and appends the
loop supervisor's corrective message after the re-prompt: the child's request ends [task, empty turn, re-prompt, corrective], two
instructions in one request. It is the shape the live run at `ce5f952` found for the entry role (finding F1), which
[`PD-ORCH-009`](../../product/directives/pd-orch-009.md#pd-orch-009) revision 3 removed for the root alone ([OQ-282](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-282)),
naming every delegated child as unchanged. Noticed 2026-10-14 by fin43 (`fin43-live-findings`) while building revision 3; raised as
[OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283). Not repaired: which message stands is the ruling's.

## Specs

REQ-ORCH-095 asks for one re-prompt and REQ-ORCH-096 for "one corrective message"; together they send two. REQ-ORCH-104's
stuck-mode clause ("ALWAYS recover") is what puts the corrective there. No requirement says which wins when both are owed by the
same empty turn.

## Relevant files

- `packages/engine/src/children/orchestration.ts` — the REQ-ORCH-095 re-prompt (`turn('Carry out the task now, …', outcome.messages)`).
- `packages/engine/src/run/turn.ts` — `observeStuck()` on an empty reply with no call; `check()` before each step injects the corrective.
- `packages/engine/src/run/supervisor.ts` — `LoopSupervisor.observeStuck`, `withdrawStuck` (revision 3's, used for the root only).
- `packages/engine/src/children/children.test.ts` — "REQ-ORCH-096 with PD-ORCH-009 revision 3: a delegated child's empty turn still arms stuck", which pins the shape as found.

## Outcome

**Repaired 2026-10-14 by fin44 (`fin44-supervision-and-match`)** under [OQ-283](../../archive/architecture/open-questions/59-spikes-and-later-questions-26.md#oq-283)'s
ruling (R-072), recorded as [`PD-ORCH-009`](../../product/directives/pd-orch-009.md#pd-orch-009) revision 4: the child's re-prompted empty
turn is no stuck report. `IterationChildren.execute` (`packages/engine/src/children/orchestration.ts`) calls
`withdrawStuck()` on the child's supervisor immediately before it sends "Carry out the task now, …", so the re-prompt is the last
message of its request. **Pinned by** `children.test.ts`, "PD-ORCH-009 revision 4 (OQ-283): …", two cases red on `a3be56c`: silent
then an answer (the re-prompt last, no classification, no `loop_supervisor_activation`, the child `succeeded`), and silent twice
(the child `failed` with `incomplete_execution` naming `no_activity`, no stuck activation, no `circuit_breaker_escalation`); the
case that pinned the shape as found is replaced, its expectation kept in a comment. **Shown in the built app** by `pnpm
part-h-proof`'s `silent-child` launch (`ROTARIS_CHILD_SCRIPT=silent,answer`, `circuit_breaker.enabled: true`): the re-prompt sent
once and followed by the child's own step, 0 stuck activations and 0 loop classifications. **Not shown:** a live run with a silent
child, the orchestrator's.
