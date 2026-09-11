# Todo

A small React todo application. It is the workspace of Rotaris's live run (`pnpm live-run`): the agent under
test reads it, changes it and verifies it.

- `src/todos.js` — the list as pure functions over a plain array. No DOM, no clock, no module state.
- `src/todos.test.js` — `node:test` over those functions. No dependencies; `node --test` runs it as it is.
- `src/App.jsx`, `src/main.jsx` — the React surface over the same functions.
- `docs/requirements/` — what the application is meant to do, one document per requirement.

## Checking it

```
node --test
```

`npm run dev` and `npm run build` need `npm install` first; the live run does not install anything, so the
`node --test` line above is the check that always works here.
