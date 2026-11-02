## Two release-guard cases spawn with a 60 s bound inside vitest's 30 s one

Seen on Windows 11 x64 (build 26200), Node 24.11.0, 16 cores, about 2 GB of 16 GB free, at `c9ebc8cf`, in `pnpm check`:
`tools/release-guard/src/guard.test.ts`'s "the script passes this repository for the version it declares" failed with
"Test timed out in 30000ms". Alone the same file passed, the case in 4.6 s.

The case runs the guard script twice with `spawnSync(..., { timeout: 60_000 })` and "the script itself boots …" once, but
neither gave the `it` a timeout, so vitest's `testTimeout` of 30 s ended them first. Under the full gate's parallelism a real
Node boot that reads the repository can outlast 30 s, which the spawns' own bound allows.

## Specs

None contradicted: a defect of the test's bounds.

## Relevant files

- `tools/release-guard/src/guard.test.ts` — the two cases that spawn the script.
- `vitest.config.ts` — `testTimeout: 30_000`.

## Repaired — 2026-10-20

The two cases carry timeouts past their spawns' bounds: 70 s for the one spawn, 130 s for the two.
