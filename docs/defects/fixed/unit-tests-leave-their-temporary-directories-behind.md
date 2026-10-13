## Unit tests leave their temporary directories behind

Several unit tests make a directory below the operating system's temporary directory with `mkdtempSync` and never remove it,
so every `pnpm check` adds more. Seen 2026-10-13 by fin36's reviewer while reading `/tmp` for OQ-248's per-attempt socket
directories: about 29,900 `rotaris-*` directories (about 360 MB), of them 21,244 `rotaris-coord-XXXXXX` (11,810 dated
2026-10-06, 7,743 dated 2026-10-07, 1,691 dated 2026-10-13), 2,483 `rotaris-init-XXXXXX`, 1,392 `rotaris-initcmd-XXXXXX`,
1,112 `rotaris-setup-facts-XXXXXX`, and a few hundred each of `rotaris-setup-*` and `rotaris-mcp-*`. The session's disk is a
fixed allowance shared by every plan (the orchestrated build's `environment.md`, "Disk"), and a large `/tmp` also slows any
proof that lists it (workspace-proof's scenario 13b reads the temporary directory for OQ-248's checks).

## Specs

- None: the product writes none of these; they are the tests' own scratch directories. The repository's own rule for tests
  and proofs is that a run removes what it creates.

## Relevant files

- `apps/desktop/src/main/initialization.test.ts`: `workspace()` makes `rotaris-coord-*` and nothing removes it.
- `packages/config/src/init/init.test.ts`: `rotaris-init-*`.
- `apps/desktop/src/main/commands/initialization.test.ts`: `rotaris-initcmd-*`.
- `apps/desktop/src/run-host/mcp.test.ts`: `rotaris-setup-facts-*` (and, by their names, the other `rotaris-setup-*` and
  `rotaris-mcp-*` directories).

## Outcome (fin38, 2026-10-13) — repaired

**Measured first.** The whole suite (`pnpm vitest run`) under a private, empty `TMPDIR` at the branch's base (`4e69b00` plus
this bundle's first repairs) left, besides the tools' own `jiti` and `node-compile-cache`: 89 `rotaris-coord-*`, 11
`rotaris-init-*`, 6 `rotaris-initcmd-*`, 4 `rotaris-setup-facts-*`, one each of `rotaris-setup-end-*`, `rotaris-setup-family-*`,
`rotaris-setup-cancel-grace-*`, `rotaris-setup-budget-grace-*`, `rotaris-setup-shutdown-*`, `rotaris-mcp-*`, `rotaris-mcp-disc-*`,
`rotaris-mcp-fatal-*`, `rotaris-mcp-era-*`, `rotaris-mcp-negotiation-*`, and a fixed `rotaris-phantom-artifacts`.

**Repaired.** Each test file that made them now makes its directories through a local `scratchDir(prefix)` and removes them
in an `afterEach` (`rmSync`, recursive, forced, three retries): `apps/desktop/src/main/initialization.test.ts`,
`apps/desktop/src/main/commands/initialization.test.ts`, `apps/desktop/src/run-host/mcp.test.ts`,
`packages/config/src/init/init.test.ts`, `packages/config/src/mcp/mcp.test.ts`, `packages/mcp/src/setup.test.ts` and
`packages/mcp/src/negotiation.test.ts`; `packages/mcp/src/mcp.test.ts`'s suite-wide directory is removed in its `afterAll`;
and `children.test.ts`'s phantom-child case writes its artifacts below the suite's own per-test directory, which its
`afterEach` already removes. **Shown:** the whole suite again under a fresh private `TMPDIR` (load 1.7 on 4 CPUs): 387 files
passed, 5 skipped, 5,681 tests passed, and the directory held only `jiti` and `node-compile-cache` afterwards — no `rotaris-*`
directory. The directories earlier runs left in the host's `/tmp` are not removed by this change; they are any session's to
clear once no test of theirs is running.
