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

## Outcome

**Repaired 2026-09-29 under R-067.** The hint under the Runtime category's run-start mode selector is now
`runStartModeHint` in `packages/ui/src/settings/ConfigSettings.tsx`. It says what `plan` does: "Applies from the next
run. With plan, a run writes a plan and waits at the plan gate for your answer before it changes anything; a question
or an exploration is not held." (REQ-ORCH-152, REQ-ORCH-153's hold and its answer-group exemption). When the followed
session holds a release, it adds that the session is released, that its runs start without the gate whatever the
setting says, and that choosing Plan first on the composer's run-start control plans its next run again
(PD-ORCH-003's surface clause). The renderer feeds it `SessionRecord.planReleased` of the followed session
(`apps/desktop/src/renderer/main.tsx`, the `Settings` root); with no session followed it reads as the base hint. The
span carries `data-testid="run-start-hint"` and `data-released`.

The selector itself re-arms nothing. It defers to Save (REQ-CONFIG-320) and speaks for the workspace's
configuration, so the hint names the composer's chip, whose `plan` choice sends `session.planRearm`. Whether a Save
of `plan` should also re-arm is raised as [OQ-137](../../architecture/open-questions.md) with this reading built.

**Pinned by** `packages/ui/src/settings/run-start-hint.test.ts`: three cases, the base hint, the released hint and the
unreleased session reading as the base, all three red against the old sentence. **Driven in the built app** by
`settings-proof` launch 7, as root under Xvfb on Linux, 2026-09-29. In a workspace of its own set to `plan`, with no
session followed, the hint says what `plan` does and speaks of no release (`data-released="false"`). A prompt is then
held at `awaiting_plan_decision` and the plan approved (`plan_released = 1`). With the approved session reopened and
Settings open on Runtime, the hint reads `data-released="true"`, states "This session is released" and names Plan
first on the run-start control. The workspace file still says `run_start_mode: plan`, since an approval never writes
the mode.
