## A base-tree session continues beside another run in its workspace

REQ-GIT-120's second clause — "resuming a NON-isolated session SHALL be refused, surfaced as `This session uses the base
workspace, so it cannot continue while another run is active.`" — and REQ-MONITOR-256's second sentence ("Resuming a
base-workspace session must be refused while a run is active there") are not built: no code in `apps/` or `packages/`
carries the refusal's text. A session with no worktree binding (its Branch column `—`) can be continued — by a message to it
at rest, by Continue, by the retry, or by the plan gate's relaunch — while another run executes in the same workspace's base
tree, so two runs write one working tree, which is what REQ-GIT-119's hint says isolation exists to prevent. `Sessions.prompt`
(`promptHeld`), `continueSession`, `retry` and `planDecision` refuse only a run of the session itself ("A run is already
active."). Noticed on 2026-10-07 by both advocates of the R-072 consortium's question GI1 (OQ-224), whose ruling builds it on
the count it rules ("a run active … with that session excluded"); recorded before its code, as the ruling asks.

## Specs

REQ-GIT-120 (second clause), REQ-MONITOR-256 (second sentence), REQ-MONITOR-258 (the closed list's first gate: "resuming or
continuing a session in a workspace where a run is already executing"); `PD-GIT-001` (the count it is asked on). Loading or
focusing a session stays allowed (PD-SHELL-002).

## Relevant files

- `packages/engine/src/sessions.ts` — `promptHeld`, `continueSessionHeld`, `relaunchPlanDecision`, `planDecisionHeld`: the
  paths that start a further run of an existing session; `resume` (a load), which stays unrefused.
