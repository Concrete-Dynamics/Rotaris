# Spike — the transaction commit on the publish path

- **Date:** 2026-09-02
- **Questions:**
  1. `REQ-MONITOR-221` requires every change to be persisted before it is published to any view, and
     `REQ-MONITOR-218` forbids "any minimum wait, debounce, or delay floor of any size" before
     publishing a row a view has not seen. ADR-0058 concludes from those two that persist-before-publish
     "now rests on **a transaction commit**, and a commit's cost is therefore on the publish path", and
     states plainly that "**the commit is not yet measured on this path and the record should not pretend
     otherwise**". What does it cost, at `synchronous = NORMAL` and at the `synchronous = FULL`
     that `REQ-SESSION-070` and `REQ-SESSION-068`/`REQ-SESSION-072` force?
  2. ADR-0058 leaves WAL checkpointing "on SQLite's automatic schedule" and identifies the checkpoint
     `fsync` as "the one background cost on the publish path". How often does it fire at a realistic row
     rate, and what does it cost when it does?
  3. **The number the record does not have:** commit *and then* publish, run host → main → renderer,
     end to end, against `REQ-MONITOR-222`'s 250 ms and `REQ-MONITOR-223`'s factor-of-two ceiling. Every
     latency figure currently in the record excludes the commit and is therefore a lower bound.
  4. ADR-0058 forbids the workspace service holding a write transaction across a long read, because
     "a long write transaction in the other process would make that commit wait". What does the run
     host's commit cost while the service is reading, and what does it cost when the rule is broken?
  5. ADR-0058 chose a native binding. Can it be built against the Electron ABI on this machine, and
     what does that take? ADR-0056 needs the answer.
- **Scope:** measurement only. No product code was written and none is authorised. Everything below was
  produced by a throwaway harness in the session scratchpad; nothing was written into this repository
  except this document.
- **Bearing on the record:** the verdicts are in **section 10**. **Section 2** records three defects in
  the binding and its pragma handling that will cost an implementer a day each if they are rediscovered
  rather than read; **section 11** records six findings that bear on ADR-0058, ADR-0056 and ADR-0002
  independently of the verdicts. **Section 12** states what the harness does not model. **No figure
  below is estimated, extrapolated or rounded up from something else; every number is a measurement
  taken in this session.** One set of figures was measured, was wrong because the harness was wrong, and
  is reported as such in section 2.4 rather than quietly replaced.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| CPU arch | x64 |
| Node (host) | v24.11.0 (`NODE_MODULE_VERSION` 137) · npm 11.12.1 |
| Electron | 44.1.0 — reused from `spike-base`, not reinstalled |
| Electron internals | Chromium `152.0.7977.65` · Node `24.19.0` · V8 `15.2.124.18-electron.0` · `NODE_MODULE_VERSION` **149** · N-API 10 |
| Store volume | `C:` — **NTFS**, disk 0, `CT1000P310SSD8`, **NVMe SSD**, 54.9 GB free |
| Other volume | `D:` — NTFS, disk 1, `WDC PC SN530`, NVMe SSD, 708.7 GB free |
| Toolchain for the native build | Visual Studio Community 2022 `17.14.37531.7`, MSVC toolset `14.44.35207`, Python 3.12.7, node-gyp 12.4.0, `@electron/rebuild` 4.2.0 |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine, same OS build and same Electron build as the `ipc-hop-latency`, `packaged-first-paint`
and `windows-writer-handle-compaction` spikes, so these figures are comparable with that record.

**Where the store was put.** ADR-0058 puts the store in the per-user *local* data directory
(`REQ-STARTUP-145`), which on Windows is under `%LOCALAPPDATA%` on `C:`. Every database in this spike
was created on `C:`, the same NTFS volume on the same NVMe device, so the `fsync` costs below are the
ones the product would pay. Nothing was measured on `D:` and nothing was measured on a network share.

Nothing here was packaged. Sections 5, 6, 8 and 9 run the store under `ELECTRON_RUN_AS_NODE=1
electron.exe`, which is Electron's own Node; section 7 runs it inside a real Electron `utilityProcess`,
which is where ADR-0002 puts the run host.

---

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

## 3. What was built

### 3.1 The store

One SQLite database per workspace, `journal_mode = WAL` set at open and read back, `busy_timeout =
5000`, page size 4096 (default, read back), `wal_autocheckpoint = 1000` (default, read back). Three
tables, modelled on ADR-0058's stated obligations — the listing attributes of `REQ-MONITOR-234`, the
user-facing transcript rows and the event history of `REQ-EVENTS-098`/`REQ-MONITOR-237`, plus the
metric aggregates `REQ-SESSION-072` requires every in-flight save to carry:

```sql
CREATE TABLE session (
  session_id TEXT PRIMARY KEY, created_at INTEGER, updated_at INTEGER,
  execution_status TEXT, schema_version INTEGER, internal INTEGER, worktree TEXT,
  checkpoint_count INTEGER, task_title TEXT, requirement_id TEXT, unit_id TEXT,
  awaiting_input INTEGER, tokens_total INTEGER, cost_micros INTEGER, iteration INTEGER,
  state_json TEXT);
CREATE INDEX session_by_updated ON session(updated_at DESC);
CREATE TABLE transcript_row (session_id TEXT, idx INTEGER, role TEXT, name TEXT, persona TEXT,
  ts TEXT, body_json TEXT, PRIMARY KEY (session_id, idx)) WITHOUT ROWID;
CREATE TABLE event (session_id TEXT, seq INTEGER, kind TEXT, at_ms INTEGER, payload_json TEXT,
  PRIMARY KEY (session_id, seq)) WITHOUT ROWID;
```

**This is a measuring instrument, not a proposed schema.** It exists to make the commit the right
*size*. It has no migrations, no checkpoint index, no delivery records and no improvement library.

### 3.2 The rows

Generated by the **same generator, copied verbatim**, that the `ipc-hop-latency` spike used, so the two
spikes' payloads compose: 60 % `agent`, 25 % `tool`, 15 % `thinking`, content sized to the caps the
specification states. Measured over the 1,024-row pool used here, JSON bytes per row:
**mean 2,234.5 · min 483 · max 4,599**. (The IPC spike measured mean 2,238 over its own 2,000-row
sample; the two agree.)

### 3.3 The transaction shapes

ADR-0058 rule 2 makes several previously hand-enforced orderings into "same transaction" —
`REQ-EVENTS-072`'s durable-record-before-wire-event, `REQ-SESSION-028`'s all-or-nothing save — and
`REQ-SESSION-072` requires the aggregates to travel with it. Four shapes were measured so the cost can
be attributed rather than asserted. Every one begins `IMMEDIATE`, per ADR-0058 rule 4.

| Shape | Statements in the transaction |
|---|---|
| `row` | insert the transcript row |
| `row+evt` | + insert the event |
| **`full`** | + narrow `UPDATE session SET updated_at, tokens_total, cost_micros, iteration` |
| `full+state` | as `full`, but the `UPDATE` also rewrites a 68 KB `state_json` |

**`full` is the headline shape** and every "commit" figure in sections 5 to 8 is `full` unless said
otherwise. `full+state` exists to price the pessimistic reading of `REQ-SESSION-072` — that an in-flight
save rewrites the whole bounded-collection snapshot rather than only what changed.

### 3.4 The end-to-end arrangement

Section 7 reuses the `ipc-hop-latency` harness unchanged — Electron main, a run host in a
`utilityProcess`, a renderer with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`,
the same ADR-0046-shaped apply stage and the same 40-slot ADR-0045 recycler — with exactly one change:
**the run host commits before it publishes**, and stamps the moment before the commit.

```js
function publishOne() {
  const t_commit0 = now();
  commitOne();                 // BEGIN IMMEDIATE; insert row; insert event; update aggregates; COMMIT
  const m = makeIncrement();
  m.t_commit0 = t_commit0;
  m.t_send = now();
  send(m);                     // REQ-MONITOR-221: persisted, then published
}
```

For the 10,000-row conditions **both** the database and the renderer's resident window are prefilled
with 10,000 rows, because `REQ-MONITOR-223` says "a session holding at least 10,000 **recorded**
transcript rows" and `REQ-MONITOR-222` says "regardless of how long the session already is". Prefilling
only the renderer would have tested the cheaper half.

---

## 4. Method

**What is timed.** Three intervals, from stamps taken in the processes that own them:

| Name | From | To |
|---|---|---|
| **commit** | run host, immediately before `BEGIN IMMEDIATE` | run host, immediately after `COMMIT` returns |
| **transport** | run host `t_send`, immediately before the publish call | renderer, after the store apply, the projection and the recycler's DOM commit have all returned |
| **end to end** | run host `t_commit0` | the same renderer stamp |

`REQ-MONITOR-222` bounds "run activity … appear on the live surfaces"; `REQ-MONITOR-223` says
"measured from the run **emitting** the change to the surface showing it"; `REQ-ORCH-155` says "within
100 ms of the run **recording** it". The end-to-end interval above is the closest match to the first
two. For `REQ-ORCH-155` the clock arguably starts where the recording ends, which is the **transport**
interval; both readings are given in section 10 and the choice is stated rather than assumed.

**Clocks.** In Electron's Node — main process, utility process — `process.hrtime.bigint()` was measured
in situ and ticks at **100 ns**, which resolves a 60 µs commit. The renderer's `performance.now()` is
coarsened to 100 µs, as the IPC spike recorded. Cross-process comparison uses the **same NTP-style
calibration that spike established and validated**: 400 ping-pong exchanges over the transport about to
be measured, θ from the median of the best 10 % by round-trip time, before any measurement begins. The
within-run spread of θ over that best decile was 0.083–0.230 ms across the runs here.

**Sampling.** Every condition is a separate process launch, so no heap or JIT state carries between
conditions. Commit benchmark (sections 5 and 6): 300 warm-up commits, discarded, then
`PRAGMA wal_checkpoint(TRUNCATE)`, then 3,000 measured commits (12,000 for the long runs), the WAL file
size sampled after each timed region. End-to-end (section 7): the IPC spike's protocol unchanged —
prefill, settle 600 ms, two forced `global.gc()` passes, settle 400 ms, 400 calibration exchanges, 400
warm-up publications discarded, 2,000 measured publications.

**Publish cadence.** As the IPC spike recorded, a Node `setInterval` on Windows fires at the ~15.6 ms
system timer granularity whatever period is asked for, so the end-to-end runs publish at ≈64 per second.
That is above `REQ-MONITOR-219`'s 20-per-second coalescing tick and is a stress rather than a
concession. The measured intervals start at `t_commit0` and so are not biased by the cadence.

**Counts.** 34 commit-benchmark launches, 16 end-to-end launches, 11 two-process concurrency runs, 3
`node:sqlite` runs, and 6 targeted probes. Every launch reported below exited 0 and produced output.
`refused = 0` in every end-to-end run, so every quoted latency is a latency of an increment the renderer
actually applied.

---

## 5. Raw results — the commit itself

`full` shape, one transcript row + one event + the aggregate update, in one `IMMEDIATE` transaction, in
**microseconds**. Pooled over 3 replicate launches of 3,000 commits each where three per-run p95s are
shown, 1 launch of 3,000 otherwise. `sync` is `PRAGMA synchronous` read back immediately before and
immediately after the measured window, so the condition is evidenced rather than assumed.

### 5.1 Headline — `NORMAL` versus `FULL`

| Condition | rows already in the table | sync | n | min | p50 | p90 | **p95** | p99 | p99.9 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `NORMAL` | 0 | 1/1 | 9000 | 109.0 | **185.4** | 298.1 | **362.8** | 1077.0 | 12595.6 | 37907.5 | 317.9, 331.8, 416.9 |
| `NORMAL` | 10,000 | 1/1 | 9000 | 117.4 | **182.2** | 275.3 | **329.0** | 961.2 | 10701.3 | 15941.9 | 319.8, 315.0, 349.8 |
| `FULL` | 0 | 2/2 | 9000 | 543.8 | **812.1** | 1131.4 | **1434.4** | 4728.0 | 11243.9 | 36613.5 | 1046.2, 1544.9, 1760.9 |
| `FULL` | 10,000 | 2/2 | 9000 | 559.5 | **836.9** | 1119.0 | **1345.9** | 3339.7 | 9599.0 | 38537.2 | 1036.9, 1606.1, 1321.9 |
| `FULL` raised and lowered per commit | 0 | 1/1 | 9000 | 562.3 | **829.8** | 1120.4 | **1372.4** | 3860.6 | 10220.2 | 67318.3 | 1112.8, 1518.6, 1564.4 |
| `FULL` raised and lowered per commit | 10,000 | 1/1 | 9000 | 579.6 | **877.8** | 1273.8 | **1683.0** | 5575.6 | 12081.1 | 33464.8 | 1150.9, 1831.4, 1944.7 |
| `OFF` | 0 | 0/0 | 3000 | 111.8 | 177.5 | 265.1 | 320.9 | 568.6 | 4093.4 | 6995.5 | 320.9 |
| `OFF` | 10,000 | 0/0 | 3000 | 118.3 | 179.8 | 267.9 | 321.1 | 650.3 | 4481.3 | 5810.9 | 321.1 |

Read three things off that table.

- **`FULL` costs 4.4× the `NORMAL` p50 and 4.0× the p95.** The absolute delta at p50 is ~630 µs, which
  is one `fsync` (section 5.3).
- **`OFF` and `NORMAL` are indistinguishable**, exactly as SQLite's WAL semantics predict: at `NORMAL`
  in WAL a commit appends to the log and does not sync. That agreement is the evidence that the
  `NORMAL` figures are not accidentally paying for a sync.
- **Raising and lowering the pragma around the transaction costs essentially nothing beyond the sync
  itself** — 829.8 µs against `FULL`'s own 812.1 µs at p50. `PRAGMA synchronous` measured alone is
  **2.1–2.2 µs**. ADR-0058's raise-and-lower shape is free; the `fsync` is the whole bill.

### 5.2 Where the `NORMAL` cost goes, by transaction shape

`synchronous = NORMAL`, 3,000 commits each, microseconds.

| Shape | rows | p50 | **p95** | p99 | max |
|---|---|---|---|---|---|
| `row` (one insert) | 0 | 130.6 | 302.0 | 1267.9 | 59238.3 |
| `row` | 10,000 | 105.2 | 220.6 | 458.4 | 13999.2 |
| `row+evt` | 0 | 126.4 | 257.2 | 775.0 | 15487.2 |
| `row+evt` | 10,000 | 135.9 | 264.3 | 805.0 | 12513.6 |
| `full` | 0 | 185.4 | 362.8 | 1077.0 | 37907.5 |
| `full` | 10,000 | 182.2 | 329.0 | 961.2 | 15941.9 |
| `full+state` (68 KB `state_json` rewritten) | 0 | 189.1 | 346.1 | 936.6 | 11028.3 |
| `full+state` | 10,000 | 190.6 | 340.0 | 974.2 | 13079.0 |
| `row` at `FULL` | 0 | 695.8 | 945.9 | 1386.5 | 10474.6 |
| `full+state` at `FULL` | 0 | 748.4 | 1035.2 | 1706.0 | 8449.2 |

**Rewriting the whole 68 KB bounded-collection snapshot on every row costs 4–8 µs at p50.** The
pessimistic reading of `REQ-SESSION-072` is not expensive; the ADR's narrower "records only what
changed" is right for other reasons but not for this one. At `FULL` the shape matters even less,
because the `fsync` dominates everything.

### 5.3 What an `fsync` costs on this volume — the control

Because "`FULL` is 4× `NORMAL`" is only meaningful next to the device's own flush cost, that was
measured directly on the same directory: 2,000 iterations of a 4 KiB write, microseconds.

| Operation | min | p50 | p95 | p99 | max |
|---|---|---|---|---|---|
| `write(4 KiB)` + `fsync` | 442.4 | **559.3** | 748.4 | 922.3 | 5716.7 |
| `write(4 KiB)` + `fdatasync` | 429.3 | 546.3 | 745.2 | 984.7 | 2927.9 |
| `write(4 KiB)`, no sync | 6.9 | **9.9** | 79.8 | 111.4 | 1188.2 |

**An `fsync` on this NVMe SSD costs ~560 µs at p50**, and the `FULL`-minus-`NORMAL` delta of ~630 µs is
one of them plus the extra WAL work. `NORMAL` in WAL genuinely performs no sync per commit.

For completeness, the same real-row transaction in the **rollback journal** SQLite would otherwise use,
which is what WAL is being chosen over (`REQ-EVENTS-098` makes the non-blocking property a conformance
property, not a preference):

| journal | `synchronous` | p50 (µs) | p95 (µs) |
|---|---|---|---|
| WAL | NORMAL | 65.3 | 160.8 |
| WAL | FULL | 717.0 | 951.2 |
| DELETE | NORMAL | 3692.3 | 4527.5 |
| DELETE | FULL | 4345.1 | 5942.2 |

WAL at `NORMAL` is **57× cheaper at p50** than the rollback journal at the same durability setting.

### 5.4 An explicit flush

`REQ-SESSION-068` and `REQ-SESSION-072` require an explicit flush to make the newest requested state
durable and not return before it is, "usable from any caller's context, including one where no
asynchronous runtime is active". Measured as the whole raise-`FULL` / commit / lower-`NORMAL` sequence,
200 iterations at the end of every one of the 34 commit-benchmark runs:

**p50 714.8–962.5 µs · p95 1054.0–1559.3 µs · p99 1231.3–2558.5 µs · max 1557.1–44055.2 µs.**

A flush is a sub-millisecond synchronous call. `REQ-SESSION-068`'s "usable where no asynchronous
runtime is active" is satisfied by construction: `better-sqlite3`'s entire API is synchronous, which is
the property ADR-0058 selected it for, and this spike exercised it with no event loop involvement
inside the timed region.

---

## 6. Raw results — the WAL checkpoint

### 6.1 How often it fires, and what it costs

Measured from the per-commit series plus the WAL file size sampled after each commit. `full` shape,
`synchronous = NORMAL`, `wal_autocheckpoint = 1000` (SQLite's default, read back), page size 4096, WAL
frame 4120 bytes.

**The transaction writes a measured 7.44 WAL frames.** 1000 ÷ 7.44 = 134.4, and the observed period is
**135–136 commits**, which is the arithmetic confirming itself.

| Run | n | commits over 2 ms | share | gap between them (min / median / max) | spike cost p50 | spike p95 | spike max |
|---|---|---|---|---|---|---|---|
| 12,000 commits, 0 rows, r1 | 12000 | 89 | 0.74 % | 132 / **136** / 139 | **9066 µs** | 11463 | 14632 |
| 12,000 commits, 0 rows, r2 | 12000 | 88 | 0.73 % | 132 / **136** / 139 | 10080 | 13437 | **53102** |
| 12,000 commits, 10,000 rows | 12000 | 88 | 0.73 % | 132 / **136** / 138 | 10994 | 14428 | 21226 |
| 3,000 commits, 0 rows | 3000 | 22 | 0.73 % | 132 / **136** / 139 | 9685 | 11930 | 16916 |

The spike indices are almost perfectly periodic — `135, 270, 407, 542, 678, 814, 951, 1088, 1220,
1359, 1492, 1630, 1764, 1901, …` — which is what identifies them as the autocheckpoint rather than as
scheduler noise.

**With the checkpointing commits removed**, the body of the distribution is:
**p50 179.2–219.9 µs · p95 301.0–385.7 µs · p99 442.4–642.8 µs · max 1592.6–1883.5 µs.**

So the honest statement of the publish-path commit at `NORMAL` is not one number but two:

> **About 0.73 % of commits — one in every 136 — cost 9–11 ms at p50 and up to 53 ms. The other
> 99.27 % cost 179–220 µs at p50 and 301–386 µs at p95.**

At `REQ-MONITOR-219`'s ceiling of 20 publications per second that is a checkpoint every **6.8 s**; at
the ≈64 per second these runs actually achieved, every **2.1 s**.

### 6.2 Turning the autocheckpoint off makes everything worse

ADR-0058 leaves checkpointing "on SQLite's automatic schedule". The alternative was measured.

| `wal_autocheckpoint` | n | p50 | **p95** | p99 | p99.9 | max | WAL after 3,000 commits | explicit `wal_checkpoint(PASSIVE)` |
|---|---|---|---|---|---|---|---|---|
| 1000 (default) | 9000 | 185.4 | 362.8 | 1077.0 | 12595.6 | 37907.5 | 4.16 MB (1,010 frames) | 3330.9 µs (71 frames) |
| **0 (off)** | 9000 | **242.4** | **678.8** | 989.4 | 1833.5 | 4155.4 | **91.26 MB (22,151 frames)** | **155,188 µs (22,151 frames)** |

Disabling it removes the periodic spike and buys nothing: the ordinary commit gets **31 % slower at
p50 and 87 % slower at p95** because every commit now searches a WAL that never resets, and the
deferred work reappears as a **155 ms** stall the moment anything checkpoints, plus 18.4 ms to truncate.
**ADR-0058's choice to leave the automatic schedule alone is the right one and this is the evidence.**

### 6.3 Explicit checkpoints

At a 4.16 MB WAL, measured at the end of each run. Over the 29 measurements at `synchronous` 1 or 2,
`wal_checkpoint(PASSIVE)` cost **min 1885 µs, median 2975 µs, max 12176 µs** (the 12.2 ms figure is a
single observation), and a following `wal_checkpoint(TRUNCATE)` **776–1519 µs**. Every one returned
`busy = 0` and checkpointed every frame it reported.

The two runs at `synchronous = OFF` are the control that shows what the checkpoint is spending its time
on: the same `PASSIVE` checkpoint over the same WAL cost **524 and 586.5 µs**. **So roughly 2.4 ms of a
2.975 ms checkpoint is its `fsync`s** — SQLite syncs the WAL before the checkpoint and the database file
after it, which is two of this device's ~560 µs flushes plus the copying.

---

## 7. Raw results — end to end, commit **then** publish

**This is the figure the record does not have.** Run host `t_commit0` → renderer applied, in
**milliseconds**, `relay` topology (ADR-0002's actual arrangement: run host → `parentPort` → main →
`webContents.send` → renderer), transcript increment, `push` apply. Percentiles are over pooled samples;
per-run p95 shows every replicate.

### 7.1 End to end

| Condition | resident + recorded rows | n | min | p50 | p90 | **p95** | p99 | p99.9 | max | per-run p95 |
|---|---|---|---|---|---|---|---|---|---|---|
| **commit at `NORMAL`, relay** | **0** | 6000 | 0.715 | 1.111 | 1.487 | **1.774** | 7.617 | 40.937 | 108.302 | 2.221, 1.570, 1.590 |
| **commit at `NORMAL`, relay** | **10,000** | 6000 | 0.674 | 1.095 | 1.463 | **1.723** | 5.283 | 19.021 | 27.927 | 1.737, 1.652, 1.798 |
| commit at `FULL`, relay | 0 | 4000 | 1.295 | 1.733 | 2.236 | **2.587** | 4.370 | 8.124 | 10.180 | 2.588, 2.561 |
| commit at `FULL`, relay | 10,000 | 4000 | 1.281 | 1.734 | 2.194 | **2.517** | 3.928 | 8.791 | 10.278 | 2.578, 2.453 |
| commit at `NORMAL`, direct port | 0 | 2000 | 0.480 | 0.783 | 1.072 | **1.257** | 1.970 | 11.167 | 13.038 | 1.257 |
| commit at `NORMAL`, direct port | 10,000 | 2000 | 0.482 | 0.788 | 1.012 | **1.129** | 1.872 | 10.386 | 12.784 | 1.129 |
| **no commit (control), relay** | 0 | 4000 | 0.427 | 0.770 | 1.032 | **1.161** | 1.510 | 2.052 | 2.426 | 1.140, 1.174 |
| **no commit (control), relay** | 10,000 | 4000 | 0.409 | 0.780 | 1.069 | **1.220** | 1.778 | 3.980 | 5.177 | 1.277, 1.158 |

The no-commit control was run in this session, on this harness, so the commit's contribution is a
difference between two measurements rather than a comparison across reports. It reproduces the
`ipc-hop-latency` spike's relay figures (p95 1.133 ms at 0 rows, 1.291 ms at 10,000) to within 0.03 ms
at 0 rows and 0.07 ms at 10,000 rows, which is the evidence that nothing else about the harness moved.

### 7.2 The same samples, decomposed

| Condition | rows | commit p50 | commit **p95** | transport p50 | transport **p95** | end-to-end **p95** |
|---|---|---|---|---|---|---|
| `NORMAL`, relay | 0 | 0.396 | 0.700 | 0.699 | 1.052 | **1.774** |
| `NORMAL`, relay | 10,000 | 0.378 | 0.642 | 0.699 | 1.065 | **1.723** |
| `FULL`, relay | 0 | 1.095 | 1.681 | 0.629 | 0.922 | **2.587** |
| `FULL`, relay | 10,000 | 1.099 | 1.663 | 0.628 | 0.847 | **2.517** |
| `NORMAL`, direct port | 0 | 0.384 | 0.678 | 0.388 | 0.569 | **1.257** |
| `NORMAL`, direct port | 10,000 | 0.381 | 0.600 | 0.393 | 0.552 | **1.129** |
| no commit, relay | 0 | — | — | 0.768 | 1.159 | **1.161** |

**The commit is 39 % of the end-to-end p95 on the relay path at `NORMAL`, and 54 % on the direct-port
path.** It is now the largest single component of the interval when the ports are used, and roughly
equal to the whole transport when the relay is used. It is still 0.7 % of `REQ-MONITOR-222`'s budget.

One counter-intuitive line is worth stating rather than smoothing: the `FULL` runs have a **lower**
transport p95 (0.847–0.922 ms) than the `NORMAL` runs (1.052–1.065 ms). The commit is ~700 µs longer,
which spaces the publications further apart and leaves main's event loop more slack. It is an artefact
of the fixed cadence, not a benefit of `FULL`.

### 7.3 The tail, and where the checkpoint lands

The autocheckpoint is visible on the end-to-end path at the same period. Counting the run host's own
commit series across a whole run, warm-up included:

| Run | n | commits over 3 ms | share | gap (median / min / max) | spike p50 | spike max |
|---|---|---|---|---|---|---|
| `NORMAL` 0 rows r1 | 2400 | 19 | 0.79 % | 135 / 1 / 137 | 9.06 ms | 24.66 ms |
| `NORMAL` 0 rows r2 | 2400 | 18 | 0.75 % | 135 / 133 / 137 | 7.64 ms | 11.11 ms |
| `NORMAL` 10,000 rows r1 | 2400 | 18 | 0.75 % | 135 / 128 / 137 | 9.20 ms | 18.51 ms |
| `FULL` 0 rows r1 | 2400 | 20 | 0.83 % | 135 / 17 / 137 | 6.48 ms | 8.47 ms |

Exceedance of the **end-to-end** interval, pooled:

| Condition | n | > 5 ms | > 10 ms | > 25 ms | > 50 ms | > 100 ms | **> 250 ms** | max |
|---|---|---|---|---|---|---|---|---|
| commit `NORMAL`, 0 rows | 6000 | 63 | 29 | 11 | 6 | 2 | **0** | 108.30 ms |
| commit `NORMAL`, 10,000 rows | 6000 | 62 | 28 | 1 | 0 | 0 | **0** | 27.93 ms |
| commit `FULL`, 0 rows | 4000 | 37 | 1 | 0 | 0 | 0 | **0** | 10.18 ms |
| no commit, 0 rows | 4000 | 0 | 0 | 0 | 0 | 0 | **0** | 2.43 ms |

**Zero of 20,000 measured end-to-end publications exceeded 250 ms.** The two samples over 100 ms both
came from the *transport* (transport max 107.846 ms against a commit max of 24.658 ms in the same run),
which is the sporadic `webContents.send` excursion the `ipc-hop-latency` spike already recorded as its
finding 6, not a store effect.

### 7.4 To first paint

`t_post` — a task scheduled after the animation frame following the commit — from `t_commit0`:
p95 **10.088–10.510 ms** with a commit, against **9.572–9.664 ms** without one. As the IPC spike found,
this is dominated by the display cadence, and the commit adds roughly its own p50 to it.

---

## 8. Raw results — concurrency

ADR-0058 rule 4: "The workspace service is forbidden from holding a write transaction across an
unbounded pass … The reason is `REQ-MONITOR-218`: a transcript row must be published with no delay of
any size, it must be committed first (`REQ-MONITOR-221`), and a long write transaction in the other
process would make that commit wait."

Two OS processes, one store, 10,000 rows prefilled, `busy_timeout = 5000` unless stated. The writer is
the run host committing the `full` shape at `NORMAL` as fast as it can — an overstatement of the real
rate, chosen as a stress. Writer commit durations, **microseconds**:

| Reader | n | min | p50 | **p95** | p99 | max | writer errors |
|---|---|---|---|---|---|---|---|
| none (control) | 3000 | 108.8 | 163.6 | 271.7 | 867.5 | 15100.5 | 0 |
| none (control, replicate) | 3000 | 109.3 | 165.3 | 275.5 | 880.9 | 13291.6 | 0 |
| whole-session reads, back to back | 3000 | 141.0 | **345.9** | **898.9** | 2618.4 | 40760.1 | 0 |
| whole-session reads, back to back (replicate) | 3000 | 136.6 | 283.8 | 613.0 | 1172.1 | 64375.2 | 0 |
| whole-session reads, 5 ms gap | 3000 | 135.3 | 265.9 | 519.6 | 853.5 | 30677.7 | 0 |
| **holds a 200 ms write transaction** (forbidden) | 200 | 125.0 | 203.8 | 434.8 | 1383.6 | **205387.1** | 0 |
| **holds a 50 ms write transaction** (forbidden) | 400 | 128.5 | 248.1 | 403.2 | 1164.7 | **61844.6** | 0 |
| holds a 200 ms write transaction, `busy_timeout = 0` | 3000 | 17.6 | 18.4 | 27.3 | 177.5 | 1077.0 | **2967 of 3000 `SQLITE_BUSY`** |

The reader in the compliant rows is doing real work: each pass reads every one of the ~13,000
transcript rows and the listing, taking **147–1603 ms per pass**, and it read 47,695–82,405 rows over
the run. Its own latency is not the subject here but is recorded because it bears on `REQ-MONITOR-225`.

Four findings.

- **A heavy compliant reader roughly doubles the writer's median commit and triples its p95** — 163.6 →
  345.9 µs at p50, 271.7 → 898.9 µs at p95 — and never blocks it. Zero errors, zero `SQLITE_BUSY`.
  ADR-0058 consequence 2's "contention is real, bounded by rule 4's short `IMMEDIATE` transactions" now
  has a number. The absolute figure stays under a millisecond.
- **Breaking rule 4 costs exactly what the rule says it costs.** A reader holding a 200 ms write
  transaction produced a single commit of **205.4 ms** — 82 % of `REQ-MONITOR-222`'s entire budget, in
  one commit, before the transport has done anything. A 50 ms hold produced a 61.8 ms commit. The rule
  is load-bearing, not hygiene.
- **`busy_timeout` is load-bearing too, and there is a worse failure than waiting.** With
  `busy_timeout = 0`, **2,967 of 3,000 commits raised `SQLITE_BUSY`** — the run host could not persist,
  so under `REQ-MONITOR-221` it could not publish at all. The reader was also starved, taking 97
  `SQLITE_BUSY` of its own 98 attempts: the two processes thrash. ADR-0058 says only that `busy_timeout`
  "is a small bounded value"; this says what happens at the bottom of that range.
- One run is a result by omission: the same forbidden reader with `busy_timeout = 5000` and **no gap
  between its 200 ms write transactions** did not complete 3,000 commits in **300 seconds** and was
  killed. The writer was starved indefinitely. That is not a latency figure and is not reported as one.

---

## 9. Cross-check against ADR-0058's named fallback binding

Same schema, same generated rows, same machine, `node:sqlite` (`DatabaseSync`) in Electron 44.1.0,
SQLite 3.53.3, 3,000 commits, microseconds. Single launch per condition, so these have no replicate
spread and the `better-sqlite3` column is pooled over three launches.

| Condition | `node:sqlite` p50 | p95 | p99 | max | `better-sqlite3` p50 | p95 |
|---|---|---|---|---|---|---|
| `NORMAL`, 0 rows | 159.9 | 274.7 | 833.3 | 9745.6 | 185.4 | 362.8 |
| `NORMAL`, 10,000 rows | 157.5 | 267.0 | 990.4 | 11078.8 | 182.2 | 329.0 |
| `FULL`, 0 rows | 666.7 | 903.2 | 1773.5 | 11176.5 | 812.1 | 1434.4 |

The fallback binding is not slower — on these samples it is slightly faster, and it needs no ABI
rebuild, no asar unpacking and did not exhibit defect 2.3. It also carries the opposite inherited WAL
durability default (section 2.5). Nothing here reopens ADR-0058's choice, which rests on
`node:sqlite`'s Stability 1.2 status and on Electron's non-contractual shipping of the module, not on
speed — but the record should not carry an unstated assumption that the fallback is a performance
sacrifice.

---

## 10. Verdicts

### `REQ-MONITOR-222` — "within 250 ms at the 95th percentile … both at zero pre-existing rows and at thousands of pre-existing rows" — **PASS**

| Condition | p95 | margin |
|---|---|---|
| commit at `NORMAL` then publish, relay, **0 recorded rows** | **1.774 ms** | 141× |
| commit at `NORMAL` then publish, relay, **10,000 recorded rows** | **1.723 ms** | 145× |
| commit at `FULL` then publish, relay, 0 rows | 2.587 ms | 97× |
| commit at `FULL` then publish, relay, 10,000 rows | 2.517 ms | 99× |

Zero of 20,000 measured publications exceeded 250 ms; the worst single sample was 108.3 ms and came
from the transport, not the store. **The margin the record has been quoting is reduced from ~221× to
~141×, and it survives.** The commit alone consumes **0.28 %** of the budget at p95 and the whole
end-to-end interval **0.71 %**; a typical checkpointing commit (9.06 ms) is 3.6 % of it and the worst one
observed end to end (24.66 ms) is 9.9 %.

### `REQ-MONITOR-223` — "no more than twice … at the 95th percentile … at least 10,000 recorded transcript rows" versus none — **PASS**

Measured, as the requirement specifies, "from the run emitting the change to the surface showing it":

| Path | 0 rows p95 | 10,000 rows p95 | **ratio** | ceiling |
|---|---|---|---|---|
| commit `NORMAL` + relay, end to end | 1.774 ms | 1.723 ms | **0.971** | 2 |
| commit `FULL` + relay, end to end | 2.587 ms | 2.517 ms | **0.973** | 2 |
| commit `NORMAL` + direct port, end to end | 1.257 ms | 1.129 ms | **0.898** | 2 |
| the commit alone | 0.700 ms | 0.642 ms | **0.917** | 2 |
| the commit alone, micro-benchmark, 9,000 samples per arm | 0.363 ms | 0.329 ms | **0.907** | 2 |

Every ratio is below 1: a 10,000-row session was consistently a shade *faster* than an empty one, in
both the store and the transport, which is within the run-to-run spread rather than a real effect. The
store contributes no growth term — the insert goes into a `WITHOUT ROWID` primary key whose B-tree
depth barely moves between 0 and 10,000 rows, and the aggregate update touches one row by key. **This
requirement is not at risk from the store.**

### `REQ-ORCH-155` — "reflect a state change the run has recorded within 100 ms of the run recording it, at the 95th percentile" — **PASS on both readings**

The requirement's clock starts when the run *records* the change, so the interval is arguably the
transport alone; the more conservative reading starts before the commit. Both are given because the
choice changes the number by 70 %:

| Reading | 0 rows p95 | 10,000 rows p95 | margin |
|---|---|---|---|
| from the end of the commit (the change is recorded) — transport | 1.052 ms | 1.065 ms | 95× |
| from before the commit — end to end | 1.774 ms | 1.723 ms | 56× |

### `REQ-MONITOR-221` — "every change must be persisted before it is published to any view" — **PASS, and now priced**

The harness implements the ordering literally: `BEGIN IMMEDIATE` … `COMMIT`, then publish. The
requirement's own argument is that this "is satisfiable alongside `REQ-MONITOR-218` … because
persistence carries no delay of its own". That argument is upheld: **the price of persist-before-publish
is 0.396 ms at p50 and 0.700 ms at p95**, and it is work, not a wait.

### `REQ-MONITOR-218` — "no minimum wait, debounce, or delay floor of any size … on any platform" — **PASS as measured, with one condition that would break it**

A commit is not a wait, a debounce or a delay floor; nothing in the harness defers, parks or coalesces
a publication, and the run host publishes on the same turn the commit returns. But `REQ-MONITOR-218`
says *of any size*, and section 8 shows a way to manufacture one: a second process holding a write
transaction turns the commit into a wait of exactly that transaction's length — **205.4 ms measured for
a 200 ms hold.** That is not a floor the product would have chosen, but it is a floor a user would
experience, and it is imposed by another process. **ADR-0058 rule 4 is what keeps this requirement
true, and this measurement is the evidence for it.**

### `REQ-SESSION-067` / `REQ-SESSION-068` / `REQ-SESSION-072` — durable when requested, synchronous flush, no async runtime — **PASS**

The binding's API is synchronous throughout; no timer, no parking and no coalescing exists anywhere in
the harness's write path. The explicit flush measured **p50 715–963 µs, p95 1054–1559 µs** and returns
only after `COMMIT` at `synchronous = FULL` has returned.

### `REQ-SESSION-070` — a terminal-status save "MUST NOT return before that status can be read back by any other reader of the store" — **PASS, and `FULL` is not what delivers it**

Directly tested. A terminal status was committed at `synchronous = NORMAL` by one process, which then
kept its connection open and did **not** checkpoint. A **separate OS process**, using a **different
binding** (`node:sqlite`) and opening the store **read-only**, immediately read it back:

```
synchronous=NORMAL  → second process sees {"status":"completed","rows":1,"journal_mode":"wal"}
synchronous=FULL    → second process sees {"status":"completed","rows":1,"journal_mode":"wal"}
```

`REQ-SESSION-070`'s **readability** clause is satisfied by `NORMAL`, because a committed WAL frame is
visible to any other opener at once — which is exactly the reasoning ADR-0058 already gives for
`REQ-EVENTS-029` two paragraphs earlier. What `FULL` buys for a terminal save is survival of a power
loss or an operating-system crash, not readability. ADR-0058 attributes the `FULL` forcing to the
readability clause; **the justification is wrong even though the decision is defensible**, and section
11.4 says what to do about it.

### `REQ-EVENTS-029` — each event durable individually "at the moment it is raised and never in accumulated batches" — **PASS, not separately costed**

The event insert is inside the same transaction as the row, per ADR-0058 rule 2. Its marginal cost is
the `row` → `row+evt` step in section 5.2: **−4 to +31 µs at p50**, i.e. inside the noise. Making the
event durable individually is free once the row's commit is being paid for.

### ADR-0058's own open item — "the commit is not yet measured on this path" — **CLOSED**

---

## 11. Findings that bear on the record

### 11.1 The margin is reduced by a third, not by an order of magnitude — but the p95 is no longer the whole story

The record has been quoting `REQ-MONITOR-222` at p95 1.13 ms against 250 ms. With the commit it is
**1.774 ms**, so the margin falls from ~221× to ~141×. That is still two orders of magnitude and
**ADR-0002, ADR-0008 and ADR-0010 are not reopened by it** (section 11.6).

What changes is the *shape* of the distribution, and that is worth more than the p95. Without the
commit the end-to-end interval had a maximum of 2.426 ms over 4,000 samples and nothing above 5 ms.
With it, 63 samples in 6,000 exceed 5 ms, 29 exceed 10 ms, and the periodic WAL checkpoint puts a
**9–11 ms** commit into the path once every 136 commits, deterministically. Nothing about that
threatens 250 ms. It does mean that any conformance test or diagnostic threshold built on "an update
takes about a millisecond" will now see routine excursions of ten times that, on a fixed period, and
should not treat them as faults.

### 11.2 ADR-0058's decision to leave checkpointing on the automatic schedule is confirmed by measurement

Section 6.2 is the evidence: disabling the autocheckpoint makes the ordinary commit 31 % slower at p50
and 87 % slower at p95, grows the WAL to 91 MB in 3,000 commits, and converts the periodic 9 ms spike
into a single **155 ms** stall. ADR-0058 says checkpointing is "bounded by WAL size rather than by
session volume"; that is exactly right, and the boundedness is what the default `wal_autocheckpoint =
1000` provides. **Do not make it configurable and do not turn it off.**

The one thing the ADR should add is the period, because it is a design input rather than an
implementation detail: **7.44 WAL frames per publish-path commit, hence a checkpoint every ~136
commits**, and a transaction that wrote more frames would checkpoint proportionally more often. If a
later decision widens the publish-path transaction — a second index, a wider `UPDATE`, a blob — the
checkpoint frequency moves with it and the tail follows.

### 11.3 The commit is now the largest single component on the direct-port path

The `ipc-hop-latency` spike found the direct `MessagePort` transport at p95 0.583 ms against the relay's
1.133 ms, and ADR-0002 names the port as its remedy "if measurement shows the double hop threatens the
budgets". This spike changes the arithmetic behind that remedy: with the commit included, the relay
path is 1.774 ms and the direct path is 1.257 ms. **The port still wins, but it now removes 29 % of the
interval rather than 49 %, because the commit is 54 % of the direct path's p95 and cannot be removed by
changing the transport.** Anyone re-opening ADR-0002's remedy on latency grounds should use 1.774 versus
1.257, not 1.133 versus 0.583.

### 11.4 ADR-0058's stated reason for forcing `FULL` on a terminal save does not survive the test

The durability section says `FULL` is forced for a terminal status because `REQ-SESSION-070` "requires
the status to be readable by any other reader of the store before the call returns". The test in
section 10 shows a different process, with a different binding, reading that status back immediately at `NORMAL`. The
readability clause does not need `FULL`.

This does not make the decision wrong — a terminal status is exactly the record a user is told they can
rely on, and 812 µs once per session is a trivial price for surviving a power cut. It makes the *stated
ground* wrong, and a wrong ground is dangerous here in a specific way: someone optimising later will
test readability, find `NORMAL` sufficient, and drop the `FULL`. **The ADR should re-ground the forcing
on power-loss durability — the property `NORMAL` in WAL explicitly does not have, which the same
section already names — and keep the decision.** Measured cost of keeping it: **812.1 µs at p50, 1434.4
µs at p95, once per terminal save**, or 829.8 / 1372.4 µs if the pragma is raised and lowered around the
transaction as the ADR specifies.

### 11.5 Two ADR-0058 statements are now measurable and one is stale

- "Ordinary commits run at `synchronous = NORMAL`. In WAL mode a commit at `NORMAL` writes the
  transaction to the write-ahead log **without an `fsync`**." Confirmed: `NORMAL` and `OFF` are
  indistinguishable (185.4 vs 177.5 µs at p50) and both are 4.4× cheaper than `FULL`, whose delta
  matches this device's measured 559 µs `fsync`.
- "at `REQ-MONITOR-219`'s coalescing tick that is at most twenty commits per second per live session".
  At 20 commits/s the store is at **0.37 % duty at p50**; even at the ≈64/s these runs achieved it is
  1.2 %. The publish path is nowhere near the store's capacity, and the ADR's carve-out forbidding
  per-tick commits is protecting the *transport*, not the store.
- ADR-0058 describes `better-sqlite3` as "published on the 12.x line". The current line is **13.0.3**.
  This spike measured **12.11.1** deliberately, to match the record. If implementation takes 13.x the
  figures should be re-taken, because the bundled SQLite version moves with it (12.11.1 ships SQLite
  3.53.2; Electron 44.1.0's own built-in is 3.53.3).

### 11.6 Are ADR-0002, ADR-0008 or ADR-0010 reopened? — **No. Bluntly, no.**

- **ADR-0002 (process topology) — not reopened.** Its `utilityProcess` run host relaying through main
  costs 1.052 ms at p95 with the commit in place; adding the commit takes the whole interval to 1.774 ms
  against a 250 ms budget. Its stated revisit trigger is the double hop threatening the budgets, and the
  double hop is now 59 % of an interval that uses 0.7 % of the budget. The direct-port remedy remains
  available and remains unnecessary on latency grounds. **One thing in ADR-0002's neighbourhood does
  need attention and it is not latency:** section 2.3's abort kills the run host, and ADR-0002's whole
  topology rests on the run host being the one process that owns a session's writes.
- **ADR-0008 (one ordered session writer) — not reopened.** Its ordering discipline is unaffected by
  commit cost, and a commit of 0.396 ms at p50 does not make an ordered queue a bottleneck at 20 or even
  64 publications per second. The concurrency results *support* it: the single-writer rule is what keeps
  `SQLITE_BUSY` at zero in every compliant condition measured.
- **ADR-0010 (three channels between run and surfaces) — not reopened.** Nothing measured here touches
  the channel split. The commit sits upstream of all three channels and costs the same whichever one
  carries the result.

**What is reopened is smaller and sharper:** ADR-0058's own "Revisit if" names "the commit cost on the
publish path, once instrumented, turns out to consume a material share of `REQ-MONITOR-222`'s budget,
which would make the coalescing tick's commit shape a decision rather than a consequence". It does not: the commit is 0.28 % of the budget at
p95, and the whole end-to-end interval 0.71 %. **That revisit trigger can be marked not-triggered on evidence.** The other trigger —
"cross-process write contention, measured against `REQ-MONITOR-218`'s no-delay-floor rule, proves real"
— is **partially triggered**: contention with a compliant reader is real but sub-millisecond, while
contention with a rule-4-violating reader is 205 ms. That makes rule 4 a conformance obligation with a
number attached, and it makes alternative G's two-store split a live option if the workspace service's
write pattern ever turns out to need long transactions.

---

## 12. What this harness does **not** model

- **The model and tool work that produce a row.** `REQ-MONITOR-222` starts at "run activity"; everything
  upstream of `t_commit0` — the provider stream, the transcript projection in the run host, the 50 ms
  coalescing tick of `REQ-MONITOR-219` — is outside the measured interval. The figures here are a lower
  bound on the requirement's own interval, a tighter one than the IPC spike's but still a lower bound.
- **A real schema.** Three tables, no indexes beyond two primary keys and one listing index, no
  migrations, no checkpoint index (ADR-0039), no delivery store (ADR-0041), no improvement library, no
  traceability tables. ADR-0058 consequence 9 says "indexes and query planning are ours to own" and
  names `REQ-SESSION-042`'s listing and `REQ-TRACE-239`'s 100 ms board budget as needing measurement
  against real indexes. **Neither was measured here.** Every additional index on `transcript_row` adds
  WAL frames per insert and therefore both commit cost and checkpoint frequency.
- **One session, one workspace, one store.** `REQ-TOOLS-089` and `REQ-SANDBOX-038` allow concurrent
  runs, which under ADR-0058 share one store and one write lock. Two run hosts contending was **not**
  measured; only run-host-versus-workspace-service was.
- **A store of realistic size.** The largest database built here is 91.1 MB (22,500 rows); the 10,000-row
  conditions ran against a 54.6 MB store. `PRAGMA quick_check` at open,
  `integrity_check`, the pre-migration copy, and everything in ADR-0058's recovery ladder were not
  exercised at any size.
- **Anything but the happy path.** No torn write, no corruption, no disk-full, no `SQLITE_FULL`, no
  read-only volume, no antivirus quarantine of the `-wal` file. The only failure injected was lock
  contention.
- **The `-shm` file across processes on a real user's machine.** Both processes here were started by the
  same user in the same session on local NTFS. `REQ-SESSION-198` puts the store on machine-local storage
  precisely so a synchronising client never sees it, and that is not tested here.
- **Packaging.** Development mode only. The native module's asar-unpacking obligation — ADR-0058
  consequence 1, ADR-0054, ADR-0056 — was **not** exercised. `better-sqlite3` was loaded from a plain
  `node_modules` tree. A packaged build must place `better_sqlite3.node` outside the asar and this spike
  says nothing about whether that works.
- **Any machine but this one.** One NVMe SSD, one NTFS volume, one Windows build, one afternoon. The
  `fsync` figure in section 5.3 is a property of this device: on a spinning disk `FULL` would be
  10–100× worse and the `FULL` verdicts in section 10 would need re-taking. `NORMAL` performs no sync
  and should be far less device-sensitive, but that was not tested on other storage.
- **macOS and Linux.** Neither was touched. `fsync` semantics on macOS in particular differ (`F_FULLFSYNC`
  versus `fsync`), and SQLite's behaviour there is not the same as here.
- **Replicate depth in three places.** The `direct` topology, the `node:sqlite` cross-check, and the
  long-write contention rows are single launches. The long-write maxima (205.4 ms, 61.8 ms) rest on 1
  and 3 reader passes respectively; they are the right order of magnitude and should not be quoted to
  three figures.
- **Anti-malware was active and unmeasured**, as was whatever else the machine was doing. The p99.9
  figures in section 5 (4–12 ms) and the isolated 37–67 ms commit maxima are consistent with external
  interference and were not attributed.
