---
req-id: SWR-3500
status: approved
trace: optional
test: optional
title: "Requirement Change Propagation"
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3500 — Requirement Change Propagation

What happens after a requirement was delivered and the world moves: the
specification is edited, a requirement is replaced or removed, evidence goes
stale, two requirements start contradicting each other, or a dependency has not
landed yet.

This epic holds the machinery that turns those events into precisely scoped work
instead of either silence or a full re-implementation: change detection over any
source, the impact analysis that distinguishes a reworded sentence from a
changed behaviour, the migration worklist that superseding produces, the removal
analysis, dependency gating, and the enumerated decisions that must reach a
human.

Derived from [docs/plans/2026-08-14-requirements-board.md](../plans/2026-08-14-requirements-board.md)
§5–§7, §14, §25–§27, §39, §45–§47, §51.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3501](3500-requirement-change-propagation/SWR-3501-requirement-change-detection.md) | Requirement change detection across sources | approved |
| [SWR-3502](3500-requirement-change-propagation/SWR-3502-needs-update-on-change.md) | A delivered requirement that changes becomes Needs Update | approved |
| [SWR-3503](3500-requirement-change-propagation/SWR-3503-agentic-impact-analysis.md) | Agentic impact analysis of a requirement change | approved |
| [SWR-3504](3500-requirement-change-propagation/SWR-3504-no-behavioural-impact.md) | A change without behavioural impact is re-verified, not re-implemented | approved |
| [SWR-3505](3500-requirement-change-propagation/SWR-3505-impact-creates-execution-units.md) | Impact outcomes create the right execution units | approved |
| [SWR-3506](3500-requirement-change-propagation/SWR-3506-clarification-required.md) | An unclear change asks rather than guesses | approved |
| [SWR-3507](3500-requirement-change-propagation/SWR-3507-superseding-migration.md) | Superseding produces a migration worklist | approved |
| [SWR-3508](3500-requirement-change-propagation/SWR-3508-supersede-deprecates.md) | A superseded requirement is deprecated, never deleted | approved |
| [SWR-3509](3500-requirement-change-propagation/SWR-3509-removal-impact-analysis.md) | Removing a requirement analyses what it leaves behind | approved |
| [SWR-3510](3500-requirement-change-propagation/SWR-3510-dependency-gating.md) | Dependencies gate execution | approved |
| [SWR-3511](3500-requirement-change-propagation/SWR-3511-conflicting-requirements.md) | Conflicting requirements block instead of being resolved by an agent | approved |
| [SWR-3512](3500-requirement-change-propagation/SWR-3512-human-in-the-loop.md) | Decisions with product meaning reach the user | approved |
| [SWR-3513](3500-requirement-change-propagation/SWR-3513-stale-evidence-propagation.md) | Stale evidence triggers propagation, not only hash changes | approved |
| [SWR-3514](3500-requirement-change-propagation/SWR-3514-auditable-impact-analysis.md) | Impact analyses are auditable and reproducible | approved |
| [SWR-3515](3500-requirement-change-propagation/SWR-3515-propagation-pass.md) | One evaluation runs every propagation rule, in one order, without the desktop | approved |
| [SWR-3516](3500-requirement-change-propagation/SWR-3516-open-decision-artefact.md) | An open decision is an artefact, and it survives a restart | approved |
| [SWR-3517](3500-requirement-change-propagation/SWR-3517-one-annotation-grammar.md) | One reader of the annotation grammar (technical, from SWR-3507) | approved |
| [SWR-3518](3500-requirement-change-propagation/SWR-3518-migration-plan-store.md) | A migration plan survives the read that produced it (technical, from SWR-3507) | approved |
| [SWR-3519](3500-requirement-change-propagation/SWR-3519-evaluation-depth-and-catch-up.md) | An evaluation states its depth, can be stopped, and strands no requirement (technical, from SWR-3515) | approved |

## History

- 2026-08-14 — Epic cut from the requirement-board target picture as slice 5 of
  six. Depends on epics [SWR-3200](3200-requirement-delivery-state.md) and
  [SWR-3400](3400-requirement-execution.md); extends the existing requirement
  diff (SWR-2332) and tombstone concept (SWR-2318) rather than replacing them.
  Delivery plan and slice ownership:
  [docs/plans/2026-08-14-requirements-board-slices.md](../plans/2026-08-14-requirements-board-slices.md).
