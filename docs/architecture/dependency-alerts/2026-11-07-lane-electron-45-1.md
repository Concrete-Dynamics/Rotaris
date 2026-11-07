# Lane record — Electron 45.1.0 alone, on the green base (R-091, 2026-11-07)

**Own branch, one change.** This is the separate reading the 2026-11-06 split
([`2026-11-07-lane-electron-vite-6-preload-fix.md`](2026-11-07-lane-electron-vite-6-preload-fix.md), merged as `0b5981f3`) left
owed: `electron` `44.10.0` → `45.1.0`, and nothing else. Branch `chore/deps-electron-45-1`, cut from `origin/main` at
`0b5981f3`, which already carries electron-vite 6 with the preload's externals answered.

## 1. Why this is its own branch, and what the older readings did and did not show

PRs **#49** and **#58** both proposed this pin **together with electron-vite 6**. Since then,
[the 2026-11-06 probe](2026-11-07-lane-electron-vite-6-preload-fix.md) proved that electron-vite 6 refuses ADR-0056 rule 4
**on its own**: it externalises this package's `dependencies` in every node-side section, so the preload shipped
`require("zod")`, a sandboxed preload cannot load it, the bridge never landed, and the packaged launch found 0 sessions
with a one-colour `load-proof.png`. #58's five refusals of five, and the note
[`the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md`](../../defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md)
that recorded them, therefore attributed to Electron 45 a refusal that electron-vite 6 produced on a tree carrying both.
The correlation those runs showed was real; the attribution was not separable on them. **This branch moves the pin alone,
on a base where the preload loads, and reads rule 4 again.**

## 2. What changed

| File | Change |
| --- | --- |
| `apps/desktop/package.json` | `electron` `44.10.0` → `45.1.0` (exact pin kept) |
| `pnpm-lock.yaml` | the importer's specifier and version, and `electron`'s own `packages` key with its integrity and its `snapshots` key; nothing else |

45.1.0 declares exactly the same three dependencies as 44.10.0 (`@types/node` `^24.9.0`, `@electron/get` `^5.0.0`,
`@electron-internal/extract-zip` `^1.0.1`), read with `npm view electron@<v> dependencies engines --json`. The lockfile was
moved by hand to that shape — the importer's two lines plus the `packages` and `snapshots` keys — after
`pnpm install --lockfile-only` pruned unrelated stale `rolldown`/`@oxc-project/types` entries (a resolution artefact of
electron-vite 6's tree, **out of this brief's scope**); `pnpm install --frozen-lockfile` then passes and reports the
lockfile up to date. 2 files, 1 insertion, 1 deletion.

**45.1.0's age.** Published `2026-10-27T19:56:51.585Z` (`npm view electron time`), so it is past `pnpm-workspace.yaml`'s
`minimumReleaseAge: 10080` at this branch's date.

## 3. The runtime line moves

Measured on this tree with `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron -p process.versions`:

| | 44.10.0 | 45.1.0 |
| --- | --- | --- |
| Node | 24.22.1 | 24.22.1 |
| Chromium | 152.0.7977.169 | **156.0.8078.49** |
| V8 | 15.2.124.45-electron.0 | 15.6.75.19-electron.0 |
| undici | 7.30.1 | 7.30.1 |
| **`process.versions.modules`** | 149 | **150** |

The module interface moves, which is exactly why rule 4 — the packaged launch proving the bindings load under the shipped
binary — is this pin's gate.

**Both native modules are N-API and ABI-stable across it, measured rather than assumed.** Under the Electron-45 runtime
(`ELECTRON_RUN_AS_NODE=1 electron -e "require('better-sqlite3'); require('node-pty')"`, `modules` 150): **both load**. Under
44.10.0 (`modules` 149), both load too. `better-sqlite3` `13.0.3` and `node-pty` `1.1.0` are the versions on both trees, so
the same prebuilt bindings answer under both ABIs; `@electron/rebuild` runs in electron-builder's `--win` step regardless.

## 4. Local verification (this host, my own runs)

Linux x86_64, Node 26.12.1, pnpm 11.9.0, each heavy run behind `heavy-nice` + `heavy-run`.

- **The build.** `pnpm --filter @rotaris/desktop build` green under `electron-vite` 6.0.0 with Electron 45.1.0.
- **The preload.** The emitted `out/preload/index.cjs` requires `electron` **only**, and the branch's own new check
  (`node apps/desktop/scripts/lib/preload-externals.mjs`) **PASSes**. Its bytes differ from the merged tree's build — the
  bundler's chunk comments and `/* @__NO_SIDE_EFFECTS__ */` markers differ between builds, not the file's externals — so
  the reading that transfers is the `require` set and the check, not a digest.
- **The bridge, at runtime.** `/tmp/ev6-verify/main.js` (a `BrowserWindow` with `sandbox: true` and this build's preload,
  then `executeJavaScript('typeof window.rotaris')`) under **Electron 45.1.0** → **`BRIDGE-TYPE object`**.
- **`pnpm check`.** `gate:symbols` green (artifact unchanged), `gate:typecheck` **0** `error TS`, `gate:lint` green (all
  stages), `gate:test` **`1 failed | 557 passed | 5 skipped (563)`** — every red one of the four soft-paused-kill cases of
  `packages/agent-tools/src/terminal/terminal.test.ts`, the documented host-load flake this repository carries
  ([`the-pty-process-death-assertions-flake-on-a-loaded-host.md`](../../defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md)).
  This diff loads nothing in that file.
- **The packaged launch is not runnable here.** This host is Linux and the `package` job's launch step is Windows-only
  (`apps/desktop/scripts/lib/package-platform.mjs`: on Linux the launch and capture steps are `not applicable`). Rule 4's
  own reading is therefore CI's, recorded in §5.

## 5. CI — the `package` job (rule 4)

Recorded below from CI, with the job id, the UTC timestamps and the artifact's own numbers.

## 6. What would separate the two failure classes, if it refuses

The base this branch sits on makes the two causes distinguishable, which #58's base could not:

| Reading | Preload-class failure (the electron-vite-6 defect) | Electron-45-specific failure |
| --- | --- | --- |
| `the preload carries no external package` | **red** | green — the built preload requires `electron` alone |
| `load-proof.png` | **exactly one colour** (the black capture) | paints a real window |
| `the packaged app opens a store and runs a terminal call` | 0 sessions, 0 model requests | recorded below |
