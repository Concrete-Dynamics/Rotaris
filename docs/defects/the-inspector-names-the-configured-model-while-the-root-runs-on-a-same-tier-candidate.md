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
  [`a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md`](a-child-moved-by-a-fallback-is-drawn-on-its-configured-model.md),
  since its repair reaches the per-child ladder cells, outside this repair's files.

The repair publishes the live root cell's key on the record and names it in the run-level agent's Model while the run is live;
the composer's chip and the strip's model item keep naming what the next run starts with (REQ-MONITOR-146, REQ-SHELL-043).

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
