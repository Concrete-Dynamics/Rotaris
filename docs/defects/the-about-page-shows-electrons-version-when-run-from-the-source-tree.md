## The About page shows Electron's version when the app is run from the source tree

Run as the proofs and `pnpm dev` run it — `electron apps/desktop/out/main/index.js` — the About page's Version row reads
`v44.1.1`, which is Electron's version, not the product's (`apps/desktop/package.json` declares `0.1.0`).
`shell.hello` answers `app.getVersion()`, and Electron answers that from the `package.json` beside the application it
was given. Here that is `out/main/`, which holds none, so Electron falls back to its own version. The packaged build
is not affected: ADR-0054's first execution (2026-09-04) recorded the installer's application showing the product
version. `pnpm settings-proof` does not catch it, because it asserts only that the row matches `/^v\d/`. Noticed
2026-09-27 in `settings-proof`'s evidence while building the notices generator (first-release-plan.md §4.3), whose
work does not touch it. The version guard (§4.1) is being built in parallel and may repair it; if it does, this note
moves to `fixed/` with that repair.

## Specs

`REQ-SHELL-140` fixes the Product card's Version row as `v{version}` of the product. `REQ-STARTUP-158` requires one
release version everywhere it is shown. The development entry is not a release, so no release ships this. But every
proof that reads the About page reads Electron's version as if it were the product's.

## Relevant files

- `apps/desktop/src/main/commands/shell.ts`: `shell.hello` answers `version: app.getVersion()`.
- `apps/desktop/scripts/settings-proof.mjs`: the Version check accepts any `v<digit>` value.
- `apps/desktop/package.json`: the version the row should show.
