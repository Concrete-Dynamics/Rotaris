## The packaged app under Electron 45 opens no session in the package job's launch

Dependabot's `electron` group, pull request #49 (Electron 44.3.0 → 45.0.0, with electron-builder and electron-vite), fails
CI's `package` job at its last step on both of its runs of 2026-11-04 (41876152753, 41876164187): after the installer,
the fuses read back as asked, the portable and the icons, "the packaged app opens a store and runs a terminal call"
ends `error: pnpm package refused: expected one session, found 0`. The same job on `main`, under Electron 44.3.0, passed
the same step (run 41829796480, `ad1a6698`). So the packaged app built with Electron 45 either does not start a run
against the loopback stub model, or does not record its session where the step reads it; the run's evidence artifact
(`windows-x64-package-evidence`) holds what the launch wrote, and was not read here.

Noticed on 2026-11-04 while moving Electron to 44.10.0 instead (acceptance finding AF-05, plan `hrda`,
`docs/architecture/dependency-alerts/2026-11-04-lane-electron-44-10.md` §2), which keeps the 44 line partly for this.
Recorded, not investigated: the move to 45 is that pull request's.

**Read against the corrected tally on 2026-11-06 — the reading below was revised the same day.**
[Dependabot's #54 keeps `electron` at **44.10.0**](https://github.com/Concrete-Dynamics/Rotaris/pull/54) and its
`package` job **passed** the step on both of its runs (41906236287, 41906246618). The one 44.10.0 refusal that exists
is on **#52's** head (`f1442691`, the `typescript` pull request), which also keeps Electron at 44.10.0 — so the same
head went red once and green once, which shows the step is not perfectly deterministic but does **not** show that 45 is
fine. Every 45.1.0 run of every branch refused the step: #49's 41905629985/41905640745 and this branch's
42271282568/42271350580. **The refusal is one shape across both refusals — the run host starts, the store opens and
the MCP setup completes, and then the launch ends with no session — and every run that refused was under 45.1.0,
while every run that passed was under 44.10.0.** So the original reading stands: the packaged app under Electron 45
opens no session, this record does not know why, and the cause is open. [The lane file](../architecture/dependency-alerts/2026-11-06-lane-electron-45-1.md)
§4 tabulates all nine runs and retracts an intermediate "flake" reading of this note.

The 2026-11-06 branch that re-asked this question (the `electron` group to 45.1.0, with `esbuild` declared directly,
R-091) is **blocked on ADR-0056's rule 4** for exactly this reason: the gate's own lint error on the group's head was
repaired (the `esbuild` declaration), but the packaged launch still refuses and the run never starts.

## Specs

ADR-0056 rule 4 (the build proves the bindings load under the shipped binary and fails if they do not) and ADR-0054's
packaged launch: the step is their check, and it refuses **on every 45.1.0 run read so far** and passed every 44.10.0
run of 2026-11-06 including main's own. Rule 4 is what the refusal is about: the packaged app under 45.1.0 opens no
session, so the bindings are not load-proved for that major and no requirement is shown contradicted until the cause is
diagnosed. The superseded "flake" reading is retracted in the 2026-11-06 paragraph and in the lane file §4.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the packaged launch and its "expected one session" check.
- `apps/desktop/package.json` — the pin pull request #49 moves.
- `.github/workflows/ci.yml` — the `package` job.
