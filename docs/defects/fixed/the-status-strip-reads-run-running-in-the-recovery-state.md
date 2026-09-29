## The status strip reads "run Running" in the recovery state

While a crash-left session was open without repair, the Workspace badge, the Mission subtitle and the Mission run row
all read `Run needs recovery`, but the window's bottom status strip read `run Running`. The strip built its run item
from `presentationStatus(session.executionStatus)` alone and did not consult the recovery fact. It said a run was active
when none existed, beside a run-level agent drawn `paused`.

Found 2026-09-28 by the fourteenth review round of the merged revision 4 build of `PD-ORCH-005` (R-065), driving the
built app: a scripted delegating run killed with SIGKILL, relaunched on the same profile, the session opened from
Sessions without repair. Reproduced by this round the same way.

## Specs

REQ-CHAT-008's synthetic `Run needs recovery` label for a busy session with no local run, and the presentation that
`PD-ORCH-005` clause 13 (OQ-100) and clause 18 give that state on the other surfaces. REQ-SHELL-038 names the strip.

## Relevant files

- `apps/desktop/src/renderer/main.tsx`: the window root's status items.
- `packages/ui/src/composer.ts`: `statusStripRunItem`, and `runStateOf`, whose recovery test it shares.
- `packages/ui/src/composer.test.ts`, `apps/desktop/src/renderer/recovery-wiring.test.ts`: the tests.

## Repaired — 2026-09-28

By the fourteenth fix round of the merged revision 4 build (R-065). The window root reads the recovery fact from
`useNeedsRecovery`, the same liveness predicate the Workspace and Mission roots read, and names the strip's run item
through `statusStripRunItem`. That function answers `Run needs recovery` exactly where `runStateOf` answers `recovery`,
and otherwise gives the presentation vocabulary as before.

Evidence: `composer.test.ts`, "reads "Run needs recovery" for a busy session with no run here…", and
`recovery-wiring.test.ts`, "main.tsx names the strip's run item from the recovery fact", both red against the unrepaired
code. In the built app, relaunched onto the crash-left session, the strip's first item reads `Run needs recovery`.
