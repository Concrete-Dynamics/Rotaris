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

## Repaired — 2026-10-07, fin29 (PD-GIT-001, OQ-224; REQ-GIT-119, REQ-GIT-120, REQ-MONITOR-251)

Classified by the R-072 consortium as its question GI1, ruled as [OQ-224](../../architecture/open-questions.md) and recorded
as [`PD-GIT-001`](../../product/directives.md#pd-git-001): the per-workspace reading, with a workspace folder nested inside
or around another counted as sharing it. The dialog and main now read one count. The run host answers `runs.active` with
`scope: 'sharing'` from `Sessions.activeRunsSharing` (`packages/engine/src/sessions.ts`): the workspace's own active runs,
whatever tree they run in, and any active run whose effective tree is the workspace's folder, lies inside it or contains it
(`treesOverlap`, whole components under the canonical rule). Main's `session.newId` answers `{sessionId, isolationRequired}`
from it (an unreadable count is required), and the renderer's launch dialog shows that answer (`isolationRequiredOf`,
`packages/ui/src/StartSessionDialog.tsx`) in place of `currentBusy || listBusy`. `session.start` forces the default tree on
the same count, an unreadable count forcing too, and every forced placement raises an informational notice scoped to the new
session with REQ-GIT-119's hint and the branch (`apps/desktop/src/main/commands/session.ts`). Pinned by
`commands/session.test.ts` (an idle project shares its own base tree while another project runs, asking `ws-1` with `scope:
'sharing'`; a sharing run forces the worktree and raises the notice; an unreadable count forces; `session.newId`'s three
answers), all red on the source before; `run.test.ts`'s PD-GIT-001 cases (same root, inside, around, a common string prefix,
the outer workspace's isolated run not counting for an inner folder, the session excluded); `dispatch.test.ts`'s `sharing`
hop; and `start-session-isolation.test.ts` (the dialog locked, unlocked, and locked on an answer that does not say). Shown by
`pnpm part-j-proof`'s two-window launch: while A's project runs, B's dialog reads unchecked and enabled and B's unchecked
launch ends `completed` on B's base tree with no worktree binding. fin28's repair round 1 (`32ac0c0`) had made the
instance-wide reading deliberate; that claim is kept, falsified, beside its replacement in `PD-SHELL-009`'s first execution,
ADR-0013's sixth execution and the process view.
