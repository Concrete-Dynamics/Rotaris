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
[the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on.md](the-entry-agents-context-limit-is-read-from-the-requested-model-not-the-one-it-runs-on.md)
removed from the inspector's limit. A child's compression is built when its turn starts from its persona's configured model
(`persona.modelRef ?? deps.model`, `children/orchestration.ts`), not from its cell, so it ignores a session override from
the start as well as a later move. The
intent classifier and the analyst take their models from the configuration and are not carried through the session's
overrides either. Read from the code 2026-10-02 (fin8, ladder-overrides, the verifier's optional finding); no test drives a
compression pass after a ladder move.

## Outcome — repaired 2026-10-02 (fin10, quota-exclusions-and-choices, task 1)

- `TurnCompression.compressor` and `trigger` (`packages/engine/src/run/compression.ts`) are now read at each pass —
  `CompressionRunner.due()` and `runOnce`, the manual pass included — instead of being values captured when the turn
  started. `Run.compressionFor` (`packages/engine/src/run/run.ts`) takes `current: () => ModelChoice`, the pair the agent's
  cell calls next with the session's overrides followed (`Run.callsOn` for the root; for a child, its own cell from
  `forChild`, in `children/orchestration.ts`), and resolves the trigger against it; a configured `compressor.model` still
  wins for the compressing model (REQ-MONITOR-080). A child's compression now follows its cell, so a child under a session
  override compresses on the override's model from its first pass, the wider case the triage found.
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-MONITOR-078/080: compression follows the model the agent's cell is
  on", three cases, each red before with no pass at all because the trigger stayed `a1`'s): a root moved from `a1` to `b1` by
  a same-tier fallback compresses on `b1` at `b1`'s threshold; a root that follows a child's wait choice of `c1` compresses
  on `c1`; a child of a configured `a1` started under an override to `c1` compresses on `c1`.
- Shown in the built app by `compression-proof`'s new `after-a-move` scenario: the root starts on alpha (10,000 tokens),
  meets insufficient quota, moves to its same-tier candidate `scripted-b/beta` (1,000), and its 900-token step compresses with
  `capacity: 1000`, `trigger_tokens: 600` in the entry. Red on a build of the code before ("no pass ran after the move"),
  green after (load 0.8 to 1.0, nothing else running).
- Not repaired here, as the triage scoped it: the note's side remark that configured slots follow no override. In that
  scenario the pass itself called the configured `compressor.model` (its default, the `small_model` alias: alpha, the pair
  just recorded out of quota), which REQ-MONITOR-080 lets win over the agent's own; that a configured slot — the compressor,
  the intent classifier, the analyst, the loop classifier — is not carried through the session's exclusion is recorded as a
  note of its own by the bundle's second task.

## Specs

- REQ-MONITOR-078: compression triggers at the capacity of the model the agent calls.
- REQ-ORCH-091 (a)/(d) and REQ-MONITOR-194: a pair recorded out of quota and replaced is not called automatically for the
  rest of the session.

## Relevant files

- `packages/engine/src/run/run.ts` — `compressionFor` (the compressor's model and the trigger), and the root turn's call
  of it with `rootResilience.cell.model`.
- `packages/engine/src/children/orchestration.ts` — the child's call of `compressionFor`, with the persona's configured model.
- `packages/engine/src/run/ladder.ts` — `followOverride` and the ladder's moves, which change `cell.model` mid-turn.
