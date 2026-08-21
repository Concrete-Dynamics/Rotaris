---
req-id: SWR-3200
status: approved
trace: optional
test: optional
title: "Requirement Delivery State and Evidence"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3200 — Requirement Delivery State and Evidence

The operational layer over the canonical requirement: where a requirement stands
in the agentic delivery process, which specification version was actually
delivered, what evidence exists for it, whether that evidence is current, and
what the whole picture aggregates to for an epic.

This epic owns the second axis of the model — delivery state beside lifecycle —
and the evidence semantics that make `Done` mean something: traceability is a
product state, not a report, and a requirement with complete traces still shows
red when its tests fail.

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§3–§6, §21–§23, §35–§36, §38–§41, §48, §51.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3201](3200-requirement-delivery-state/SWR-3201-delivery-state-model.md) | Requirement delivery state | approved |
| [SWR-3202](3200-requirement-delivery-state/SWR-3202-delivery-state-independent-of-lifecycle.md) | Delivery state is independent of the requirement lifecycle | approved |
| [SWR-3203](3200-requirement-delivery-state/SWR-3203-delivery-transitions.md) | Delivery transitions are a validated state machine | approved |
| [SWR-3204](3200-requirement-delivery-state/SWR-3204-satisfied-hash.md) | Satisfied hash records which specification version was delivered | approved |
| [SWR-3205](3200-requirement-delivery-state/SWR-3205-delivery-metadata-store.md) | Delivery metadata store | approved |
| [SWR-3206](3200-requirement-delivery-state/SWR-3206-evidence-obligations.md) | Evidence obligations per requirement | approved |
| [SWR-3207](3200-requirement-delivery-state/SWR-3207-evidence-health-projection.md) | Evidence health projection | approved |
| [SWR-3208](3200-requirement-delivery-state/SWR-3208-evidence-detail-records.md) | Evidence details are concrete and navigable | approved |
| [SWR-3209](3200-requirement-delivery-state/SWR-3209-stale-evidence-detection.md) | Evidence goes stale without the requirement changing | approved |
| [SWR-3210](3200-requirement-delivery-state/SWR-3210-continuous-evaluation-triggers.md) | Continuous requirement evaluation | approved |
| [SWR-3211](3200-requirement-delivery-state/SWR-3211-requirement-health.md) | Derived requirement health | approved |
| [SWR-3212](3200-requirement-delivery-state/SWR-3212-epic-progress-aggregation.md) | Epic progress aggregation | approved |
| [SWR-3213](3200-requirement-delivery-state/SWR-3213-requirement-audit-trail.md) | Requirement audit trail | approved |
| [SWR-3214](3200-requirement-delivery-state/SWR-3214-requirement-revision-history.md) | Requirement revision history | approved |
| [SWR-3215](3200-requirement-delivery-state/SWR-3215-done-conditions.md) | Done requires its completion conditions | approved |
| [SWR-3216](3200-requirement-delivery-state/SWR-3216-requirement-board-projection-api.md) | Board projection API | approved |
| [SWR-3217](3200-requirement-delivery-state/SWR-3217-adopting-existing-work.md) | Existing work is adopted after verification, never asserted | approved |
| [SWR-3218](3200-requirement-delivery-state/SWR-3218-adoption-pass.md) | The adoption pass and the one door it reaches Done through | approved |
| [SWR-3219](3200-requirement-delivery-state/SWR-3219-satisfied-delivery-origin.md) | A satisfied delivery names its origin | approved |
| [SWR-3220](3200-requirement-delivery-state/SWR-3220-verification-record-store.md) | A verification is recorded as one artefact | approved |
| [SWR-3221](3200-requirement-delivery-state/SWR-3221-verification-pass.md) | The verification pass, and where a verification may be measured | approved |
| [SWR-3222](3200-requirement-delivery-state/SWR-3222-one-measurement-two-readings.md) | A requirement returns to Done only on a verification the ring also saw | approved |
| [SWR-3223](3200-requirement-delivery-state/SWR-3223-board-pass-cost-is-linear.md) | One board pass costs no more than linear in the store | approved |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 2 of
  six. Builds on epic [SWR-3100](3100-requirement-sources.md) and consumes the
  existing coverage query (SWR-2336) and completion-verifier evidence
  (SWR-2603, SWR-2606). Delivery plan and slice ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
