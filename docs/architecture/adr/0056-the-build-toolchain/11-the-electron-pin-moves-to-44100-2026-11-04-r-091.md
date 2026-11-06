# ADR-0056 — The build toolchain — The Electron pin moves to 44.10.0 — 2026-11-04 (R-091)

Part 11 of 12 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## The Electron pin moves to 44.10.0 — 2026-11-04 (R-091)

`electron` is pinned exactly at **44.10.0** in `apps/desktop/package.json`, out of GHSA-jr5w-w6x2-84p9 (high, `<44.9.1`)
and the moderate and two low advisories beside it, which 44.3.0 sat inside with CI's production audit green
([the lane's reading](../../dependency-alerts/2026-11-04-lane-electron-44-10.md); acceptance finding AF-05 of R-091's plan
`hrda`). Nothing else moves with it: 44.10.0 declares the same dependencies as 44.3.0, and the lockfile changes only the
importer's specifier and version and `electron`'s own `packages` and `snapshots` keys. Read from each runtime with
`ELECTRON_RUN_AS_NODE=1 electron -p process.versions` (44.10.0 on Windows 11 ARM64, 2026-11-04):

| | Electron 44.3.0 | Electron 44.10.0 |
| --- | --- | --- |
| Node | 24.20.0 | 24.22.1 |
| Chromium | 152.0.7977.78 | 152.0.7977.169 |
| V8 | 15.2.124.19-electron.0 | 15.2.124.45-electron.0 |
| `process.versions.modules` | 149 | 149 |

**The 44 line, not the major.** Dependabot's `electron` group proposes 45 (pull request #49), whose CI `package` job on
2026-11-04 refused the packaged launch ("expected one session, found 0"), where `main`'s passes under 44.3.0; a major
moves the Chromium and Node lines this record's rules were measured against. 44.10.0 was the newest 44 release past
`minimumReleaseAge`'s seven days (published 2026-10-27; 44.10.1 and 44.10.2 were younger). The move to 45 stays the
pull request's.

**Consequence 7 still governs, as it did for 44.3.0.** The binary interface is unchanged (149). The fuse wire is
unchanged too: @electron/fuses read the 44.10.0 `electron.exe` as the nine fuses 44.3.0 carried, in the same states,
and a copy flipped with `electron-builder.yml`'s map read back through `checkFuses` as asked, the unflipped copy refused
fuse by fuse. Rule 4 is still what proves the bindings for the artifact, and `pnpm package` does not run on the
Windows ARM64 host this was moved on
(`docs/defects/pnpm-package-on-the-windows-arm64-host-fails-rebuilding-node-pty-for-want-of-spectre-mitigated-libraries.md`),
so rule 4's run for 44.10.0 is continuous integration's `package` job on the landed head, reported with it, not here.
The development tree ran under 44.10.0: the proofs the lane's reading lists, every launch loading the store and
terminal bindings into Electron's own processes. No Linux or macOS artifact was produced. The dated "Electron 44.3.0"
in this record's earlier parts, in the fuse test's fixture and in others' measurements stays as measured.
