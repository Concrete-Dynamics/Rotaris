---
req-id: REQ-TODO-001
status: approved
title: Add, toggle and remove a todo
priority: P1
date: 2026-09-11
---

# REQ-TODO-001 - Add, toggle and remove a todo

A person adds a todo by typing a title and submitting it, marks one done or not done, and removes one.

## Acceptance criteria

- A submitted title is stored trimmed; a blank title adds nothing.
- An added todo starts not done, and carries an identifier no other todo in the list holds.
- Toggling changes exactly one todo; removing drops exactly one.
