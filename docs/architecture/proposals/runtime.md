# RUNTIME slice — architecture proposals

Status: **proposal**. Nothing here is approved. Numbering is provisional (`ADR-RUNTIME-NN`); the
synthesis step assigns final numbers.

## Parts

Since 2026-10-26 the rest of this document is in [`runtime/`](runtime/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](runtime/01-scope.md) | Scope |
| [02](runtime/02-part-1-extracted-constraints.md) | Part 1 — Extracted constraints; C1. Where a run may execute, and how long it lives; C2. Cross-process observation and control; C3. Durable state: format, atomicity, ordering; C4. The event journal; C5. Projections and the live update transport |
| [03](runtime/03-c6-child-scheduling-and-the-child-state-machine.md) | C6. Child scheduling and the child state machine; C7. Cancellation, shutdown, and unclean exit; C8. Lifecycle hooks; C9. Time, clocks and budgets; C10. Parallel runs, isolation, and routing; C11. Failure containment (the run's blast-radius rules) |
| [04](runtime/04-part-2-adr-proposals.md) | Part 2 — ADR proposals; ADR-RUNTIME-01 — Where the run engine executes; ADR-RUNTIME-02 — The run/UI boundary: one control channel, two distinct update channels; ADR-RUNTIME-03 — Durable store: files as the source of truth; no database in this slice; ADR-RUNTIME-04 — One ordered session writer per session; ADR-RUNTIME-05 — Following a session the current process does not own |
| [05](runtime/05-adr-runtime-06-the-delegated-child-scheduler-an.md) | ADR-RUNTIME-06 — The delegated-child scheduler: an explicit ledger, not a promise graph; ADR-RUNTIME-07 — Resume, locking and recovery: the lock as the single capability token; ADR-RUNTIME-08 — Hook invocation: per-occurrence sequential, cross-occurrence concurrent, resolved on exit rather than close; ADR-RUNTIME-09 — Two clock ports and a budget primitive; no bare timers in engine code; ADR-RUNTIME-10 — Cancellation and shutdown: one sticky stop request, one ordered teardown, one shared deadline; ADR-RUNTIME-11 — The run registry: runs are addressed by session id; focus is a UI concept |
| [06](runtime/06-part-3-candidate-stack-assessed-against-this.md) | Part 3 — Candidate stack, assessed against this slice only; What the `LLM` port must provide, for this slice to be implementable |
| [07](runtime/07-part-4-escalations.md) | Part 4 — Escalations |
| [08](runtime/08-part-5-open-questions-specification-genuinely.md) | Part 5 — Open questions (specification genuinely silent) |
| [09](runtime/09-part-6-reconciliations-recorded-apparent.md) | Part 6 — Reconciliations recorded (apparent conflicts that are not) |
| [10](runtime/10-part-7-summary-of-what-these-proposals-commit-to.md) | Part 7 — Summary of what these proposals commit to |
