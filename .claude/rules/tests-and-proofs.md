---
paths:
  - "**/*.test.ts"
  - "**/*.test-support.ts"
  - "apps/desktop/scripts/**/*.mjs"
---

# Tests, and the evidence beside them

Unit tests sit **beside the unit they cover** (`<unit>.test.ts`), run on Node with scripted model
clients, and are collected by `vitest.config.ts` — `*.test.ts` only, so a `.tsx` suffix collects
nothing. The narrowest verification is `pnpm vitest run <path>`. A module only tests import is
named `<unit>.test-support.ts`, and no product module imports it (pinned for `@rotaris/ui` by
`packages/ui/src/test-support.test.ts`).

- **A handful of suites go red only under full-suite parallelism** — the ones driving a real PTY or a
  real child process. Re-run the file alone before believing a red from `pnpm test`.
- **`pnpm check` is the gate** (symbols, typecheck, lint, tests) and all four must be green before a
  commit. Never report green from a piped command: `cmd | tail` reports tail's exit status, and that
  has produced a false green here. Redirect to a file and read the status.
- **A proof script is evidence, not a test of the harness.** Each launches the *built* app against a
  scratch profile; a red is a defect of the product until the harness is shown to be wrong. Run the
  suite a change touches, not only the script named after it — a moved seam breaks a neighbour's proof,
  and that is the point of having them.
- **A first execution reports back into the record that decided it**, in place, including when it found
  nothing, and appends a row to `docs/architecture/first-executions.md`.
- `pnpm live-run` spends the owner's money. It is never automatic; an agent asks first.

The index of which proof covers what is in `AGENTS.md`.
