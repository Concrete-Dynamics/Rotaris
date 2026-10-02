## A wait choice persists the override for the shown wait alone

When more than one agent is parked on a provider limit, `Run.setEntryModel`'s wait branch overrides every waiting pair in
the session's memory (`for (const w of this.waits.all()) this.memory.setOverride(...)`) and resolves every wait with the
chosen model, but writes one `model_override` timeline entry, for the wait the surface shows (`waits.current()`). The
overrides of the other waiting pairs live in memory only: a later run of the same process keeps them, but a reload
(`ResilienceMemory.rehydrate`) and the autopsy reader do not see them, so after a restart an agent on one of those pairs
returns to it. Read from the code 2026-10-02 (fin8, ladder-overrides) while working in the same branch; no test or live
pack holds two waits on different pairs at once.

## Specs

- REQ-ORCH-091 (d): a manual model change "persists the override in session state for the rest of the session".
- REQ-SESSION-026 / REQ-SESSION-196: a mid-session model override persists across reloads of the session.

## Relevant files

- `packages/engine/src/run/run.ts` — `setEntryModel`'s wait branch: the memory loop over every wait, the one entry.
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.rehydrate`, which replays only what the timeline holds.
