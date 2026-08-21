---
req-id: SWR-2433
status: approved
trace: required
test: required
title: "Delegation context header in child-agent transcript"
epic: SWR-2000
date: 2026-08-03
---

# SWR-2433 — Delegation context header in child-agent transcript

When a user selects a child agent in the Rotaris task-agent tree or any other
agent-selection surface, the scoped transcript for that agent shall display the
delegation parameters at the top — the task description, persona, category,
background/blocking mode, and any dependency or inherited-context references the
parent agent provided when spawning the child. This gives the user immediate
visibility into _why_ the child agent exists and _what it was asked to do_,
without needing to locate the delegation event in the parent's transcript.

The delegation context shall render as a distinct, visually separated,
collapsible header block above the agent's own transcript events. It is part of
the transcript content (scrolls with it), not a floating overlay.

## Scope

- **In scope**: displaying the task description, target persona, task category
  (quick/deep/planning/research), background/blocking mode, and any named
  dependencies or inherited context references from the delegation.
- **In scope**: the header is collapsible — clicking the header bar collapses
  it to a single-line summary showing the task name and persona, hiding the full
  task description and detail fields. Clicking again expands it.
- **In scope**: the header updates immediately when switching between child
  agents and persists across session reloads.
- **In scope**: collapse state is transient UI state, not persisted across
  session reloads (same policy as SWR-2432 group expand/collapse).
- **In scope**: the header is derived from the session event stream (the
  delegate action that spawned this child).
- **Out of scope**: displaying a delegation header for the root/entry agent
  (there is no delegating parent).
- **Out of scope**: editing or re-delegating from the header.
- **Out of scope**: rendering raw delegate action JSON — only human-relevant
  fields are shown.

## Acceptance criteria

- Selecting a child agent shows the delegation context header at the top of the
  scoped transcript, above any agent message or tool events.
- The expanded header includes: `task_name`, `persona`, `category`,
  `run_in_background` mode, `task` description, and any `depends_on` /
  `inherited_context` references.
- The collapsed header shows a single line with the `task_name` and `persona`
  only.
- Fields whose values are empty or unset are omitted from the display (e.g. no
  category label if `category` is `None`, no dependency list if empty).
- Clicking the header toggles between expanded and collapsed states.
- Selecting a different child agent replaces the header with that agent's
  delegation context (expanded by default for the newly selected agent).
- Returning to the full-run view (all agents) hides the per-agent delegation
  header.
- The delegation context is restored after closing and reopening a session.
- The root/entry agent shows no delegation header.

## Test portfolio

| Level         | Productive scenario                                                                                                                                                                                  | Exercised boundary                                                                         | Planned/covering test                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Unit          | Delegation metadata extracted from a `RotarisDelegateAction` produces correct header fields with empty optional fields omitted                                                                        | Field extraction, missing optional fields, root-agent exclusion, collapse toggle state     | `apps/rotaris/tests/test_transcript.py`     |
| Integration   | Transcript model inserts a delegation header row when scoped to a child agent, omits it for root, toggles expand/collapse                                                                            | Header row structure, agent-switch replacement, full-run suppression, collapse interaction | `apps/rotaris/tests/test_views.py`          |
| User-flow E2E | User sees delegation context at top of transcript for a child agent, collapses it to single-line, switches to another child and sees its context expanded, returns to full run and header disappears | Full delegate paint + agent selection + collapse interaction + session reload              | `apps/rotaris/tests/test_run_wiring_e2e.py` |

Epic: [Rotaris Desktop](../2000-rotaris-desktop.md)
