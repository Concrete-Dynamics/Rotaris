# Audit reading — the CI audit's first execution (R-091, 2026-11-01)

The reading that let `.github/workflows/ci.yml`'s new blocking step, `pnpm deps:audit`
(`pnpm audit --prod --audit-level=high`), start green: what it found on its first run, what this branch
(`hrd2-ci-security`, bundle G2 of [`hardening.md`](../hardening.md) §5) moved, and what the step does not see.

- **Read against:** `9b0b5858` (`origin/main`, 2026-11-01), Windows 11 ARM64, Node 26.13.0, pnpm 11.9.0, about 21:15 UTC.
- **Source:** `pnpm audit --prod --json` and `pnpm audit --json`, which ask the npm registry's bulk advisory endpoint
  about the versions `pnpm-lock.yaml` resolves; the dates below are `npm view <package> time`.
- **Not read:** GitHub's Dependabot alerts (36 open at the time). This pass is the audit's view only; the alerts keep
  their own readings ([`README.md`](README.md)).

## 1. What the production audit found

`--prod` reads `dependencies` and `optionalDependencies` (55 + 32 packages): 13 advisories, **5 high**, 6 moderate,
2 low, in three packages, each a single resolved copy.

| Package | Resolved | Advisories (GHSA) | Reach | Fixed in |
| --- | --- | --- | --- | --- |
| `zod` | 4.5.4 | high: GHSA-mrhx-c7xc-m3w5 (memory exhausted validating an oversized constrained collection) | shipped: every cross-process schema (`contracts`), the tools' argument schemas, `config`; a peer of the AI SDK in `model` | 4.6.6 (2026-10-11) |
| `undici` | 7.29.1 | high: GHSA-xjj6-f33q-929c, GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm; moderate: GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-9fm3-97px-rjf6, GHSA-55wc-3pg8-jfw6 | shipped: `agent-tools` pins it exactly and the run host's fetch builds its `Agent` dispatcher from it (U7 of [the 2026-10-22 triage](2026-10-22-dependabot-triage.md)); `@ai-sdk/provider-utils` (`^7.29.0`) and `@electron/get` (`^7.24.4`) resolve the same copy | 7.30.1 (2026-10-15) |
| `fast-uri` | 3.1.8 | moderate: GHSA-w74x-v6f9-j3xg, GHSA-wjr9-j795-jxcr; low: GHSA-xhq7-xmqj-769h, GHSA-333x-w4r6-6crp | shipped: `ajv` 8.20.0 (`^3.0.1`), the MCP tool-schema gate | 3.1.9 (2026-10-19) |

The zod advisory bears on the hardening plan's own bound: bundle D1 adds `.max()` to the IPC schemas, and a
constrained collection is exactly the shape the advisory names.

## 2. Disposition: patched, on this branch

Every fixed version is older than `minimumReleaseAge`'s seven days, so each installs under the repository's policy.

| File | Change |
| --- | --- |
| `packages/agent-tools/package.json` | `undici` `7.29.1` → `7.30.1` (exact pin kept) |
| `pnpm-workspace.yaml` | the catalog's `zod` `^4.5.4` → `^4.6.6` (resolves 4.6.7, 2026-10-12) |
| `pnpm-lock.yaml` | `undici` 7.29.1 → 7.30.1, `zod` 4.5.4 → 4.6.7 (the AI SDK's peer-suffixed keys with it), `fast-uri` 3.1.8 → 3.1.9; no other entry |

The transitive copies moved by the method of [the patch lane](2026-10-22-lane-patches.md#how-the-transitive-copies-were-moved):
a per-major `overrides:` block (`undici@7`, `zod@4`, `fast-uri@3`) for one `pnpm install --lockfile-only`, then the
block removed and the install run again, which keeps every locked version inside its dependents' ranges and leaves no
override behind. Without it, `model`'s auto-installed `zod` peer stayed at 4.5.4 beside the catalog's 4.6.7.

**After:** `pnpm audit --prod` reads "No known vulnerabilities found". The package tests ran against the moved tree
(the bundle's report gives the command and its result).

**What the move changed underneath (2026-11-03, at the landing).** zod 4.6 no longer copies a check's maximum into a
schema's internal `_zod.bag` (4.5.4 did); parsing, the errors and `z.toJSONSchema`'s `maxLength`/`maxItems` are unchanged.
One reader of that internal existed: hardening D1's `packages/contracts/src/limits.test.ts`, landed beside this branch,
whose walk found every bounded field unbounded under 4.6.7. It now reads the `max_length` and `length_equals` checks.

## 3. What the blocking step does not see

`--prod` follows the manifests' `dependencies`. **Electron is a `devDependency` of `apps/desktop`** (electron-builder's
convention) although it is the runtime the product ships, and the build tools are devDependencies by right. The whole
tree, read the same evening after §2's move: 12 advisories, **4 high**, 6 moderate, 2 low.

| Package | Resolved | High | Reach | Lead |
| --- | --- | --- | --- | --- |
| `electron` | 44.3.0 | GHSA-jr5w-w6x2-84p9 (`<44.9.1`); also one moderate, two low | **shipped**: the runtime itself | Dependabot's `electron` group, pull request #49 (opened 2026-11-01, 44.3.0 → 45.0.0); [the note](../../archive/defects/the-shipped-electron-runtime-sits-inside-a-high-advisory-the-production-audit-cannot-see.md) |
| `undici` | 6.28.1 | GHSA-xjj6-f33q-929c, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm | build only: `node-gyp` 12.4.0 (`^6.25.0`) under `@electron/rebuild`, which fetches Node headers when the native bindings are rebuilt | 6.29.1 exists; not shipped |

The moderates are `@vitest/mocker` 4.1.11 (test only) and `minimatch` (eslint and electron-builder, build only).
`ci.yml` therefore runs `pnpm audit --audit-level=high` over the whole tree as well, in a step that reports and does
not block, so the shipped runtime's advisories are in every run's log; blocking on them is not this reading's to decide.

*2026-11-04:* Electron moved to 44.10.0, out of all four of its advisories, and the shipped runtime's audit now blocks:
`pnpm deps:audit:runtime` reads the whole tree's report for Electron alone, the build tools' advisories staying report-only
([the lane's reading](2026-11-04-lane-electron-44-10.md)). The `undici` 6.28.1 row above stands, and is
[a note](../../defects/the-build-tools-undici-6-copy-sits-inside-three-high-advisories-and-keeps-the-vulnerabilities-check-open.md).

## 4. How an exception is written

None is written today. pnpm 11.9.0 reads `auditConfig.ignoreGhsas` (and `ignoreCves`) from `pnpm-workspace.yaml`:
measured 2026-11-01 by adding `GHSA-jr5w-w6x2-84p9` there, after which `pnpm audit` no longer listed it and its summary
read "(1 ignored)", then removing it. An exception is an entry there with a comment naming the reading in this directory
that holds its GHSA id, its disposition (residual, never "patched": a patched advisory needs no exception) and the date it
goes; `tools/workflows.test.ts` fails an id no reading here names, and an audit command line in a workflow that carries
`--ignore`.
