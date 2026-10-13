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
