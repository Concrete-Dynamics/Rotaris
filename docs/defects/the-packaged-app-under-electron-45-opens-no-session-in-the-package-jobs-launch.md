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

**Read again on 2026-11-06 (the Electron-group branch over `b6501e8e`, R-091): the refusal is not 45's, it is the
step's own flake.** Dependabot's `production` pull request #54 keeps `electron` at **44.10.0** and its `package` job
read the same step two ways on the **same head `f1442691`**: refused with the same `expected one session, found 0` on
run 41905781129, and **passed** on run 41905796288. On the refusing runs the evidence artifact's
`release/load-proof.app.log` ends `run host exited (0), an orderly end` and `main process exiting with status 0` with
`0 sessions` written; on the passing runs the same log lists the model requests and `run … ended completed
(tasks_complete)`, so the launch wrote a session on one run and not on the other. Nothing in #54 touches sessions,
the store or the launch, and nothing in the diff moves Electron. Against that, the two refusals of #49 (45.1.0) and
one of #54 (44.10.0) are one shape with one green run between them, so **no run yet shows Electron 45 causing this** —
the cause is a race the probe reads differently run to run, and the repair belongs to `package.mjs`'s probe, not to
pull request #49's bump. Not repaired here either (this branch keeps the step as it is); recorded so a later reader
does not take "45 is refused" from the 2026-11-04 pair. The branch's own reading is
[`docs/architecture/dependency-alerts/2026-11-06-lane-electron-45-1.md`](../architecture/dependency-alerts/2026-11-06-lane-electron-45-1.md) §4.

## Specs

ADR-0056 rule 4 (the build proves the bindings load under the shipped binary and fails if they do not) and ADR-0054's
packaged launch: the step is their check, and it refuses. No requirement is shown contradicted until the cause is read.
The 2026-11-06 reading finds a run of #54's own package job passing that step under 44.10.0, so what the step measures
is not settled by these refusals and no requirement is shown contradicted by 45 either.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the packaged launch and its "expected one session" check.
- `apps/desktop/package.json` — the pin pull request #49 moves.
- `.github/workflows/ci.yml` — the `package` job.
