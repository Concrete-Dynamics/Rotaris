# ADR-0054 — Packaging, the four artifacts, and self-update — Linux and macOS configuration prepared — 2026-10-22 (R-080; not wired, IC-3 and `PD-STARTUP-001` stand)

Part 20 of 22 of [ADR-0054](../0054-packaging-artifacts-and-self-update.md), which indexes every part.

## Linux and macOS configuration prepared — 2026-10-22 (R-080; not wired, IC-3 and `PD-STARTUP-001` stand)

R-080 asked for the Linux and macOS build configuration to be prepared as far as the absence of build hosts allows.
This is the preparation. It is not a first execution: nothing was built, and nothing can be. `electron-builder.yml`
still carries no `mac` or `linux` section, and `pnpm package` still runs `--win` alone. `build-hooks.cjs` refuses every
platform but `win32` before anything is rebuilt or packed, which is IC-3 enforced in code rather than in prose.

`apps/desktop/scripts/lib/platform-targets.mjs` holds the two configurations a host would merge over
`electron-builder.yml`. Its tests read them against the requirements, against electron-builder 26.15.3's own
configuration schema, and against the barrier: nothing that builds imports the module, `release.yml`'s matrix and
`PUBLISHED_PLATFORMS` hold `windows-x64` alone, and both hooks still refuse `darwin` and `linux`.

- **`macos-arm64`.**
  - A `UDZO` disk image, `arm64` only (REQ-STARTUP-022), with the `/Applications` link.
  - The volume is named `Rotaris <declared version>`, written as a literal for the same reason the artifact names are.
  - The bundle identifier is `ai.rotaris.app` (REQ-STARTUP-014).
  - `identity: null` and `notarize: false` (REQ-STARTUP-023).
  - Proposed runner: `macos-15`.
  - **OQ-450** asks about the bundle's lower-case name and about whether an ad-hoc signature counts as a code signature on ARM64.
- **`linux-x86_64`.**
  - An `x64` AppImage carrying REQ-STARTUP-024's desktop entry: `Type`, `Name`, `Terminal`, `Development;IDE;`, plus `inode/directory`, so that a folder's "open with" offers the application. Exec is the tool's own, `AppRun %U`.
  - **ESC-11 is answered on paper for option (b).** The stable line admits `toolsets.appimage: "1.0.3"`, the static runtime, which 26.15.3 labels a beta. The tool's source shows the difference ESC-11 turned on. With its default `"0.0.0"` (the legacy FUSE 2 runtime), `AppImageTarget.js` writes `--no-sandbox` into Exec unconditionally. With `"1.0.3"` it writes nothing, and the image's `AppRun` adds the switch only where `unshare -Ur true` fails.
  - Spike 12 must still measure the static runtime on a host that never had `libfuse.so.2` (IC-3 item 1).
  - Proposed runner: `ubuntu-24.04`, pinned rather than `-latest`, for REQ-STARTUP-025.

**Still owed on the hosts, unchanged by this note** (IC-3 items 1 to 4):

- spike 12 (above);
- spike 17's first paint for both artifacts;
- ADR-0056's load proof on a macOS and a Linux runner;
- the instance claim on both.

ADR-0056's load proof is not a configuration change. `build-hooks.cjs`'s rule 1a lists win32 binaries only, and rule 4 launches `<product>.exe`. Both need their macOS and Linux forms written on the host that can run them.

The dmg and AppImage apply strategies of "The updater" also wait for the directive's withdrawal, as `PD-STARTUP-001` says. The icon is O-4's.

**Wiring it**, once IC-3 and IC-8 are discharged and a directive withdraws `PD-STARTUP-001`, means three changes made together. First, `package.mjs` gains the platform switch and renders the configuration through `preparedConfiguration`. Second, `release.yml`'s matrix gains one entry per key on the runners above. Third, `tools/release-pipeline`'s `PUBLISHED_PLATFORMS` gains the same keys.

*Note 2026-10-26 ([R-087](../../../product/requests.md#r-087)), and the paragraph above is kept as written: for the Linux
key it no longer holds. The owner narrowed IC-3 to macOS, and
[ADR-0066](../0066-the-linux-artifact-is-built-on-a-developer-host.md) authorises building the Linux artifact now. The
first change above, plus the hooks' rules 1a and 4 written for Linux, is that build's wiring (ADR-0066 point 5, AC-3).
The second and third are publication and still wait on a directive revising `PD-STARTUP-001`. IC-3 items 1 to 4 above
are, for Linux, ADR-0066's AC-1 to AC-4.*
