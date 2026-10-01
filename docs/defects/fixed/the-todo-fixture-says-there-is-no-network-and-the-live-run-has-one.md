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
[`the-todo-fixture-names-a-test-command-that-fails.md`](the-todo-fixture-names-a-test-command-that-fails.md).
Recorded, not repaired, when it was noticed; repaired below.

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

## Outcome

Repaired 2026-10-01 under the fin2 harness bundle (triage of the open notes on `origin/main` 46b897c).

Confirmed on this branch first: two new cases in `apps/desktop/scripts/fixtures/todo-app.test.ts` failed on the
unrepaired fixture — `AGENTS.md` matched `/\bnetwork\b/`, and the `devDependencies` paired `vite` 7 with
`@vitejs/plugin-react` 6, whose published peer is `vite ^8.0.0`. Against the registry from a scratch copy, `npm install
--dry-run` on the unrepaired `package.json` answered `ERESOLVE … Found: vite@7.3.6`; with `vite ^8.3.2` it resolved
(`add vite 8.3.2`, `add @vitejs/plugin-react 6.1.1`, exit 0). Nothing in `live-run.mjs` or `lib/duress-checks.mjs` keys
on the fixture's sentence.

- `AGENTS.md` now says only what is true of the live run: dependencies are not installed, installing them is not part of
  the work, `npm run dev` and `npm run build` need an `npm install` first, and the check is `node --test`, which needs no
  dependency. The network claim is gone. `README.md` already said this and is unchanged.
- `package.json` asks for `vite ^8.3.2`, a major `@vitejs/plugin-react ^6.1.1` accepts, so an install that someone does
  make resolves rather than failing for a reason unrelated to the network.

Pinned by `todo-app.test.ts`: no file the agents read (`src/todos.js`, `README.md`, `AGENTS.md`) mentions the network,
and the `vite` major is one the plugin's major declares as its peer (a table read from the registry on 2026-10-01, which
fails the case for a plugin major it does not name). Both fail on the unrepaired fixture; the six earlier cases, which run
every `node --test` command the fixture names, pass unchanged.

Shown by the live run's duress scenario (`pnpm live-run --confirm --skip-build --only=duress`, `LIVE_RUN_DURESS_MS=5400000`,
endpoint `katalyst`, unmetered; built head of this branch, as root under Xvfb; pack
`.live-run/runs/2026-10-01T14-15-05-420Z/` of the `fin2-harnessdoubl` worktree, git-ignored), which passed: one
iteration, six children, 271 tool calls, 47 of them terminal commands, and none of them an install, a registry query or a
network probe. The one `npm` invocation was `npm test` (#244, verify-result), which runs `node --test`. Counted with the
same filter over the 71ad8e8 duress pack, the unrepaired fixture's run made 27 such calls, the autopsy's figure. The
deliverables quote the new sentence (`docs/decisions.md` cites `AGENTS.md:10`, "The check is `node --test`, which needs
no dependency") and dispute nothing about the network.

