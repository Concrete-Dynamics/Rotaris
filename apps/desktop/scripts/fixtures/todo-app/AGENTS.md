# Working in this repository

A small React todo application. Keep changes minimal and verified.

- `src/todos.js` holds the list logic as **pure functions**: take the array, return a new array, no mutation,
  no DOM, no clock, no module-level state. New behaviour belongs there, not in the React component.
- `src/App.jsx` renders what those functions return. It holds the only state.
- Every function in `src/todos.js` carries a test in `src/todos.test.js` (`node:test` and `node:assert/strict`).
- **Dependencies are not installed** and there is no network here: `npm install`, `npm run dev` and
  `npm run build` will fail. The check that works is `node --test`, and it must be green before you
  report a change as done.
- Requirements live in `docs/requirements/`. When you implement one, cite its identifier (`REQ-TODO-00N`) in a
  comment above the function, as the existing functions do.
