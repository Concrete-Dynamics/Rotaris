## The Windows global configuration directory is not the one REQ-CONFIG-001 spells

`REQ-CONFIG-001` spells the global configuration scope on Windows as `%LOCALAPPDATA%\rotaris\rotaris\`. The product
resolves it as `%LOCALAPPDATA%\rotaris\config\`: `resolveUserDirs`'s `win32` case in `packages/platform/src/dirs.ts`
joins `rotaris` and `config` under `LOCALAPPDATA`, beside the data directory `rotaris\data`. The Linux and macOS
answers match the requirement's spellings (`~/.config/rotaris/`, `~/Library/Application Support/rotaris/`); the
Windows one does not. The architecture record repeats the product's spelling (`views/02-process-view.md`, "Files and
directories on disk") and `docs/architecture/proposals/data.md` A3 repeats the requirement's, so the two documents
disagree with each other as well. No ADR or owner decision found in `docs/architecture/` rules between them.

The requirement also says its spellings are "that location on each platform rather than a second definition of it",
deferring the choice of location to `REQ-STARTUP-145`. Both spellings are under the machine-local `%LOCALAPPDATA%`,
so the location rule is met either way; what differs is the directory's name, which the requirement does state.

Noticed 2026-09-28 while repairing `config-dir-for-answers-the-linux-directory-on-macos.md` (R-062), by reading
`REQ-CONFIG-001` against `dirs.ts`. Not repaired there: the harness copies the product's rule, the product is outside
that task, and whether the spelling or the code is right is not for an agent repairing a proof harness to decide.

## Specs

Contradicts the Windows spelling in `REQ-CONFIG-001` (`%LOCALAPPDATA%\rotaris\rotaris\`). `REQ-STARTUP-145`
(machine-local, platform-conventional) and constraint D-04 (the configuration and data directories are different
directories) are met by the product's spelling and would be met by the requirement's.

## Relevant files

- `packages/platform/src/dirs.ts`: `resolveUserDirs`, the `win32` case (`<LOCALAPPDATA>\rotaris\config`).
- `docs/spec/15-settings-configuration.md`: `REQ-CONFIG-001`, the Windows spelling.
- `docs/architecture/views/02-process-view.md`: the files-on-disk table, which spells the product's answer.
- `docs/architecture/proposals/data.md`: A3, which spells the requirement's.
- `apps/desktop/scripts/lib/harness.mjs`: `configDirFor`, the proofs' copy of the product's answer, held to it by
  `apps/desktop/scripts/lib/proof-isolation.test.ts`.
