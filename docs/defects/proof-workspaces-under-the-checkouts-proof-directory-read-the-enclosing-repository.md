## Proof workspaces under the checkout's .proof directory read the enclosing repository

A proof that makes its workspace a plain directory under the checkout's git-ignored `.proof/` and gives it no repository
of its own leaves the application's git discovery to climb into the checkout the proof runs in. The app's Git view and
status strip then read that repository: its branches, its worktrees and its diffs. Observed 2026-10-07 at about 08:55 UTC
while fin30's `workspace-proof` ran beside another bundle's landing: that landing worktree's `fetch-proof` app had two
`git -C …/.proof/fetch-proof/profile/workspace diff --numstat --no-renames -z main...fin29-…` children running, diffing
another plan's branches. finacc3 A2-19 found the same in `driver-proof`
([`fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md`](fixed/a-proof-exits-while-processes-of-the-app-it-launched-still-run.md)),
which fin30 repaired for that proof alone (`GIT_CEILING_DIRECTORIES` at its evidence directory). By a reading of the
scripts, about twenty proofs make such a workspace (among them `fetch-proof`, `artifacts-proof`, `composer-proof`,
`mission-proof`, `plan-gate-proof`, `resilience-proof`, `rows-proof`); which of them draw a surface that reads git was not
checked. Recorded, not repaired: a repair for every proof (for instance the ceiling in `proofIsolationEnv`) changes what
each of them launches into, and each would have to be run.

## Specs

None contradicted: the product reads the repository its workspace lies in, as it should. The defect is the proofs'
isolation: what a proof's evidence shows of git depends on the checkout and the branches beside it.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`, `evidenceDirectory`.
- `apps/desktop/scripts/fetch-proof.mjs` and the other proofs whose workspace is a plain directory under `.proof/`.
- `apps/desktop/scripts/driver-proof.mjs` — the one repaired, by `NO_ENCLOSING_REPOSITORY`.
