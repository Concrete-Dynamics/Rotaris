## workspace-proof reds on Chromium's profile under a relative XDG base

`pnpm workspace-proof`'s REQ-STARTUP-145 check for Chromium's own profile ("written below the machine-local data directory") fails
with 63 passed, 1 failed, 2 skipped. Nothing stands under `rel-config`, and the profile is at `<scratch home>/.local/share/rotaris/chromium`,
so it may be the check's expectation rather than the placement; the cause was not established. Measured 2026-10-30 on the Linux agent
host, identically on `3ed01f9f` and on a branch that does not touch this path.

## Specs

REQ-STARTUP-145, if the product is at fault.

## Relevant files

- `apps/desktop/scripts/workspace-proof.mjs`: the `relative-xdg` scenario
- `apps/desktop/src/main/index.ts`: `placeChromiumProfile`
