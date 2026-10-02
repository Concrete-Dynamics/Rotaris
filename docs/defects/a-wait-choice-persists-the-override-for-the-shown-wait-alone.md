## A wait choice persists the override for the shown wait alone

When more than one agent is parked on a provider limit, `Run.setEntryModel`'s wait branch overrides every waiting pair in
the session's memory (`for (const w of this.waits.all()) this.memory.setOverride(...)`) and resolves every wait with the
chosen model, but writes one `model_override` timeline entry, for the wait the surface shows (`waits.current()`). The
overrides of the other waiting pairs live in memory only: a later run of the same process keeps them, but a reload
(`ResilienceMemory.rehydrate`) and the autopsy reader do not see them, so after a restart an agent on one of those pairs
returns to it. Read from the code 2026-10-02 (fin8, ladder-overrides) while working in the same branch; no test or live
pack holds two waits on different pairs at once.

The same holds on the quota-wait retry path (REQ-MONITOR-194, since 2026-10-02): choosing the waiting pair itself clears its
exclusion and persists no override for it, but every other waiting pair is overridden to the chosen one in memory alone,
with no `model_override` entry at all. (Since the second round of
[a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](fixed/a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md)
the loops call `Run.overrideFor`, which persists a superseded override's taking-back as `cleared: true` for each pair; the
new override itself is still written for the shown wait alone.)

## Specs

- REQ-ORCH-091 (d): a manual model change "persists the override in session state for the rest of the session".
- REQ-SESSION-026 / REQ-SESSION-196: a mid-session model override persists across reloads of the session.

## Relevant files

- `packages/engine/src/run/run.ts` — `setEntryModel`'s wait branches (the change-model one and the quota retry): the loop
  over every wait (`overrideFor`), the one entry or none.
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.rehydrate`, which replays only what the timeline holds.
