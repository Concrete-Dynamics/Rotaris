## The todo-app fixture tells agents there is no network, and the live run has one

The live run's fixture says in `AGENTS.md`: "**Dependencies are not installed** and there is no network here:
`npm install`, `npm run dev` and `npm run build` will fail." Nothing in the live run removes the network, and the run's
workspace reached the npm registry. `npm install` does fail there, but with `ERESOLVE` and not for want of a network: the
fixture's `package.json` pairs `@vitejs/plugin-react ^6.1.1`, whose peer is `vite ^8.0.0`, with `vite ^7.1.14`. Agents
that test the fixture's claim find it false, then spend calls finding out why the install still fails. In the duress run
four children made 27 npm probe calls by the autopsy's count. The deliverable then disputed the fixture in writing: the
delivered `docs/overview.md:98` says `AGENTS.md` and `README` "wrongly blame the absence of a network". (`README.md` in
fact blames nothing: it says only that the live run installs nothing.)

Live-run finding: a71-10

A sibling of the fixed
[`the-todo-fixture-names-a-test-command-that-fails.md`](fixed/the-todo-fixture-names-a-test-command-that-fails.md).
Recorded, not repaired.

## Specs

- None; harness fixture.

## Evidence

- Duress pack `.live-run/runs/2026-10-01T03-15-27-194Z/` (the `accept` worktree; git-ignored), session `57095770`:
  - #209 and #214 (reconcile-docs-continue): `npm install --dry-run` → "npm error code ERESOLVE".
  - #210 and #213: `npm view react version` → `19.3.0`, fetched from `https://registry.npmjs.org/`.
  - #268 (verify-result): "Found: vite@7.3.6 … peer vite@"^8.0.0" from @vitejs/plugin-react@6.1.1".
  - #273: `example.com` answered ("status 200"); #284: `registry.npmjs.org/react` answered directly ("status 200").
  - The probes ran in reconcile-docs (#175), reconcile-docs-continue (#207 to #214, #232), verify-result (#256 to #284)
    and verify-result-continue (#299 to #304, #310). The autopsy counts 27 calls and about 47 s of tool time, plus their
    reasoning turns.

## Relevant files

- `apps/desktop/scripts/fixtures/todo-app/AGENTS.md:9-11` — the claim.
- `apps/desktop/scripts/fixtures/todo-app/package.json:16-19` — the `devDependencies` that cannot resolve together.
- `apps/desktop/scripts/fixtures/todo-app/README.md:17-18` — the accurate form of the same advice ("the live run does
  not install anything").
- `apps/desktop/scripts/fixtures/todo-app.test.ts` — pins the fixture's `node --test` commands, and none of its prose.
- `apps/desktop/scripts/live-run.mjs:23` and `:124` — the run's workspace is a copy of this fixture.
