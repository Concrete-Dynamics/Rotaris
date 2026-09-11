# Requirements

What the todo application is meant to do: an epic at the root and one document per requirement in
`REQ-100-todo-app/`, the conventional shape of REQ-TRACE-002. Identifiers are the prefix, a hyphen and decimal
digits and nothing else (REQ-TRACE-022), so this store is one the requirements board can read as well as the
agent under test.

`REQ-101` and `REQ-102` are implemented in `src/todos.js`. Two are approved and **not implemented**, one for each
path the live run exercises: `REQ-103` is the work the `edit` scenario hands over in the composer, and `REQ-104`
is the work the `requirements` scenario releases from the board.
