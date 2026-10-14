## A workspace opens while the global configuration cannot be loaded

With a global `agents.yaml` the build refuses to load (fin42's `notice-proof` section 1b: one hook entry with
`timeout_seconds: 0`, REQ-HOOKS-012), the window opens the workspace as usual — the main window loads, the store opens,
the Git and prompt reads run — with its configuration unloaded, and the failure is first raised as a warning or error
notice when a prompt is submitted: "The run was refused before it started", whose detail is REQ-CONFIG-478's report. What
the window showed at the open was not read (`notices.ts` logs only warnings and errors, and one earlier notice of a lower
severity is in the log unnamed). REQ-CONFIG-478 says plainly that where the rejected key or value sits in the global scope
no workspace opens until it is corrected, and that the failure presents as the opening workflow's failure, with one
concrete next step named. ESC-29 ("a withdrawn key in *global* scope stops every workspace opening", ruled report-and-carry-on
for that key alone, `docs/architecture/owner-decisions.md`) read the requirement the same way for every other fatal
condition. Raised as OQ-279 by fin42, which built nothing; recorded here
by fin43 (`fin43-optional-findings`) from the fin42 review's finding that it reads as a defect beside the question. What
the build must do is OQ-279's ruling: whether "no workspace opens" refuses every workspace while the global file is invalid
or opens each one unconfigured, and whether the notice is raised at the open.

## Specs

- `REQ-CONFIG-478`: "Where the rejected key or value sits in the **global** scope, no workspace opens until it is
  corrected", and "Opening a workspace is a workflow a user starts, so this failure MUST present as REQ-NOTIFY-001's
  *failed with one concrete next step named*" — the build opens the workspace and presents the failure at the first run.
- `REQ-CONFIG-233` (the fatal conditions), `REQ-HOOKS-012` (the invalid entry used to reach it).

## Relevant files

- `docs/architecture/open-questions.md` OQ-279 — the reading, the measurement and what a ruling decides.
- `apps/desktop/scripts/notice-proof.mjs` section 1b — asserts the refusal at the run and its report; nothing about the open.
- `apps/desktop/src/main/index.ts` and the run host's configuration load — where the workspace opens with the
  configuration unloaded and where the run is refused.
