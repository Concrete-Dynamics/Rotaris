## The inspector names the configured model while the root runs on a same-tier candidate

After the ladder moves the root to a same-tier candidate (REQ-ORCH-091 b, REQ-NOTIFY-082) — after a quota answer, or since
fin10 before its first call when the session holds the configured pair out of quota — the inspector's Model field for the
run-level agent still names the configured key. Seen 2026-10-03 (fin10, quota-exclusions-and-choices) in
`resilience-proof`'s `next-run-choice` launch (`.proof/resilience-proof/next-run-choice-run-header.png`): with alpha
excluded, the held prompt's root ran on `scripted-b/beta` (the scripted client logged `scripted/beta`, and the
`quota_fallback_model` entry carries `pre_call: true`) while the inspector read "Model alpha". The run-level agent's model
is the entry role's (`entryRole` / `modelInForce` in `packages/ui/src/agents.ts`), which follows a session-wide override
(`SessionRecord.modelOverrides`) but not a per-agent ladder move, which is no override. With the pre-call read, every run of
a session whose configured model is excluded now runs on the candidate, so the mismatch shows on every such run, not only
after a failure in the run. Not repaired (outside the task that saw it).

**Amended 2026-10-03 (fin11's triage, before the repair).** Two consequences the note did not state:

- **The inspector cannot move the root back to the key it shows.** While the field names the excluded configured key, choosing
  that key there sends nothing: the inspector's handler drops a choice equal to its current value (`v !== currentModel` in
  `Inspector.tsx`) and the searchable select fires `onChange` only on a changed value (`searchable-select.tsx`'s `choose`).
  So the composer-chip note's "the key stays choosable from … the inspector" fails exactly in this case, which is why the two
  notes are repaired together.
- **Children moved by a fallback are drawn on their configured model too.** A child moved by a same-tier, unresponsive-model
  or REQ-ORCH-088 timeout fallback is projected with its configured `children.model_key`, its context limit included
  (`toAgentRecord` in `packages/engine/src/sessions.ts`). Recorded as a note of its own,
  [`a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md`](../a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md),
  since its repair reaches the per-child ladder cells, outside this repair's files.

The repair publishes the live root cell's key on the record and names it in the run-level agent's Model while the run is live;
the composer's chip and the strip's model item keep naming what the next run starts with (REQ-MONITOR-146, REQ-SHELL-043).

## Outcome — repaired 2026-10-03 (fin11)

- **The engine publishes the key the root runs on.** `Run.entryModelKey` (`packages/engine/src/run/run.ts`) is the key the
  root's ladder cell runs on. The cell carries the `models:` key its model was taken from (`AgentResilienceCell.key` in
  `packages/engine/src/run/ladder.ts`), set at every assignment: `RunConfig.modelKey` or the switched key when the cell is
  built, the override followed, the same-tier candidate's key, the key chosen during a wait, and null after a role's fallback.
  A carried configured key that is no loader-made copy is the answer; otherwise the configured key for the cell's pair where
  one names it (matched by provider and model, as the exclusions are), else the carried key or the catalogue entry the move
  took it to; null before the cell exists. Both `readSession`s in
  `packages/engine/src/sessions.ts` carry it as `SessionRecord.entryModelKey` (`packages/contracts/src/channels.ts`), null on
  a stored record.
- **A move republishes the record.** The move writes no row and saves nothing, so the record went unpublished until the call
  returned: the first proof run after the field landed still read `alpha` for the whole 8 s call. The ladder now tells the run
  at each `cell.model` assignment (`TurnResilience.moved` in `packages/engine/src/run/ladder.ts`), and the run republishes
  (`ProjectionOwner.refreshRecord`, coalesced at `RECORD_TICK`); `entryContext`'s limit is kept current by the same publish.
- **The run-level agent names it while its run is live.** `runLevelModel` in `packages/ui/src/agents.ts`, read by
  `runLevelAgent` — the inspector's Model field and the persona window's read-only model. `entryRole` is unchanged, so the
  composer's chip and the strip's model item still name what the next run starts with (REQ-MONITOR-146, REQ-SHELL-043).
- **Pinned** by `agents.test.ts` ("while the run is live the run-level agent names the key its root runs on; at rest, the
  entry role's") and four cases in `packages/engine/src/run/ladder.test.ts` (the record names b1 after a same-tier move; the
  record is republished when the root moves, so it names b1 while the call on b1 is in flight; a move onto a discovered entry
  is named by the configured key for its pair; and the pre-call case, the root resumed after its child met insufficient
  quota). Each fails without the repair. Three more pin the carried key (repair round 1): a root configured on the second of
  two keys for one pair (`a-fast`, `a-deep`) is named `a-deep` with no move; a wait choice of `b-deep` beside `b-fast` is named
  `b-deep`; a move onto a loader-made copy is named by the configured key for its pair.
- **Corrected in repair round 1 (2026-10-03).** The first form matched the pair alone — the first configured key for it — so
  a root running on the second of two keys naming one provider's model was published as the first, with no move at all, where
  origin/main had named the configured key (the verifier's case: `expected 'a-fast' to be 'a-deep'`). The pair match is now
  the fallback, after the key the cell carries.
- **Shown** by `resilience-proof`'s `next-run-choice` (`--only=next-run-choice --skip-build` after `pnpm build`, as root under
  Xvfb, Node 24, load 1.7 to 2.2): the inspector's Model trigger read `beta` during the held run on beta
  (`results.json` `nextRunChoice.inspectorValue`), the composer's chip and the strip `alpha`. The first two runs on this
  branch read `alpha` (no republish) and then `scripted-b/beta` (the discovered tier pick's key, before the configured key
  for the pair was preferred).
- **Not repaired here:** the inspector's reselect of the shown excluded key is the chip note's repair
  ([`the-composers-next-run-chip-cannot-choose-the-excluded-key-it-already-shows.md`](the-composers-next-run-chip-cannot-choose-the-excluded-key-it-already-shows.md));
  children moved by a fallback stay open in
  [`a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md`](../a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md).

## Specs

- REQ-MONITOR-066 — the model selector names the agent's current model "rather than showing a wrong or blank one".
- REQ-MONITOR-052 / REQ-MONITOR-069 — the inspector's field is the agent's model selector, the persona window's instance
  card its read-only model value: the agent's model, not the configuration's.
- REQ-MONITOR-049 — the run-level agent's context limit is already read from the model the root's cell calls; the model named
  beside it disagreed with it.
- REQ-MONITOR-194 — "A user may still choose an excluded pair explicitly, from any model selector": not from the inspector
  while it shows that pair.
- REQ-NOTIFY-082 — the move to the same-tier candidate is transparent ("without asking the user"); it does not say the
  surfaces keep naming the pair left behind.

## Relevant files

- `packages/ui/src/agents.ts` — `entryRole` and `modelInForce`: the run-level agent's model from the configured key and the
  overrides in force.
- `packages/ui/src/Inspector.tsx` — the Model field (`inspector-model`), whose value is the shown agent's `model`.
- `packages/engine/src/run/ladder.ts` — the same-tier move (`limitPath`), which changes the root's cell and no record field.
- `packages/ui/src/design-system/searchable-select.tsx` — `choose`: `onChange` only for a value other than the current one.
- `packages/engine/src/run/run.ts` — `rootCell` and `entryContext`, which already reads the cell's model (REQ-MONITOR-049).
