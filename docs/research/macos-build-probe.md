# macOS ARM64 source-build probe — T6

The `build-probe` matrix in [release.yml](../../.github/workflows/release.yml) runs on an Apple-silicon
`macos-15` runner when a pull request changes that workflow. It checks `darwin/arm64`, installs the locked
workspace and Electron, generates requirement symbols and runs `pnpm build` over the five application entries.
The release jobs are gated by the tag event; the pull-request path has only read permission and no signing step.

`PUBLISHED_PLATFORMS` in [assets.mjs](../../tools/release-pipeline/assets.mjs) remains exactly `windows-x64`.
The probe calls no packaging command and uploads no release directory. It therefore works beside
PD-STARTUP-001 without widening the published platform set. IC-3 is not discharged: a green source build
cannot establish native binding load under Electron, DMG packaging, first paint or the instance claim.

The existing package path is Windows-specific: `package.mjs` hard-codes `--win` and `win32-x64`, and
`build-hooks.cjs` refuses `darwin` before rebuild/pack. Producing a macOS installer would need separate,
authorized work on those seams and IC-3 evidence; this probe deliberately ends at the source build.

Local validation: the repository gate and the platform-target tests. A macOS build result must come from the
PR's `source build probe (macos-arm64)` job; a Linux source build is not evidence of that result.
