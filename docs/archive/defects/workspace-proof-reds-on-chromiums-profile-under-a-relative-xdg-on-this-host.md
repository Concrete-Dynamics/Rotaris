## workspace-proof reds on Chromium's profile under a relative XDG base

## Outcome: repaired 2026-11-21 (R-119's branch, `feat/r-117-web-search-setup`)

The harness, not the product. `packages/platform/src/dirs.ts` ignores a relative XDG value and Chromium's profile was
always under `<home>/.local/share/rotaris/chromium`; the check also demanded that `rel-config` not exist at all, and a
system library that takes the relative value as it stands writes there (IBus's `ibus/bus`, read 2026-11-21). The check
now fails only on profile-shaped content under `rel-config` (`Local State`, `Preferences`, `Crashpad`, or Electron's
`<name>` directory) and prints what it found. `pnpm workspace-proof` green on this host, 2026-11-21.

`pnpm workspace-proof`'s REQ-STARTUP-145 check for Chromium's own profile ("written below the machine-local data directory") fails
with 63 passed, 1 failed, 2 skipped. Nothing stands under `rel-config`, and the profile is at `<scratch home>/.local/share/rotaris/chromium`,
so it may be the check's expectation rather than the placement; the cause was not established. Measured 2026-10-30 on the Linux agent
host, identically on `3ed01f9f` and on a branch that does not touch this path.

## Specs

REQ-STARTUP-145, if the product is at fault.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs`: the `relative-xdg` scenario
- `apps/desktop/src/main/index.ts`: `placeChromiumProfile`
