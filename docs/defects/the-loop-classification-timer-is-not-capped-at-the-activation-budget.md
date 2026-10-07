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
