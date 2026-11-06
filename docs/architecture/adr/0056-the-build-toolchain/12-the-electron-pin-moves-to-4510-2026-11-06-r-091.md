# ADR-0056 — The build toolchain — The Electron pin moves to 45.1.0 — 2026-11-06 (R-091) — withdrawn before merge

Part 12 of 12 of [ADR-0056](../0056-the-build-toolchain.md), which indexes every part.

> **Status: withdrawn before merge, the same day (2026-11-06).** The branch that carried this moved the pin to 45.1.0
> and declared `esbuild` directly; CI's `package` job (rule 4) refused the packaged launch on **both** of its runs, the
> run never starting a session, where `main` under **44.10.0** passed the same step the same day. The pin therefore
> **stays at 44.10.0** (part 11) and **nothing in this part is in force**. The record is kept because rule 4's refusal
> under a major is exactly what a later reader needs to see beside part 11's "partly for this".

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

**Read differently from part 11 at first, and then put back to part 11's reading.** Part 11 kept the 44 line "partly
for this" — Dependabot's #49 refused CI's `package` job twice on 2026-11-04 under 45, where `main` passed under
44.3.0, and the refusal was written as
[the note](../../../defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md). This
part first read a 44.10.0 red/green pair as the step's own flake and said the move to 45 was safe on the owner's
ruling. **The corrected tally on 2026-11-06 withdraws that and re-instates part 11's reading.** The pair is on **#52's**
head (`f1442691`), not #54's; and every 45.1.0 run of every branch refused the step while 44.10.0 runs passed — 4
refusals of 4 under 45.1.0 (Dependabot #49's 41905629985/41905640745 and this branch's 42271282568/42271350580) against
1 refusal of 5 under 44.10.0, with `main` itself passing under 44.10.0 on 2026-11-06 (42252399585). The evidence
artifact shows the difference plainly: under 44.10.0 the launch writes `session <uuid> started` and five model
requests; under 45.1.0 neither appears and the launch ends with 0 sessions. The branch that would have moved the pin
was **withdrawn before its merge** for this reason (owner's ruling, 2026-11-06), and the pin stays at **44.10.0**.
Cause undiagnosed; rule 4 is not discharged for 45.1.0.

**What this part therefore records as the standing decision.** The Electron pin is at **44.10.0**, per part 11. The
45.1.0 move is **not taken**: there is no branch carrying it on `main`, and a future attempt owes a diagnosis of the
packaged launch's missing session first (see
[the note](../../../defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md) and
[the lane reading](../../dependency-alerts/2026-11-06-lane-electron-45-1.md) §4 for the full tally). The `esbuild`
declaration recorded above is a property of the absent 45.1.0 branch and does not move `main` either.
