## `resilience-proof` fails twenty-three scenarios on `main`

`pnpm resilience-proof`, alone, on `origin/main` at `0febcaa1` built in a clean worktree on a developer's Ubuntu host
(2026-11-25, under `xvfb-run`): 23 scenarios fail and none passes. Three shapes: five scenarios and `transient` "overran
its 180000 ms bound"; eleven say "the composer holding focus did not hold within 15000 ms; last seen false"; five say
"Cannot read properties of undefined (reading 'session_id')"; `switch-back` completed one iteration where two are asked.
A branch rebased onto that head fails the same 23 with the same messages. On `af3906d1`, the day before, the suite had
one red beside other suites (`switch-over-override`). What moved between the two heads was not bisected; the commits
between them include the first-launch theme dialog (`cbd3526d`), which would explain a composer that never holds focus,
and that is a guess.

## Specs

None established. The proof's own record is `docs/proofs/`; a red there is a defect of the product until the harness is
shown wrong.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs` — the suite, and the composer-focus wait its driven scenarios begin with.
- `apps/desktop/src/renderer/` — whatever a launch shows before the composer since `cbd3526d`.
