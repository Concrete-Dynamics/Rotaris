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

## Outcome

**Repaired 2026-09-29 under R-067: the code now spells the requirement.** `resolveUserDirs`'s `win32` case answers
`<LOCALAPPDATA>\rotaris\rotaris` for the configuration directory. The data directory is unchanged, the sibling
`<LOCALAPPDATA>\rotaris\data`, so D-04 still holds. The requirement's spelling is built as written; no clause was
read differently. No earlier directory is adopted, because REQ-STARTUP-145 forbids adopting one and REQ-CONFIG-058
withdrew the adoption mechanism. A Windows machine that ran an earlier build still has its `rotaris\config`, and it
is left untouched and unread, which is what REQ-CONFIG-058 requires of "a directory under any other name". There is
no record here that any Windows build was ever distributed.

What moved with it:

- `apps/desktop/scripts/lib/harness.mjs` `configDirFor` answers `local\rotaris\rotaris` on `win32`. `skills-proof.mjs`'s
  comment says so.
- `lib/launch-sites.test.ts` now refuses a script that spells either Windows name itself, `'rotaris', 'config'` or
  `'rotaris', 'rotaris'`.
- `views/02-process-view.md` (the diagram and the files-on-disk table) and `views/05-state-ownership.md` spell
  `%LOCALAPPDATA%/rotaris/rotaris/`.
- `proposals/data.md` A3 already spelled the requirement. It gains a reconciliation line, so it and the view now
  agree.

One consequence is recorded rather than decided. On Windows the configuration directory is also the directory the
preference store's `Rotaris\Rotaris` root names (`resolvePreferenceRoot`), because the filesystem folds case. The
two stores share that directory but no file: the store writes `preferences.json`, and no configuration file has that
name. REQ-SHELL-006 leaves the store's physical path free and asks for key disjointness, which holds. macOS already
nests the store at `…/rotaris/Rotaris` inside the configuration directory. The process view states this too.

**Pinned by** two cases in `packages/platform/src/platform.test.ts`:

- The REQ-CONFIG-001 case asserts `C:\Users\me\AppData\Local\rotaris\rotaris` with `LOCALAPPDATA` set, the same
  spelling composed from the home when it is unset, and that the configuration and data directories differ. It was
  red against the old `rotaris\config` answer, then green after the change.
- The existing local-profile case also moved to the new spelling.

`apps/desktop/scripts/lib/proof-isolation.test.ts`'s parity case, which holds `configDirFor` equal to `resolveUserDirs`
on all three platforms, went red with the product changed and the harness not, and green once the harness moved. It
now also asserts the literal `…\rotaris\rotaris`.

**Owed to the next Windows package (IC-3):** the built-app evidence. Nothing here ran on Windows. The answer is
decided by the platform parameter and pinned by the unit cases; it has not been measured. The first Windows run must
show three things:

- a proof that writes the global configuration through `configDirFor` (`config-proof`, `skills-proof`'s policy
  launch, `mcp-proof`) is read by the product at `<local>\rotaris\rotaris\`;
- a real profile's first save lands at `%LOCALAPPDATA%\rotaris\rotaris\agents.yaml`;
- `preferences.json` and the configuration files sit side by side in that directory without either store reading the
  other's.
