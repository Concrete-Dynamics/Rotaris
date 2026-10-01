# Working in this repository

A small React todo application. Keep changes minimal and verified.

- `src/todos.js` holds the list logic as **pure functions**: take the array, return a new array, no mutation,
  no DOM, no clock, no module-level state. New behaviour belongs there, not in the React component.
- `src/App.jsx` renders what those functions return. It holds the only state.
- Every function in `src/todos.js` carries a test in `src/todos.test.js` (`node:test` and `node:assert/strict`).
- **Dependencies are not installed**, and installing them is not part of the work here: `npm run dev` and
  `npm run build` need an `npm install` first. The check is `node --test`, which needs no dependency, and
  it must be green before you report a change as done.
- Requirements live in `docs/requirements/`. When you implement one, cite its identifier (`REQ-1NN`) in a
  comment above the function, as the existing functions do.
