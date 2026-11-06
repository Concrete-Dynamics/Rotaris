# ADR-0056 — The build toolchain — The Electron pin moves to 45.1.0 — 2026-11-06 (R-091)

Part 12 of 12 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

## The Electron pin moves to 45.1.0 — 2026-11-06 (R-091)

`electron` moves to **45.1.0** in `apps/desktop/package.json` (exact pin kept), with `electron-builder` to `^26.18.0`
and `electron-vite` to `^6.0.0`, on Dependabot's `electron` group (pull request #49) and the owner's ruling of
2026-11-06 that the fix the bump exposes is made before the merge
([the lane's reading](../../dependency-alerts/2026-11-06-lane-electron-45-1.md)). It is the first move across a
**major** since 44.3.0: the module interface changes with it, and the native-module obligation below is exactly what
is owed for that.

Read from each runtime with `ELECTRON_RUN_AS_NODE=1 electron -p process.versions` (45.1.0 on Linux x86_64, 2026-11-06;
44.10.0 as part 11 measured it):

| | Electron 44.10.0 | Electron 45.1.0 |
| --- | --- | --- |
| Node | 24.22.1 | 24.22.1 |
| Chromium | 152.0.7977.169 | 156.0.8078.49 |
| V8 | 15.2.124.45-electron.0 | 15.6.75.19-electron.0 |
| `process.versions.modules` | 149 | **150** |

**Consequence 7 is the case, and rule 4 is what settles it.** The module interface moves (149 → 150), so
`better-sqlite3` and `node-pty` must be rebuilt against 45.1.0 and load-proved under the shipped binary: that is rule
4, it runs in CI's `package` job on the landed head, and it does not run on this host. This part records the pin and
the interface; the proof is the `package` job's, reported with the pull request.

**`esbuild` becomes a direct dependency of `apps/desktop` in the same change.** `electron-vite` 5 declared `esbuild`,
so the two proof scripts that `require('esbuild')` (`restore-kill-proof.mjs`, `terminal-proof.mjs`) resolved it
through that dependency and `restore-kill-proof.mjs` carried an `eslint-disable-next-line
import-x/no-extraneous-dependencies` to say so. `electron-vite` 6 drops `esbuild` for `rolldown`, so nothing in the
tree brings it in after the bump, the disable suppresses a rule that reports nothing, and the gate fails on it
(`reportUnusedDisableDirectives: 'error'`). `esbuild` is therefore declared in `apps/desktop/package.json`
(`^0.28.2`, the range `vite` 8.2.4 peers on) and the now-obsolete disable is removed. The measurement and the CI red it
answers are in [the lane's reading](../../dependency-alerts/2026-11-06-lane-electron-45-1.md) §1.

**Read differently from part 11, on purpose.** Part 11 kept the 44 line "partly for this" — Dependabot's #49 refused
CI's `package` job twice on 2026-11-04 under 45, where `main` passed under 44.3.0, and the refusal was written as
[the note](../../../defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md). Read
again on 2026-11-06 against Dependabot's `production` pull request #54, which keeps `electron` at **44.10.0**: its
`package` job refused the same step on one run (41905781129) and **passed** it on the other (41905796288) **on the same
head**, so the refusal is the step's own flake and not 45's, and the note now carries that as its dated observation.
The move to 45 is therefore taken on the owner's ruling with the reasoning above, not left to the pull request.
