## An agent calls a pair the session recorded out of quota when no override replaces it

REQ-MONITOR-194 says a pair recorded out of quota is, for the rest of the session, "neither retried automatically nor
offered as an automatic fallback candidate". The ladder excludes it from the same-tier candidates (`sameTierCandidates`
reads `ResilienceMemory.exhausted`) but never consults the exclusion before a call: an agent whose cell is on the pair calls
it again, and only the provider's next insufficient-quota answer sends it to the same-tier rule or a wait. Two cases reach
it. Another agent of the run on the same pair: in `ladder.test.ts`'s harness a root on `a1` delegated, its child's call on
`a1` failed on quota (`model_exhausted {a, a1}`), and the root's next call still went to `a1` before any choice was made.
And a later run of the session: the memory is rehydrated, but the new root's cell is built on the configured pair, so its
first call goes to the excluded pair. The scripted client answered those calls; a real provider would refuse them, so the
agent waits on a pair the session already knew to be out of quota. Noticed 2026-10-02 (fin8, ladder-overrides) while
repairing [a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md](a-childs-wait-choice-leaves-the-root-calling-the-pair-it-replaced.md),
which covers the case where an override replaces the pair; not repaired. Whether a call on an excluded pair the user never
replaced counts as an automatic retry (the call is not a repetition of the failed one) is arguable, as that note's Specs
section says of its own case.

## Outcome — repaired 2026-10-02 (fin10, quota-exclusions-and-choices, task 1)

The note's "arguable" is answered by the specification, not by a ruling: REQ-MONITOR-194 says the exclusion "survives a
resume of the same session", and a resume makes new calls, never a retry of the failed one, so the clause bites only if it
covers every later automatic call of the pair; spec resolution 21 (`docs/spec/resolutions/02-run-monitoring-steering.md`)
says the exclusion governs "automatic retry and automatic fallback candidacy". What the agent does instead is
REQ-ORCH-091's own order, (b) then (c).

- `packages/engine/src/run/ladder.ts`: `resilientStep` reads the exclusion before every call, after `followOverride`. A cell
  on a pair the session holds out of quota is not called: it takes `limitPath`, the path an insufficient-quota answer takes —
  its one same-tier fallback if its budget allows (REQ-ORCH-091 b; the `quota_fallback_model` entry and `quota_fallback`
  issue carry `pre_call: true`), else the suspended wait that never auto-resumes (c; the `model_wait` issue carries
  `pre_call: true`, the header the exhausted variant) — and writes no second `model_exhausted`. A wait cancelled or released
  on it ends the step on `excludedReport`, the exclusion standing in for the provider's answer. The two paths share one
  function, so the after-a-call path is unchanged.
- An explicit choice of the pair clears the exclusion before the ladder sees it (`Run.clearChosenExclusion`: the switch and
  both wait branches), so the pre-call wait cannot loop. As built "Keep waiting" sends nothing, so such a wait ends only by a
  choice of model or a cancel; a later repair that makes keep waiting a retry must count that retry as an explicit choice of
  the pair, or the pre-call check sends each later call back into the wait — said in
  [keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md](keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md).
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-MONITOR-194 / REQ-ORCH-091 (a)-(c): no automatic call reaches a
  pair the session recorded out of quota"): a root resumed after its child's quota answer on `a1` moves to `b1` before
  calling (red before: `root a1`); a continuation of a session whose configured `a1` is excluded, with no candidate, waits
  without calling `a1` and never auto-resumes (red before: `a1, a1`); with a candidate it moves before its first call, in this
  process and in a fresh one (red before: `a1, b1, a1`). The existing switch-pending case now also records the child's
  pre-call move (the child is built on the configured `a1` the root's quota answer excluded).
- Shown in the built app by `resilience-proof`'s `same-tier` scenario, extended with a second prompt in a relaunch that resumes
  the session (`same-tier-resume`): the continuation's calls `scripted/beta` alone, a second `quota_fallback_model` carrying
  `pre_call: true`, one `model_exhausted`; red on a build of the code before (`scripted/alpha` called), green after.

- **Repair round 1 (2026-10-03), the compression pass.** As first built the pre-call read sat inside `resilientStep` alone,
  and the turn's automatic compression check runs before the ladder is called, so an agent resumed on a pair another agent had
  just excluded compressed on that pair, at its threshold, and only then moved (the verifier reproduced it: a root on `a1`
  after its child's quota answer on `a1` compressed on `a1` at `a1`'s 100-token trigger, where `b1`'s would not have
  triggered). This note first called that "outside this note"; it is not — REQ-MONITOR-194 forbids the call and
  REQ-MONITOR-080 names the model the agent is itself using, which after the move is `b1`. The settle is now its own function,
  `settleBeforeCall` in `packages/engine/src/run/ladder.ts` (`followOverride`, then the exclusion's `limitPath`), and
  `runTurn` (`packages/engine/src/run/turn.ts`) calls it before the compression check as well as `resilientStep` before every
  call; a cell with nothing to settle takes the synchronous `onExcludedPair` and no extra await. A pass that would still call
  the agent's own excluded pair — a manual pass while the agent awaits a tool or a child, before its next call moves it — is
  withheld (`TurnCompression.withheld`, answered by `Run.compressionFor`): it makes no call and fails with the reason, which
  the manual arm reports per agent. A configured `compressor.model` is a configured slot and is still called as configured
  ([OQ-189](../../architecture/open-questions.md), whose sentence claiming this was closed is corrected in place). Pinned in
  `ladder.test.ts` ("REQ-MONITOR-078/080: compression follows the model the agent's cell is on"): a root that steps again
  after its child excluded `a1` makes no pass and calls `b1` (red before: compressor `a1`); with no candidate the root waits
  before its check and compresses on the model chosen at that model's trigger (red before: `a1`); a manual pass while the
  root sits on the excluded `a1` calls nothing and names the reason (red before: compressor `a1`). Shown by
  `compression-proof`'s `excluded-before-pass` scenario, red on a build of the code before and green after.

Not covered, and outside this note: the intent classifier, the analyst and the summariser make model calls outside the
ladder, so they read no exclusion (recorded by task 2 of the same bundle, OQ-189).

## Specs

- REQ-MONITOR-194: "neither retried automatically" for the rest of the session, surviving a resume.
- REQ-ORCH-091 (a): exhausted models are "remembered session-wide and excluded from candidates".

## Relevant files

- `packages/engine/src/run/ladder.ts` — `resilientStep`: the exclusion read only after a failed call.
- `packages/engine/src/run/run.ts` — `rootResilience` and the `forChild` cell: built on the configured or the agent's own
  pair, through the overrides only.
