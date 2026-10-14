## The skills, instructions and queue readers fall back to defaults on a fatal configuration load

Raised by an advocate of the consortium that ruled [OQ-279](../architecture/open-questions.md#oq-279) (2026-10-13, under
[R-072](../product/requests.md#r-072)) and recorded on 2026-10-14 by fin43 (`fin43-notices-and-config`), which built that
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
