---
paths:
  - "**/*.test.ts"
  - "**/*.test-support.ts"
  - "apps/desktop/scripts/**/*.mjs"
---

# Tests, and the evidence beside them

Unit tests sit **beside the unit they cover** (`<unit>.test.ts`), run on Node with scripted model clients, and are
collected by `vitest.config.ts` — `*.test.ts` only, so a `.tsx` suffix collects nothing. The narrowest verification is
`pnpm vitest run <path>`. A module only tests reach is named `<unit>.test-support.ts`, and no product module imports it
(`tools/test-support-naming/test-support-naming.test.ts`, every package under `packages/` and `apps/desktop`'s `src/` and
`scripts/`, where the name ends `.test-support.mjs` or `.cjs` for a script). Nothing one test stubs reaches the next:
`vitest.config.ts` restores spies, clears calls and undoes `vi.stubEnv` and `vi.stubGlobal` before each test.

- **A property test is seeded and sits beside its unit** (`<unit>.property.test.ts`, `fast-check`, pinned): a fixed
  `seed` and `numRuns` written in the file, so every run meets the same cases and a printed counterexample replays from
  its `seed` and `path`; a shape a property holds out is named by a predicate citing the note that records it.
- **A few suites go red only under full-suite parallelism** — those driving a real PTY or child process. Re-run the file
  alone before believing a red from `pnpm test`.
- **Coverage is measured outside the gate, by CI's gate job after `pnpm check` (since 2026-11-03, hardening G2), and
  its floor only rises** —
  `pnpm test:coverage` fails below the four figures in `vitest.config.ts`, and a whole-suite run that measures more
  rewrites them, a rewrite committed with its change.
- **`pnpm check` is the gate**, green before a commit. Never report green from a piped command (`cmd | tail` reports
  tail's status, and that has produced a false green here): redirect to a file and read the status.
- **A proof script is evidence, not a test of the harness.** It launches the *built* app against a scratch profile; a red
  is a product defect until the harness is shown wrong. Run every suite a change touches: a moved seam breaks a neighbour.
- **A first execution reports back into the record that decided it**, in place, even when it found nothing, and appends
  a row to `docs/architecture/first-executions.md`.
- `pnpm live-run` spends the owner's money. It is never automatic; an agent asks first.
- **A landing that cites a requirement for the first time lowers the baseline** in the same commit:
  `pnpm req-coverage --write-baseline` rewrites `tools/requirement-coverage/baseline.json`, which `pnpm lint` holds.

The index of which proof covers what is `docs/proofs/README.md`, rendered from `tools/proof-registry/registry.mjs`
(`pnpm proofs:index` writes it; `pnpm lint` fails when it is stale). `pnpm preflight [proof-id …]` checks the machine
before a suite launches — Electron, the build's freshness, the code-intelligence bundle, `.proof/`'s writability,
exported `ROTARIS_*` variables, the display — and what each named proof's registry record needs; it launches nothing.
`pnpm evidence verify <dir>` re-hashes an evidence pack against its `evidence-manifest.json` (a live run writes one
as it finishes); `pnpm evidence write <dir>` writes one for any other evidence directory.
