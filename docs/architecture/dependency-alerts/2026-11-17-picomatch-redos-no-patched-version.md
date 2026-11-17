# Reading — `picomatch` ReDoS, GHSA-fc5q-39xc-vjpf, with no patched version to take (2026-11-17)

The gate's blocking audit, `pnpm audit --prod --audit-level=high`, went red on 2026-11-17 on every branch and on
`main` for an advisory published that day. This file is its reading. The exception it proposes is the owner's to
accept; until then the pull request that carries it stays a draft.

- **Read against:** `main` at `dd75ae46`, Linux x86_64, Node 24.18.0, pnpm 11.9.0, 2026-11-17 about 17:30 UTC.
- **Source:** `pnpm audit --prod --audit-level=high`; `pnpm why -r picomatch --prod`; `pnpm view picomatch dist-tags`;
  CI job `gate (pnpm check)` of run `44135137285`, step "Dependency audit (production, high and above)".

## 1. The advisory

| | |
| --- | --- |
| Id | GHSA-fc5q-39xc-vjpf |
| Package | `picomatch` |
| Severity | high |
| What | a regular-expression denial of service through single-branch repeated extglobs: a crafted **glob pattern** makes matching take very long |
| Vulnerable | `<=4.0.7` |
| Patched | `>=4.0.8` |

## 2. What the repository resolves, and how it is reached

`pnpm-lock.yaml` resolves one copy, `picomatch@4.0.7`. In the production tree it is reached on one path:

```
@rotaris/release-guard (dependencies) > vite@8.3.5 > tinyglobby@0.2.17 > fdir@6.5.0 > picomatch@4.0.7
                                                    > tinyglobby@0.2.17 > picomatch@4.0.7
                                      > vite@8.3.5 > picomatch@4.0.7
```

`@rotaris/release-guard` is the pre-build guard of REQ-STARTUP-028 (`pnpm release:guard <tag>`); it imports
`runnerImport` from `vite` to load the default configuration. It is a tool of this repository, run by a developer or by
the tag workflow on this repository's own tree. **It is not part of the shipped application:** no manifest under
`apps/desktop` or `packages/` names `picomatch`, `tinyglobby` or `vite` as a dependency, and the audit names no path
but the guard's. The development tree reaches the same copy through the linters, which `--prod` does not read.

## 3. Exposure

The fault needs an attacker to supply the glob pattern. The patterns `picomatch` is handed on this path are Vite's own
and this repository's configuration, read from the tree the guard runs on. A person who can change those can change the
guard itself. The consequence if it were reached is a slow or hung build step, not a disclosure and not code execution.

## 4. Why no update

There is nothing to update to: the registry's latest `picomatch` is `4.0.7` (`dist-tags: latest 4.0.7`, last modified
2026-08-24), and `picomatch@4.0.8` does not resolve. When it is published, `minimumReleaseAge` holds it out of an
install for seven days more.

## 5. The exception, and what lifts it

`pnpm-workspace.yaml` gains `auditConfig.ignoreGhsas: [GHSA-fc5q-39xc-vjpf]`, the form `ci.yml`'s header names for an
advisory that has been read, and `tools/workflows.test.ts` holds that the id stands in a reading here.

**It is lifted** — the entry deleted and the lockfile moved — when `picomatch >=4.0.8` resolves under the release-age
window. Dependabot's weekly `dev-tooling` or `production` group will propose it; the pull request that takes it removes
the entry in the same commit.

## 6. What this reading does not do

It dismisses no alert on GitHub, and it changes no manifest and no lockfile. It was written by the model
(`claude-fable-5-2`) while cutting a release for [R-103](../../product/requests.md#r-103); accepting a high advisory's
exception is the owner's decision.
