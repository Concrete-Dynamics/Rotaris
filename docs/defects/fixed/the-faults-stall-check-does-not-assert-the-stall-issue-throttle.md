## The live run's `faults-stall` check does not assert the stall issue's throttle

The `faults-stall` scenario of `apps/desktop/scripts/live-run.mjs` holds the entry agent's second model call silent for
300 s and reads the session's `issues`. Its check of the entry agent's stall watch filters the `stall` issues by their
message (`agent appears stalled: no model event or token for N seconds`) and asserts only that at least one exists
(`rootStall.length > 0`). Since [`PD-MONITOR-005`](../../product/directives.md#pd-monitor-005) revision 2 (OQ-127's ruling,
2026-10-06) the issue is written only with its warning: at stall entry, then no more often than REQ-MONITOR-120's throttle
(the stall timeout, or 30 s, whichever is longer). Before that revision the build wrote one issue at every evaluation
(REQ-MONITOR-117's cadence, 5 s at the default 90 s threshold), and the check passed that too: a regression to an issue per
evaluation would leave the scenario green.

Known finding (3) of the final acceptance's brief (finacc3), acceptance finding F14, on `760394c`
(`live-run.mjs:1792-1793`). Noticed by the verifiers of the repair plan that built revision 2 (fin20/fin21), whose first
execution says the scenario "should now leave one `stall` issue at 90 s before the 120 s idle bound, where it left one per
evaluation" and that no live run measured it.

## Specs

- [`PD-MONITOR-005`](../../product/directives.md#pd-monitor-005) revision 2, "The `stall` issue": emitted only when the
  evaluation also writes the warning, at entry and then no more often than REQ-MONITOR-120 lets the warning repeat.
- REQ-MONITOR-119 (narrowed by the directive) and REQ-MONITOR-120 (the throttle). The product is not contradicted; the
  proof that should show the product meets the directive cannot fail when it does not.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `faults-stall` scenario's `rootStall` check (lines 1786-1793 at `760394c`).
- `packages/engine/src/children/stall.ts` — `StallWatch.evaluate` and `stallRepeat`, the throttle the check should read;
  `stallRecords`, which writes the warning and the issue together.

## Outcome

Repaired 2026-10-06 (finacc3, bundle `finacc3-accept1-2`). `apps/desktop/scripts/lib/stall-issue-cadence.mjs`
(`stallIssueCadence`) reads a session's `stall` issues a stall at a time: an issue's `recorded_at` less the silence it
states (its metadata's `silent_seconds`) is the silence's start, which no event moves while the stall lasts, so issues of
one agent with one start are one stall, and each repeat in it must come no sooner than REQ-MONITOR-120's throttle after the
one before it (the threshold, or 30 s, whichever is longer; the threshold is read from the entry's silence less 6 s, since
the live run does not know the entry persona's `stall_timeout`). The `faults-stall` scenario now also checks that no repeat
came sooner (`readIssues` reads `recorded_at` and `metadata` too, and the pack's issues carry `recordedAt`).
`lib/stall-issue-cadence.test.ts` pins it: one issue at 90 s passes, and an issue at every 5 s evaluation from 90 s to
120 s, the shape before revision 2, fails six times. `AGENTS.md`'s `faults` row names the check.
