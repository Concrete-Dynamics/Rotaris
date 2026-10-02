## A refused confinement start is not reported as REQ-NOTIFY-061 says

When a run asks for a confinement mode the host cannot deliver, or names a mode no one recognises, the run host refuses
it before any session exists (`prepareRun`'s start-time gate in `apps/desktop/src/run-host/configuration.ts`, answered by
`launchSession` in `apps/desktop/src/run-host/launch.ts` as `session.configuration`, "The run was refused before it
started", with the backend's reason and remediation as the detail). REQ-NOTIFY-061's notice for that case is not what
reaches the screen:

- **Start** (`session.start` in `apps/desktop/src/main/commands/session.ts`): the notice's title is the headline and the
  refusal wording is only its copyable detail; its message is empty, where REQ-NOTIFY-061 has the wording "in both its
  message and its copyable detail". It carries no action, where REQ-NOTIFY-061 has "an action returning to the workspace
  view". It offers no retry, as required.
- **A prompt on an existing session** (`session.prompt`): the engine's `setupFor` re-runs the same gate and refuses as
  `configuration`; main raises no notice at all and the composer's error line is the only report.
- **Continue** (`session.continue`): the notice is raised as the start's is, with the same two gaps.

The run host cannot tell this refusal from any other configuration refusal by its code, so main cannot single it out.
`apps/desktop/src/main/index.ts`'s run-result handler says "The authentication and sandbox classes ahead of it are not
built either": the sandbox class never reaches a run result, because the run never starts. The indicator clause
("The sandbox indicator stops describing the run as sandboxed") is met only because no such indicator is drawn
([no-workspace-indicator-names-the-confinement-backend.md](no-workspace-indicator-names-the-confinement-backend.md)).
Found read-only by the third triage; confirmed on `fin5-noticed-gaps` by `launch.test.ts` (the refusal's code) and
`commands/session.test.ts` (the notice's shape).

## Specs

- REQ-NOTIFY-061 — the message and the copyable detail, the workspace-view action, no retry.
- REQ-NOTIFY-060 — the sandboxed-launch class, second in order.
- REQ-SANDBOX-120 — the refusal's title and body; REQ-SANDBOX-095/097, refused before a session exists.

## Relevant files

- `apps/desktop/src/run-host/configuration.ts` — `prepareRun`'s gate and `effectiveSandboxMode`.
- `apps/desktop/src/run-host/launch.ts` — `launchSession`'s refusal.
- `apps/desktop/src/run-host/host.ts`, `apps/desktop/src/run-host/dispatch.ts`, `packages/engine/src/sessions.ts`
  (`setupFor`) — the continuation's refusal.
- `apps/desktop/src/main/commands/session.ts` — the notices for `session.start`, `session.prompt`, `session.continue`.
- `apps/desktop/src/main/index.ts` — the run-result handler's comment.
