# Lane record — the Electron group to 45.1.0, and esbuild declared directly (R-091, 2026-11-06)

Dependabot's `electron` group, pull request [#49](https://github.com/Concrete-Dynamics/Rotaris/pull/49)
(`electron` 44.10.0 → 45.1.0, `electron-builder` → 26.18.0, `electron-vite` → 6.0.0), taken over on a branch cut from
`origin/main` at `b6501e8e` as the owner's ruling of 2026-11-06 directed: **accept, with the dependency fix in front of
the merge**. It is a version update, not an alert reading; the alerts it is expected to affect are on the next triage
pass. No requirement or directive is changed.

The three Dependabot pull requests of 2026-11-04 were decided together (owner, 2026-11-06, on a read-only ruling):
#49 accepted with a fix, #52 held, #54 closed. This file is #49's; [#54's close](https://github.com/Concrete-Dynamics/Rotaris/pull/54)
and #52's hold are recorded in their pull requests and in §5 below.

## 1. What changed, and why esbuild goes with it

| File | Change | Why |
| --- | --- | --- |
| `apps/desktop/package.json` | `electron` `44.10.0` → `45.1.0` (exact pin kept) | the bump Dependabot proposes |
| `apps/desktop/package.json` | `electron-builder` `^26.15.3` → `^26.18.0` | the bump Dependabot proposes |
| `apps/desktop/package.json` | `electron-vite` `^5.0.0` → `^6.0.0` | the bump Dependabot proposes |
| `apps/desktop/package.json` | **`esbuild` `^0.28.2` declared directly (new)** | the missing dependency the bump exposes |
| `apps/desktop/scripts/restore-kill-proof.mjs` | one `eslint-disable` removed | obsolete once esbuild is declared |
| `pnpm-lock.yaml` | the importer's specifiers and versions, the resolved graph | the four specifiers above |

**The missing dependency, measured.** `electron-vite` 5 declared `esbuild` (`^0.25.11`) itself, so the two proof
scripts that `require('esbuild')` — `restore-kill-proof.mjs` and `terminal-proof.mjs` — resolved it through that
dependency, and `restore-kill-proof.mjs:45` carried an `eslint-disable-next-line
import-x/no-extraneous-dependencies` saying so ("electron-vite's bundler, which `apps/desktop` declares"). `electron-vite`
**6 drops `esbuild` from its dependencies** (it declares `rolldown` instead; read from the registry for 6.0.0 on
2026-11-06), so after the bump **nothing in the tree brings esbuild in**: `require('esbuild')` fails, and the disable
in `restore-kill-proof.mjs` suppresses a rule that now reports nothing, which `reportUnusedDisableDirectives: 'error'`
turns into a gate failure. CI measured exactly that on the pull request's head `eacc569d`
(run [41905640745](https://github.com/Concrete-Dynamics/Rotaris/actions/runs/41905640745), job `gate`):

```
apps/desktop/scripts/restore-kill-proof.mjs
  45:1  error  Unused eslint-disable directive (no problems were reported from 'import-x/no-extraneous-dependencies')
```

**The fix is to declare the dependency the scripts actually use.** `esbuild` is `apps/desktop`'s — the proof scripts
live in that package and import it — so it is declared in `apps/desktop/package.json`, not at the root. `^0.28.2` is
the newest release past `minimumReleaseAge`'s seven days (published 2026-08-08) and the range `vite` 8.2.4 itself
peers on (`esbuild: ^0.27.0 || ^0.28.0`), so one copy resolves for both the peer and the two proof scripts. With it
declared, the import is no longer extraneous and the disable in `restore-kill-proof.mjs` is **obsolete**, which is
what the `import-x/no-extraneous-dependencies` rule reports — so it is removed rather than kept.
`terminal-proof.mjs` carries no disable on `main` (it resolves through a local `createRequire` alias), and none is
added: it needs no suppression once the package declares esbuild.

**Nothing else moves for esbuild.** `pnpm-workspace.yaml` already lists `esbuild: true` under `allowBuilds` (its
postinstall places the binary), so no install-script setting changes. `tools/dependency-policy.test.ts`'s catalog rule
(catalogue a dependency **two or more** manifests name) is not triggered: `apps/desktop` is the only manifest naming
`esbuild`, so it stays a plain specifier, not `catalog:`.

## 2. The Electron runtime under 45.1.0

`ELECTRON_RUN_AS_NODE=1 electron -p process.versions` on this tree (Linux x86_64, 2026-11-06):

| | Electron 44.10.0 | Electron 45.1.0 |
| --- | --- | --- |
| Node | 24.22.1 | 24.22.1 |
| Chromium | 152.0.7977.169 | 156.0.8078.49 |
| V8 | 15.2.124.45-electron.0 | 15.6.75.19-electron.0 |
| `process.versions.modules` | 149 | **150** |

**The module interface moves (149 → 150).** That is exactly ADR-0056's native-module obligation: `better-sqlite3` and
`node-pty` are rebuilt against the shipped Electron and load-proved under it, which `pnpm package` does and CI's
`package` job reports on the landed head — not on a Linux host, and not here.

## 3. Verification on this tree

Run on Linux x86_64, Node 26.12.1, pnpm 11.9.0, on the branch head.

- **`pnpm check` — symbols, typecheck and lint green; the test stage red on one file that is a known host-dependent
  flake, not this change** (below). `gate:symbols` generated (unchanged), `gate:typecheck` printed no `error TS`, and
  the lint stage's own checks all passed — including `check-record-links` (12,172 links), `check-doc-budget` (2,604
  files) and `eslint .` with **0** unused-disable and 0 errors. The eslint stage no longer reports the CI error above:
  `eslint apps/desktop/scripts/restore-kill-proof.mjs apps/desktop/scripts/terminal-proof.mjs` exits **0**.
- **The test stage:** 556 files passed, **1 failed** — `packages/agent-tools/src/terminal/terminal.test.ts`, the four
  soft-paused kill cases of `REQ-SHELL-092, REQ-TOOLS-098`, `goneWithin(pids, 5_000)` reading `[true, true]` where
  `[false, false]` is expected. **This is the documented host-dependent flake**
  ([`the-pty-process-death-assertions-flake-on-a-loaded-host.md`](../../defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md)),
  whose own 2026-10-29 Linux reading is the same four cases on the base commit `3ed01f9f` with nothing pending. It
  needs no PTY interface from the change and reproduces on the **untouched** `origin/main` (`b6501e8e`) worktree on
  this same host: **4 failed, 113 passed** — the identical four cases, on a tree that does not contain this branch.
  The red is the host, not the bump.
- **Under the new runtime:** `ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron -p process.versions` reports
  45.1.0 (table above), so the pin resolves and the runtime installs.

**What this lane did not run, and why.** The proofs (`*-proof` suites) build and drive the app through Electron; this
host has no X display and no `xvfb-run` (`pnpm preflight` fails its display check for exactly that), so no proof suite
ran here. `pnpm build` and the package path also need a display. Rule 4's run for 45.1.0 — the native bindings rebuilt
against 45.1.0 and load-proved under the packaged binary, plus the packaged launch — is **CI's `package` job on the
landed head**, reported with the pull request, not here. The pull request's ACKNOWLEDGES this in its own text.

**`package` (rule 4) refused on this branch too, both runs — and it is not a flake.** The `package` job refused on
both of this branch's runs (42271282568, 42271350580) at the same step, `the packaged app opens a store and runs a
terminal call` → `expected one session, found 0`, and so did Dependabot's #49 on both of its runs. **Status: blocked
on rule 4** — the packaged launch does not run a session under 45.1.0 (see §4 for the measurement and the earlier
claim this file made and now retracts).

## 4. The packaged launch under 45.1.0 refuses, and the 2026-11-04 note's "flake" reading does not survive

**This file earlier read the refusal as the step's flake rather than the major. That reading is retracted: it rested on
a misattribution, and the corrected tally points the other way.**

What was measured, head by head (every `package` job I read; `expected one session, found 0` is the refusal):

| Head | Electron | Run | Event | `package` |
| --- | --- | --- | --- | --- |
| #49 `eacc569d` | **45.1.0** | 41905629985 | push | refused |
| #49 `eacc569d` | **45.1.0** | 41905640745 | pull_request | refused |
| **#58 `d24c2fa9`** | **45.1.0** | 42271282568 | push | **refused** |
| **#58 `d24c2fa9`** | **45.1.0** | 42271350580 | pull_request | **refused** |
| #52 `f1442691` | 44.10.0 | 41905781129 | push | refused |
| #52 `f1442691` | 44.10.0 | 41905796288 | pull_request | **passed** |
| #54 `24ad497a` | 44.10.0 | 41906236287 | push | **passed** |
| #54 `24ad497a` | 44.10.0 | 41906246618 | pull_request | **passed** |
| main `b6501e8e` | 44.10.0 | 42252399585 | push | **passed** (2026-11-06, this day) |

**Electron 45.1.0: 4 refusals of 4. Electron 44.10.0: 1 refusal of 5.** The single 44.10.0 refusal is the same-head
red/green pair this file leaned on — but the head is **#52's** (`f1442691`, the `typescript` pull request), **not
#54's** as an earlier version of this section said, and #52 never moves Electron either. So the step is not perfectly
deterministic (one 44.10.0 run refused where four passed), but **every 45.1.0 run refused, on two independent
branches, while main under 44.10.0 passed the same day** — the correlation is with the Electron line, and the used
evidence does not support calling it a flake.

**The failure signature, from the evidence artifact** (`windows-x64-package-evidence`, runs 42271282568 and
42271350580, cross-checked against #49's 41905629985/41905640745, which share it):

| | under 44.10.0 (main `b6501e8e`, passing) | under 45.1.0 (#58 `d24c2fa9`, refusing) |
| --- | --- | --- |
| `run host hello` | present | present |
| `run host: session <uuid> started; row 0 recorded` | **present** | **absent** |
| `run host: model request POST …/chat/completions` | **5** | **0** |
| `run … ended completed (tasks_complete)` | present | absent |
| tail | `0 sessions` not written; the run is recorded | `… exited (0), an orderly end` with **0 sessions** written |

So under 45.1.0 **the packaged app never starts the run at all** — the store opens, the MCP setup completes, and then
the launch ends with no session row, where the same build under 44.10.0 starts a session and issues its model requests
seconds in. That is the shape ADR-0056's rule 4 exists to catch, and it is a **behavioural difference in the packaged
app under the new major**, not a read race in the probe.

**What remains unestablished, stated plainly.** *Why* 45.1.0 refuses is **not** diagnosed here: the artifact shows the
run never starts, not which of the several candidate causes it is (a Chromium 156 rendering change, a scripted-seam
(`ROTARIS_CAPTURE_PROMPT`) path that no longer fires, a changed Node/Chromium behaviour on the way to the composer, a
startup refusal the log does not name). This host cannot run the packaged launch to bisect (no display), so the
diagnosis is owed to a Windows host or to CI with an instrumented probe. What is established is the difference itself
and its correlation with the major.

**Consequence for the branch.** Rule 4 is **not discharged** for 45.1.0, so `main`'s rule — a green gate on the
landed head and the proofs the plan names — is not met, and this branch reports **blocked on rule 4** rather than
ready. The esbuild fix in §1 stands on its own (the gate's lint error is gone, verified locally), but a lint fix does
not carry a major whose packaged launch does not run. The dated observation appended to
[the note](../../defects/the-packaged-app-under-electron-45-opens-no-session-in-the-package-jobs-launch.md) was
written to say the 2026-11-04 refusals were the probe's flake; it has been corrected there too, and the note's original
reading — that 45's packaged launch opens no session — is **re-instated as the standing one**.

## 5. The two pull requests beside this one (owner's ruling, 2026-11-06)

- **#54 (`undici` 7.30.1 → 8.12.3, the `production` group) — closed; the dispatched `undici` stays 7.30.1.** The
  product's own code builds an `undici` `Agent` and hands it to `fetch` as the `dispatcher`
  (`packages/agent-tools/src/tools/direct-fetch.ts`, OQ-37). Under 8.12.3 the gate measured a real failure:
  `TypeError: fetch failed / Caused by: InvalidArgumentError: invalid onRequestStart method`
  (`packages/agent-tools/node_modules/undici/lib/core/util.js:597`), plus five `fetch.test.ts` cases reading
  `network_error` where `http_error`/`egress_redirect_denied` is expected (job 126841519958). The `Dispatcher` contract
  the code is written against is not the one `undici` 8 exposes, so the bump is **incompatible with the product as
  built**, not merely an unverified update. The comment on the close names the condition for re-opening: the code's
  dispatcher use is rewritten for 8's contract, in a branch of its own.
- **#52 (`typescript` 5.9.3 → 7.0.2, the `dev-tooling` group) — held, not closed.** The gate on its head `f1442691`
  failed with ~30 `TS2339`/`TS2694` errors in `packages/workspace/src/traceability/parser.ts`, every one reading
  `typeof import("…/node_modules/typescript/lib/version")` — the compiler-API surface (`createSourceFile`,
  `ScriptTarget`, `ScriptKind`, `transpileModule`, `isIdentifier`, …) is **gone from the typed entry point** in 7.0.2.
  `parser.ts` loads the compiler through `createRequire(import.meta.url)('typescript')` at run time and types it with
  `import type * as TS from 'typescript'`, so the parser is coupled to whatever `typescript` the resolver finds.
  The prerequisite is the one the ruling names: an **explicit JS compiler-API dependency** the parser can load
  independently of the toolchain's TS7, with the candidate `@typescript/typescript6` (exists on the registry, latest
  6.0.2) to be measured for `createRequire` resolution and packaged availability **before** the bump is accepted. Until
  then the bump breaks the typecheck and the parser's own load path is unproven under 7. The hold is recorded in the
  pull request's comment; nothing is closed or merged.

**A dependabot re-open, and what would stop it (a proposal, not applied).** Dependabot re-proposes a version it still
sees as behind on the next weekly run, so #54's close does not by itself stop `undici` 8 coming back as a fresh pull
request. `.github/dependabot.yml` has no `ignore` block today, and adding one is **not** done here: it is
Dependabot's configuration, `tools/dependabot.test.ts` holds the file's ecosystems, cooldown and groups (an `ignore`
entry must be pinned there too), and the owner ruled only that the pull request is closed, not that an ignore rule is
minted. If the owner wants the re-open suppressed rather than re-triaged, the shape is:

```yaml
    ignore:
      # The product's own dispatcher use is written against undici 7's Dispatcher contract
      # (packages/agent-tools/src/tools/direct-fetch.ts, OQ-37); 8 refuses it with
      # InvalidArgumentError: invalid onRequestStart method. Re-evaluate when that use is
      # rewritten for 8's contract. See docs/architecture/dependency-alerts/2026-11-06-lane-electron-45-1.md §5.
      - dependency-name: 'undici'
        update-types: ['version-update:semver-major']
```

It belongs in the `npm` entry beside `cooldown` and `groups`. No such edit is made in this branch; the section is
recorded so the decision is a one-line change when the owner makes it, and so a silent re-open is read as what it
is — Dependabot doing its job, not a reversal of this reading.
