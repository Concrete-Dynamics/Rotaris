## The run-start setting says the plan gate is not built

The Runtime settings category's run-start mode control carries the hint "Stored for the next run. The plan gate itself
is not built in this version." The plan gate has been built since ADR-0062 (a held run parks at
`awaiting_plan_decision`, and the gate is answered in the workspace), so the hint tells the user that choosing `plan`
does nothing. It also says nothing of the release: under `PD-ORCH-003` a session that holds an approved release is not
held whatever the mode says, and a surface that offers the mode for such a session is to say so.

Noticed 2026-09-28 by the read-only scout of `PD-ORCH-003` revision 2 under R-065, and confirmed in the source while
building it; not repaired there, since the lane that built it draws no surface. Not driven in the built app.

## Specs

`REQ-ORCH-152` (the mode is offered in the settings interface and `plan` applies REQ-ORCH-153's gate), narrowed by
`PD-ORCH-003`: "A surface that offers the run-start mode for a session holding a release SHALL state that the session
is released, so the control never reads as promising a gate that will not open." The hint promises the opposite: that
no gate will ever open.

## Relevant files

- `packages/ui/src/settings/ConfigSettings.tsx` — the `run-start-mode` control's `settings__hint` (around line 248).
- `docs/architecture/adr/0062-the-plan-gate-as-a-run-segment.md` — the gate as built.
