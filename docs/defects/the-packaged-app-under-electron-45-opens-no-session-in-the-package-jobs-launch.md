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

## Specs

ADR-0056 rule 4 (the build proves the bindings load under the shipped binary and fails if they do not) and ADR-0054's
packaged launch: the step is their check, and it refuses. No requirement is shown contradicted until the cause is read.

## Relevant files

- `apps/desktop/scripts/package.mjs` — the packaged launch and its "expected one session" check.
- `apps/desktop/package.json` — the pin pull request #49 moves.
- `.github/workflows/ci.yml` — the `package` job.
