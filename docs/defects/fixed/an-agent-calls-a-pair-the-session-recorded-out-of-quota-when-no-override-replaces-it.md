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
  [keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md](../keep-waiting-on-the-quota-wait-header-sends-nothing-where-it-should-resolve-the-wait-as-a-retry.md).
- Pinned in `packages/engine/src/run/ladder.test.ts` ("REQ-MONITOR-194 / REQ-ORCH-091 (a)-(c): no automatic call reaches a
  pair the session recorded out of quota"): a root resumed after its child's quota answer on `a1` moves to `b1` before
  calling (red before: `root a1`); a continuation of a session whose configured `a1` is excluded, with no candidate, waits
  without calling `a1` and never auto-resumes (red before: `a1, a1`); with a candidate it moves before its first call, in this
  process and in a fresh one (red before: `a1, b1, a1`). The existing switch-pending case now also records the child's
  pre-call move (the child is built on the configured `a1` the root's quota answer excluded).
- Shown in the built app by `resilience-proof`'s `same-tier` scenario, extended with a second prompt in a relaunch that resumes
  the session (`same-tier-resume`): the continuation's calls `scripted/beta` alone, a second `quota_fallback_model` carrying
  `pre_call: true`, one `model_exhausted`; red on a build of the code before (`scripted/alpha` called), green after.

Not covered, and outside this note: the intent classifier, the analyst and the summariser make model calls outside the
ladder, so they read no exclusion (recorded by task 2 of the same bundle); and a compression pass due before the cell's
first step on an excluded pair is made before the ladder moves the cell.

## Specs

- REQ-MONITOR-194: "neither retried automatically" for the rest of the session, surviving a resume.
- REQ-ORCH-091 (a): exhausted models are "remembered session-wide and excluded from candidates".

## Relevant files

- `packages/engine/src/run/ladder.ts` — `resilientStep`: the exclusion read only after a failed call.
- `packages/engine/src/run/run.ts` — `rootResilience` and the `forChild` cell: built on the configured or the agent's own
  pair, through the overrides only.
