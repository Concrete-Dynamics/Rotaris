## The entry agent's context limit is read from the requested model, not the one it runs on

`Run.entryContext` (`packages/engine/src/run/run.ts`), REQ-MONITOR-089's reading for the run-level agent, measures the
root's prompt tokens against `entryOverride.model ?? config.model`, the model the user or the configuration requested.
The root's ladder can run it on another model: a same-tier or unresponsive-model fallback (REQ-ORCH-090, REQ-ORCH-091 b),
or an override a change-model resolution persisted for the pair (REQ-ORCH-091 d), which stands even after a switch onto
that pair. The inspector then reads one model's capacity while the root fills another's. The model the root runs on is
its ladder cell's (`rootCell.model`). Noticed by the verifier of `fin5-noticed-gaps` (repair round 1, optional finding)
after a switch onto an override-moved pair; the gap predates that branch and holds for every ladder move of the root.
Not repaired, since it lies outside that branch's tasks.

## Outcome — repaired 2026-10-02 (fin8, ladder-overrides, task 2)

`Run.entryContext` (`packages/engine/src/run/run.ts`) reads the limit from the model the root's ladder cell calls,
`rootCell?.model.model`, falling back to the requested model (`entryOverride.model ?? config.model`) only before the cell
exists. A same-tier or unresponsive-model move, an override persisted for the pair and, since the same round, an override
the root follows from its next call
([a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md))
now move the limit with the cell. Pinned in `packages/engine/src/run/ladder.test.ts` ("the entry agent's context limit
follows the root's same-tier move to the model it runs on"): `a1` advertising 1000 and `b1` 5000, the root moved `a1` →
`b1` on quota, and the published `entryContext.limit` reads 1000 then 5000 to the end (red before: 1000 throughout).
`mission-proof` drives no scripted fallback, so the unit test carries the evidence.

## Specs

- REQ-MONITOR-049: "the context limit is the model's maximum input tokens", which for the root is the model its ladder
  cell runs on.
- REQ-MONITOR-089: the synthetic root agent exposes the root's newest reading; its limit is read beside it.

## Relevant files

- `packages/engine/src/run/run.ts`: `entryContext`, `rootCell`, `rootResilience`.
- `packages/engine/src/run/ladder.ts`: the moves that set the cell's model.
