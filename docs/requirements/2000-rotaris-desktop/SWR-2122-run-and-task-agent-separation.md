---
req-id: SWR-2122
status: approved
trace: required
test: required
title: "Separate run control from task-agent inspection"
epic: SWR-2000
date: 2026-07-22
---

# Separate run control from task-agent inspection

The Rotaris Workspace shall render session-level run control separately from task-agent
instances. The task-agent list shall contain only real child instances and shall identify each
by its agent type, with the task title as the supporting line. The transcript shall initially
show all run events; selecting a task agent shall explicitly scope it to shared context plus
that agent's events, and users shall be able to return to the full run transcript.
Run-level status, model, reasoning, pause, cancel, and compression controls shall be presented
in a dedicated Run header. Per-agent context usage shall be labelled as that agent's context
window rather than a session total.

## Acceptance criteria

- The synthetic session root is not selectable or displayed as a task agent.
- The default transcript contains events from all agents; task selection scopes it and the scope
  control restores the full transcript.
- The Run header owns root-only controls, while the inspector contains only selected task-agent
  details and controls.
- Task-agent rows lead with the agent type (persona) and show the task title beneath it.
- The inspector explicitly explains that its context meter is per-agent.
