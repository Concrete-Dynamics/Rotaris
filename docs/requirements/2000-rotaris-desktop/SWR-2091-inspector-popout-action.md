---
req-id: SWR-2091
status: approved
trace: required
test: required
title: "Inspector pop-out action"
epic: SWR-2000
date: 2026-07-20
---

# Inspector pop-out action

The workspace inspector shall expose a visible `Pop out` action for the inspected agent. Activating it shall open or raise the separate persona window defined by SWR-2004 and select the inspected agent's instance tab.

## Acceptance criteria

- The action is disabled when no agent is selected.
- Activating the action emits the selected agent ID.
- The action works whether click-to-pop-out is enabled or disabled.
