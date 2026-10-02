## The entry agent's context limit is read from the requested model, not the one it runs on

`Run.entryContext` (`packages/engine/src/run/run.ts`), REQ-MONITOR-089's reading for the run-level agent, measures the
root's prompt tokens against `entryOverride.model ?? config.model`, the model the user or the configuration requested.
The root's ladder can run it on another model: a same-tier or unresponsive-model fallback (REQ-ORCH-090, REQ-ORCH-091 b),
or an override a change-model resolution persisted for the pair (REQ-ORCH-091 d), which stands even after a switch onto
that pair. The inspector then reads one model's capacity while the root fills another's. The model the root runs on is
its ladder cell's (`rootCell.model`). Noticed by the verifier of `fin5-noticed-gaps` (repair round 1, optional finding)
after a switch onto an override-moved pair; the gap predates that branch and holds for every ladder move of the root.
Not repaired, since it lies outside that branch's tasks.

## Specs

- REQ-MONITOR-049: "the context limit is the model's maximum input tokens", which for the root is the model its ladder
  cell runs on.
- REQ-MONITOR-089: the synthetic root agent exposes the root's newest reading; its limit is read beside it.

## Relevant files

- `packages/engine/src/run/run.ts`: `entryContext`, `rootCell`, `rootResilience`.
- `packages/engine/src/run/ladder.ts`: the moves that set the cell's model.
