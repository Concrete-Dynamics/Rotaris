---
req-id: SWR-3214
status: approved
trace: required
test: required
title: "Requirement revision history"
epic: SWR-3200
date: 2026-08-14
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3214 — Requirement revision history

Rotaris must not maintain a second history of requirement text — git and the
originating source already have one. What it can do is join them: which
specification version existed when, which run implemented it, and which commit
carries that implementation.

Requirement: the revision history of a requirement is assembled from source
revisions, git commits touching the requirement's artefact, recorded requirement
hashes and run metadata. Each revision entry carries its hash, its delivery
outcome, the run that implemented it and the commit that carries it; the current
revision is marked as such.

## Acceptance criteria

- History is assembled on read from git and the audit trail, not stored as a
  parallel copy of the requirement text.
- A revision that was never delivered appears with no run and no commit rather
  than being omitted.
- A repository without git history yields the hashes Rotaris recorded and states
  that source history is unavailable.
- Entries are ordered oldest to newest and the current hash is identified.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Assembly from crafted git output plus audit records; the undelivered and no-git cases | The history assembler | `tests/unit/requirements/test_revision_history.py` |
| Integration | History for a requirement in a git fixture names the real commits that touched its file | Assembler over a git fixture | `tests/integration/test_requirement_delivery.py` |
| User-flow E2E | `N/A — its product flow is the history panel (SWR-3313)` | — | — |

Epic: [Requirement Delivery State and Evidence](../3200-requirement-delivery-state.md)
