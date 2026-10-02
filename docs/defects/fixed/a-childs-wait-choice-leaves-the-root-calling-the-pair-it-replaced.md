## A child's wait choice leaves the root calling the pair it replaced

When a child waits on an exhausted pair and the user resolves the wait with "change model now", the run persists the
override for the session (`setEntryModel`'s wait branch: `memory.setOverride` for every waiting pair, then a
`model_override` timeline entry that says "it stands for the rest of the session"). Children spawned afterwards resolve
their model through it (`forChild` calls `memory.effective`). The root does not. Its cell is built through the
overrides only when `rootResilience` rebuilds it (a switch onto another model, or a new run), so a root already running
on the replaced pair keeps calling it. The ladder never consults the overrides on a call (`ladder.ts` reads only
`markExhausted`, `isExhausted` and `exhausted`).

Observed with a probe in `packages/engine/src/run/ladder.test.ts`'s harness, not committed. The catalogue held `a1`
(tier `small_model`) and `c1` (no tier). The root on `a1` delegated in the background. The child's first call on `a1`
failed with insufficient quota, and with no same-tier candidate it waited on `a/a1`. The user chose `c1` there, which
recorded `model_override {provider: a, model: a1, model_key: c1, supersedes: false}`. The requests then went:
child `c1`, child `c1`, summariser `a1`, root `a1`. The root and the summariser called the pair the session had just
recorded as exhausted (`model_exhausted`) and replaced. The scripted client answered them. A real provider would refuse
again, sending the root up the ladder or into a wait of its own on the same pair.

The autopsy reader (`entryModelKeys`) reads such an override as moving the root at once ("an override of the root's own
pair moves it", in `apps/desktop/scripts/lib/autopsy-entry-model.test.ts`). That reading matches the documented intent,
not this behaviour. So over this store the reader prints the root on `c1` while it ran on `a1`. Repairing the run makes
the reader right. Changing the reader to match the run would encode the defect.

Recorded 2026-10-02 (fin5, harness-readers, repair round 3). It was found while weighing the residual of
[the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md](the-autopsy-reader-can-print-a-switched-key-a-childs-wait-choice-overrode-before-the-root-ran-on-it.md),
and it is not repaired. Whether the root's live cell should follow a child's wait choice at once, or at its next turn,
is the requirement's to say, not this note's.

## Outcome — repaired 2026-10-02 (fin8, ladder-overrides, task 1)

Read as the requirements decide it: REQ-ORCH-091 (d) persists the override "in session state for the rest of the
session", and REQ-MONITOR-194 says the replaced pair is "neither retried automatically" for the rest of the session, so no
agent's next call goes to it. The root resumes after its children inside the same turn, so moving it at its next turn
(`rootResilience`, `rebuildEntryFromMemory`) would not have repaired the probe; the instant is the next call.

- `packages/engine/src/run/ladder.ts`: `followOverride`, called before every call of `resilientStep`, moves the cell to
  `ResilienceMemory.effective(cell.model)` when the session holds an override for the pair it is on, and adds the pair it
  leaves to the cell's attempted pairs (so REQ-ORCH-091 b never offers it back). Every agent follows it: the root, a child
  built before the choice, and a child on the pair whichever agent waited. No new record: the `model_override` entry
  already says the pair is replaced, and the autopsy reader reads it as moving the root at once, which is now what runs.
- `packages/engine/src/children/report.ts` / `run.ts`: the summariser has no ladder, so its model is carried through the
  same overrides at each attempt (`SummariserDeps.resolve`, `Run.summariserDeps`).
- The rule follows any override reaching the pair, not only one whose pair is recorded exhausted (the triage's narrower
  trigger): a rate-limit wait's choice is persisted by the same REQ-ORCH-091 (d), its row says "the run resumes on it now
  and keeps it for the rest of the session", and the children and a rebuilt root already resolved every override
  whatever the wait's cause. The authentication pin (REQ-NOTIFY-070) is set only after its run has ended, and OQ-182's
  pair-keyed reading already moves every agent on the pair, so the rule is consistent with it.

Pinned by the note's probe, made permanent in `packages/engine/src/run/ladder.test.ts` ("a child's wait choice moves the
root and the summariser off the replaced pair from their next call"): red before, with exactly the probe's
`child c1, child c1, summariser a1, root a1`; each half of the repair alone leaves its own agent red (the root on `a1`
without `followOverride`, the summariser on `a1` without `resolve`). Recorded in
[ADR-0027](../../architecture/adr/0027-the-model-client-implementation.md), "Seventh execution".

**Second round, 2026-10-02 (the verifier's finding).** Following the overrides from every call exposed a shape the first
round left: two wait choices that go back. a1 runs out of quota and the user chooses c1 (`a1 → c1`); later c1 runs out
and the user chooses a1 (`c1 → a1`, which since the repair of
[an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md](an-explicit-choice-of-an-exhausted-pair-does-not-clear-its-exclusion.md)
also clears a1's exclusion). The memory then held the cycle `a1 → c1 → a1`, and `ResilienceMemory.follow`, bounded at
eight hops with no cycle detection, ended on c1 for an agent on c1: after the second choice the requests were child `a1`,
child `a1`, summariser `a1`, **root `c1`** — the pair just recorded out of quota and replaced. Repaired at the memory:

- `ResilienceMemory.supersededBy` names the override a choice supersedes — the chosen pair's own, when its chain leads back
  to the pair the choice replaces — and `Run.overrideFor` (both wait branches of `setEntryModel`) takes it back before
  setting the new one, in the memory and as a `model_override` entry carrying `cleared: true` and `cause: 'superseded'`
  (fin6's shape for a taken-back pin; for a child's choice it carries the choice's `switch_pending`, so the autopsy reader
  orders the two alike). `rehydrate` replays it, so a reload holds `c1 → a1` alone.
- `follow` is cycle-safe for a store that already holds a cycle (written before this round): it ends on the target of the
  newest override in the cycle (the memory keeps its overrides in the order last set). Both autopsy readers follow the
  same rule, and the script's copy now reads a `cleared: true` entry as the engine's does (the repair of
  [the-scripts-autopsy-reader-ignores-a-taken-back-pin.md](the-scripts-autopsy-reader-ignores-a-taken-back-pin.md), which
  this round needed for the two copies to agree).

Pinned in `packages/engine/src/run/ladder.test.ts` ("a wait choice back onto a pair an earlier choice replaced takes that
override back, so no agent returns to the pair just replaced"): red before with exactly `child a1, child a1, summariser a1,
root c1`; in `resilience.test.ts` (`supersededBy` — removed in the third round — and a cycle ending on the newest target, red before for an agent on y);
and in the readers' parity table (a pin taken back; a superseded override; a cycle), two rows red in the script's copy before.

**Third round, 2026-10-02 (the verifier's repair-round-2 finding).** The second round took back only an override whose
chain led back to the waiting pair, which treated the cycle and not its cause: the user's newest explicit choice of a pair
did not supersede an older override from that pair. With `a1 → c1` standing, a later wait on f1 (an entry switch had moved
the root there) resolved with a1 cleared a1's exclusion and set `f1 → a1`, but the root followed `a1 → c1` before its first
call: root requests `a1, c1, f1, c1`, while the row said "Model changed to a1 during the wait; the run resumes on it now".
The quota-retry path had the same shape: a child's wait resolved with c1 while the root's call on a1 was in flight, the root
then waited on a1 and the user chose a1 itself, and the retry followed `a1 → c1` although the row said "the call is retried
on it now". The second round's reason is kept above; its replacement:

- `Run.takeBackOverrideOf` (both wait branches of `setEntryModel`) takes back ANY override from the pair chosen in a wait —
  the change-model choice's pair, or the waiting pair itself on the quota-retry path — before the new overrides are set,
  persisted as before (`model_override`, `cleared: true`, `cause: 'superseded'`, the child's `switch_pending`). With the
  chosen pair's own override gone, the new one can never lead back to it, so no choice writes a cycle;
  `ResilienceMemory.supersededBy` is removed, and `follow` still ends a cycle an older store holds on its newest target.
- An agent whose cell had already followed the override stays on its target (`followOverride` moves a cell; nothing moves
  it back). The entry records where the root's cell is (`root_cell`: `followed`, `on_pair` or `elsewhere`), and both autopsy
  readers read it: a root that had followed stays on the target, as after a ladder move; a root still on the pair never ran
  on the target, so the key printed for the override is taken back.

Pinned in `packages/engine/src/run/ladder.test.ts` ("a wait choice of a pair an earlier choice replaced takes that override
back, and the agent resumes on the pair chosen": red before with root `a1, c1, f1, c1`; "choosing the waiting pair itself
takes back the override an earlier choice set for it, and the call is retried on it": red before with root
`a1, a1, c1, c1`), and in the readers' parity table (`apps/desktop/scripts/lib/autopsy-entry-model.test.ts`: two rows, red
in both copies before with `root-model` printed again at the end).

**Fourth round, 2026-10-02 (the verifier's repair-round-3 finding).** The third round's claim that "both autopsy readers
read it, so they stay in step with the run" was false for a root on an intermediate pair of the chain. `takeBackOverrideOf`
recorded `followed` only when the root's cell was the chain's END (`memory.effective` of the chosen pair), though its own
comment defined `followed` as "on the override's target". A root that had followed `a1 → c1` and was still on c1 when
`c1 → f1` was added sat on the taken-back override's own target and moved on to f1 at its next call (`followOverride`), yet
the entry recorded `elsewhere`: both readers deleted `a1 → c1`, walked from the configured a1 and ended on `a1`
(`a1, c1, f1, a1`) while the root called f1. The third round's reason is kept above; its replacement: `followed` is recorded
when the root's cell is any pair of the chain from the taken-back override's own target on (`Run.onChainFrom`, which walks
`memory.overrideFor` from it, bounded by the pairs passed). The readers needed no change: on `followed` they already set
the root to the chain's end, which is where the run's root goes from any pair of the chain. Pinned in
`packages/engine/src/run/ladder.test.ts` ("a take-back while the root is on an intermediate pair of the override's chain
records it followed, and the reader ends where the root runs": the verifier's probe, red before with `root_cell:
'elsewhere'` and `entryModelKeys` ending `a1, c1, f1, a1`; after, root `a1, a1, c1, f1, …` and the reader `a1, c1, f1`),
and by a row of the readers' parity table for an intermediate root recorded `followed`.

## Specs

- REQ-ORCH-091 (a) and (d): exhausted models are "remembered session-wide and excluded from candidates", and a manual
  change "persists the override in session state for the rest of the session". The root and the summariser go on
  calling the replaced pair in the same session.
- REQ-MONITOR-194: a pair recorded out of quota is "neither retried automatically" for the rest of the session. The
  root's next call on it is automatic. It is not a retry of the failed call, so this reading is arguable and the note
  names it rather than ruling it.

## Relevant files

- `packages/engine/src/run/run.ts`: `setEntryModel` (the wait branch writes the override); `rootResilience` (consults
  `memory.effective` only on a rebuild); the `forChild` resilience (consults it for every child).
- `packages/engine/src/run/ladder.ts`: the per-call ladder, which never reads the overrides.
- `packages/engine/src/run/resilience.ts`: `ResilienceMemory.effective` and `setOverride`.
- `packages/engine/src/autopsy.ts` and `apps/desktop/scripts/lib/autopsy-entry-model.mjs`: `entryModelKeys`, which reads
  the intended behaviour.
