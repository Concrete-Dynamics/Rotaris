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
(`tools/test-support-naming/test-support-naming.test.ts`, every package under `packages/`).

- **A few suites go red only under full-suite parallelism** — those driving a real PTY or child process. Re-run the file
  alone before believing a red from `pnpm test`.
- **`pnpm check` is the gate**, green before a commit. Never report green from a piped command (`cmd | tail` reports
  tail's status, and that has produced a false green here): redirect to a file and read the status.
- **A proof script is evidence, not a test of the harness.** It launches the *built* app against a scratch profile; a red
  is a product defect until the harness is shown wrong. Run every suite a change touches: a moved seam breaks a neighbour.
- **A first execution reports back into the record that decided it**, in place, even when it found nothing, and appends
  a row to `docs/architecture/first-executions.md`.
- `pnpm live-run` spends the owner's money. It is never automatic; an agent asks first.

The index of which proof covers what is `docs/proofs/README.md`, rendered from `tools/proof-registry/registry.mjs`
(`pnpm proofs:index` writes it; `pnpm lint` fails when it is stale). `pnpm preflight [proof-id …]` checks the machine
before a suite launches — Electron, the build's freshness, the code-intelligence bundle, `.proof/`'s writability,
exported `ROTARIS_*` variables, the display — and what each named proof's registry record needs; it launches nothing.
`pnpm evidence verify <dir>` re-hashes an evidence pack against its `evidence-manifest.json` (a live run writes one
as it finishes); `pnpm evidence write <dir>` writes one for any other evidence directory.
