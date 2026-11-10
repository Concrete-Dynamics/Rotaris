# Lane record — the `dev-tooling` group with `typescript` held at 5.9 (2026-11-10)

Repair of Dependabot's `dev-tooling` group (#52), whose gate was red at the typecheck stage. Branch
`chore/deps-dev-tooling-hold-ts7`, cut from `origin/main` at `00faa9ce` (the merge of #78). The group carries seven
updates; this lane lands **six of them** and holds `typescript` exactly as `main` has it, because the seventh
(`typescript` 5.9.3 → 7.0.2) is not an update this repository can take yet — not by any repair inside this diff.

- **Read against:** `00faa9ce`, Linux x86_64, Node 26.12.1, pnpm 11.9.0, 2026-11-10, about 08:20 UTC.
- **Source of the break:** the PR's own gate log (job `128739175526` on head `6d8eb6e5`), re-read from the log and
  reproduced locally on the PR's head in a scratch worktree.

## 1. What the group moves, and the one member that breaks

`.github/dependabot.yml`'s `dev-tooling` group proposes seven root `devDependencies` at once:

| Package | From | To | In this lane |
| --- | --- | --- | --- |
| `@types/node` | `^24.0.0` | `^26.6.6` | **lands** |
| `@vitest/coverage-v8` | `4.1.11` | `5.1.0` | **lands** (paired with vitest, below) |
| `eslint` | `^10.9.1` | `^10.14.0` | **lands** |
| `eslint-plugin-boundaries` | `^7.2.1` | `^7.4.0` | **lands** |
| `vitest` | `^4.1.11` | `^5.0.5` | **lands** |
| `typescript-eslint` | `^8.69.0` | `^8.72.1` | **lands** |
| `typescript` | `~5.9.3` | `~7.0.2` | **held** — see §2 |

**`@vitest/coverage-v8` and `vitest` move as a pair and to the same version.** The provider peers on vitest's *exact*
version (`@vitest/coverage-v8@5.1.0` declares `vitest: 5.1.0`), which is why Dependabot's group widens `vitest` to a
caret while pinning the provider. Dependabot's manifest pair (`vitest ^5.0.5` + `@vitest/coverage-v8 5.0.5`) resolved to
`vitest 5.1.0` with the provider still at `5.0.5`, so `pnpm peers check` reported an unmet peer. Both are set to `5.1.0`
here (`vitest ^5.1.0`, `@vitest/coverage-v8 5.1.0`), which is the smallest change that makes the pair agree;
`pnpm peers check` is clean.

## 2. Why `typescript` 7 cannot be taken, and why no diff in this lane fixes it

Two independent walls, both measured here, either of which blocks the gate on its own:

1. **`typescript-eslint` refuses TS 7.0 outright.** `typescript-eslint@8.72.1` declares `typescript: ">=4.8.4 <6.1.0"`,
   and with TS 7.0.2 resolved in the tree `pnpm lint` does not merely warn — it aborts at load:

   ```
   typescript-eslint does not support TS 7.0.
   See ...announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0 to run typescript-eslint using the TS 6 API.
   See also https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking support for TS >=7.1
   Error: typescript-eslint does not support TS 7.0.
   ```

   That is the lint half of the gate. No change to this repository's *source* reaches it: `typescript-eslint` is the
   linter's parser, and it reads whatever `typescript` the toolchain resolves. Support is upstream and pending (≥7.1),
   so the honest move is to hold `typescript` until a `typescript-eslint` that supports 7 lands — which, per
   `tools/dependabot.test.ts`, Dependabot moves in this same `dev-tooling` group.

2. **TS 7.0.2 is the native compiler and its package no longer exports the classic JS compiler API.** Its `exports`
   map is `"." → ./lib/version.cjs` (which exports only `{ version, versionMajorMinor }`) plus `./unstable/{sync,async,
   ast,fs,…}`. `import type * as TS from 'typescript'` and `createRequire(import.meta.url)('typescript')` therefore
   resolve to the version stub, and every classic-API call reads `undefined`:

   ```
   TypeError: Cannot read properties of undefined (reading 'Latest')
    ❯ sourceFileOf packages/workspace/src/traceability/parser.ts:84:62
   ```

   The gate log names 135 `error TS` in `packages/workspace/src/traceability/parser.ts`, plus the same break in seven more
   files that read the compiler API (`consumer.test.ts`, and `tools/{check-ui-language,check-plural-markers,
   check-timeline-vocabulary,migrate-ui-primitives,ui-contract-publisher}.mjs`, `tools/typecheck-projects.test.ts`). This
   half is repairable in principle — the parser already loads the compiler through `createRequire`, so it *could* point
   at a classic-API package (`@typescript/typescript6`, registry latest 6.0.2, classic API confirmed present) — but that
   repair cannot land while wall (1) stands, and it is a change to how the product loads its parser, not a version bump.

**The break is `typescript` alone.** In a scratch worktree on #52's head, holding `typescript` and the linter that
parses with it (`typescript-eslint 8.69`) and applying the remaining updates resolved cleanly: the scoped parser and
consumer suites pass there. On the lane head the manifest holds **only** `typescript` (at 5.9.3) and moves the other
six — `typescript-eslint 8.72.1` is one of the six, and `eslint@10.14` accepts it because 8.72 peers `typescript
>=4.8.4 <6.1.0`, which 5.9.3 satisfies. `@types/node` 26, `vitest` 5, `eslint` 10.14 and `eslint-plugin-boundaries`
7.4 are not implicated by any error in the PR's log or in this lane's run.

## 3. Verification

- **Local gate, Linux x86_64, Node 26.12.1, pnpm 11.9.0**, on the lane head (all four stages):
  - `pnpm symbols` (`node tools/symbol-artifact/generate.mjs`): **unchanged** (4447 identifiers).
  - `tsc -b tsconfig.json --force` (typecheck): **exit 0**, 0 `error TS`.
  - `eslint . --max-warnings 0` (lint, with the bump's own 10.14 + boundaries 7.4 + typescript-eslint 8.72): **exit 0**.
  - `vitest run` (tests): **576 passed | 5 skipped (581)**, exit 0.
  - `pnpm peers check`: **no peer dependency issues**; the lockfile resolves cleanly.
  - Resolved versions in the head's `pnpm-lock.yaml`: `typescript 5.9.3`, `typescript-eslint 8.72.1`, `@types/node
    26.6.6`, `vitest 5.1.0`, `@vitest/coverage-v8 5.1.0`, `eslint 10.14.0`, `eslint-plugin-boundaries 7.4.1`.
    `vitest` is a caret (`^5.1.0`) and the provider an exact `5.1.0`; the pair agrees **in the current lockfile**
    (`vitest 5.1.0` + `@vitest/coverage-v8 5.1.0`), and Dependabot moves both together in this group, so a later
    vitest publishes a fresh PR that moves them together again rather than silently skewing the tree.
- **The bump's own linter found 18 real findings and they are repaired in this diff**, not suppressed: the tightened
  `@typescript-eslint` rules left 11 `no-unnecessary-type-assertion` errors (6 test files: three under
  `apps/desktop/src/main/updater/` and three under `tools/release-pipeline/`) and 7 `unbound-method` `eslint-disable`
  directives that the newer analysis no longer needs (5 production files: `packages/{platform,config,workspace}`). The
  assertions are dropped and the directives removed; the affected suites and a scoped lint both pass.
- **CI is the authority for the Windows half** (the `package` job and the Windows gate run on the pushed head).

## 4. What this lane does not do

No merge, no force-push, no push to `main`. It holds one dependency of a Dependabot group and lands the rest; the hold
is named in the PR body and here, with its lifting condition (`typescript-eslint` supporting TS 7). The only source
edits are the lint repairs §3 names — five production files lose an obsolete `eslint-disable` line and six test files
lose a redundant `as string`; **no runtime behaviour changes**, and the repo-wide typecheck and the suites pass on
`main`'s product code otherwise unchanged, because nothing in the six landed updates needs a code change.

## 5. Re-evaluation condition

Delete the hold — move `typescript` to the then-current 7.x and let `typescript-eslint` follow in the same group — when
a `typescript-eslint` release supports TypeScript 7 (upstream issue 10940; ≥7.1 at the time of writing). At that point
the second wall (§2.2) must be answered too: the classic-API consumers named there need an explicit JS compiler-API
dependency, or a migration to TS 7's `unstable/*` API, before `typescript` 7 can land.
