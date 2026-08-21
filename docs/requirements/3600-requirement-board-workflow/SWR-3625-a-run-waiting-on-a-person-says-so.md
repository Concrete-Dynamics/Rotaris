---
req-id: SWR-3625
status: approved
trace: required
test: required
title: "A run waiting on a person says so where the requirement is shown"
epic: SWR-3600
date: 2026-08-21
source: docs/plans/2026-08-14-requirements-board.md
---

# SWR-3625 — A run waiting on a person says so where the requirement is shown

A run that stops to ask something is only useful if the person it is asking
finds out. Today a pending approval or an agent question is published for the
*focused* session alone — one projection writes one set of store slots — so a
requirement working in the background can be blocked on a person indefinitely
with nothing anywhere saying so. The board shows it as running, because it is;
what it is doing is waiting.

Requirement: while a run is waiting on a person, every surface that shows the
requirement says so and offers the way in. The wait itself is bounded by a
budget the user sets, and the default is that it does not expire — an answer
given in the user's own time is the point, and a prompt denied on a timer is a
decision made for them.

## Acceptance criteria

- A run waiting on an approval or on an agent's question is stated on the
  requirement card, on the requirement's detail page, on its queue row, and on
  its session row in the workspace.
- Acting on the statement focuses that session in the workspace, where the
  question is answered; nothing about answering it is rebuilt beside the board.
- The statement clears when the run stops waiting, whether it was answered,
  cancelled or timed out.
- How long a run may wait is one setting, applied to both an approval and a
  question, offered as a bounded choice ending in "indefinitely", and
  "indefinitely" is the default.
- An indefinite wait is still cancellable: stopping a run releases what it was
  waiting on rather than waiting the budget out.

## Test coverage

Unit tests cover the wait budget, including that zero means indefinitely and
that a cancel still releases an indefinite waiter, and the setting's stops. An
integration test raises a question and an approval on a background run and
asserts the statement on all four surfaces and its clearing. A hermetic
user-flow test releases a requirement, follows the statement into the session,
answers it and sees the run continue. The originating product flow is a user
answering a released run in their own time (SWR-3612, SWR-3624).

Epic: [Requirement Board Workflow and Review](../3600-requirement-board-workflow.md)
