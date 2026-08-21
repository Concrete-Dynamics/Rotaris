---
req-id: SWR-2913
status: approved
trace: required
test: required
title: "A session that is not running shows no live agent"
epic: SWR-2000
date: 2026-08-10
---

# SWR-2913 — A session that is not running shows no live agent

The workspace describes one run through two independent readings of the same
snapshot. The run header, the session list and the composer mode come from
`SessionState.execution_status`. The agent tree, the live counter, the inspector
and the mission view come from `SessionState.child_states`. Nothing ties them
together, so a snapshot in which the two disagree is rendered as a contradiction:
`RUN Completed` above a pulsing dot and `1 live`, with an inspector that still
reads `running`.

SWR-2912 stops the engine writing such a snapshot. This requirement makes the
desktop incapable of *displaying* one, whatever it reads — a session recorded by
an older build, a process killed before it could write its terminal status, or a
run whose optimistic UI update lost a race with the final refresh.

A session whose status does not claim a run MUST NOT present a live agent.

## Acceptance criteria

- `build_session_projection` reconciles the projected agents against
  `state.execution_status` before returning. When that status is not in
  `rotaris_core.session.recovery.ACTIVE_EXECUTION_STATUSES`, no projected agent
  is left `running`, `waiting`, or `queued`.
- `ACTIVE_EXECUTION_STATUSES` is reused, not restated. It is already the single
  answer to "does this status claim a live run", shared with stale-session
  detection (SWR-2817) and worktree integration; a second list in the projection
  would be a fourth place to disagree.
- An unfinished agent takes the run's own outcome, mirroring the mapping the
  projection already applies to the run summary: a completed run leaves it
  `done`, a failed run `failed`, and anything else — paused, cancelled,
  interrupted — `cancelled`.
- The row says why it changed rather than silently changing colour: its activity
  text is replaced with a short reason naming the run's end, and its active-tool
  chips are cleared for the reason `RunBridge` already clears them when a child
  ends mid-call — a stopped agent holding a live tool is the same contradiction
  one step down.
- A session that really is running is untouched: every agent keeps the state its
  record carries, including `queued` and `waiting`.
- `idle` is untouched too, and for a different reason: it is the status a session
  carries *before* it has reported a run, so there is no ending to give its
  agents. Only a run that stopped settles them.
- No view is special-cased. The agent tree, the `N live` counter, the dashboard,
  the mission graph, the per-persona windows and the inspector all read
  `AgentNode.state` / `AgentNode.is_live`, so the reconciliation reaches them
  through the store without any of them being changed.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A finished session's snapshot that still holds a running child projects no live agent; a failed run's unfinished agents read `failed`; a genuinely running session keeps its live and queued agents | `build_session_projection` | `apps/rotaris/tests/test_services.py::test_a_finished_session_projects_no_live_agent`, `::test_a_failed_session_projects_its_unfinished_agents_as_failed`, `::test_a_running_session_keeps_its_live_agents` |
| Integration | Loading such a session into the workspace store leaves the header and the agent list agreeing, with the live counter at zero | `ConfigService.apply_session_projection` → `WorkspaceStore` → workspace view | `apps/rotaris/tests/test_views.py::test_a_finished_session_shows_no_live_agent_in_the_workspace` |
| User-flow E2E | A user watches a run finish in Rotaris and the agent list agrees with the run header instead of contradicting it | Public product boundary → user-observable result | `apps/rotaris/tests/test_run_wiring_e2e.py::test_a_finished_run_leaves_no_live_agent` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
