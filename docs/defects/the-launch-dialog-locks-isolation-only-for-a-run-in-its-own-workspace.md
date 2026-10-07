## The launch dialog locks isolation only for a run in its own workspace, while main forces it for a run in any

The session-launch dialog pre-checks and disables its isolation checkbox (REQ-GIT-119) only when a session of the window's
own workspace is busy: `currentBusy || listBusy` over the focused session and that workspace's session list. Main's
`session.start` forces a launch made without an explicit tree into `rotaris/session/<id>` whenever a run is active anywhere
in the instance (REQ-GIT-120, REQ-MONITOR-251), asking the run host's instance-wide count. So in a second window on an idle
project, while another project's run executes, the dialog offers isolation unchecked and enabled, without the hint, and a
launch left unchecked is still placed in a worktree it did not show. The dialog and main disagree about what "another run is
active" means. This held before PD-SHELL-009 too (the run host's count was the instance's for every caller then); it was
noticed in fin28's repair round 1, when the verifier found that keying `runs.active` by workspace had silently narrowed
main's force to the workspace, which that round reverted for `session.start`.

## Specs

REQ-GIT-119 ("While another run is active, isolation SHALL be mandatory: the checkbox is pre-checked AND disabled") against
REQ-GIT-120 ("Whenever any run is active: launching a new session without an explicit worktree request SHALL force-create
one"). REQ-GIT-120's "any run" reads instance-wide; REQ-GIT-119's "another run" and its hint ("Two runs sharing one working
tree would overwrite each other's edits") can be read either way, and the build reads it per workspace. Whichever reading is
meant, one of the two surfaces contradicts it: either the dialog should lock for a run in any project, or main's force should
be keyed to the workspace (which REQ-GIT-120's "any" does not say). The reading is the specification's to settle; not
classified here.

## Relevant files

- `apps/desktop/src/renderer/main.tsx`: the launch dialog's `runActive` (`currentBusy || listBusy`), over the window's
  workspace only.
- `apps/desktop/src/main/commands/session.ts`: `session.start`'s forced isolation, asking `runs.active` with the empty id
  (the instance's count).
- `apps/desktop/src/run-host/dispatch.ts`: `runs.active`, keyed by workspace since PD-SHELL-009, the empty id counting the
  instance.
- `apps/desktop/src/main/commands/session.test.ts`: the REQ-GIT-120 case pinning main's instance-wide force.
