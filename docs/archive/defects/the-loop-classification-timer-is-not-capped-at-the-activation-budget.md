## The loop-classification timer is not capped at what remains of the activation budget

`runtime.loop_classification_timeout` is accepted at any value above 0 (`packages/config/src/sections/runtime.ts`, the
`exclusiveMin: 0` read), the run host turns it into milliseconds (`apps/desktop/src/run-host/host.ts`, `timeoutMs`), and the
supervisor arms the classification timer from it as it stands (`packages/engine/src/run/supervisor.ts`,
`classifyWithinBound`). Nothing caps a call at what remains of REQ-NOTIFY-106's 2-second activation budget, so a workspace
that sets the key to 30 lets one classification hold the agent for 30 s.

Noticed 2026-10-07 by the R-072 consortium's ruling of OQ-232 (finding D6 of the `a68f121` duress run) and confirmed on
branch `fin32-child-reports-and-limits` by reading the three files; recorded, not repaired.

## Specs

- REQ-CONFIG-467: "The configured value is an upper bound only: a classification call is allowed no more than whatever
  remains of the activation budget of REQ-NOTIFY-106 when it is dispatched, so raising this key can never lengthen a call past
  that budget."
- REQ-NOTIFY-100 ("never more than what remains of the activation budget of REQ-NOTIFY-106") and REQ-NOTIFY-106 (2 seconds
  end to end).

## Relevant files

- `packages/config/src/sections/runtime.ts` — the key's read, with no upper bound.
- `apps/desktop/src/run-host/host.ts` — `timeoutMs`, handed to the supervisor and the classifier's model call uncapped.
- `packages/engine/src/run/supervisor.ts` — `classifyWithinBound`, the timer armed from the configured value.

## Outcome

Repaired 2026-10-13 (fin35, branch `fin35-notes-and-optionals`). `packages/engine/src/run/supervisor.ts` exports
`LOOP_ACTIVATION_BUDGET_MS` (2,000 ms, REQ-NOTIFY-106), and `classifyWithinBound` arms its timer at the smaller of the
configured `classificationTimeoutMs` and that budget, so the key stays an upper bound only (REQ-CONFIG-467). The
activation is taken in `check()` at the turn's step boundary (ADR-0059 decision 4; consequence 1 already accepts that a tool
running when the trigger fired is not interrupted) and the call is dispatched in the same synchronous stretch, so what remains
of the budget at dispatch is the whole of it. `apps/desktop/src/run-host/host.ts` caps the classifier's model-request timeout
(`modelTimeoutMs`) at the same figure. The key's read in `packages/config/src/sections/runtime.ts` is unchanged: a value
above 2 is still a valid configuration, as REQ-CONFIG-467 lets it be.

Pinned by two cases in `packages/engine/src/run/supervisor.test.ts` — "caps the classification at what remains of the
activation budget, whatever the configured bound" (a 30,000 ms bound aborted at 2,000 ms; red before the change, the
classifier never aborted) and "keeps a configured bound below the budget as the bound" (500 ms) — and by
`pnpm part-h-proof`'s `raw-count-long-bound` launch: `loop_classification_timeout: 30`, the classifier held, one `raw-count`
activation inside the 12 s capture window. On the build before the change the proof failed with "raw-count-long-bound:
expected 1 loop_supervisor_activation entries, found 0"; after it, green (load 3.2 to 3.4 on 4 CPUs for the green run, up to 8.4 for the red one; neither
reading turns on timing, since the uncapped bound is 30 s against a 12 s window).

**Corrected 2026-10-13 by fin35's review, the first repair's reason kept above.** The paragraph above read the budget from the
activation `check()` takes and concluded that the whole of it remains at dispatch. That is false of the code: REQ-NOTIFY-106
counts the budget from "a session's recent activity satisfying the criteria", and the turn (`run/turn.ts`) observes a tool call
**before** it dispatches it, so the triggering call itself and the rest of its step run inside the budget before the next
`check()`; a 30 s terminal call that armed the trigger left nothing of it, yet the classifier was still given 2 s. The supervisor
now notes, on the monotonic clock, when `observe` or `observeStuck` armed the pending trigger (`LoopSupervisor` and
`SupervisorRegistry` take `Pick<Clocks, 'timers' | 'monotonic'>`, `sessions.ts` passes the run's clocks), and
`classifyWithinBound` bounds the call by the smaller of the key and what remains; with nothing left it dispatches no call — a
failed classification (REQ-NOTIFY-106's "rather than a missed budget", REQ-NOTIFY-109) — and the fallback decides, so no metered
request is sent only to be cut. The run host still hands the model request the 2 s ceiling. Pinned by three further cases in
`supervisor.test.ts` — "allows the classification only what remains of the budget after the triggering step ran" (1.5 s spent,
cut 0.5 s after dispatch), "dispatches no classification once the budget is spent before the step boundary" and "counts a later
activation from its own trigger, not the first one" — all three red on the first repair.
