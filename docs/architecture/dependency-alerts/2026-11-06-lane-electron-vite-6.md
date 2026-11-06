# Lane record — the group split: electron-vite 6 alone, Electron 44.10.0 held (R-091, 2026-11-06)

The isolation of one variable out of Dependabot's `electron` group, pull request
[#49](https://github.com/Concrete-Dynamics/Rotaris/pull/49): `electron-vite` 6.0.0 **alone**, with `electron` held at
its exact pin `44.10.0` and `electron-builder` untouched at `^26.15.3`. Branch `chore/deps-electron-vite-6`, cut from
`origin/main` at `b6501e8e`. It is a version update, not an alert reading; the alerts it is expected to affect are on
the next triage pass. No requirement or directive is changed.

- **Read against:** `b6501e8e`, Linux x86_64, Node 26.12.1, pnpm 11.9.0, 2026-11-06, about 20:50 to 21:50 UTC.

## 1. What changed

| File | Change | Why |
| --- | --- | --- |
| `apps/desktop/package.json` | `electron-vite` `^5.0.0` → `^6.0.0` | the one variable this branch isolates |
| `apps/desktop/package.json` | `electron` stays `44.10.0` (exact pin kept) | held deliberately — the suspect moves only after this variable is settled |
| `apps/desktop/package.json` | `electron-builder` stays `^26.15.3` | not part of the isolation |
| `apps/desktop/package.json` | **`esbuild` `^0.28.2` declared directly (new)** | the missing dependency the bump exposes (below) |
| `apps/desktop/scripts/restore-kill-proof.mjs` | one `eslint-disable` removed | obsolete once esbuild is declared |
| `pnpm-lock.yaml` | the importer's specifiers and versions, the resolved graph | the four specifiers above |

**The missing dependency, measured.** `electron-vite` 5 declared `esbuild` (`^0.25.11`) itself, so the two proof
scripts that `require('esbuild')` — `apps/desktop/scripts/restore-kill-proof.mjs` and
`apps/desktop/scripts/terminal-proof.mjs` — resolved it through that dependency, and `restore-kill-proof.mjs` carried an
`eslint-disable-next-line import-x/no-extraneous-dependencies` saying so ("electron-vite's bundler, which `apps/desktop`
declares"). `electron-vite` **6 drops `esbuild` from its dependencies** (read from the registry for 6.0.0 on
2026-11-06: `cac` `^7.0.0`, `rolldown` `~1.2.10`, `picocolors`, `@babel/core`, `magic-string`, the arrow-functions
plugin — no `esbuild`), so after the bump **nothing in the tree brings esbuild in**: `require('esbuild')` fails, and
the disable in `restore-kill-proof.mjs` suppresses a rule that now reports nothing, which
`reportUnusedDisableDirectives: 'error'` turns into a gate failure. CI measured exactly that on the Dependabot
branch's own head `eacc569d` (run [41905640745](https://github.com/Concrete-Dynamics/Rotaris/actions/runs/41905640745),
job `gate`; `headBranch` `dependabot/npm_and_yarn/electron-88ce6717ff`):

```
apps/desktop/scripts/restore-kill-proof.mjs
  45:1  error  Unused eslint-disable directive (no problems were reported from 'import-x/no-extraneous-dependencies')
```

**The fix is to declare the dependency the scripts actually use.** `esbuild` is `apps/desktop`'s — the proof scripts
live in that package and import it — so it is declared in `apps/desktop/package.json`, not at the root. `^0.28.2` is
the newest release past `minimumReleaseAge`'s seven days (published 2026-08-08) and the range `vite` 8.2.4 itself
peers on (`esbuild: ^0.27.0 || ^0.28.0`), so one copy resolves for both the peer and the two proof scripts. With it
declared, the import is no longer extraneous and the disable is **obsolete**, so it is removed rather than kept.
`terminal-proof.mjs` carries no disable on `main` (it resolves through a local `createRequire` alias), and none is
added. `pnpm-workspace.yaml` already lists `esbuild: true` under `allowBuilds` (its postinstall places the binary), so
no install-script setting changes; `apps/desktop` is the only manifest naming `esbuild`, so
`tools/dependency-policy.test.ts`'s catalog rule (catalogue a dependency **two or more** manifests name) is not
triggered.

## 2. What this branch is, and what it is not

- It **is** the isolation of ONE variable out of the #49 group. #58 carried two independent changes — the Electron
  45.1.0 pin and `electron-vite` 6 — and the diagnosis of 2026-11-06 (report
  `2026-11-06-rotaris-main-entscheid-followup.md` in the Codexius workspace; §3 is its evidence chain) found the
  second to be the one that breaks ADR-0056's rule 4. This branch moves `electron-vite` 6 onto the held 44.10.0 line
  and reads CI's `package` job.
- It is **not** a proposal to ship `electron-vite` 6. If its `package` job refuses the same way #58's did, the
  mechanism below stands and a remedy for the preload's externals is owed before any further move; nothing here
  recommends acceptance.
- **#49** — open (the group bundle this branch splits; its own `package` job refused at 45.1.0); **#58** — closed
  2026-11-06 as blocked on rule 4 at 45.1.0, branch kept as the diagnosis platform; **#59** — the `undici` ignore
  rule, merged 2026-11-06 as `6b521dc6` before this record was written (it was open when this branch was cut; not
  part of this isolation).

## 3. The mechanism under test — a pre-registered prediction

Written before any reading of this branch's CI, and stated as a prediction so a failure of it is informative:

`electron-vite` 6 externalises `zod` into the preload — `externalizeDepsPlugin` puts every `apps/desktop` dependency
(minus the workspace excludes) into the build's external list in both versions, and v6's preset migrates
`build.rollupOptions` to `build.rolldownOptions` while the repository's explicit `build.rollupOptions` is what its
config merges against, so the external list survives into the preload build and `zod` is emitted as a `require`
(the 2026-11-06 diagnosis, §3; that build difference was reproduced here, see §4). The preload is loaded into a renderer with `sandbox: true`
(`apps/desktop/src/main/secure-web-preferences.ts` — `sandbox: true`, `contextIsolation: true`, `nodeIntegration:
false`, spread by every `new BrowserWindow` site in `apps/desktop/src/main/index.ts`, among them line 864/904/1043/
1141/1224/1584 and the sites in `main-windows.ts`). A sandboxed preload may reach only `electron`, so it throws
`module not found: zod` before exposing the bridge (ADR-0044); the bridge is absent, and
`apps/desktop/src/renderer/shell.ts:28` throws before React mounts.

**So: if the mechanism is right, this branch's `package` job refuses exactly as #58's did — no session row, 0 model
requests, a black `load-proof.png`; if it passes, the mechanism is refuted and Electron 45.1.0 becomes the suspect
again.** §5 reads the job: **it refused, in exactly that shape — the prediction held.** This branch cannot itself
discharge rule 4 (no display exists on this host, so no packaged launch runs here); what §5 produces is the reading
that the rule-4 failure is `electron-vite` 6's and not the Electron pin's.

## 4. Verification

Commands run on this tree (Linux x86_64, Node 26.12.1, pnpm 11.9.0), at write time:

- `pnpm install --prefer-offline` — exit 0. Lockfile movement, checked package-entry by package-entry against
  `b6501e8e`: `electron-vite` 5.0.0 → 6.0.0; `esbuild` 0.25.12 → 0.28.2 (the whole `@esbuild/*` platform family with
  it); `rolldown` 1.2.16 and its binding family added; `cac` 6.7.14 → 7.1.0; `magic-string` 1.4.5 added; `vite`,
  `vitest`, `@vitejs/plugin-react` and `@vitest/mocker` keep their versions (their peer-fit key gains
  `esbuild@0.28.2`). **`electron` does not move: one `electron@44.10.0` key in, one out.** No same-key entry changes
  its integrity.
- The packaged-seam build, `ROTARIS_BUILD=package pnpm --filter @rotaris/desktop exec electron-vite build` (the
  repo-wide `pnpm … build` spelling is window-gated on this host to the 23:00–02:59 Berlin heavy-work band; the
  package-scoped spelling is the same build, run under the heavy-run lock and memory gate) — exit 0. `grep -n
  'require("zod")\|require("electron")' apps/desktop/out/preload/index.cjs`:

  ```
  1:let electron = require("electron");
  2:let zod = require("zod");
  ```

  **One `require("zod")` in the preload built on Electron 44.10.0 — the mechanism's first premise, held.** The
  preload is byte-identical (md5 `61c11cdf25375e9c7e06aca6ba5a2aef`, 144,889 bytes) to #58's v6-on-45.1.0 preload,
  and the renderer bundle is byte-identical to `main`'s (`2be796800f898cf5089828484ceaffbe`) — the build difference
  is the preload and nothing the renderer sees.
- `pnpm check` on this head — **symbols 0, typecheck 0 (no `error TS`), lint 0** (all 16 stages of `gate:lint` and
  `eslint . --max-warnings 0`, including the unused-disable rules), **test exit 1: 5 failed | 8052 passed | 57
  skipped**, every failure in `packages/agent-tools/src/terminal/terminal.test.ts` — the documented host-dependent
  PTY process-death flake (`goneWithin(pids, 5_000)` reading `[true, true]` where `[false, false]` is expected, plus
  the neighbouring soft-pause cases). It is **not this change**: the same file on an untouched `origin/main`
  (`b6501e8e`) worktree on this same host reads **4 failed | 113 passed** (the identical case shape), and the count
  itself is not stable run to run — an earlier reading of this branch's head in this lane read **4 failed | 8052
  passed**, `main`'s own CI gate on `6b521dc6` failed the same file with **1 failed | 7980 passed**, and my own
  reading above (5 failed) is the largest of the three. The red is the host's and CI's
  ([`the-pty-process-death-assertions-flake-on-a-loaded-host.md`](../../defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md));
  the branch touches no code those cases execute.

## 5. CI — the `package` job, and the prediction discharged

The `package` job (windows-x64, development) ran on both the push and the pull_request event of the head `59241faf`
and **refused on both**, at the same step, in the exact shape §3 predicted. Evidence, from the run's own artifact
`windows-x64-package-evidence` (downloaded and re-read here, not taken from the log alone):

| Reading | Value |
| --- | --- |
| the refusal | `error: pnpm package refused: expected one session, found 0` / `[package] REFUSED — expected one session, found 0 (286890 ms)` |
| the failing step | `the packaged app opens a store and runs a terminal call` → `expected one session, found 0` |
| every step before it | **ok** — code-intelligence bundle, manifest, notices, build id, `electron-vite build (seams compiled out)`, the seam check, the artifact names, `electron-builder --win`, the fuses, the portable, the icon |
| host-side setup in `load-proof.app.log` | complete: `run host hello` received (550 ms), workspace opened (`0 sessions, 0 rows`), `workspace.ack`, MCP setup `completed` |
| `run host: session <uuid> started; row 0 recorded` | **absent** |
| `POST …/chat/completions` (model requests) | **0** |
| `load-proof.png` | **1024×720, exactly one colour** `(18,18,18)` — whole-image `R=G=B=18`, the pure-black signature |

The app opens its store, settles every host-side step, **paints nothing, starts no run, and exits 0**: #58's signature,
reproduced on a branch where `electron` never moved. **`electron-vite` 6 is therefore *sufficient on its own* to refuse
ADR-0056's rule 4, at Electron 44.10.0** — the failure is not the pin's, and the pin was never its mover.

**What the CI artifact does not itself capture:** the run records the end state (no session row, no model request, a
black PNG) and not the intermediate throw. The chain the end state comes from — the v6 preload's `require("zod")`, the
sandbox's refusal (`module not found: zod`), the absent bridge — is proven at the preload-loader level **on this Linux
host** (§4, and the diagnosis report §3), and is here *consistent with* the packaged Windows run rather than read off
its artifact. Stated as proven: the build output, the loader refusal and the end state. Not asserted: that the throw is
the only path to that end state in the packaged binary.

**What this does — and does not — say about Electron 45.1.0.** It says the 45.1.0 pin was never the mover: the
failure follows `electron-vite` 6 onto 44.10.0. It does **not** rate Electron 45.1.0 either way — 45.1.0 was never
given a preload that loads, so nothing here exercises it. It also does not show that `electron-vite` 6 is the *only*
blocker: whether a v6 build with the preload's externals fixed, **and** Electron 45.1.0, then passes rule 4 is a
separate experiment (§7). Electron 45.1.0 remains **open and unrated**, and becomes answerable only after the
preload's externals are fixed (a v6 that bundles `zod` into the preload, or a preload that
does not import `zod`).

## 6. Boundary

This branch does not touch `.github/workflows`, does not merge, and does not move the `electron` pin.

## 7. The next experiment (a proposal — not applied here)

The preload's externals under `electron-vite` 6 are what this branch leaves broken, and they are the prerequisite to
any further move. Two candidate remedies were tested in a minimal two-file fixture (the same source, the same real
`zod`, `electron-vite` 6) on this host:

| Preload config under v6 | Built preload | Runtime under `sandbox: true` |
| --- | --- | --- |
| `externalizeDepsPlugin()` as today | 0.22 kB, `require("electron")` + `require("zod")` | **fails**, `module not found: zod` |
| `externalizeDepsPlugin({ exclude: ['zod'] })` | 158,194 B, `require("electron")` only | **passes**, bridge present |
| `build.externalizeDeps: false` (the plugin's own switch) | 158,194 B, `require("electron")` only | **passes** |
| `build.rollupOptions.external: ['electron']` | still `require("zod")` | fails |
| `ssr: { noExternal: true }` (top level or in the section) | still `require("zod")` | fails |
| the plugin omitted from the `preload` section | still `require("zod")` | fails |

So the shape to build is the first working row on top of this branch — the preload states its externals, `zod` bundles
back in as v5 did — and only then the Electron pin moves, with its own `package` run. That branch is not this one:
this one isolates a single variable, and mixing the remedy in would destroy the isolation it exists to provide.
