# Lane record — electron-vite 6 on Electron 44.10.0, with the preload's externals fixed (R-091, 2026-11-07)

The completion of the split the 2026-11-06 record began (its own file stands on branch `chore/deps-electron-vite-6`, PR
[#64](https://github.com/Concrete-Dynamics/Rotaris/pull/64), and reaches this directory only with that pull request). That
record lifted `electron-vite` to 6.0.0 **alone**, held `electron` at 44.10.0, and proved the bump sufficient on its own to
refuse ADR-0056 rule 4: the v6 preload shipped `require("zod")`, a sandboxed preload cannot load a package out of
`node_modules`, the bridge never landed, and the packaged launch found 0 sessions with a one-colour `load-proof.png`.
It proved the remedy, too, in a minimal fixture: `externalizeDepsPlugin({ exclude: ['zod'] })` and
`build.externalizeDeps: false` each bundle `zod` back into the preload.

This branch takes the two arms that were left as a probe and turns them into one acceptable change: `electron-vite` 6,
the `esbuild` devDependency the 2026-11-06 lane's build needed, and the preload's externals answered. **`electron` is
unmoved at 44.10.0.** Branch `chore/deps-electron-vite-6-preload-fix`, cut from `origin/main` at `6b521dc6`.

## The root cause, measured rather than inferred

The 2026-11-06 record said electron-vite 6 "leaves `zod` external". What it does, read from the release's own code and
measured on this tree, is narrower and states the rule the repository must now hold:

- **v6 writes the dependency list into the options the bundler actually reads.** `externalizeDepsPlugin` emits an
  `enforce: 'pre'` config hook that sets `build.rolldownOptions.external` and then assigns
  `config.build.rollupOptions = config.build.rolldownOptions` (`node_modules/electron-vite/dist/chunks/lib-DoUt4oMD.js`,
  the plugin and its call site at `resolveConfigDrivenPlugins`). On Vite 8, whose bundler is rolldown, that list is the
  effective one. In v5 the plugin set `rollupOptions.external` only.
- **The differential, printed from a probe in both trees** (`enforce: 'post'`, reading `config.build` after every plugin
  has run): the preload's `rolldownOptions.external` is **`n=136`, `zod=false`** under v5 and **`n=280`, `zod=true`**
  under v6, while `rollupOptions.external` reads `n=280`, `zod=true` in both. So the preload section's own `external`
  list (`EXTERNAL`: electron, the native modules, the builtins) stopped replacing the dependency list.
- **The consequence, on the artifact.** Same tree, same `pnpm --filter @rotaris/desktop build`, only the preload section
  differing: unfixed → `require("electron")`, `require("zod")`, md5 `61c11cdf25375e9c7e06aca6ba5a2aef`, 144,889 B;
  fixed → `require("electron")` alone, md5 `39d99be298e5ad5d82b9bae98d1ffcda`, 324,790 B.
- **The fix is surgical.** In the fixed tree `preload/index.cjs` differs from the unfixed build, and
  `main/index.js` (`46c4dd3577376501f31c3b166edaaf2d`), `main/run-host.js` (`e30bccd07222eaf5130140fb73ea03ee`),
  `main/workspace-service.js` (`d76595d625b996aeab58dab7dc733e1d`) and `renderer/index.html`
  (`5987b36d0c468e2e384a05173553b3c5`) are byte-identical between the two builds.

## Which remedy, and why that one

Both proven candidates were built on this branch and compared, not chosen on paper. Each produced the **same**
preload — md5 `39d99be2…`, 324,790 B, byte-identical to the v5 baseline's own preload (`/tmp/rot-baseline`, `b6501e8e`)
and to each other.

| Remedy | Result |
| --- | --- |
| `build.externalizeDeps: false` on the preload section (**taken**) | preload `39d99be2…` (324,790 B), `require`s `electron` only |
| `externalizeDepsPlugin({ exclude: [...WORKSPACE_PACKAGES, 'zod'] })` (rejected) | byte-identical preload |
| `build.rollupOptions.external: ['electron']`, `ssr.noExternal: true`, dropping the plugin (2026-11-06, all ineffective) | still `require("zod")` |

**`build.externalizeDeps: false` is taken** because it is the electron-vite 6 API for this exact case — the plugin's own
declaration is `@deprecated use build.externalizeDeps config option instead`, and the preload types state that a
sandboxed preload requires third-party dependencies bundled (the `isolatedEntries` doc comment says the same) — and
because it closes the class rather than the one package reached today. An exclusion list names the packages that happen
to be external *now*; the next `dependencies` import the preload grows through `@rotaris/contracts` would reopen the
defect in silence. Where the plugin is given, `resolveConfigDrivenPlugins` skips the option, so the preload section now
carries the symbol plugin alone and the option decides; `EXTERNAL` still states what stays external.

## What changed

| File | Change | Why |
| --- | --- | --- |
| `apps/desktop/package.json` | `electron-vite` `^5.0.0` → `^6.0.0`; `esbuild` `^0.28.2` added; **`electron` unmoved at `44.10.0`** | the lift; the bundler the build's own child compile requires |
| `apps/desktop/electron.vite.config.ts` | the preload section: `build.externalizeDeps: false`, the symbol plugin alone, the reason in the comment; the header's preload bullet extended | the fix |
| `apps/desktop/scripts/restore-kill-proof.mjs` | the now-unused `import-x/no-extraneous-dependencies` disable removed | `esbuild` is a declared devDependency, and the lint runs `reportUnusedDisableDirectives: 'error'` |
| `apps/desktop/scripts/lib/preload-externals.mjs` | new: the check and its allowed set | the artifact-level guard |
| `apps/desktop/scripts/lib/preload-externals.test.ts` | new: the reading, with a case that must fail | so the guard can be shown to fail |
| `apps/desktop/scripts/package.mjs` | one step, "the preload carries no external package", after the build | rule 4's own job reads the preload back |
| `docs/architecture/dependency-alerts/README.md` | one row | this record |
| `pnpm-lock.yaml` | the importers' specifiers, `electron-vite` 6.0.0 with `rolldown`, `esbuild` 0.28.2 | resolution |

`electron` stays `44.10.0` by the 2026-11-04 [part 11](../adr/0056-the-build-toolchain/11-the-electron-pin-moves-to-44100-2026-11-04-r-091.md)
of ADR-0056 and this lane's brief: the Electron-45 step is its own change, and it is only answerable once the preload
loads.

## Verification on this tree

All of it ran on Linux x86_64, Node 26.12.1, pnpm 11.9.0, Electron 44.10.0 (unchanged), each heavy run behind
`heavy-nice` + `heavy-run`.

- **The build.** `pnpm --filter @rotaris/desktop build` green with `electron-vite` 6.0.0 resolved, and the emitted
  preload `39d99be2…` (324,790 B) — byte-identical to the v5 baseline's preload, `require`s `electron` only.
- **The runtime, with my own hands** (`/tmp/ev6-verify/main.js`: a `BrowserWindow` with `sandbox: true` and the given
  preload, then `executeJavaScript('typeof window.rotaris')`, Electron 44.10.0, `--headless --ozone-platform=headless
  --disable-gpu --no-sandbox`):

  | Preload | `sandbox` | Result |
  | --- | --- | --- |
  | this branch's build (`build.externalizeDeps: false`) | `true` | **`BRIDGE-TYPE object`** |
  | the same tree's preload with the fix reverted | `true` | `PRELOAD-ERROR … module not found: zod` → `BRIDGE-TYPE undefined` |

  The second row is the **negative control**, run after the fix, through the same harness and flags: the check goes red
  without the change. Both readings are from this branch's own tree, not from a fixture.
- **The new artifact check, both directions.** `node apps/desktop/scripts/lib/preload-externals.mjs` on the built
  `out/preload` → `PASS` (exit 0); the same command on a directory holding only the unfixed preload →
  `FAIL — zod` (exit 1). Its test file: 7 passed, including one case it must fail on.
- **`pnpm symbols`** exit 0 (4447 identifiers, 120 directives; the artifact unchanged).
- **`pnpm typecheck`** exit 0, 0 `error TS` (it reads the `.mjs` under `tsconfig.scripts.json`; the helper's first
  version failed it with 5 errors and was corrected).
- **`pnpm lint`** exit 0, all stages — `check-record-links` reads 12173 relative links in 2605 files; `check-doc-budget`,
  the proof registry, the boundaries pass and the UI-language check green.
- **`pnpm test`** — exit 1: **4 failed | 8060 passed | 57 skipped (8121)**, 563 files, 211 s. Every failure is one of the
  four cases of the soft-paused kill suite in `packages/agent-tools/src/terminal/terminal.test.ts`
  (`goneWithin(pids, 5_000)` reading `[true, true]` where `[false, false]` is expected — lines 1195, 1228, 1241, 1267).
  This change touches nothing that file or the terminal loads (`git diff origin/main -- packages/` is empty; the file is
  byte-identical between `b6501e8e` and `6b521dc6`), and the red is the host-dependent flake this repository already
  carries: [`the-pty-process-death-assertions-flake-on-a-loaded-host.md`](../../defects/the-pty-process-death-assertions-flake-on-a-loaded-host.md)
  records line 1267's case reading `[true, true]` on 2026-10-29 and `[false, true]` on 2026-11-01, on trees that contain
  nothing of the change each time.
- **The negative control for that red, run here.** The same file, same command, same host, on an untouched
  `origin/main` worktree (`/tmp/rot-baseline`, `b6501e8e`): **the identical four cases**, 6579 / 6575 / 8101 / 8603 ms.
  Alone on this branch's tree it repeats: 6570 / 6567 / 8059 / 8590 ms. The red is the host's, on both trees, and not a
  difference this branch makes — recorded as a flake, not reformatted into green.

## The `package` job (rule 4) — GREEN

CI on the frozen dependency diff, read from each run's own artifact (`windows-x64-package-evidence`), not from the log
alone. The dependency diff is frozen at `52d7b547`; the head below adds only this record file.

| Event | Job | Conclusion |
| --- | --- | --- |
| pull_request, head `52d7b547` | `128232239794` (run `42317086674`), started `2026-11-07T00:15:20Z` | **success**, 8m3s |
| push, head `52d7b547` | `128232175430` (run `42317066305`) | **success**, 5m35s |
| push, head `90e80d1c` | `128237708649` (run `42318711466`) | **success**, 7m6s |
| pull_request, head `90e80d1c` | `128237770453` (run `42318716466`) | **failure** — see below |
| pull_request rerun, head `90e80d1c` | `128241786120` (run `42318716466`) | **success**, 6m44s |
| push, head `b7f7f9ae` | `128246110261` (run `42321262602`) | **success**, 7m19s |
| pull_request, head `b7f7f9ae` | `128246150348` (run `42321266385`) | **success**, 6m33s |

**The reading, from the artifact.** The numbers below are the `52d7b547` pull_request run's; every other green reading
carries the same fields (session `completed`, `requests` 5, `toolsRequests` 2, `terminalCalls` 1, `painted` true), the last
of them the final head's (`b7f7f9ae`, pull_request job `128246150348`: session `4ce9dd46-…` `completed`, 5 requests,
`painted` true, exit 0).

| Item | Before (2026-11-06, six runs) | This head |
| --- | --- | --- |
| `the packaged app opens a store and runs a terminal call` | **refused** — `expected one session, found 0` | **ok**, 10219 ms |
| sessions in the store | 0 | **1**, `execution_status` `completed` |
| terminal call | absent | present, `status` `ok`, `is_error` 0 |
| stub model requests | **0** | **5** (`toolsRequests` 2, `terminalCalls` 1) |
| `load-proof.png` | 1024×720, **exactly one colour** `(18,18,18)` | 1024×720, **4659 distinct RGB colours** |
| app log | no session started | `run host: session d8ab194b-… started; row 0 recorded` at `00:22:34.247Z`, five `POST …/v1/chat/completions` |
| store `user_version` | (not reached) | 35, migrated |
| the new step: `the preload carries no external package` | — | **ok**, 1 file read |
| every prior step (build, seam check, code-intelligence bundle/manifest, notices, build id, artifact names, `electron-builder --win`, fuses, portable, icon) | ok | ok |
| portable launched twice (REQ-STARTUP-165) | — | ok, 22082 ms |

### The one red, and why it is not this change

The `90e80d1c` pull_request run's `package` job failed at the launch with `expected one session, found 0` — the same
sentence as the defect this branch fixes, and **not** the same failure. Its own artifact separates them:

| | The preload defect (2026-11-06) | This red (`128237770453`) |
| --- | --- | --- |
| `the preload carries no external package` | — (step did not exist) | **ok** — the preload it built was clean |
| `load-proof.png` | **exactly one colour** `(18,18,18)` | **2721 distinct colours**: a fully painted UI (sidebar, banner, Overview) |
| app log | host-side steps only, no session | host-side steps **and** the window loaded, the notice drawn, `code-intelligence-setup → success` |
| the typed prompt | never reached | **never reached** — no `prompt roots` line, no `run host: session … started`, 0 model requests |
| the view | — | **Overview**, the launch view: the probe's Ctrl+2/Ctrl+L chords and its typed text never took effect |

The window painted and every host-side step settled; only the probe's scripted input did not land, so no run started.
That is a driver-timing mode on a loaded Windows runner, not the preload's externals: the artifact the job itself built
carried `require("electron")` alone and passed its own check. The same head's push-event job passed the same step, and the
pull_request rerun passed it too — three green readings and one red across one head, with the red's evidence showing a
healthy preload. It is recorded here rather than smoothed over: a red package job holds the merge until a green one
stands, and the green one does (the rerun).

**What this settles and what it does not.** Settled: on Electron **44.10.0**, electron-vite 6 with the preload's
externals answered passes ADR-0056 rule 4 in CI — the packaged application opens its store, starts a run, reaches the
shipped model client, runs the terminal call and paints a real window. The intermediate link the 2026-11-06 record had to
mark as "consistent with" is now closed at the packaged level too: the app log carries the session and the model requests
that the broken preload left at zero. Not settled here: Electron 45.1.0's own fitness (§ above); and the probe-input
mode the one red shows, which the green runs and this branch's own preload do not explain away — it is named as an
observation with its artifact, not diagnosed here.

## The `gate` job (`pnpm check`)

| Event | Job | Conclusion | Reading |
| --- | --- | --- | --- |
| push | `128232175088` (run `42317066305`) | **fail** | `Test Files 557 passed \| 5 skipped (563)`, `Tests 7941 passed \| 134 skipped (8121)`, **`Errors 1 error`** — **no failing test**. The one error is `Worker exited unexpectedly` ([`a-vitest-fork-worker-exits-unexpectedly-during-the-gate-and-its-test-file-goes-unreported.md`](../../defects/a-vitest-fork-worker-exits-unexpectedly-during-the-gate-and-its-test-file-goes-unreported.md)): 562 of 563 files reported, one file's worker died and was never reported. The `AttachConsole failed` traces around it are printed by green runs on that host too. This branch's own file reported green in the same run: `✓ apps/desktop/scripts/lib/preload-externals.test.ts (7 tests \| 1 skipped)`. |
| pull_request | `128232239446` (run `42317086674`) | recorded in the PR | |

This is the repository's documented runner red, not this diff's: no test failed, and the branch touches neither the
terminal nor the orchestrator nor a worker's own code (`git diff origin/main -- packages/` is empty). A red gate holds
a merge until it is green, so it is reported here rather than smoothed over.

## Deviations from the brief, and open risks

- The brief said "einen der zwei bewährten Kandidaten" (one of the two proven candidates). Both were built; the
  supported API was taken and the other is recorded above with its byte-identical result. That is a choice inside the
  brief, stated rather than silent.
- **The guard is new code, and new code can be wrong.** It is minimal (a `require` scan over the emitted preload, an
  allow-list read from the config) and its test proves the failing direction; the residual risk is a `require` shape
  the regex does not read (a computed specifier), which no build here emits.
- **The `gate` job's documented flakes are not this change's.** `packages/agent-tools/src/terminal/terminal.test.ts`
  (host-dependent PTY process death) and the Windows-runner land/settle-launch cases have gone red on heads this PR
  does not touch; the 2026-11-06 lane recorded them, and `main`'s own `6b521dc6` gate failed the first of them.
- **Electron 45.1.0 stays open and unrated.** Nothing here exercises it. It is now separately answerable — a preload
  that loads is its precondition, and this branch is where that condition is met — but the pin's own fitness needs its
  own branch and its own `package` run.
