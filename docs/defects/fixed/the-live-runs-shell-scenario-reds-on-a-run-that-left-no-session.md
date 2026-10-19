## The live run's shell scenario reds on a run that left no session

`live-run.mjs`'s `shell` block probes the Overview's repository card (`[data-testid="overview-repo-branch"]`) and
asserts its text reads `main`. The card reads the store's attached session, so a run that left none — `--only=shell`
alone, over the sign-in it always runs first — paints no card at all. The block's sessions check already allows for
that (`sessions.length >= wanted.filter((name) => name === 'ask' || name === 'edit').length`, zero when neither
ran); the branch check did not.

Observed 2026-10-19 by the evidence manifest's first execution (win32 arm64, against the registered default):
`pnpm live-run --confirm --only=shell` printed `PASS the shell painted`, `PASS Overview lists the sessions the runs
left — 0 session row(s)`, `FAIL the repository card reads the branch — absent`, and nothing else red; the pack
(`.live-run/runs/2026-10-19T06-09-23-495Z`) held a store with no session.

## Specs

None contradicted. The Overview's cards reading the attached session is the surface's design — AGENTS.md records
the same for the metric cards, "the Overview metric cards read the *attached* session, so they are zero in the
shell scenario by design". The wrong expectation was the harness's.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — the `shell` block and its branch check.

## Outcome

Repaired in the harness, 2026-10-19. The check now runs only when a session was expected: with `expectedSessions
=== 0 && sessions.length === 0` the block prints a NOTE — "no session was attached, so the Overview paints no
repository card" — and a run that expects sessions (the default set, or `--only=ask`/`--only=edit`) keeps the
assertion unchanged.

Shown by the re-run at the same head (`pnpm live-run --confirm --only=shell --skip-build`, pack
`.live-run/runs/2026-10-19T06-17-49-457Z`): the NOTE in place of the red, `live-run PASSED`, 14 pass, 4 note,
0 fail, exit 0.
