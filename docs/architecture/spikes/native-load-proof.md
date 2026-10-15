# Spike — the build's load proof (IC-6), and the first packaging of the product

- **Date:** 2026-09-04
- **Discharges:** `implementation-conditions.md` **IC-6**, set by the Architecture Gate, decision 2. The
  per-runner half (macOS, Linux) is IC-3 item 3 and is deferred to hardware by GD-5; nothing here touches it.
- **Host:** Windows 11 Pro 10.0.26200, Node v24.11.0, pnpm 11.9.0 (hoisted linker), Electron **44.1.1**
  (node 24.19.0, `modules` 149), electron-builder 26.15.3, @electron/rebuild 4.2.0, Visual Studio 2022
  Community 17.14 (MSVC 14.44, Windows SDK 10.0.26100), Python 3.12.
- **Under test:** ADR-0056 rules 1, 1a, 3 and 4 as built — `apps/desktop/electron-builder.yml`,
  `scripts/build-hooks.cjs` (the two electron-builder hooks), `scripts/native-load-probe.cjs` (rule 4's
  process), `scripts/package.mjs` (`pnpm package`). Evidence lands in `apps/desktop/release/load-proof.json`.
- **Nothing had ever packaged this application before this spike.** electron-builder had never run; the
  packaging path of the walking skeleton's record was marked untested.

**Verdict: IC-6 is discharged.** Under D10's measured condition — a rebuild that exits 0 and compiles
nothing — the build **fails at rule 1a**; with a prebuilt binary in the tree the loader reaches, the build
**fails at rule 4**, naming the file the loader opened; and the straight build passes both, produces the
installer, and the packaged application opens a store in a real utility process and runs a terminal call
through the compiled bindings. Ten runs were needed to get there and every refusal on the way is listed in
section 4, because six of them were the mechanism finding something no reading had caught — one of them in
the product, and it is the ninth defect of the pattern ADR-0058 consequence 17 counts.

---

## 1. What the build now does

| step | where | what it establishes |
|---|---|---|
| `beforeBuild` | `build-hooks.cjs` | every copy of each binding's `build/` is removed (a cold build — @electron/rebuild skips on its `.forge-meta` and node-gyp reports "up to date" otherwise); `force_build=1` reaches node-gyp through `npm_config_force_build` (the binding's own gyp skips its sources when a prebuild exists — D10); the moment is stamped as the **rebuild marker**; @electron/rebuild is run **here**, by name over the set, `force`, `buildFromSource`, and electron-builder's own pass then runs over the result and skips. Its return is logged as "not evidence of anything". |
| `afterPack` rule 1a | `build-hooks.cjs` | for each binding and each built file: a compiled binary **newer than the marker** exists among the copies the rebuild can reach, the artifact's copy under `app.asar.unpacked` is **byte-identical** to one of them, and no prebuild is in the artifact — neither unpacked nor **in the asar index**, where the binding's `existsSync` would find it. |
| `afterPack` rule 4 (a) | `native-load-probe.cjs` | `ELECTRON_RUN_AS_NODE=1 <win-unpacked>/Rotaris.exe probe <appOutDir>`: the packaged Electron binary requires each binding **through the packaged `app.asar`**, with `process.dlopen` wrapped so the report names the file the loader actually opened; it opens `:memory:` and a WAL file through better-sqlite3 and spawns `cmd.exe /c echo` through node-pty and waits for exit. The hook asserts the Electron version, that every opened file is one of rule 1a's, and that each binding opened at least one. |
| `afterPack` naming | `build-hooks.cjs` | `REQ-STARTUP-031`: the yml's `artifactName` templates render to `artifactName(version, 'setup')` from `tools/release-naming`. |
| rule 4 (b) | `package.mjs` | after the installer: `win-unpacked/Rotaris.exe <scratch workspace>` under a scratch `LOCALAPPDATA` with the scripted client and the capture seams; the scratch store must exist at the current schema, hold one session, and a settled `terminal` call. |
| counterfactuals | `ROTARIS_IC6_COUNTERFACTUAL=no-force` / `keep-prebuild` | D10's condition; a prebuild in the loader's path (packed from the same yml minus the exclusions, rule 1's presence check looking away). Each **must** refuse the build. |

## 2. The straight build — run 9

| | |
|---|---|
| `electron-vite build` | 2.9 s |
| `electron-builder --win` (rebuild, pack, hooks, NSIS) | 262.5 s, of which the cold rebuild of both bindings **176.9 s** |
| the packaged app | 10.4 s |
| **total** | **275.8 s** |
| rule 1a | `better_sqlite3.node` 1,989,632 B; `pty.node` 303,104 B, `conpty.node` 312,320 B, `conpty_console_list.node` 134,656 B — all newer than the marker, byte-identical in the artifact, no prebuild in `app.asar.unpacked` or in the asar index (1,070 entries) |
| rule 4 (a) | Electron 44.1.1, node 24.19.0, `modules` 149; **2 files opened**, both under `app.asar.unpacked`: `better-sqlite3/build/Release/better_sqlite3.node` and `node-pty/build/Release/conpty.node` (the ConPTY path; `pty.node` is winpty's and is not reached on this Windows); SQLite 3.53.4, `journal_mode` read back `wal`, PTY exit 0 with the echo seen |
| rule 4 (b) | the packaged app claimed the instance, forked the run host and the workspace service, opened the scratch store at **schema v5**, ran one session to `completed` with one `terminal` call settled `ok`, painted (`load-proof.png`: the Workspace view, "Intent: moderate_feature", `$ git status` ok · 2.1 s, "The run completed."), and showed **0.1.0** in the shell header — the packaged `app.getVersion()` is the product's, not Electron's |
| artifacts | `release/Rotaris-0.1.0-windows-x64-setup.exe` (125,246,346 B) and its `.blockmap`; `win-unpacked/` 442 MB, `app.asar` 68.5 MB |
| naming | both templates render to `Rotaris-0.1.0-windows-x64-setup.exe` |
| signing | **none** — no certificate is configured; `signtool verify` finds no signature on the executable, the installer, or the shipped `electron.exe`. electron-builder's log prints "signing with signtool.exe" for four files anyway. Signing is `REQ-STARTUP-107`'s obligation and is not this work's. |

## 3. The two counterfactuals — the build refuses

**Run 7 — `no-force`.** `force_build` unset, everything else the same. The rebuild ran for **138.2 s, exited 0**,
and the build was refused:

> rule 1a (better-sqlite3): no compiled binary newer than the rebuild marker (2026-09-04T10:30:54.808Z) for
> build/Release/better_sqlite3.node — the rebuild step produced nothing; found no file at all

That is D10 exactly — the command reports success, the artifact would have carried nothing — and it is
caught before packaging by the evidence about the artifact, which is what rule 1a was written to be.

**Run 10 — `keep-prebuild`.** Packed from the same configuration minus the two exclusion lines, so the
prebuilds are in the asar index and, being `.node`, unpacked beside the compiled files; rule 1's presence
check skipped for the counterfactual. Rule 1a passed on the compiled files (they are there and fresh); the
probe ran; the build was refused:

> rule 4: the loader opened a file that is not the compiled binary the artifact carries:
> `\\?\…\app.asar.unpacked\node_modules\better-sqlite3\prebuilds\win32-x64.node`

better-sqlite3's loader prefers `prebuilds/<platform>-<arch>.node` and opened it; node-pty's loader prefers
`build/Release` and opened the compiled `conpty.node`, so the refusal names exactly the binding whose loader
would have shipped the wrong file. **Rule 4 is the check, and it is the only one that saw this.**

## 4. What the first execution found — ten runs, six findings

| run | refused at | finding |
|---|---|---|
| 1 | electron-builder | **`electron: ^44.1.1` is a range, and the packager refuses a range.** Pinned to `44.1.1` — ADR-0056 consequence 7 says the shell and the addons move together, and a range was never that. |
| 2 | the dependency collector | **`pnpm list --prod --json --depth Infinity` fails with `EMFILE`** over the app's tree while `@rotaris/*` are `dependencies`. They are compile-time inputs (vite bundles them through aliases), so they moved to `devDependencies`; the list then succeeds. The app's runtime dependencies are exactly the seven electron-vite externalises. |
| 2 | (not refused — noticed) | **`node-pty` was not a dependency of the app.** The run-host bundle externalises it, so the artifact would have carried no PTY and the terminal tool would have failed only in the field. Added. |
| 3 | rule 3 | **Returning `false` from `beforeBuild` makes electron-builder package no `node_modules` at all** (28 asar entries). The hook now runs the rebuild itself and returns `true`; electron-builder's own pass runs over the result and skips on `.forge-meta`. |
| 4 | rule 1a | **pnpm keeps two copies of a binding** — `node_modules/.pnpm/better-sqlite3@13.0.3/…` and the hoisted `node_modules/better-sqlite3` — @electron/rebuild compiles both (different bytes from the same sources: the link-time code generation is not deterministic), the collector packages the `.pnpm` copy, and the checkout's `require` resolves the hoisted one. Rule 1a as first written compared the artifact to the wrong copy. It now accepts any binary this build compiled, over every copy, and the cold build removes every copy's `build/`. |
| 5 | rule 4 | *Harness.* Electron hands `dlopen` the extended-length spelling (`\\?\…`) of an unpacked path. The comparison normalises it. The loader had opened the right files. |
| 6 | rule 4 (b) | **The packaged window was blank.** Not packaging: the unpackaged build painted nothing either, since run 2's dependency move. `packages/ui` resolves `react` through a `.pnpm` symlink and the app through the hoisted directory — one version, two real paths, two React copies in the renderer bundle, `react-dom`'s hooks dispatcher `null` in the components' copy (`Cannot read properties of null (reading 'useCallback')`). Fixed by `resolve.dedupe: ['react', 'react-dom', 'zustand']` in the renderer section. **This is the ninth defect of ADR-0058 consequence 17's pattern**, and the first found by the packaging path — which is what ADR-0056 consequence 2 said that path was for. |
| 8 | (not refused — wrong) | *Harness.* The first `keep-prebuild` construction copied the prebuild **beside** the unpacked tree, and the loader never saw it: Electron resolves through the asar index, and a file the index does not name does not exist to a `require` from inside the asar. The counterfactual now packs from a configuration that includes the prebuild. This is also the measured content of rule 3: "unpacked" is a property of the index, not of the directory. |
| — | node-pty from source | **`deps/winpty/src/winpty.gyp` runs `cd shared && GetCommitHash.bat` while gyp loads**, and with `NoDefaultCurrentDirectoryInExePath=1` in the environment cmd.exe does not search the current directory for the batch file, so gyp fails to load the package at all. The variable is set by this session's shell, not by the platform; the hook clears it for the rebuild and records that it did. node-pty compiles from source with Spectre mitigations on this toolchain: `pty.node`, `conpty.node`, `conpty_console_list.node`, `winpty.dll`, `winpty-agent.exe`. |

One flake, stated so it is not mistaken for a finding: in the full `pnpm check` after the packaging runs,
the terminal test through the real PTY once got no output; it passed on re-run twice, with the compiled
node-pty present in `build/Release` and with it moved aside, so the checkout's tests load the Electron-built
binding without harm.

Two things the run confirmed rather than found: `ELECTRON_RUN_AS_NODE` keeps asar support and the
`app.asar.unpacked` redirection for `process.dlopen` (the probe's paths prove it); and node-gyp turns
`npm_config_force_build=1` into `-Dforce_build=1` (spike 22 used the CLI spelling).

## 5. What is not covered, said so it is not mistaken for done

- The **portable** and its launcher stub (ADR-0054, a second build technology): not built. Only
  `win-unpacked` and the NSIS installer exist.
- **macOS and Linux** (IC-3): the hook refuses any other platform by construction.
- **Signing** (`REQ-STARTUP-107`), the **release gate** (`REQ-STARTUP-156`: baseline machine, blocked
  network, first paint of each artifact): not performed. The installer was not run to install.
- The **per-runner** half of rule 4 (IC-3 item 3).
- The **application icon**: electron-builder's default is used; `resources/` is empty.
- **Build time**: a cold rebuild of both bindings is ~3 minutes on this machine, on every `pnpm package`,
  by design (rule 1a needs a binary newer than the marker). A warm variant is a decision for later, not a
  shortcut for now.

## Windows 11 ARM64 dev tree — 2026-10-15

*Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev tree, launched from powershell
5.1.26100.9457, at `b9e30052`. Everything above is x64; this is the first load of the `win32-arm64` bindings this record
holds, and it is a development-tree load, not rule 4's packaged one (OQ-400's reading: it measures windows-arm64 only).*
*OQ-400, ruled 2026-10-15 under R-072: this section **informs** and discharges nothing of rule 4. Rule 4's load executes the
`windows-x64` artifact, so it stays owed to a Windows x64 host; an emulated run of that artifact on this host would inform and
never discharge it (REQ-STARTUP-026).*

A fresh `pnpm install --prefer-offline` in a new worktree ran no node-gyp. A scratch probe modelled on
`native-load-probe.cjs` (never committed) required both bindings from the checkout's `node_modules`, with `process.dlopen`
wrapped, under Node and then under Electron with `ELECTRON_RUN_AS_NODE=1`:

| runtime | ABI | `better-sqlite3` opened | `node-pty` opened | store | PTY |
| --- | --- | --- | --- | --- | --- |
| Node 24.18.0 arm64 | 137 | `prebuilds\win32-arm64.node` | `prebuilds\win32-arm64\conpty.node` | SQLite 3.53.4, WAL set, read back `wal` | `probe-ok`, exit 0, 1,431 ms |
| Electron 44.1.1 (Node 24.19.0) arm64 | 149 | the same file | the same file | the same | `probe-ok`, exit 0, 1,367 ms |

One N-API prebuild of each serves both runtimes, as on x64. The fresh install still held two `build\` directories:
`node-pty\build\Release\conpty\` (`conpty.dll`, `OpenConsole.exe`: node-pty's own post-install copy) and
`better-sqlite3\build\`, a node-gyp project configured for `target_arch` arm64 on 2026-09-29 in the primary checkout, with no
`.node` in it, hard-linked into the new worktree from the pnpm store's side-effects cache. Neither is in the loader's path
here. After a `pnpm package` on this host the prediction is that `node-pty`'s loader, which tries `build\Release` first,
takes whatever that build writes; that is the session's I2 and is not measured yet.

One shell detail for whoever repeats this: Electron's output reaches a PowerShell 5.1 redirect (`& electron.exe … > file`)
as nothing, an empty file with exit 0, because the binary is a GUI-subsystem executable; `cmd /c "… > file"` captures it.
