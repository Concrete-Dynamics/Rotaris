# Spike — the whole-store backup and restore, run end to end — 11. Raw results — the Electron-ABI confirmation, which ADR-0056 is owed

Part 11 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

## 11. Raw results — the Electron-ABI confirmation, which ADR-0056 is owed

### 11.1 There is no ABI mismatch to rebuild for, on this version of this binding

`better-sqlite3@13.0.3` ships **Node-API** prebuilds. Measured on the shipped `prebuilds/win32-x64.node`:
`napi_register_module_v1` **present**, `NODE_MODULE_VERSION` **absent**. `package.json` depends on
`node-addon-api@^8`; `binding.gyp` defines `NAPI_VERSION=10`.

| Binding | Host Node v24.11.0 (`modules` 137) | Electron 44.1.0 main (`modules` 149) | Electron 44.1.0 `utilityProcess` |
|---|---|---|---|
| shipped npm prebuild, **no rebuild** | LOAD=OK, SQLite 3.53.4 | **LOAD=OK**, SQLite 3.53.4 | **LOAD=OK**, SQLite 3.53.4 |
| from-source build against the **Electron** ABI | **LOAD=OK**, SQLite 3.53.4 | LOAD=OK | LOAD=OK |

**ADR-0058's statement that "both directions abort the load with a specific message naming the two
`NODE_MODULE_VERSION` values" was measured on `better-sqlite3@12.11.1` and does not hold for 13.0.3.**
There is no mismatch in either direction. The obligation is not thereby discharged — the asar-unpack
obligation is untouched, and a later move back to a NAN-based binding or a different native module
reinstates it — but the rebuild-per-Electron-version cost the record budgets for this binding is, on this
version, zero.

### 11.2 What the rebuild actually took, and what `electron-rebuild` reports when it does nothing

| Command | Wall | Produced a `.node` |
|---|---|---|
| `electron-rebuild -v 44.1.0 -o better-sqlite3` | **12.882 s** | **no** |
| `electron-rebuild … --force`, warm | **4.535 s** / 4.516 s / 4.481 s | **no** |
| `node-gyp rebuild --release --force_build=1 --runtime=electron --target=44.1.0`, cold | **27.724 s** and **29.167 s** | **yes**, 1,989,632 B |
| the same, incremental with nothing changed | **4.212 s** | up to date |

Every one of those exited **0**, and every `electron-rebuild` invocation printed `✔ Rebuild Complete`.

**The reason the plain rebuild produces nothing is in the package's own `binding.gyp`:**

```
'force_build%': 0,
'prebuild_exists%': '<!(node lib/binding.js)',
…
['force_build==1 and prebuild_exists==0', { 'sources': ['src/better_sqlite3.cpp'], … }]
```

With the shipped prebuild present, `prebuild_exists` is `1`, the condition is false, the generated MSBuild
project has no sources, MSBuild builds nothing at minimal verbosity, node-gyp prints `gyp info ok`, and
`electron-rebuild` searches `build/Release` — its debug log reads `testing files [ '.forge-meta', 'obj' ]` —
finds no binary, and reports success anyway. To compile from source the prebuild must be moved aside **and**
`--force_build=1` passed.

**And the loader would not use the result even if it were built.** `lib/binding.js` tries
`prebuilds/<platform>-<arch>.node` **first** and only then `build/Release/better_sqlite3.node`. Verified
with both present: `getPrebuildPath()` returns the prebuild.

So a build step that reads "rebuild the native store binding against the Electron ABI" and runs
`electron-rebuild` would, against this package, **report success, compile nothing, and ship the prebuild** —
and would keep shipping the prebuild if it ever did compile something. On this version that is harmless,
because the prebuild is the right binary. It is written down because it is the exact shape of failure
ADR-0058 says must never be swallowed, sitting in the build rather than in the store, and because the next
binding may not be forgiving.

*Two environment caveats, recorded rather than glossed.* The first `electron-rebuild` attempt failed with
`MSB8029` — MSBuild refuses to build a project under `%TEMP%` — because the harness lives in the session
scratchpad; redirecting `TEMP`/`TMP` inside the scratchpad cleared it. That is a harness-location artifact,
not a product one. And node-gyp still exited 0 with MSB8029 present, which is the same swallowed-failure
shape by a different cause.

### 11.3 The restore under a packaged-shape Electron build (`e/main.js`)

Electron 44.1.0, main process with a `BrowserWindow` shown and painting continuously, the workspace service
and the run host as real `utilityProcess` children, the from-source Electron-ABI binding
(`modules` = 149 in both children), one run per size.

| | small | medium | large |
|---|---|---|---|
| store bytes | 69,632 | 11,767,808 | 328,531,968 |
| phase | done | done | done |
| staging `quick_check` | ok | ok | ok |
| sessions after | 3 | 10 | 20 |
| gates | 115.7 | 155.2 | 1,351.4 |
| handshake | 1.38 | 1.18 | 1.25 |
| expand / open staging | 62.5 / 9.9 | 108.8 / 42.7 | 476.3 / 1,016.8 |
| step 3 / step 4 | 3.99 / 4.02 | 3.52 / 3.81 | 3.66 / 3.98 |
| **gap between the renames** | **4** | **4** | **4** |
| **store unavailable** | **89.1** | **169.9** | **1,513.6** |
| whole restore | 206.3 | 326.3 | 2,866.3 |
| **main-process event-loop lag while it ran** | n=14, p50 **6**, p95 7, max **7** | n=21, p50 **6**, p95 7, max **13** | n=184, p50 **6**, p95 6, max **10** |
| window still alive at the end | yes | yes | yes |

**The restore works under Electron and the window does not notice.** Main's event-loop lag stays at 6 ms
p50 and never exceeds 13 ms even across the 2.87 s large restore, because every expensive step is in a
utility process. Against `REQ-SHELL-150`'s 100 ms and 120 ms thresholds there is two orders of magnitude of
headroom — with the caveat in section 15 that this harness's renderer draws an `<h1>` and has no state
store, so the figure is a floor for the topology and not a prediction for the product.

Electron's numbers are 20–40 % above the host-Node numbers for the same work (e.g. store-unavailable 89.1
against 63.9 ms at 68 KB; 1,513.6 against 1,450.5 ms at 313 MB). One run per size, no repetition, so that
difference is an observation and not a measurement.

---
