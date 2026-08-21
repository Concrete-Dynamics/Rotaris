---
req-id: SWR-2089
status: approved
trace: required
test: required
title: "Inspector persona tabs"
epic: SWR-2000
date: 2026-07-20
---

# Inspector persona tabs

The workspace inspector shall organize agent inspection as a `QTabWidget` with one tab per persona type. Selecting an agent in the Workspace agent tree shall switch to that agent's persona tab and inspect the selected instance.

## Acceptance criteria

- Clicking an agent selects its persona tab and displays that agent's controls and live data.
- Each configured or active persona has one inspector tab; a tab summarizes the selected instance of that persona.
- Model, reasoning, steer, pause, and cancel controls retain the semantics defined by SWR-2084, SWR-2086, and SWR-2088.
- At compact widths, selecting an agent opens the inspector drawer and keeps it mutually exclusive with the agents-and-todos drawer.
