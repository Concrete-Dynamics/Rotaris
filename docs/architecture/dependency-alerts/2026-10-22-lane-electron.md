# Lane record — Electron 44.3.0 (R-081, 2026-10-22)

The Electron lane of [the 2026-10-22 triage](2026-10-22-dependabot-triage.md): branch `deps-electron-44-3`, cut from
`origin/main` at `b0d1b3ff`. It patches **2 alerts**, #3 and #54 (GHSA-fw47-9c62-h3vw, `electron` `>= 44.0.0-alpha.1,
< 44.3.0`). Each is *expected* to close when this branch merges, and neither is closed before. The other 47 alerts are on
the patch branch, `deps-security-patches`. The residuals (#40, #42) stay open (triage §5).

## What changed

| File | Change | Why |
| --- | --- | --- |
| `apps/desktop/package.json` | `electron` `44.1.1` → `44.3.0` (exact pin kept) | #3, #54 |
| `pnpm-lock.yaml` | the importer's specifier and version, and `electron`'s own `packages` and `snapshots` entries | the pin; nothing else moves |
| `docs/architecture/adr/0056-the-build-toolchain.md` | a dated section | the toolchain's Electron moved; Consequence 7 is the case |
| `docs/defects/` | one note | noticed along the way; recorded, not repaired |
| `docs/product/requests.md`, `docs/architecture/README.md`, `docs/architecture/dependency-alerts/` | R-081, a pointer, this directory | the request and its triage, byte-identical on both branches |

electron 44.3.0 declares the same dependencies as 44.1.1 (`@electron/get` 5.1.0, `@electron-internal/extract-zip`,
`@types/node`). The lockfile was resolved by `pnpm install --lockfile-only` after the specifier changed, and the diff is
five changed lines: the specifier, the version, the `packages` key with its integrity, and the `snapshots` key. `pnpm install --frozen-lockfile` then reads "Already up to date", and `node node_modules/electron/install.js`
fetched the 44.3.0 runtime.

**What was checked for coupling to the pin, and left.** No manifest, setup file, workflow or build hook names the
version. `build-hooks.cjs` reads `ctx.electronVersion`. The remaining `44.1.1` strings are test fixtures with their own
inputs (`tools/notices/notices.test.ts` builds a fixture `package.json`, and `apps/desktop/scripts/lib/platform-targets.test.ts`
passes an arbitrary version to the IC-3 refusal), plus dated measurements in comments and in the record. None changed. No
architecture view states the Electron version, so no view and no reconciliation entry changes. The component view's
pins are the patch branch's to change.

## Verification on this tree

All of it ran on Linux x86_64 with Node 26.8.1 and pnpm 11.9.0.

- **The runtime.** `ELECTRON_RUN_AS_NODE=1 electron -p process.versions` gives Node 24.20.0, Chromium 152.0.7977.78 and
  `modules` 149 (ADR-0056's table has both runtimes). The binary interface is unchanged.
- **`pnpm verify:plan`** names the gate and **no proof suite**, and asks for review of `apps/desktop/package.json`. Electron is the
  runtime of every proof, so the review named **every proof**: 53 of the 54 `*-proof` scripts in the root
  `package.json`, all run. The 54th, `slice-proof`, signs in to a real endpoint with a stored key on `live-run`'s terms
  ([`docs/proofs/README.md`](../../proofs/README.md)). It costs money, and the brief this lane ran under excludes a live run.
- **`pnpm build`** (electron-vite) is green, and `pnpm code-intel:bundle` built for linux-x64.
- **The proof sweep, 53 proofs,** on the built tree, on a private 1600×1000 Xvfb. It ran in three stretches: three proofs
  (17:03 to 17:13 UTC), then a session restart, then 22 (18:07 to 19:02) and 28 (19:04 to 20:00). **51 passed** at
  their first run: `part-h-proof`, `part-j-proof`, `continuation-proof`, `plan-gate-proof`, `resilience-proof`,
  `compression-proof`, `checkpoint-proof`, `sessions-proof`, `restore-kill-proof`, `store-resolution-proof`,
  `fetch-proof`, `edits-proof`, `questions-proof`, `approvals-proof`, `todo-proof`, `attachments-proof`,
  `artifacts-proof`, `mcp-proof`, `code-intel-proof`, `skills-proof`, `injection-proof`, `sandbox-proof`,
  `terminal-stream-proof`, `tool-shapes-proof`, `delegation-proof`, `config-proof`, `init-proof`, `workspace-proof`,
  `settings-proof`, `updater-proof`, `transcript-proof`, `rows-proof`, `update-depth-proof`, `composer-proof`,
  `slash-proof`, `chat-controls-proof`, `palette-proof`, `notice-proof`, `library-proof`, `improvements-proof`,
  `retrospective-proof`, `mission-proof`, `git-proof`, `theme-proof`, `layout-proof`, `overview-proof`,
  `requirements-proof`, `requirements-runs-proof`, `traceability-proof`, `directive-proof` and `driver-proof`.
  **2 failed, and neither is the bump:**
  - `terminal-proof`, 121 of 122: `live.headerCommand` read an elided label. The echo command is
    `node "<checkout>/.proof/terminal-proof/out/echo.cjs"`, and from this worktree's path it is 92 characters, where the
    label elides past 90 (`packages/ui/src/terminal/labels.ts`). The open note is
    [`terminal-proofs-header-check-ignores-the-command-labels-90-character-elision.md`](../../defects/terminal-proofs-header-check-ignores-the-command-labels-90-character-elision.md).
    The failure depends on the length of the checkout path, not on Electron.
  - `exit-trace-proof`, 35 of 37: after the proof's `SIGSEGV` to the renderer, main wrote no `RENDERER GONE` line. It
    failed the same two checks on untouched `b0d1b3ff` under Electron 44.1.1, run alone, and again on this tree. The
    new note is
    [`exit-trace-proofs-renderer-crash-writes-no-renderer-gone-line-on-a-linux-host.md`](../../defects/exit-trace-proofs-renderer-crash-writes-no-renderer-gone-line-on-a-linux-host.md).
- **A cold rebuild against 44.3.0.** `better-sqlite3` 13.0.3 and `node-pty` 1.1.0 were copied to a scratch project
  without their `build/` and `prebuilds/`. Both were compiled through `@electron/rebuild` 4.2.0's API with `beforeBuild`'s
  own options (`electronVersion: '44.3.0'`, `buildFromSource`, `force`, `useCache: false`, `mode: 'sequential'`,
  `npm_config_force_build=1`), against the headers node-gyp fetched into `~/.electron-gyp/44.3.0` (`"target": "44.3.0"`),
  in 99 s. The 44.3.0 binary, run as Node, then loaded each from its fresh `build/Release` (the `dlopen` paths say so).
  An in-memory SQLite (3.53.4) stored and read back a row, and a PTY ran `/bin/sh -c 'echo …'` and exited 0. These are Linux
  bindings, not the artifact's.

**Not here, and why.** The gate (`pnpm check`) is run on this exact tree before the commit. Continuous integration's
`gate` and `package` jobs run on the pushed head, and `package` is ADR-0056's rule 4 for the artifact: the Windows bindings
rebuilt against 44.3.0 and loaded under the packaged binary. All of these results are in the pull request, because no file
can carry the result of a run on the commit that holds it. This host is Linux, and none of these steps had a Windows
host to run on.

No Linux or macOS artifact was produced (IC-3, `PD-STARTUP-001`).

## What this lane leaves

- **Newer Electron not taken**: 44.9.3 is the newest 44 line at this reading. The brief named 44.3.0 alone.
- **#40 and #42**, recorded as residuals in triage §5.
- **The merge with the patch lane.** Both branches change `pnpm-lock.yaml` and `apps/desktop/package.json`, on different
  lines. Whichever lands second is rebased, `pnpm install --lockfile-only` is run on the rebased tree, and that tree is
  gated again.

## Stopped at the gate — 2026-10-22, not committed

The brief this lane ran under allows one repeat of a red full gate and then stops the lane uncommitted. The lane stopped
there: no commit, no push, no pull request. The tree is left in the worktree `Rotaris-crw-wt-deps-electron-44-3` (branch
`deps-electron-44-3`, base `b0d1b3ff`). This section and the note's dated paragraph were written after the runs below.

| Run | Window (UTC) | Tree | Stages | Tests |
| --- | --- | --- | --- | --- |
| `pnpm check` 1 | 20:04:42 to 20:11:24 | before the fix below | symbols, typecheck, lint green; test red | 474 files passed, 1 failed, 5 skipped; 6,987 tests passed, 1 failed, 57 skipped |
| `pnpm check` 2 | 20:11:44 to 20:18:39 | final | symbols, typecheck, lint green; test red | 474 files passed, 1 failed, 5 skipped; 6,987 tests passed, 1 failed, 57 skipped |
| `pnpm check` 3, the one repeat, same tree | 20:20:07 to 20:27:10 | final | symbols, typecheck, lint green; test red | 474 files passed, 1 failed, 5 skipped; 6,987 tests passed, 1 failed, 57 skipped |

- **Run 1** was red on this record's own wording: `tools/windows-ic3-citations.test.ts` found IC-3 named in a sentence
  about the Windows host. The sentence was split, the test passed alone (5 of 5), and the tree changed, so runs 2 and 3
  gate the final tree. The terminal case below passed in run 1.
- **Runs 2 and 3** were each red on one case of `packages/agent-tools/src/terminal/terminal.test.ts`, "REQ-TOOLS-097/099
  (OQ-144, acceptance round 1): a run's cancel that lands while a fresh shell answers the first call's handshake …". The
  load at their start was 2.85 and 1.34. That case is the open note
  [`a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md`](../../defects/a-cancel-during-the-first-calls-handshake-can-read-as-cancelled-before-the-command-completed.md).
  It went red alone on untouched `b0d1b3ff` the same day, and this lane changes no `agent-tools` file.

**What resumes the lane:** a full `pnpm check` green on this tree, or on its rebase, then the commit, the push and the pull
request. Its CI `package` job is then ADR-0056's rule 4 for the 44.3.0 artifact. A repair of the handshake case would also
resume it, but under its own request and not in this lane.

## Resumed — 2026-10-23, rebased onto `7de5286b`

A later brief asked for this worktree's work to be saved — verified, committed, pushed and opened as a pull
request — so the lane was resumed rather than rewritten. `origin/main` was 19
commits ahead of `b0d1b3ff`; the patch lane's pull request had landed R-081's row, the triage and
`2026-10-22-lane-patches.md`, and everything this branch held of `docs/product/requests.md` and of
`dependency-alerts/README.md` was byte-identical to `main`. The rebase took `main`'s copies (`requests.md` counted 83
requests by then, not 81), and this branch carries only what `main` does not: the pin, the lockfile, ADR-0056's dated
section, this record and the two defect notes, in two commits.

Re-run on the rebased tree, on the same Linux x86_64 host, Node 26.8.1 and pnpm 11.9.0:

- **The lockfile.** `pnpm install --lockfile-only` again gives the same five changed lines, and `pnpm install
  --frozen-lockfile` reads "Lockfile is up to date, resolution step is skipped"; the tree was installed from it.
- **The runtime.** `ELECTRON_RUN_AS_NODE=1 electron -p process.versions` gives Node 24.20.0, Chromium 152.0.7977.78,
  V8 15.2.124.19-electron.0 and `modules` 149 — the ADR's table, re-read.
- **The bindings in this tree.** `better-sqlite3` (its `linux-x64` prebuild) opened an in-memory database and read back a
  row and `sqlite_version()` 3.53.4 under the 44.3.0 binary; `node-pty` ran `/bin/sh -c …` and exited 0.
- **`pnpm build`** is green (electron-vite, 7.5 s).
- **A start.** The built tree launched under the 44.3.0 binary with `--ozone-platform=headless` — this host has neither
  Xvfb nor a display — and the log shows the instance claimed, the main window loaded, the workspace store opened
  through `better-sqlite3`, the run host's hello, six skills discovered, the git view read and the first-launch chooser
  offered. The 40 s timeout it was given killed it; nothing else did.
- **`pnpm check`**: symbols, typecheck and lint green; tests 476 files passed, 1 failed, 5 skipped — `terminal.test.ts`
  again, and only it. Five cases this time: the handshake cancel at 1105, and the four `goneWithin` assertions at 1195,
  1228, 1241 and 1267.
- **Neither family is this branch's.** The file run alone, at load 1.9, failed the same five. The untouched `2bb0e577`
  in `Rotaris-crw` (Electron 44.1.1, this host) failed the four `goneWithin` cases with the same `[true, true]` where
  `[false, false]` is expected, and no handshake case. Both families are
  [`the-pty-process-death-assertions-flake-on-a-loaded-host.md`](../../defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md)
  and the handshake note's dated paragraph.

**Still not here.** No Windows host, so rule 4's `package` job — the bindings rebuilt against 44.3.0 and loaded under the
packaged binary — remains the pull request's to report. `pnpm package` was not run, because it builds Windows only. No
Linux or macOS artifact was produced.

