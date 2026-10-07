## An empty XDG_RUNTIME_DIR puts the instance socket in the working directory

Off Windows, the single-instance claim (`socketDirectoryFor`, `packages/platform/src/instance.ts`) takes the directory of its
hand-over socket from `XDG_RUNTIME_DIR` with `??`, so a variable that is set but empty (`XDG_RUNTIME_DIR=`) is used as it
stands: `endpointFor` answers `posix.join('', 'instance-<pid>-<nonce>.sock')`, a socket relative to whatever the process's
working directory is, and a relative value is used the same way. Seen on the built app (Linux, 2026-10-07): launched with
`XDG_RUNTIME_DIR=` from an empty scratch directory, the instance listened on `<working directory>/instance-2787-43749334.sock`
and the file was still there after the launch was stopped. A second launch from another working directory would look for the
record's endpoint by that relative path. The XDG Base Directory Specification treats a relative path as invalid, and says an
application whose `XDG_RUNTIME_DIR` is not set falls back to a replacement directory with similar capabilities.

The proof harness's comment on its short runtime directory (`apps/desktop/scripts/lib/harness.mjs`, `proofIsolationEnv`)
says "the product never reads this variable"; the claim does read it.

Noticed 2026-10-07 by the builder of finacc3's bundle `finacc3-accept1-12` while showing the empty-`XDG_CONFIG_HOME` repair
on the built app (`docs/defects/fixed/an-empty-xdg-config-home-puts-the-configuration-directory-at-a-relative-path.md`);
recorded, not repaired.

## Specs

REQ-STARTUP-145 (per-user state in the platform-conventional per-user locations, never one relative to the working
directory) and REQ-STARTUP-161/164 (the single-instance record and its hand-over, which a relative endpoint makes depend on
the working directory). REQ-STARTUP-147 lists the environment variables the startup domain reads and does not name
`XDG_RUNTIME_DIR`.

## Relevant files

- `packages/platform/src/instance.ts` — `socketDirectoryFor` (`??` on `XDG_RUNTIME_DIR`) and `endpointFor`.
- `apps/desktop/scripts/lib/harness.mjs` — `proofIsolationEnv`'s comment that the product never reads the variable.
