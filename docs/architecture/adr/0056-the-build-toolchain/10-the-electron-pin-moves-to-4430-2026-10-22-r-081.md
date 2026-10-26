# ADR-0056 — The build toolchain — The Electron pin moves to 44.3.0 — 2026-10-22 (R-081)

Part 10 of 10 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## The Electron pin moves to 44.3.0 — 2026-10-22 (R-081)

`electron` is pinned exactly at **44.3.0** in `apps/desktop/package.json`, for GHSA-fw47-9c62-h3vw (HID and USB permission
checks attributed to the wrong origin; Dependabot alerts #3 and #54,
[`../dependency-alerts/2026-10-22-dependabot-triage.md`](../../dependency-alerts/2026-10-22-dependabot-triage.md)). Nothing
else moves with it. electron 44.3.0 declares the same dependencies as 44.1.1, and the lockfile changes only its own two
entries. Read from each runtime with `ELECTRON_RUN_AS_NODE=1 electron -p process.versions`:

| | Electron 44.1.1 | Electron 44.3.0 |
| --- | --- | --- |
| Node | 24.19.0 | 24.20.0 |
| Chromium | 152.0.7977.65 | 152.0.7977.78 |
| V8 | 15.2.124.18-electron.0 | 15.2.124.19-electron.0 |
| `process.versions.modules` | 149 | 149 |

**Consequence 7 still governs, and this bump is the case it describes.** The binary interface is unchanged (149), so the
bindings this toolchain compiles from source keep their interface. Rule 4 is still what proves it for the artifact:
`pnpm package` rebuilds both bindings against the shipped Electron and loads them under the packaged binary, and the build
hooks read the Electron version from the build context, not from a literal (`build-hooks.cjs`; `afterPack` refuses a probe
that ran under another Electron). `pnpm package` builds Windows only (`PD-STARTUP-001`; IC-3 refuses Linux and macOS), and
this bump was made on a Linux host. So rule 4's run for 44.3.0 is continuous integration's `package` job on the branch's
head, and its result is reported with the pull request, not here: no file can carry the result of a run on the commit that
holds it. On Linux the development tree ran under 44.3.0 (the proof sweep in
[R-081's Electron lane record](../../dependency-alerts/2026-10-22-lane-electron.md)). Every proof launch loads the store and
terminal bindings into Electron's own processes, and that measured the unchanged interface in the development tree, not in
an artifact. The same record holds a cold rebuild: both bindings compiled from source against 44.3.0's headers with
`beforeBuild`'s own `@electron/rebuild` options, in a scratch copy with no `build/` and no `prebuilds/`, then loaded and
exercised under the 44.3.0 binary. That is a Linux binding, not the artifact's either. No Linux or macOS artifact was
produced. `apps/desktop/scripts/lib/platform-targets.test.ts`
passes `electronVersion: '44.1.1'` as an arbitrary input to the IC-3 refusal; it is not coupled to the pin and is left as it
is. The dated "Electron 44.1.1" in this record's earlier executions, and in others', stays as measured.
