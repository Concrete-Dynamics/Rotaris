## The skills, instructions and queue readers fall back to defaults on a fatal configuration load

Raised by an advocate of the consortium that ruled [OQ-279](../../archive/architecture/open-questions/58-spikes-and-later-questions-25.md#oq-279) (2026-10-13, under
[R-072](../../product/requests.md#r-072)) and recorded on 2026-10-14 by fin43 (`fin43-notices-and-config`), which built that
ruling; confirmed by reading the three readers on that branch. The ruling does not decide it.

Under a fatal configuration load in either scope, every run and every isolated start is refused with REQ-CONFIG-478's report
(REQ-EVENTS-021, REQ-GIT-071), and since OQ-279's ruling the report is raised as a persistent error notice when the workspace
opens. Three readers outside the run's own load do not refuse: each reads the saved configuration again, finds it does not
load, logs a `warn` line and carries on with a value the files did not give.

- The run host's `skills:` section reader returns `SKILLS_DEFAULTS` ("the shipped defaults stand").
- The run host's instructions reader returns `INSTRUCTIONS_DEFAULTS` with the master switch on ("injection on, no file
  switched off"), deliberately, so a broken file does not take an agent's standing instructions away.
- The workspace service's requirements reader keeps the queue's last values (or `REQUIREMENTS_DEFAULTS` when the first load
  of the service fails), and arms the queue from them (`queue.set`).

No run starts on a fatal load, so the first two shape nothing a run uses today; they shape what a surface that reads them
shows (the skills and instructions inventories). The third arms or holds the requirements queue on values the files did not
state. Whether any of the three should refuse, show the fault, or keep the defaults as built is not settled by the
specification as far as this note's author read it.

## Specs

REQ-CONFIG-478 (a fatal load names the file, the scope and the key, and nothing proceeds on it as if loaded) read with
OQ-279's ruling ("a workspace opens" means its configuration loads; runs and isolated starts are refused). REQ-WORKSPACE-048
and PD-WORKSPACE-002 (the instructions policy), REQ-WORKSPACE-051 onward (skills), REQ-TRACE-476/482 (the automatic queue).
Whether a reader falling back to defaults contradicts REQ-CONFIG-478 is the open part; this note does not rule it.

## Relevant files

- `apps/desktop/src/run-host/host.ts` — `section` and `instructions` in the skills and workspace-context deps: on `!loaded.ok`
  they return `SKILLS_DEFAULTS` and `INSTRUCTIONS_DEFAULTS`.
- `apps/desktop/src/workspace-service/delivery.ts` — `loadConfig`: on `!r.ok` it keeps the last `requirements`,
  `permissionMode` and `approvalTimeoutSeconds` and the queue armed from them.
- `apps/desktop/src/main/config-fatal-notice.ts` — the open-time notice OQ-279's ruling added, for reference.

## Outcome — repaired 2026-10-14 (fin44, `fin44-hooks-and-config`), under OQ-279's ruling

The orchestrator's brief for fin44 read OQ-279's ruling as deciding this note: "a workspace opens" means its configuration
loads, a fatal load leaves it unloaded with every run refused, and REQ-CONFIG-478 says the load "fails as a whole rather than
falling back to a default". So no reader answers an unloaded configuration with defaults:

- **Skills and instructions (run host).** `section` and `instructions` answer `SavedRead` — the section, or the fatal report
  (`renderFatal`) — and never `SKILLS_DEFAULTS` or `INSTRUCTIONS_DEFAULTS` (`apps/desktop/src/run-host/host.ts`). `SkillHost`
  (`skills.ts`) exposes `fault(root)`; the five `skills.*` requests refuse with code `config.fatal`, headline
  `SKILLS_CONFIGURATION_UNLOADED` and the report as detail (`skillsUnloaded`, `dispatch.ts`); `forceLoad` refuses with it. An
  agent built while the file does not load gets the sections its run was configured with (`configured`, from
  `configuredRuns`), or no skill and no instruction file where no run of that session is known, and what it reads that way
  is not cached for the workspace, so the agent built after the file is corrected reads it. The comment that justified the
  instruction defaults ("a broken file must not silently take an agent's standing instructions away") is kept in `host.ts`
  as the falsified reason beside its replacement.
- **The Skills category (renderer).** A refused `skills.read` leaves no projection standing, and `SkillsSettings` draws the
  fatal report (`Fatal`, exported from `ConfigSettings.tsx`, the card Models, Personas and Runtime draw) in place of the
  table, the switch and the two actions; the composer's catalog is empty, so no skill command registers.
- **The requirements queue (workspace service).** `delivery.ts` holds the report (`configFault`) and re-reads the file at each
  claim, launch preview and run-starting board action; meanwhile `scheduleQueue` (`unconfigured`,
  `packages/workspace/src/delivery/runs.ts`) defers every candidate with "The workspace configuration did not load, so nothing
  starts from the queue until it is corrected: <report>", the claim takes nothing, the preview does not promise a start, and a
  run-starting action is refused and provisions nothing. A corrected file starts the queue at the next claim.

Pinned by: `apps/desktop/src/workspace-service/delivery.test.ts` (the two OQ-279 cases — the first red on the code before,
which claimed REQ-101 on the unloaded configuration; the second provisioned and released on it), `packages/workspace/src/delivery/runs.test.ts`
(the scheduler's `unconfigured`), `apps/desktop/src/run-host/skills.test.ts` (four cases, each red with the defaults fallback
restored in `SkillHost`), and `packages/ui/src/settings/skills-fatal.test.ts` (the Skills category draws the report). No
proof drives a fatal load into Settings › Skills or the board; `notice-proof` 1b and 1c drive the fatal load itself.
Noticed beside it, not repaired:
[`a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md`](a-fatal-key-in-the-global-file-is-reported-in-the-workspace-file.md) (repaired since, 2026-10-14, fin45).
