# Lane record — the `dev-tooling` group with `typescript` held at 5.9, again (2026-11-25)

Repair of Dependabot's `dev-tooling` group (#131), whose gate was red at the typecheck stage. Branch
`dependabot/npm_and_yarn/dev-tooling-0119833116`, cut from `origin/main` at `a329f206` (head `ecec73b7`). The group
carries seven updates; this lane lands **six of them** and holds `typescript` exactly as `main` has it, for the same
reason, and against the same two walls, as the 2026-11-10 lane.

- **Read against:** `a329f206`, Linux x86_64, Node 26.12.1, pnpm 11.9.0, 2026-11-25, about 09:05 UTC.
- **Source of the break:** the PR's own gate log (job `139084901505` on head `ecec73b7`), re-read from the log and
  reproduced locally on the PR's head in a scratch worktree.
- **Supersedes:** the closed #126 (`dependabot/npm_and_yarn/dev-tooling-2a38e822cb`, closed 2026-11-25T08:46:19Z), the
  group's previous proposal, which Dependabot withdrew in favour of this one (its `vitest` pair moves to 5.1.1).

## 1. What the group moves, and the one member that breaks

| Package | From | To | In this lane |
| --- | --- | --- | --- |
| `@vitest/coverage-v8` | `5.1.0` | `5.1.1` | **lands** (paired with vitest) |
| `eslint` | `^10.14.0` | `^10.15.0` | **lands** |
| `eslint-plugin-boundaries` | `^7.4.0` | `^7.4.4` | **lands** |
| `eslint-plugin-import-x` | `^4.17.1` | `^4.18.1` | **lands** |
| `vitest` | `^5.1.0` | `^5.1.1` | **lands** (paired with the provider) |
| `typescript-eslint` | `^8.72.1` | `^8.73.0` | **lands** |
| `typescript` | `~5.9.3` | `~7.0.2` | **held** — see §2 |

**`@vitest/coverage-v8` and `vitest` move as a pair and to the same version**, as in the 2026-11-10 lane: the provider
peers on vitest's *exact* version, so both are at 5.1.1 here and `pnpm peers check` is clean.

## 2. Why `typescript` 7 cannot be taken, and why no diff in this lane fixes it

The two walls are unchanged from the 2026-11-10 lane
([`2026-11-10-lane-dev-tooling-ts7-hold.md`](2026-11-10-lane-dev-tooling-ts7-hold.md) §2), and both were measured
again on this PR's head:

1. **`typescript-eslint` refuses TS 7.0 outright.** Both `8.72.1` and `8.73.0` declare `typescript: ">=4.8.4 <6.1.0"`
   (`npm view typescript-eslint@8.73.0 peerDependencies`), so with TS 7.0.2 resolved the lint stage aborts at load.
   Support is upstream and pending (issue 10940, ≥7.1), so this half is not reachable by any change to this
   repository's *source*.
2. **TS 7.0.2's package no longer exports the classic JS compiler API.** Its `exports` map is `"." → ./lib/version.cjs`
   (only `{ version, versionMajorMinor }`) plus `./unstable/*`, so `packages/workspace/src/traceability/parser.ts` and
   the seven other files that read the compiler API (`consumer.test.ts`, and
   `tools/{check-ui-language,check-plural-markers,check-timeline-vocabulary,migrate-ui-primitives,ui-contract-publisher}.mjs`,
   `tools/typecheck-projects.test.ts`) resolve the version stub: the local run of the gate's typecheck stage names
   `error TS2339: Property 'transpileModule' does not exist on type 'typeof import("…/typescript/lib/version")'` and its
   siblings at `parser.ts:83–100`.

**The break is `typescript` alone.** Holding it and moving the other six resolves cleanly: the typecheck stage passes
on the lane head (see §3), and the six landed updates are not implicated by any error in the PR's log or in this lane's
run.

## 3. Verification

- **Local gate, Linux x86_64, Node 26.12.1, pnpm 11.9.0**, on the lane head:
  - `pnpm symbols`: **exit 0** (4481 identifiers, 153 directives).
  - `pnpm check`'s typecheck and lint stages: **exit 0** — 0 `error TS`, 0 `error` from eslint (the
    `@typescript-eslint/switch-exhaustiveness-check` finding the library bump raised elsewhere is not this PR's and is
    repaired on the `production` PR's branch).
  - `pnpm check`'s test stage: **8931 passed | 58 skipped**, with one red —
    `tools/agent-advisor/advisor.test.ts > the review > is bounded: an overrunning child is killed with its process
    group` — which is **not this lane's**: the same test is red on a pristine `origin/main` worktree, three runs of
    three, and its body returns early on `win32` (`if (process.platform === 'win32') return;`), so the CI gate
    (`runs-on: windows-latest`) never runs it. A host-only, pre-existing reading, outside this diff.
  - Resolved versions in the head's `pnpm-lock.yaml`: `typescript 5.9.3`, `typescript-eslint 8.73.0`, `vitest 5.1.1`,
    `@vitest/coverage-v8 5.1.1`, `eslint 10.15.0`.
- **CI is the authority for the Windows half** (the `gate` job runs on the pushed head).

## 4. What this lane does not do

No merge, no force-push, no push to `main`. It holds one dependency of a Dependabot group and lands the rest; the hold
is named in the PR body and here, with its lifting condition (`typescript-eslint` supporting TS 7, and the classic-API
consumers then answered — see the 2026-11-10 record §5). No source file changes: the diff is `package.json` and
`pnpm-lock.yaml`.

## 5. Re-evaluation condition

As the 2026-11-10 record states: delete the hold, and answer the classic-API consumers, when a `typescript-eslint`
release supports TypeScript 7.
