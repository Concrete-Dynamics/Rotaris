---
req-id: SWR-2447
status: approved
trace: required
test: required
title: "Transcript repaints on a timer while a row is live"
epic: SWR-2000
date: 2026-08-10
---

# Transcript repaints on a timer while a row is live

Elapsed-time labels on live rows (a thinking row without duration, a tool row with
`status == "running"`) shall keep counting between store refreshes. The transcript view runs a
repaint timer only while at least one such live row exists in the model, and stops
it when none remain, so an idle transcript costs no timer wakeups.

A counting clock only has to move once a second, but a streaming terminal preview
(SWR-2428) redraws far more often than that, so the same timer runs faster while
one is on screen and drops back afterwards.

## Acceptance criteria

- While the model contains a live thinking or running tool row, a ~1 s timer repaints the
  viewport (no size relayout — the header height is constant).
- While one of those live rows is a running terminal call, the same timer runs at
  roughly a quarter second instead, and returns to ~1 s when none remain.
- When no live row remains after a model sync, the timer is stopped.
- The timer never mutates model data; it only schedules a repaint.
