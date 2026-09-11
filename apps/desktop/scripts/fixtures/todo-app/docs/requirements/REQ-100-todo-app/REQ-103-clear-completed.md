---
req-id: REQ-103
status: approved
title: Clear the completed todos
priority: P2
date: 2026-09-11
---

# REQ-103 - Clear the completed todos

A person drops every done todo in one action, keeping the rest.

## Acceptance criteria

- `clearCompleted(todos)` returns a new array holding the todos that are not done, in their existing order.
- A list with nothing done comes back unchanged; an empty list comes back empty.
- The function is exported from `src/todos.js` and tested in `src/todos.test.js`.

## Status

Not implemented. This is the work the live run's `edit` scenario hands to the agent under test.
