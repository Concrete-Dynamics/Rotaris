# ADR-0027 — The AI SDK sits behind `ModelClient`, for the request and stream step only — Ninth execution — 2026-10-02, the exclusion read before every call (REQ-MONITOR-194, REQ-ORCH-091 a-c)

Part 14 of 18 of [ADR-0027](../0027-the-model-client-implementation.md), which indexes every part.

## Ninth execution — 2026-10-02, the exclusion read before every call (REQ-MONITOR-194, REQ-ORCH-091 a-c)

*The repair of [`an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.md`](../../../defects/fixed/an-agent-calls-a-pair-the-session-recorded-out-of-quota-when-no-override-replaces-it.md)
(fin10). Found a defect in the third execution's mechanism.*

The third execution's memory said a continuation "never returns to an exhausted model"; the ladder read the exclusion only
after a failed call (`markExhausted` then `isExhausted`), so that held of the same-tier candidates and not of the pair an
agent's cell was on. A root on `a1` resumed after its child's quota answer on `a1`, and every later run whose configured
model was `a1` (the memory rehydrated, the cell built on the configured pair), called `a1`, and only the provider's next
quota answer moved it. That reason is kept here beside its replacement: `resilientStep` now reads the exclusion before every
call, after `followOverride`, and a cell on an excluded pair takes `limitPath` without calling — the one same-tier fallback
its budget allows, else the wait that never auto-resumes — recording `pre_call: true` on the move or the wait issue and no
second `model_exhausted`. An explicit choice clears the exclusion before the ladder reads it (the eighth execution), so the
choice is called and the wait cannot loop. Measured in `packages/engine/src/run/ladder.test.ts` (red before: `root a1`
after the child's exclusion; `a1, b1, a1` and `a1, a1` for a continuation) and by `resilience-proof`'s `same-tier` scenario
with a second prompt (red before: `scripted/alpha`; after: `scripted/beta` alone). Keep waiting, which sends nothing, is
OQ-188's; a retry it might become must count as an explicit choice of the pair.

**Corrected at the bundle's first repair round, 2026-10-03.** "`resilientStep` now reads the exclusion before every call"
held of the ladder's calls and not of the turn's compression check, which `runTurn` makes before it calls the ladder: an
agent resumed on a pair another agent had just excluded compressed on that pair, at that pair's threshold, and only then
moved (the verifier's reproduction in `ladder.test.ts`). That reason is kept here beside its replacement: the settle is its
own function, `settleBeforeCall` (`followOverride`, then the exclusion's `limitPath`), which `runTurn` calls before the
compression check and `resilientStep` before every call (a cell with nothing to settle takes the synchronous
`onExcludedPair`, so its step is scheduled as before); ADR-0060's note carries the compression half. Measured in
`ladder.test.ts` (three cases, red before: the compressor called `a1`) and by `compression-proof`'s `excluded-before-pass`
scenario (red before: a pass at alpha's 600-token trigger; after: the root moved to beta, `pre_call: true`, and no pass).
