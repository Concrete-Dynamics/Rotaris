---
req-id: SWR-2099
status: approved
trace: required
test: required
title: "Agent-scoped workspace and pop-out transcripts"
epic: SWR-2000
date: 2026-07-22
---

# Agent-scoped workspace and pop-out transcripts

Selecting an agent in the Workspace shall filter the transcript to shared user and system
context plus events attributed to that agent. Events attributed to other agents shall not be
shown. Each agent instance tab in the optional inspector pop-out shall use the same filter for
that tab's agent and shall update as the session transcript changes.

## Acceptance criteria

- Selecting a different Workspace agent immediately replaces the visible agent-attributed rows
  with rows for the newly selected agent.
- User and system rows remain visible as shared conversation context.
- Agent messages, thinking, and tool rows from every non-selected agent are hidden.
- Every pop-out instance tab shows the same scoped transcript projection for its own agent.
- Appending transcript events refreshes an open pop-out without showing events from other agents.
