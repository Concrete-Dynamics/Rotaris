## The root compresses on the model its turn started on after its cell moves

`Run`'s root turn builds its compression services once, when the turn starts:
`this.compressionFor(rootResilience.cell.model, …)` (`packages/engine/src/run/run.ts`, in the root's turn setup). Both
what it captures are the model the cell held at that instant: the compressing model, when `compression.model` is not
configured (`c.model ?? choice`), and the trigger (`c.triggerFor(choice.model)` — the capacity and threshold
REQ-MONITOR-078 reads from the model the agent calls). The cell can move during the turn: a same-tier or unresponsive
fallback (REQ-ORCH-090/091 b), a wait's change-model choice, and since 2026-10-02 a session override followed before every
call (`followOverride`). After such a move a compression pass of the root still calls the pair the cell left — which may be
the pair just recorded out of quota and replaced, that REQ-MONITOR-194 says is "neither retried automatically" — and its
trigger is still the old model's capacity, the same staleness the repair of
[the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on.md](fixed/the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on.md)
removed from the inspector's limit. A child's compression is built when its turn starts from its persona's configured model
(`persona.modelRef ?? deps.model`, `children/orchestration.ts`), not from its cell, so it ignores a session override from
the start as well as a later move. The
intent classifier and the analyst take their models from the configuration and are not carried through the session's
overrides either. Read from the code 2026-10-02 (fin8, ladder-overrides, the verifier's optional finding); no test drives a
compression pass after a ladder move.

## Specs

- REQ-MONITOR-078: compression triggers at the capacity of the model the agent calls.
- REQ-ORCH-091 (a)/(d) and REQ-MONITOR-194: a pair recorded out of quota and replaced is not called automatically for the
  rest of the session.

## Relevant files

- `packages/engine/src/run/run.ts` — `compressionFor` (the compressor's model and the trigger), and the root turn's call
  of it with `rootResilience.cell.model`.
- `packages/engine/src/children/orchestration.ts` — the child's call of `compressionFor`, with the persona's configured model.
- `packages/engine/src/run/ladder.ts` — `followOverride` and the ladder's moves, which change `cell.model` mid-turn.
