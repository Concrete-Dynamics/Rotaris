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
[a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md)
the shown wait's chosen pair has an older override taken back (`Run.takeBackOverrideOf`, persisted as a `model_override`
entry carrying `cleared: true`), but the new override itself is still written for the shown wait alone.)

*Amended 2026-10-02 (fin10, the sixth triage):* this note first said the loops call `Run.overrideFor`, which does not exist.
On `origin/main` 97e1de4 the two loops of `setEntryModel`'s wait branches in `packages/engine/src/run/run.ts` call
`this.memory.setOverride` directly for every `waits.all()` entry — the change-model branch's, then one `model_override` entry
for `waits.current()` alone; the quota-retry branch's, then no `model_override` entry at all — and the taking-back of an
older override goes through `takeBackOverrideOf`, for the chosen pair only.

## Outcome — repaired 2026-10-02 (fin10, quota-exclusions-and-choices, task 1)

- `packages/engine/src/run/run.ts`: both wait branches of `setEntryModel` call `Run.overrideWaitingPairs`, which overrides
  every waiting pair but the one chosen — in the memory and as a `model_override` entry of its own (the pair, the chosen key,
  `to_provider`/`to_model`, and the placement of that wait's own agent: `supersedes` for the root's, `switch_pending` for a
  child's) — so `ResilienceMemory.rehydrate` and both autopsy readers replay every override the run holds. A root parked in a
  wait that is not the one shown takes the choice as its entry model, as when its own wait is shown, so its entry's
  `supersedes` and the run agree. A wait on the chosen pair itself is retried with no override (no entry onto itself).
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-ORCH-091 (d) / REQ-SESSION-026: a choice that resolves several
  waits persists the override of every waiting pair", with a new harness shape: the root on `a1` and a child of a role
  configured on `b1` parked at once): a choice of `c1` in the child's wait writes two entries, the rehydrated memory sends
  both `a1` and `b1` to `c1`, a fresh process's continuation runs on `c1`, and the autopsy reader reads the root `a1, c1` (red
  before: one entry, `b1 → c1`); `a1` chosen in its own wait persists `b1 → a1` (red before: no entry).
- Shown in the built app by `resilience-proof`'s new driven `two-waits` launch: the root on alpha and a child configured on
  beta both refused on quota, gamma chosen in the shown wait (the child's), two `model_override` entries
  (`scripted/alpha → gamma`, `scripted-b/beta → gamma`); a relaunch that resumes the session and delegates again calls gamma
  for the root and the new child, and the composer's chip reads gamma. Red on a build of the code before (one entry,
  `scripted-b/beta` alone), green after.

## Specs

- REQ-ORCH-091 (d): a manual model change "persists the override in session state for the rest of the session".
- REQ-SESSION-026 / REQ-SESSION-196: a mid-session model override persists across reloads of the session.

## Relevant files

- `packages/engine/src/run/run.ts` — `setEntryModel`'s wait branches (the change-model one and the quota retry): the loop
  over every wait (`this.memory.setOverride`), the one entry or none.
- `packages/engine/src/run/resilience.ts` — `ResilienceMemory.rehydrate`, which replays only what the timeline holds.
