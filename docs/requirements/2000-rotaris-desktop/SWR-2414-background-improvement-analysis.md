---
req-id: SWR-2414
status: approved
trace: required
test: required
title: "Background improvement analysis after a completed run"
epic: SWR-2000
date: 2026-07-24
---

# SWR-2414 — Background improvement analysis after a completed run

When a Rotaris task run reaches a terminal state, Rotaris MUST persist and
show that terminal state before it starts optional improvement collection in a
dedicated background worker. The composer and new-run actions remain available
while collection is active. Global chrome and the Workspace Run header MUST
show a pulsing, accessible `Reviewing run for improvements…` activity without
changing the completed status, presenting a modal, progress percentage, or
control.

When collection finishes, Rotaris MUST clear the activity indicators, refresh
the proposal library, and publish a persistent `N improvement proposals ready`
notice with a `Review proposals` action that opens Library → Improvement
proposals. An empty result MUST publish `Improvement analysis complete — no
proposals`. App shutdown MUST cancel active and queued collection, suppress
artifact persistence and completion notices, and not detach collection into a
durable service.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A completed-run analysis records an observable active state and clears it after cancellation or completion. | Workspace store and collector worker result handling. | `apps/rotaris/tests/test_background_improvement_analysis.py` |
| Integration | The task worker persists terminal state before it hands a captured analysis job to the background worker. | RunBridge, SessionManager persistence, and collector seam. | `apps/rotaris/tests/test_background_improvement_analysis.py` |
| User-flow E2E | A desktop user completes work, immediately starts follow-up work while analysis is visible, then reviews a proposal notice. | Real PySide6 Rotaris workflow with delayed collector. | `apps/rotaris/tests/test_background_improvement_analysis.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
