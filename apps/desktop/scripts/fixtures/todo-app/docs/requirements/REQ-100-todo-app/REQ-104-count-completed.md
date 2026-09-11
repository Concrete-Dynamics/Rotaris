---
req-id: REQ-104
status: approved
title: Count the completed todos
priority: P3
date: 2026-09-11
---

# REQ-104 - Count the completed todos

Beside the count of what is left, a person sees how many todos are already done.

## Acceptance criteria

- `completedCount(todos)` returns the number of todos that are done.
- An empty list counts zero; a list with nothing done counts zero.
- The function is exported from `src/todos.js` and tested in `src/todos.test.js`.

## Status

Not implemented. This is the work the live run's `requirements` scenario releases **from the board**, so that the
board-started path has work of its own and never depends on what the `edit` scenario did.
