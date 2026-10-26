---
reference: ROTARIS-CRW-001
domain: library-artifacts-improvements
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Library, Artifacts, and Improvement Proposals

## Overview

After every completed task run the product may perform an optional, strictly non-blocking background analysis that stores an "improvement artifact" containing evidence-backed improvement proposals authored by a dedicated analysis model. Users review, edit, approve, reject, defer, reset, or delete those proposals from two desktop surfaces — a Library view and a dashboard card — both of which read and mutate the same workspace-scoped artifacts in the one store. Approved proposals are applied only by a separately started improvement run whose workspace effects are checkpointed and reversible. The same domain covers the per-session store of agent-published reports and deliverables (browsable and editable in the Library and via agent-facing tools), per-persona memory files re-injected into future runs, and the saved-prompt stash and prompt history.

> **This domain carries a second analysis pass under [`PD-LIBRARY-002`](../product/directives/pd-library-002.md#pd-library-002), 2026-09-17.** The domain
> carries a second kind of analysis pass beside the per-run one: a user-started **retrospective** that
> reads the workspace's own session history across runs and authors proposals in this domain's own
> vocabulary and lifecycle. Nothing below is changed for the per-run analyst; where the retrospective
> reaches, the directive says so.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`14-library-artifacts-improvements/`](14-library-artifacts-improvements/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](14-library-artifacts-improvements/01-requirements.md) | Requirements; 1. Improvement lifecycle and run classification; 2. Proposal data model and validation; 3. Post-run analyst behavior; 4. Gate evidence | REQ-LIBRARY-001 – REQ-LIBRARY-031 (32) |
| [02](14-library-artifacts-improvements/02-5-post-run-capture-and-eligibility.md) | 5. Post-run capture and eligibility; 6. Configuration; 7. Persistence of improvement artifacts; 8. Versioned artifact history; 9. Review API (status, edit, delete); 10. Improvement executor (approval-gated application) | REQ-LIBRARY-032 – REQ-LIBRARY-066 (35) |
| [03](14-library-artifacts-improvements/03-11-rollback-of-an-applied-improvement-run.md) | 11. Rollback of an applied improvement run; 12. Withdrawn command-line surface; 13. Session artifact store (agent reports and published deliverables) | REQ-LIBRARY-067 – REQ-LIBRARY-101 (38) |
| [04](14-library-artifacts-improvements/04-14-desktop-library-view.md) | 14. Desktop Library view; 15. Desktop review-action handling | REQ-LIBRARY-102 – REQ-LIBRARY-173 (28) |
| [05](14-library-artifacts-improvements/05-16-desktop-background-improvement-analysis.md) | 16. Desktop background improvement analysis; 17. Dashboard proposals card; 18. Desktop artifact inspector/editor; 19. Prompt stash and prompt history; 20. Withdrawn text-mode surface; 21. Persona memory; 22. Ordering, timing, and concurrency; 23. Cross-cutting invariants | REQ-LIBRARY-122 – REQ-LIBRARY-164 (43) |
| [06](14-library-artifacts-improvements/06-data-formats.md) | Data & Formats; Improvement artifact record; Recorded artifact versions; Git ref namespaces; Gate evidence mapping; Analyst I/O; Session artifact store; Injected context blocks; Saved prompts; Persona memory files; Configuration keys; Improvement-artifact inspection and rollback (desktop); Desktop notices and labels | — |
| [07](14-library-artifacts-improvements/07-open-questions.md) | Open Questions | — |
