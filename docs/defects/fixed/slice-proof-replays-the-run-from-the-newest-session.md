## slice-proof replays the run from the newest session

`apps/desktop/scripts/slice-proof.mjs`, scenario 3 (one real run), read its session from the store as the newest one
(`ORDER BY created_at DESC LIMIT 1`). On a fresh run that is the run's own session, because scenario 3 launches before
the intent runs. A replay of scenario 3 (`--resume --from=spike6`, `sign-out` or `refused`) reads the store after the
three intent runs have added theirs, so it judged the THIRD intent's session as the run: on 2026-10-02 the replay failed
"the run ended paused (application_shutdown)" — the third intent's run, which the intents scenario lets run out its
capture wait because it asserts the classification alone — while the run's own session had completed.

Found by resuming the first run of `slice-proof` against the registered self-hosted endpoint (R-068) from `sign-out`.

## Specs

- None: a harness defect; the product recorded both sessions correctly.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — scenario 3's session query.

## Outcome — repaired 2026-10-02 (branch `fin6-slice-proof-endpoint`)

- Scenario 3 reads the session its own log names (`session <id> started` in `run.log`), fresh or replayed, and fails
  naming the id when the store does not hold it; the newest session stands in only for a log that names none.
- Shown by the resumed run (`--resume --from=sign-out`) that passed after it, and by the fresh run recorded in
  [`first-executions.md`](../../architecture/first-executions.md) (2026-10-02, slice-proof against a self-hosted endpoint).
