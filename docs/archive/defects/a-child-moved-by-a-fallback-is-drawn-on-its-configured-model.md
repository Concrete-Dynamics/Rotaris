## A child moved by a fallback is drawn on its configured model

A delegated child whose ladder cell moves off its configured pair — a same-tier fallback after a quota or rate-limit answer
(REQ-NOTIFY-082, REQ-ORCH-091 b), a pre-call move off a pair the session holds out of quota (REQ-MONITOR-194), an
unresponsive-model fallback (REQ-ORCH-090) or the REQ-ORCH-088 timeout's fallback — keeps being projected with its configured
`children.model_key`: the inspector's Model field and the persona window's read-only model name the configured key, and its
context ring's limit is that key's maximum input (`contextLimitFor(c.model_key)`), while every call goes to the candidate. The
run-level agent had the same fault, repaired 2026-10-03 by `SessionRecord.entryModelKey`
([`fixed/the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md`](the-inspector-names-the-configured-model-while-the-root-runs-on-a-same-tier-candidate.md));
a child's cell is built per execution by the run's `resilience.forChild` with no name to find it by, so the projection has no
live key to read. Found by fin11's triage of open notes (code reading, not driven). Not repaired: the repair keys each child's
cell by its canonical name in the run (beside `forChild` in `packages/engine/src/run/run.ts` and its caller in
`packages/engine/src/children/`), exposes the live key to `toAgentRecord`, and reads both the model and the limit from it. Size
S to M.

## Outcome — repaired 2026-10-03 (finacc, acceptance finding F7)

- **Each child's cell is kept by its task id.** The run's `resilience.forChild` (`packages/engine/src/run/run.ts`) now takes
  the execution it builds a cell for (`{ taskId, key }`, the key being the row's `children.model_key`; the call in
  `packages/engine/src/children/orchestration.ts` passes both). The cell carries the key its model was taken from (the
  override followed, else the row's key) and the run keeps it in `Run.childCells`, the latest execution's per task.
- **The run names the key a moved child runs on.** `Run.childModel(taskId)` returns null while the cell is still on the
  recorded pair under the recorded key, and once it has moved (same-tier, pre-call, unresponsive-model, REQ-ORCH-088 timeout,
  a wait choice or an override followed) returns the configured key for the cell's model by `entryModelKey`'s rule (now
  shared as `Run.keyOfCell`), together with that model's advertised maximum input (`compression.triggerFor`, as
  `entryContext` reads it).
- **The projection reads it.** `toAgentRecord` (`packages/engine/src/sessions.ts`) takes `AgentFacts.liveModelFor`, which both
  `readSession`s fill from the live run, and reads `model` and `contextLimit` from it: the limit is the live model's figure,
  else `contextLimitFor` of the live key, else the default. With no live run, or for a child this run did not execute, the
  row's `model_key` stands, as the run-level agent's Model falls back to the entry role at rest.
- **The timeout fallback republishes.** REQ-ORCH-088's retry changed `cell.model` without telling the run, so no record was
  published until the retry's own rows. It now calls `TurnResilience.moved`, as the ladder's own moves do.
- **Pinned** by four cases in `packages/engine/src/run/ladder.test.ts`: under "a child moved by a fallback is drawn on the model
  it runs on", the same-tier move after a quota answer (b1, limit 5000, while the call on b1 is held), the REQ-ORCH-088
  timeout fallback (f1, limit 7000, while the retry is held), and a child that never moves (a1 throughout); plus an assertion
  added to "a child's wait choice moves the root and the summariser off the replaced pair" (drawn on c1 from the choice on).
  The first two and the wait choice fail without the repair (`expected 'a1' to be 'b1'`, `… 'f1'`, `expected [ 'a1', … ] to
  include 'c1'`). The timeout case also fails with the repair minus the `moved` call.
- **Shown** by `resilience-proof`'s new driven scenario `child-timeout-inspector` (`--only=child-timeout-inspector
  --skip-build` after `pnpm build`, as root under Xvfb, Node 24). Alpha declares 100,000 maximum input and beta 300,000. With
  the child `helper` selected, the inspector read Model `alpha` against 100,000 while the child hung on alpha, and Model `beta`
  against 300,000 once the retry ran on beta (`results.json` `childTimeoutInspector`; `child-timeout-inspector-alpha.png`,
  `child-timeout-inspector-beta.png`; load 2.1 to 5.1). The same scenario against a build of the code without the repair
  failed with "the inspector named "alpha" while the child's retry ran on beta" (load 6.4).
- **Not changed:** after its run ends a child is named by its row's `model_key` again, the way the run-level agent falls back to
  the entry role at rest. The record keeps no per-child history of the model it ran on.

## Specs

- REQ-MONITOR-052 / REQ-MONITOR-069 — the inspector's model selector and the instance card's read-only model value name the
  agent's model.
- REQ-MONITOR-049 — "the context limit is the model's maximum input tokens": the model the agent runs on, which the run-level
  agent already follows.
- REQ-MONITOR-066 — the selector names the agent's current model "rather than showing a wrong or blank one".

## Relevant files

- `packages/engine/src/sessions.ts` — `toAgentRecord`: `model: c.model_key` and `contextLimit: facts.contextLimitFor?.(c.model_key)`.
- `packages/engine/src/run/run.ts` — `resilience.forChild`, which builds each child's cell (`agentCell`) unnamed.
- `packages/engine/src/run/ladder.ts` — `limitPath` and the unresponsive and timeout paths, which change `cell.model` and no
  record field.
