## `configDirFor` answers the Linux directory on macOS

`apps/desktop/scripts/lib/harness.mjs`'s `configDirFor(local, platform)` has two answers. On `win32` it gives
`<local>/rotaris/config`. On every other platform, `darwin` included, it gives `<local>/rotaris/config/rotaris`, the
`XDG_CONFIG_HOME` answer. On macOS the product does not read `XDG_CONFIG_HOME`. `resolveUserDirs` composes its
configuration directory from the home directory, `~/Library/Application Support/rotaris`. So on macOS every proof that
writes the scratch global configuration through `configDirFor` writes where the product never reads. That is the
defect R-062 repaired for Linux, still present for the third platform. `proof-isolation.test.ts` skips `darwin` in the
comparison that would show it ("composed from HOME, not from the pairs; not a `local`-rooted answer"), and the harness
sets `HOME` only when a caller names one. A macOS answer therefore needs the scratch home the launch was given, not
`local`.

Found 2026-09-28 in the review of R-062's proof sweep. The first-executions row for that sweep already states it as
what could not be shown. No macOS host exists (IC-3), so nothing was measured, and this is recorded, not repaired.

## Specs

None contradicted by the product. REQ-CONFIG-001 spells the macOS global scope as
`~/Library/Application Support/rotaris/`, and the product resolves exactly that. The harness's copy of the rule
disagrees with it on `darwin`, so a proof run there would produce no evidence for the configuration it writes.

## Relevant files

- `apps/desktop/scripts/lib/harness.mjs`: `configDirFor`, which gives the POSIX `XDG` answer for `darwin`.
- `packages/platform/src/dirs.ts`: `resolveUserDirs`, whose `darwin` case composes from `home`.
- `apps/desktop/scripts/lib/proof-isolation.test.ts`: the loop that `continue`s past `darwin`.
