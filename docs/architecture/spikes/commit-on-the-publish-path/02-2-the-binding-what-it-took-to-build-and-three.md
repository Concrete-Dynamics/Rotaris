# Spike — the transaction commit on the publish path — 2. The binding — what it took to build, and three defects

Part 2 of 12 of [the spike report](../commit-on-the-publish-path.md), which indexes every part.

## 2. The binding — what it took to build, and three defects

ADR-0058 consequence 1 says "a native module returns, with an Electron-ABI rebuild per version and
architecture and asar unpacking", and asks for that obligation to be carried by ADR-0056. This is the
evidence for it. **The binding was built and every measurement below is with the real binding**, not
with a stand-in.

### 2.1 The build

ADR-0058 names `better-sqlite3` "published on the 12.x line". At the date of this spike the current
line is **13.0.3**; the current 12.x release is **12.11.1**, and 12.11.1 is what was measured, so the
figures match the line the decision record names. `12.11.1` bundles **SQLite 3.53.2**.

```sh
npm install --save-exact better-sqlite3@12.11.1          # 11.8 s — fetches a prebuild for the HOST ABI
npm install --save-dev @electron/rebuild                 # 4.2.0
npx electron-rebuild -v 44.1.0 -a x64 -f -o better-sqlite3
```

- The `npm install` completed in **11.8 s** and produced a working module *for host Node* — a prebuild
  for `NODE_MODULE_VERSION` 137 was downloaded, not compiled.
- **No Electron prebuild is published.** `prebuild-install --runtime=electron --target=44.1.0
  --arch=x64 --platform=win32` returns **HTTP 404** for
  `better-sqlite3-v12.11.1-electron-v149-win32-x64.tar.gz`. There is no way to avoid a source build.
- `electron-rebuild` therefore compiled from source, in **37.6 s** wall, exit 0. Evidence that it
  compiled rather than fetched: `build/Release/` holds `obj/`, a 6.6 MB `sqlite3.lib`, a 10.1 MB
  `.pdb` and a 13.7 MB `.iobj`, and the result differs byte-wise from the downloaded host prebuild.
  `@electron/rebuild` also caches the result at
  `node_modules/better-sqlite3/bin/win32-x64-149/better-sqlite3.node` and writes
  `build/Release/.forge-meta` containing `x64--149`.
- The CLI's `-v` flag is the **Electron** version, not the tool's own version; `electron-rebuild
  --version` throws `ERR_PARSE_ARGS_INVALID_OPTION_VALUE`.

### 2.2 The ABI mismatch fails **loudly**, in both directions

The brief for this spike stated that the host-ABI-versus-Electron-ABI mismatch "is documented to fail
silently in this ecosystem". **On this toolchain it does not.** Both directions abort at load with a
specific, actionable message:

```
Loading the host-ABI build inside Electron 44.1.0:
  BETTER_SQLITE3_LOAD=FAIL name=Error code=ERR_DLOPEN_FAILED
  The module '…\better_sqlite3.node' was compiled against a different Node.js version using
  NODE_MODULE_VERSION 137. This version of Node.js requires NODE_MODULE_VERSION 149.

Loading the Electron-ABI build inside host Node v24.11.0:
  ERR_DLOPEN_FAILED … NODE_MODULE_VERSION 149 … requires NODE_MODULE_VERSION 137
```

Two consequences. The failure is diagnosable, so ADR-0056 does not need a special detector for it. But
it is also **total and one-directional**: a rebuilt module cannot be loaded by host Node, so any
build-time or test-time tooling that runs under host Node and touches the store needs its own copy at
the host ABI, or must run under Electron. That is a real constraint on the build matrix and it is not
in the record.

### 2.3 Defect 1 — the binding aborts the process when a `Statement` is garbage-collected

**This is the most important thing in this section.** Under Electron 44.1.0, `better-sqlite3` 12.11.1
intermittently kills its process:

```
electron.exe[23664]: void __cdecl node::RemoveEnvironmentCleanupHook(Isolate *, CleanupHook, void *)
  at ..\..\third_party\electron_node\src\api\hooks.cc:142
Assertion failed: (env) != nullptr

----- Native stack trace -----
 1: node::InitializationResult::~InitializationResult+10556
 2: node::RemoveEnvironmentCleanupHook+265
 3: Statement::`scalar deleting destructor'+144
 4: v8::internal::ThreadIsolation::LookupJitAllocation+49479
 …
```

Process exit code **134**. It reproduces in **both** hosts that matter:

- under `ELECTRON_RUN_AS_NODE=1 electron.exe`, and
- inside a real Electron **`utilityProcess`** — which is where ADR-0002 puts the run host. The
  captured child stderr is byte-identical apart from the pid and module base address.

Measured rate, 30 identical launches of the same 3,000-commit benchmark per arm:

| Arm | Launches | Produced output | Aborted (exit 134) |
|---|---|---|---|
| Every `Statement` retained for the life of the process | 30 | **30** | **0** |
| Statements left to the garbage collector (`db.pragma()` and discarded `db.prepare()`) | 30 | 27 | **3 (10 %)** |

In the end-to-end harness, before the workaround, **3 of 10 launches** died this way — always in the
run host, taking the run host with them. All 16 end-to-end launches after the workaround, and all 34
commit-benchmark launches after it, completed.

**Cause, as far as this spike establishes it.** The abort comes from `Statement`'s C++ destructor
calling `node::RemoveEnvironmentCleanupHook` at a moment when `Environment::GetCurrent(isolate)` is
null. It is reached whenever a `Statement` JS object becomes garbage. `db.pragma()` is the easiest way
to reach it, because it creates a transient `Statement` per call and hands back only the rows:

```js
// better-sqlite3/lib/methods/pragma.js
const stmt = this[cppdb].prepare(`PRAGMA ${source}`, this, true);
return simple ? stmt.pluck().get() : stmt.all();
```

Note that it prepares through the **C++** handle, so wrapping `Database.prototype.prepare` does not
retain it. **The workaround this spike used, and verified at 30/30, is to never call `db.pragma()` and
to hold a reference to every statement `db.prepare()` returns.** Pragmas that need no result go
through `db.exec()`, which creates no JS `Statement` at all.

This is directly load-bearing for ADR-0058 and ADR-0002. The run host is the only process that writes
a session's rows; if it aborts, `REQ-MONITOR-232`'s guarantee — that a run's terminal result, persisted
record, event sequence and timing are unaffected by anything a *view* does — is not the exposure. The
exposure is that the writer itself dies mid-run, in a way a 10 % per-run rate makes routine.

### 2.4 Defect 2 — `PRAGMA synchronous` is applied at **prepare** time, and the first `run()` is a no-op

Measured directly (`out/probe-prepare2.txt`), on one connection, WAL:

```
after prepares of (F='…=FULL', N='…=NORMAL', R='PRAGMA synchronous')   read=1
after F.run()                                                          read=1     <-- no-op
after N.run()                                                          read=1
after F.run() again                                                    read=2     <-- now it applies
```

So `db.prepare('PRAGMA synchronous = FULL')` **changes the setting immediately, before anything is
stepped**, and the first step of the resulting statement does nothing. Three routes were then compared
by their effect on real commits, which is the check that matters:

| Route | `PRAGMA synchronous` reads back | commit p50 (µs) | commit p95 (µs) |
|---|---|---|---|
| `F.run()` on a warm prepared statement | 2 | 675.1 | 909.9 |
| `N.run()` on a warm prepared statement | 1 | 59.5 | 120.2 |
| fresh `db.prepare('PRAGMA synchronous = FULL')` | 2 | 633.2 | 832.7 |
| fresh `db.prepare('PRAGMA synchronous = NORMAL')` | 1 | 57.9 | 100.3 |
| `db.exec('PRAGMA synchronous = FULL')` | 2 | 674.9 | 943.1 |
| `db.exec('PRAGMA synchronous = NORMAL')` | 1 | 60.2 | 124.0 |

**This defect produced wrong numbers in this spike, and they are recorded rather than hidden.** The
first complete pass of section 5 set the condition with `SET_FULL.run()` on a prepared statement, whose
first step is the no-op above. Every "`FULL`" run therefore executed at `NORMAL`, and the table said
`FULL` p50 = 176.9 µs against `NORMAL` p50 = 174.8 µs — that `FULL` was free. It is not; it is 812.1 µs.
The error was caught only because "an `fsync` costs nothing" was implausible enough to be checked
against a bare `fsync` on the same volume (section 5.3) before it was written down. Every condition in
sections 5 to 8 now reads `PRAGMA synchronous` back immediately before and immediately after its
measured window, and both readings are printed in the tables.

ADR-0058 says of the terminal-status and flush writes: "**The pragma is raised for the transaction and
lowered after it.**" This measurement says how that must be implemented: **not** by preparing the two
pragma statements once and re-running them. Either a fresh `prepare` each time — which then feeds
defect 1 unless the statement is retained, and retaining one per commit leaks — or `db.exec`, which
applies reliably, creates no `Statement`, and costs the same. `db.exec` is the only route that is both
correct and safe, and the record should say so rather than leave it to be found.

### 2.5 Defect 3 — ADR-0058's `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1` claim is right, and its consequence is not

ADR-0058: "the package is built with `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, so `synchronous` defaults to
`NORMAL` in WAL mode." The compile option is confirmed present. The consequence is only half true:

```
better-sqlite3 12.11.1, compile options: DEFAULT_SYNCHRONOUS=2, DEFAULT_WAL_SYNCHRONOUS=1

fresh file, before any pragma       journal_mode=delete  synchronous=2
after PRAGMA journal_mode = WAL     journal_mode=wal     synchronous=2   <-- NOT 1
reopen the existing WAL database    journal_mode=wal     synchronous=1
reopen read-only                    journal_mode=wal     synchronous=1
```

The compiled WAL default is applied when a connection **opens a database that is already in WAL mode**.
The connection that *creates* the store and switches it to WAL keeps `FULL`. So the very first session
in a new workspace would run every publish-path commit at `FULL` — measured below at 4.4× the `NORMAL`
p50 — unless the pragma is set explicitly. ADR-0058's durability section already says "the durability
section below depends on setting the pragma rather than inheriting it", so the decision is safe; this
sharpens *why* it is not optional.

**And the fallback binding's default is the opposite.** `node:sqlite` **is** present in Electron
44.1.0 (SQLite **3.53.3**) — a data point for ADR-0058's alternative B, whose rejection rested partly
on a shipped Electron release having omitted it — but it is compiled with:

```
node:sqlite in Electron 44.1.0: DEFAULT_SYNCHRONOUS=2, DEFAULT_WAL_SYNCHRONOUS=2
reopen an existing WAL database: journal_mode=wal  synchronous=2
```

ADR-0058 keeps `node:sqlite` as "the named fallback … swapping the binding is one module". It is one
module, but the two bindings' inherited WAL durability defaults are **opposites**, so a swap that does
not set the pragma explicitly changes every commit on the publish path from ~160 µs to ~667 µs (section
7). That belongs in the ADR next to the swap claim.

---
