---
req-id: SWR-2419
status: approved
trace: required
test: required
title: "File diffs in the Rotaris transcript"
epic: SWR-2000
date: 2026-07-28
---

# SWR-2419 — File diffs in the Rotaris transcript

When an agent successfully changes a file through a tool that provides a structured UI diff,
Rotaris shall show that diff immediately after the matching tool row in the Workspace transcript.
The block shall show the path, created/modified state, added and removed counts, numbered context,
addition, and deletion lines, and the existing truncation notice. Addition and deletion meaning
shall use both a prefix and distinct accessible theme colours.

Diffs shall remain visible after session reload and follow the transcript's agent filter, search,
selection, and copy behavior. They shall remain user-only UI artifacts: Rotaris must not insert
their content into the model-visible transcript, continuation prompts, summaries, compression
input, or token estimates. Failed writes and malformed diff payloads shall not create a diff block.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | A user reads or copies a structured modified, created, or truncated diff with unambiguous line semantics. | Rotaris transcript projection and Qt HTML rendering. | `apps/rotaris/tests/test_views.py` |
| Integration | A successful SDK file-write observation persists its user-only diff and projects it beside the matching tool row after reload. | `_SessionObserver`, session persistence, and `ConfigService` projection. | `apps/rotaris/tests/test_run_wiring_e2e.py` |
| User-flow E2E | A desktop user watches an agent edit a file, reloads the session, and sees the exact diff in the filtered Workspace transcript. | Real PySide6 Workspace workflow with real internal store/service wiring and a fake external agent event source. | `apps/rotaris/tests/test_run_wiring_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
