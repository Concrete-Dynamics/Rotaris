## slice-proof keeps no spike 6 figures

`apps/desktop/scripts/slice-proof.mjs`, scenario 4, runs spike 6's live harness
(`packages/model/src/ai-sdk-live.spike.test.ts`) and keeps "only the harness's figures": the `[spike6]` lines the
harness prints with `console.log` (the streamed deltas, the first-delta time, the provider's usage, the bad-key status,
the abort) for `docs/architecture/spikes/responses-dialect.md`. It ran `vitest run` with the default reporter, which
prints no test's console output when every test passes, so `spike6.log` held only the summary and `results.spike6.lines`
was empty on a green run: the figures the scenario exists to collect were lost exactly when the spike passed.

Found by the first run of `slice-proof` against the registered self-hosted endpoint (R-068), 2026-10-02:
`Tests 4 passed (4)`, zero `[spike6]` lines.

## Specs

- None: spike 6 is ADR-0027 consequence 2's evidence, not a requirement. The proof's own stated purpose was not met.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — scenario 4's `vitest run` invocation.
- `packages/model/src/ai-sdk-live.spike.test.ts` — the harness and its `[spike6]` lines.

## Outcome — repaired 2026-10-02 (branch `fin6-slice-proof-endpoint`)

Confirmed by running the harness by hand against the same endpoint: the default reporter printed no `[spike6]` line,
`--reporter=verbose` printed all of them.

- Scenario 4 runs the harness with `--reporter=verbose`, so its figures reach `spike6.log` (key substituted out) and
  `results.spike6.lines`.
- Shown end to end by the run recorded in [`first-executions.md`](../../architecture/first-executions.md) (2026-10-02,
  slice-proof against a self-hosted endpoint); not pinned by a unit test, since only a live endpoint prints the lines.
