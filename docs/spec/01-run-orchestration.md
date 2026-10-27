---
reference: ROTARIS-CRW-001
domain: run-orchestration
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Multi-Agent Run Orchestration

## Overview

A run takes one top-level user task and executes it through an autonomous, iterative multi-agent process: the task is classified for intent, handed to a coordinator role that delegates work to specialist child agents through an explicit delegation tool, and driven by an outer iteration loop that targets one todo task per iteration, verifies changed work with deterministic checks, and re-queues or abandons tasks based on evidence. The run ends with a well-defined stop reason, a terminal status, durable session records, and per-child machine-readable report artifacts; safety mechanisms (limits, timeouts, a hidden loop monitor, a message-limit soft pause, and cancellation sweeps) guarantee that no run ends with work items or child records left in a non-terminal state.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`01-run-orchestration/`](01-run-orchestration/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](01-run-orchestration/01-requirements.md) | Requirements; 1. Run Entry and Session Setup; 2. Pre-Flight Intent Classification; 3. Intent-Based Capability Gating; 4. Behavior Playbook Matrix | REQ-ORCH-001 – REQ-ORCH-027 (32) |
| [02](01-run-orchestration/02-5-coordinator-role-contract.md) | 5. Coordinator Role Contract; 6. Delegation Contract; 7. Child Task State Machine; 8. Child Naming, Limits, and Dependency Graph; 9. Per-Model Concurrency; 10. Terminal Marking, Sweeps, and Orphans; 11. Parent Suspension, Resume, and Notifications | REQ-ORCH-028 – REQ-ORCH-060 (33) |
| [03](01-run-orchestration/03-12-result-retrieval-and-voluntary-waiting.md) | 12. Result Retrieval and Voluntary Waiting; 13. Iteration Loop and Stop Conditions; 14. Message-Limit Soft Pause | REQ-ORCH-061 – REQ-ORCH-087 (27) |
| [04](01-run-orchestration/04-15-child-execution-safeguards.md) | 15. Child Execution Safeguards; 16. Loop Supervision (Hidden); 17. Child Report Artifacts and Summarization | REQ-ORCH-088 – REQ-ORCH-112 (25) |
| [05](01-run-orchestration/05-18-completion-classification-and-the.md) | 18. Completion Classification and the Deterministic Completion Gate; 19. Deterministic Verification; 20. Cancellation and Shutdown; 21. Post-Run Improvement Pass; 22. Observability | REQ-ORCH-113 – REQ-ORCH-155 (31) |
| [06](01-run-orchestration/06-23-configuration-surface.md) | 23. Configuration Surface; 24. Persistence | REQ-ORCH-143 – REQ-ORCH-149 (8) |
| [07](01-run-orchestration/07-data-formats.md) | Data & Formats; Task identifiers; Delegation observation (model-visible); Child task states; Child report artifact (behavioral schema); Timeline event vocabulary (session diagnostics); Issue kinds (session diagnostics); Stop reasons and run statuses; Session records; Workspace-level files; Intent categories; Playbook slots and budget tiers; Loop-supervisor classifier response; Configuration defaults (consolidated) | — |
| [08](01-run-orchestration/08-open-questions.md) | Open Questions | — |
