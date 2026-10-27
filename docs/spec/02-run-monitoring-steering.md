---
reference: ROTARIS-CRW-001
domain: run-monitoring-steering
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Run Monitoring and Steering

## Overview

While a task run is executing, a user must be able to watch what every agent is doing and change what the run does without stopping it. Observable surfaces show run state, the delegation tree of agents, each agent's context-window pressure, tool activity, elapsed times, verification progress, provider quota and credit standing, and queued follow-up work; observable controls let a person steer a live agent, queue follow-ups, switch the run's model, reasoning level or permission mode, force context compression, skip a verification check, pause, or cancel. Every control either takes effect with stated timing or refuses with a visible reason, every displayed state matches what a later resume of the same session would restore, and no view failure, slow consumer, or unreadable snapshot may change or stall the run itself.

---

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`02-run-monitoring-steering/`](02-run-monitoring-steering/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](02-run-monitoring-steering/01-requirements.md) | Requirements; 1. Run lifecycle and host parity; 2. Control surface and refusal semantics; 3. Agent (child task) lifecycle; 4. Run-level status and terminal result | REQ-MONITOR-001 – REQ-MONITOR-302 (39) |
| [02](02-run-monitoring-steering/02-5-delegation-tree-presentation.md) | 5. Delegation tree presentation; 6. Per-agent inspector; 7. Per-persona agent windows; 8. Delegation context header; 9. Context-window monitoring and automatic compression; 10. Manual compression; 11. Tool-call counting and history | REQ-MONITOR-036 – REQ-MONITOR-106 (72) |
| [03](02-run-monitoring-steering/03-12-elapsed-time.md) | 12. Elapsed time; 13. Current-activity display and stall visibility; 14. Pause, cancel, and shutdown; 15. Steering and queued prompts; 16. Model and reasoning switching mid-run; 17. Permission-mode switching mid-run; 18. Verification (check-suite) monitoring and skip; 19. Overview dashboard | REQ-MONITOR-107 – REQ-MONITOR-175 (69) |
| [04](02-run-monitoring-steering/04-20-status-bar-and-title-bar.md) | 20. Status bar and title bar; 21. Provider limits, cloud credit, and quota waits; 22. Failure visibility; 23. Crash, orphan, and contradiction handling | REQ-MONITOR-176 – REQ-MONITOR-213 (40) |
| [05](02-run-monitoring-steering/05-24-live-update-transport-timing-and-ordering.md) | 24. Live update transport, timing, and ordering; 25. Persistence-visible effects; 26. How a run is observed; 27. Parallel sessions and focus routing; 28. Run start and identity | REQ-MONITOR-214 – REQ-MONITOR-264 (52) |
| [06](02-run-monitoring-steering/06-29-commands-and-keyboard-access.md) | 29. Commands and keyboard access; 30. Mission view; 31. Agent navigation, run warnings, and quitting during a run; 32. Defaults, limits, and timeouts; 33. Cross-cutting invariants | REQ-MONITOR-265 – REQ-MONITOR-298 (34) |
| [07](02-run-monitoring-steering/07-data-formats.md) | Data & Formats; What a run leaves behind (externally observable); Listing-record keys; Status vocabularies; Control result shape; Agent record (as visible to monitoring); Background-agent completion notification; Verification state; Quota wait state; Notice shape; Live update payloads; Transcript row annotations; Display formats | — |
| [08](02-run-monitoring-steering/08-open-questions.md) | Open Questions | — |
