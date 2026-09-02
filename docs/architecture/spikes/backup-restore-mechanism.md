# Spike — the whole-store backup and restore, run end to end

- **Date:** 2026-09-02
- **Assigned as:** spike 22. The restore half of `REQ-SESSION-201` had never been run in any part. The
  backup half was measured on 2026-09-02 in `remote-and-synchronised-storage.md` (`VACUUM INTO`: 8 valid
  snapshots of 8 under a live writer; naive file copy: 625 unopenable of 627) and is not re-litigated here.
- **Question, as given:** does ADR-0058's restore work as written — the two renames, the reversal, the
  two-process close handshake, the three refusal gates, ADR-0005's lock-row correction, ESC-26's three
  identifier cases, the timing, and all of it under a build whose native store binding was produced against
  the Electron ABI.
- **Scope:** measurement only. No product code was written and none is authorised. Nothing was written into
  the repository except this file.

**Headline. The restore as ADR-0058 writes it fails on this platform in 30 of 30 attempts, at step 4, and
the record contains the sentence that explains why but does not apply it.** Step 2 opens the expanded
staging store read-write and no step closes it; step 4 renames that directory; Windows refuses to rename a
directory that holds an open handle — `EPERM`, 30 of 30. Closing the staging connection before the renames
makes it succeed 30 of 30. That is one line of the mechanism, and without it the feature does not work at
all.

Four further defects were found and are set out in section 14. The two that matter most: **the liveness
gate is evaluated before the run host is told to refuse runs, and a run launched in that window is
destroyed by the swap** — measured, with the run host mid-write; and **the workspace service waits for the
run host's acknowledgement with no bound, so a run host that does not answer, or that has already exited,
hangs the restore for ever** — measured, no result in 15,000 ms, twice, while a window is showing.

Everything else the record specifies held. The reversal restores the previous state when step 4 fails for a
reason that leaves the target name free; the failure names both directory paths when the reversal also
fails; the three gates refuse what they are meant to refuse and admit an older schema version; ADR-0005
consequence 11's lock-row correction is vindicated against its own counterfactual; ESC-26's three
identifier cases behave as ruled; and the whole thing runs under Electron 44.1.0 in real `utilityProcess`
children with a window painting throughout, at a main-process event-loop lag of 6 ms p50 / 13 ms max.

---

## 1. Environment

| | |
|---|---|
| OS | Microsoft Windows 11 Pro, `10.0.26200.9168` (`cmd /c ver`) |
| Host name | `ASUS-RTX` |
| Node (host) | v24.11.0, `NODE_MODULE_VERSION` 137, N-API 10 |
| npm | 11.12.1 |
| Electron | 44.1.0 — Node 24.19.0, `NODE_MODULE_VERSION` 149, N-API 10, Chromium 152.0.7977.65 |
| SQLite binding | `better-sqlite3@13.0.3` (both the shipped npm prebuild and a from-source Electron build) |
| SQLite | **3.53.4**, `COMPILER=msvc-1944`, `DEFAULT_WAL_SYNCHRONOUS=1`, `DEFAULT_WAL_AUTOCHECKPOINT=1000`, `THREADSAFE=2` |
| Toolchain | Visual Studio 2022 Community 17.14.37531.7, MSBuild 17.14.51, node-gyp 12.4.0, Python 3.14.4, `@electron/rebuild` 4.2.x |
| Archive container | `C:\Windows\System32\tar.exe` (bsdtar), used for the artifact |
| Volumes | `C:` NTFS 1,022,726,901,760 B total / 59,793,588,224 B free · `D:` NTFS 1,000,202,039,296 B / 708,652,838,912 B free |
| `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` | **1** (measured, not assumed) |
| Harness location | `…\scratchpad\spike-22` (on `C:`, under `%TEMP%` — see 11.2) |
| Anti-malware | not disabled, not enumerated, not measured |

Same machine and OS build as `spike-base`, `remote-and-synchronised-storage` and
`commit-on-the-publish-path`, so figures are comparable with them.

---

## 2. What was built, and what it is not

A model of ADR-0058's store layout, backup and restore, in about 700 lines, exercised by ten harnesses.
It is **not** product code and no line of it is proposed as any.

**The store.** `workspace.db` under `<base>/<identifier>/`, with `sessions/<session-id>/{debug.log,
summary.md, artifacts/…}` beside it and `origin.txt`, exactly as ADR-0058's layout block fixes. Four
tables: `sessions` (`session_id`, `execution_status`, `workspace_root`, `updated_at`, `created_at`),
`session_locks` (`session_id`, `pid`, `host`, `acquired_at` — `REQ-SESSION-046`'s three fields and their
types), `transcript`, `improvement_library`. `PRAGMA user_version` carries the schema version.

**The open sequence is ADR-0058 rule 3's**, not a convenience: open, `journal_mode = WAL`, read it back,
then a write probe inside `BEGIN IMMEDIATE` that is rolled back. `synchronous = NORMAL`,
`busy_timeout = 5000`. Every prepared statement is retained on the connection and result-less pragmas go
through direct execution, per ADR-0058 consequence 16.

**The backup is ADR-0058's five steps in ADR-0058's order**: `VACUUM INTO` a staging file; enumerate the
sessions and bodies **from the snapshot**; copy those and only those; write a manifest carrying the
artifact format version, the workspace identifier, the UTC instant, the store's `user_version`, session and
row counts, the artifact's lock rows and the last-seen workspace path; seal into a `tar` container; rename
onto the destination.

**The restore is ADR-0058's restore section, step by step**, with a fault injector at every point the
record names a failure: three read-only gates; the identifier decision; the close handshake; expand into
`<identifier>.restoring-<n>`; open read-write there; `quick_check`; the lock-row correction; two renames;
the reversal; re-open.

**Two real operating-system processes.** A workspace service and a run host, each a separate Node process
holding its own connection, with a parent process standing in for main and relaying the close handshake
between them — which is ADR-0002's shape, since the two children have no channel of their own. The run
host writes transcript rows at 50 ms intervals (`REQ-MONITOR-219`'s twenty per second) for a session whose
lock row it holds. It has modes: normal, deaf, slow, and exit-without-answering.

**Under Electron**, the same two roles run as real `utilityProcess` children of an Electron main process
that has a `BrowserWindow` shown and painting, with an event-loop lag sampler in main.

---

## 3. Method

Every rename trial is 30 process-local attempts on freshly created directories, reported as a count. Every
restore trial that carries a verdict is 30 repetitions with a fresh world each time. Timing is
`process.hrtime.bigint()` inside the process that does the work, reported as min / p50 / max over 10
repetitions per store size. The observer that watches the rename gap runs in a **separate process** and
holds no handle on anything inside the store directory — an earlier version of it opened the store to look,
and its own transient handle broke step 3, which is itself recorded in 4.3.

Raw JSON for everything below is under `…\scratchpad\spike-22\out\`; the harness file list is section 16.

---

## 4. Raw results — Windows directory-rename semantics (`A-rename.js`, 30 trials each)

ADR-0058 steps 3 and 4 are two directory renames. Everything the mechanism can do rests on what this
platform allows.

| Trial | Succeeded | Failure |
|---|---|---|
| A1 — rename a directory onto a **name that does not exist** | **30 / 30** | — |
| A2 — rename a directory onto an existing **empty** directory | **0 / 30** | `EPERM` |
| A3 — rename a directory onto an existing **non-empty** directory | **0 / 30** | `EPERM` |
| A4 — rename a directory onto an existing **file** | **30 / 30** | — (the file is destroyed; verified: the destination is afterwards a directory holding the source's contents) |
| A5 — rename a directory holding an open plain file descriptor | **0 / 30** | `EPERM` |
| A6 — rename a directory holding an **open `better-sqlite3` connection** | **0 / 30** | `EPERM` |
| A6b — the same, connection **closed first** | **30 / 30** | — |
| A7 — rename a directory whose store **another process** has open | **0 / 30** | `EPERM` |
| A8 — rename onto an existing `…displaced-<stamp>` at **second** granularity | **0 / 30** | `EPERM` |
| A9 — rename a directory that is another process's current directory | **0 / 30** | `EBUSY` |

Three consequences, all of them load-bearing below.

**4.1 The cache spike's finding is confirmed and is stricter than reported.** Renaming onto an existing
directory fails **even when that directory is empty**. There is no "replace if empty" on this platform.
Step 4 therefore depends absolutely on step 3 having vacated the name.

**4.2 Renaming a directory onto an existing *file* succeeds and destroys the file.** A stray
`<base>/<identifier>` that happens to be a file is silently replaced by step 4. Not a likely state; recorded
because it is the one asymmetry in the table and because nothing in the record anticipates it.

**4.3 A single held handle anywhere inside the directory is fatal, from any process.** A plain descriptor,
a SQLite connection in this process, a SQLite connection in another process, and a process's current
directory all block the rename. This is the same shape the Windows writer-handle spike found for files
(`renameSync` over a held file, 0 of 115), one level up.

**4.4 `store.db` is one file only when it is closed.** Measured: while open, the store directory holds
`workspace.db` (4,096 B), `workspace.db-shm` (32,768 B) and `workspace.db-wal` (65,952 B); after a clean
close it holds `workspace.db` alone. Closing both connections is not hygiene before the swap — it is what
makes the directory renameable at all.

---

## 5. Raw results — the two renames, the reversal, and what is observable between them

### 5.1 ADR-0058 step 2 as written: 0 of 30 (`H-reps.js`, `B-restore.js literal-step2`)

The record's swap is:

> 2. The artifact is expanded into a sibling staging directory in the same parent, in full, and the expanded
>    store is **opened read-write once there** …
> 3. `<identifier>` → `<identifier>.displaced-<UTC timestamp>`.
> 4. staging → `<identifier>`.

No step closes the connection step 2 opens. Implemented exactly so:

| Reading | Succeeded | Failing step | Code | Reversal succeeded | Store present and openable after | Staging directory left behind |
|---|---|---|---|---|---|---|
| **step 2's connection never closed** (the record's text) | **0 / 30** | `step4-install` 30 | `EPERM` 30 | 30 / 30 | 30 / 30 | **30 / 30** |
| step 2's connection closed before the renames | **30 / 30** | — | — | — | 30 / 30 | 0 / 30 |

The record's own rule is one paragraph above the sequence and does not reach the case:

> **No connection may be open on the target while it is replaced.**

The staging connection is not on *the target*. It is on the staging store, which **becomes** the target by
rename. The rule as phrased is satisfied and the mechanism still cannot complete.

Two smaller things fall out of the same reading and are recorded here rather than as separate defects.
The staging directory *is* the artifact expanded in full, so after step 4 the store directory contains the
container's own layout: the snapshot is named `store.db` where the layout fixes `workspace.db`, and
`manifest.json` sits inside the live store. The harness had to insert an unspecified rename to get past it,
and the restored store directory still carried `manifest.json` in every successful run. And `origin.txt` —
which ADR-0058 makes the reclamation surface's only way to say which project a store belongs to — is
correctly not in the artifact and is therefore **absent from every restored store**.

### 5.2 The reversal (`B-restore.js step4-fail-handle`, `step4-fail`, `reversal-fail`)

Step 4 was forced to fail two ways.

**Forced by a held handle inside the staging directory, so the target name is free.** Step 3 succeeded,
step 4 failed `EPERM`, **the reversal succeeded**, the workspace service re-opened, and the store held its
original single session. The store was left exactly as it was. This is the path the record describes and it
works.

**Forced by occupying the target name.** Step 3 succeeded, step 4 failed `EPERM` — and **the reversal
failed with the same `EPERM`, for the same reason**. The end state: the store directory occupied by the
squatter, the real store sitting under `<identifier>.displaced-<stamp>`, the workspace service's re-open
failing with `unable to open database file`, and the staging directory still on disk.

The failure text named both paths, as the record requires:

> restore failed at step 4 (EPERM) and the reversal also failed (EPERM): the store for this workspace is at
> `…\<identifier>.displaced-2026-09-02T12-48-48-760Z` and must be renamed to `…\<identifier>`

**The record treats "step 4 fails" and "the reversal also fails" as independent events. On this platform
they are strongly correlated.** A rename to a name that does not exist succeeds 30 of 30 (A1). The two ways
it fails are a held handle and an occupied name (A2–A9). If step 4 failed because the name is occupied, the
reversal is a rename onto that same occupied name and fails identically. Only the held-handle family leaves
a reversal that can succeed.

### 5.3 What a reader observes between the renames (`I-gap.js`, separate observer process)

The observer polls the store directory as fast as `fs.existsSync` allows — 97 to 169 polls per run over a
1,200 ms window, so roughly one sample every 8 ms against a gap of 3 to 5 ms. It caught the gap in 5 of 20
normal runs; in every one of those it saw exactly what the record claims:

```
store-present -> store-directory-absent -> store-present
```

**Consequence 7's claim is confirmed for the normal path.** In the gap the store directory is absent, which
`REQ-SESSION-043` makes an ordinary state.

**It is not the worst observable.** When step 4 fails because the name is occupied, the observer saw, in
**20 of 20** runs:

```
store-present -> store-directory-present-without-database
```

and it stayed there, because the reversal fails too. A store *directory* that exists and holds no database
is a third state. `REQ-SESSION-043` covers "a workspace for which this machine holds no store at all"; it
does not say what a directory with no `workspace.db` in it means, and neither does ADR-0058.

### 5.4 The `.displaced-<UTC timestamp>` name has no stated granularity

Cut to seconds, two displacements inside one second collide and **step 3 fails `EPERM` in 30 of 30**
(`H-reps.js`). The harness's own stamp carries milliseconds and never collided. ADR-0058 says "renamed with
a UTC timestamp" and fixes no granularity; the recovery ladder uses the same name shape. At second
granularity this is a hard failure of the first mutating step.

### 5.5 A file manager holding the store's own directory blocks step 3: 0 of 30

`REQ-SESSION-191` requires a reveal action that opens the session's files "in the platform's file manager",
and `REQ-SESSION-198` puts those files inside the store directory. With a process whose current directory
is `<identifier>/sessions`, **step 3 fails `EPERM` in 30 of 30** (`H-reps.js`). The store survives, the
staging directory is left behind, and the restore is refused. Nothing in the record's close handshake covers
a handle held by something that is not one of the two processes.

---

## 6. Raw results — closing both connections across two processes

The run host was given four behaviours. `SVC_CLOSE_TIMEOUT` unset is ADR-0058 and ADR-0002 as written:
"both closes are acknowledged before anything moves", with no bound stated anywhere.

| Run host | Bound on the wait | Terminated | Wall | Outcome |
|---|---|---|---|---|
| answers immediately | none (as written) | yes | 131 ms | restore completes |
| answers after 3,000 ms | none (as written) | yes | 3,146 ms | restore completes; `handshake_ms` = **3,012.9** |
| **never answers** | none (as written) | **NO** | watchdog at **15,003 ms** | no result, no error, no timeout; the store is still open and healthy; the run host is still writing |
| **exits without answering** | none (as written) | **NO** | watchdog at **15,006 ms** | no result; the run host is **dead** and holds nothing; the workspace service waits for an acknowledgement that cannot arrive |
| never answers | 2,000 ms (harness-added) | yes | 2,143 ms | proceeds, **step 3 fails `EPERM`** because the run host still holds the store; the store is left exactly as it was; the staging directory is left behind |

**6.1 There is no bound and the mechanism needs one.** ADR-0002 consequence 11 states the capability the
run host must have and states no deadline; ADR-0058 step 1 says the acknowledgements come before anything
moves and says nothing about their not coming. Measured, the workspace service waits indefinitely. The
application keeps running and a window keeps painting throughout, so what a user sees is a restore that
never finishes and never fails.

**6.2 A bound alone is not the fix.** With a 2,000 ms bound the service proceeds and step 3 fails, because
the run host's connection is still open. Proceeding on a timeout converts a hang into a clean refusal —
which is better — but the acknowledgement is not advice, it is the precondition that makes the rename
possible, so the timeout path must refuse rather than continue.

**6.3 Is there a state in which both believe the other holds the store?** Not that one. Two asymmetric
states were produced, and both are worse than a symmetric standoff because neither party is wrong about
itself.

- **The run host is dead; the workspace service believes it still holds the store.** Nothing holds the
  store; the swap would succeed; it is never attempted. Measured above.
- **The workspace service dies after the run host has given up the store** (`B-restore.js
  svc-dies-after-ask`). Measured: the run host reports `open=false, refusing=true`, refuses every
  subsequent launch (`run-refused`), the store directory is renameable by anybody because nobody holds it,
  and nothing in the sequence will ever tell the run host to re-open. The instance keeps running with a
  window showing and no session in that workspace can start again.

**6.4 The failure path does not re-open the run host.** ADR-0058 step 5 — "Both processes re-open" — is a
step of the successful sequence. The failure text says only that step 3 is reversed and the failure
reported. In every one of the 30 literal-reading failures the run host was left closed and refusing. This is
a silence in the record rather than a specified behaviour that misbehaves, but the silence has the same
effect.

---

## 7. Raw results — the three refusal gates (`K-gates.js`, `B-restore.js gate*`)

Each gate was given its own world; the target store directory was hashed before and after.

| Case | Gate 1 `quick_check` | Gate 2 | Gate 3 | Outcome | Target store byte-identical after the gates |
|---|---|---|---|---|---|
| artifact snapshot scribbled over | `*** in database main *** Tree 3 page 3: btreeInitPage() returns error code 11` | not reached | not reached | **refused** | **yes** |
| artifact `user_version` 9, build supports 3 | `ok` | `pass=false` (9 > 3) | not reached | **refused** | **yes** |
| artifact `user_version` 1, build supports 3 | `ok` | `pass=true`, `older=true` | `pass=true` | **restored**; the restored store carries `user_version` **1** and migrates at its next open | n/a |
| lock naming this machine, pid alive | `ok` | pass | `pass=false`, `live=["t"]` | **refused** | see 7.1 |
| lock naming **another** machine | `ok` | pass | `pass=false`, `live=["t"]` | **refused** | see 7.1 |
| lock naming this machine, pid dead | `ok` | pass | `pass=true` (proved unheld) | admitted | see 7.1 |
| no locks | `ok` | pass | `pass=true` | admitted | see 7.1 |

All three gates do what the record says, including the case that must **not** refuse: an older schema
version restores and is left to the ordinary migration path.

### 7.1 The gates are not read-only at the filesystem level

Measured directly. Before gate 3 the target store directory holds `workspace.db` (32,768 B). After the
three gates it holds `workspace.db`, `workspace.db-shm` (32,768 B) and `workspace.db-wal` (0 B). The
liveness gate's read-only open of a write-ahead-logged store creates the shared-memory file.

ADR-0058 says "Three gates first, all read-only, **none of them touching the target**". The database
contents are unchanged and no row is written, so the *intent* holds; the literal claim does not, and a
refused restore leaves the target directory different from how it found it.

### 7.2 A lock row naming another machine makes the target unrestorable, permanently

`REQ-SESSION-056` makes a lock naming another machine live by construction; `REQ-SESSION-047` never reaps
it; `REQ-SESSION-201` refuses a restore while any session in the target is live. Measured: gate 3 refuses,
and the only product action that clears it is `REQ-SESSION-183`'s explicit, per-session, user-confirmed
release. ADR-0005 consequence 11 drops foreign-host rows on the way **in**, from the artifact; nothing drops
them from the **target**. `REQ-SESSION-054` calls such a row "a state that should not arise" — but a machine
rename produces it for every lock row at once, and the restore is then refused per session until the user
clears them one at a time.

### 7.3 The pre-restore summary can be assembled before any mutation

Everything `REQ-SESSION-201` and ESC-26 require to be shown first was read from the artifact's manifest and
the target store, with nothing mutated: the artifact's workspace identifier, the UTC instant it was taken,
its session count, the target's session count, whether a store already exists for the artifact's identifier,
and the number of lock rows arriving. Measured at 55.6 ms p50 for a 68 KB store and 1,210.0 ms p50 for a
313 MB one (section 10) — the cost is gate 1's, not the summary's.

---

## 8. Raw results — ADR-0005 consequence 11's lock rows (`J-short.js`, `B-restore.js lockrows-*`)

A backup was taken with two sessions mid-run (`execution_status = running`, lock rows held), then restored.
The counterfactual — the same restore with the correction disabled — was run against the same world.

| | correction applied | correction **not** applied |
|---|---|---|
| lock rows in the artifact | 2 | 2 |
| foreign-host rows dropped | **2** | 0 |
| `live-1` after restore | `status=running`, no lock, **live=false**, **stale=true**, repairable | `status=running`, lock `host=DEAD-LAPTOP-7`, **live=true**, stale=false, **not repairable**, needs `REQ-SESSION-183` |
| `live-2` after restore | same | same |
| `done-1` (terminal) | untouched | untouched |
| after the ordinary explicit repair | both `interrupted`, locks released | repair does not apply to them |

Rows naming **this** machine are kept, and because their pids probe dead they are already stale, so the
ordinary repair settles them and `REQ-SESSION-059` still has the pid to name.

**ADR-0005 consequence 11 is vindicated against the case it was written for, and the case has now run.**
The sessions arrive reachable rather than permanently locked, and without the correction they arrive
permanently locked exactly as the consequence predicts.

---

## 9. Raw results — ESC-26's three identifier cases (`E-identifier.js`)

| Case | What was done | Result |
|---|---|---|
| **(a)** workspace carries the artifact's identifier | restore | completes; displaced store retained, openable, **1 session intact**, and its per-session files including `artifacts/keepme.md` still present |
| **(b)** no identifier file at all | establish by exclusive create (`O_CREAT|O_EXCL`), then restore | file created, value matches the artifact, restore completes with 2 sessions; `config.yaml` and `integration.lock` in `.rotaris/` untouched |
| **(b) race** a file appears between the check and the write | exclusive create against a squatter | **refused `EEXIST`**; the squatter's value stands; the action falls through to case (c) — the record's guard works |
| **(c) outcome 2** different readable identifier, restore into the artifact's own store | restore | completes; the workspace's identifier is **unchanged**; the artifact's store exists separately with 2 sessions; the open workspace still resolves to its own store and its own 1 session |
| **(c) outcome 3** different readable identifier, confirmed establishment | ADR-0004 replace shape (staged in `.rotaris/`, `fsync`, rename over), **2.42 ms**, after the gates and before the swap | identifier replaced; restore completes; **the store recorded under the old value is intact, unreferenced, openable, and holds its 3 sessions**; re-writing the old value by hand re-resolves the workspace to those 3 sessions — the undo the confirmation promises |
| **unreadable**, five shapes: not-an-identifier, `v1-abc`, uppercase hex, empty file, comments only | attempted | all five classify as **unreadable**; outcome 3 is not offered; **the file is byte-unchanged in all five** |

The confirmation's required content was assembled from the manifest and the two stores before anything was
written: both identifier values, the count of sessions that become unreachable (3), when the artifact was
taken, how many sessions it holds, whether a store already exists for the artifact's identifier, and how
many sessions arrive needing repair.

**The displaced store is retained and findable in every case where one was displaced**, sitting one
directory level up from the store that replaced it, exactly as the layout block specifies — with the
qualification in section 12.

---

## 10. Raw results — timing (`F-timing.js`, 10 repetitions per size, min / p50 / max in ms)

The store-unavailable window is measured inside the workspace service, from the instant it closes its own
connection to the instant its re-open completes.

| | small | medium | large |
|---|---|---|---|
| store bytes | 69,632 | 11,767,808 | **328,531,968** |
| artifact bytes | 85,504 | 11,812,352 | 328,617,472 |
| transcript rows | 150 | 20,000 | 240,000 |
| backup `VACUUM INTO` | 5.3 | 89.6 | 2,513.1 |
| backup, whole action | 145.6 | 425.0 | 4,206.1 |
| **gate 1** (extract the snapshot, `quick_check`) | 51.6 / **52.2** / 64.4 | 90.5 / **92.0** / 104.3 | 1,153.2 / **1,205.3** / 1,253.5 |
| gate 3 (liveness) | 3.0 / **3.1** / 3.3 | 3.3 / **3.5** / 3.6 | 3.5 / **3.8** / 4.6 |
| close handshake, run host answering at once | 1.2 / **1.3** / 1.5 | 1.2 / **1.3** / 1.4 | 1.2 / **1.4** / 1.6 |
| workspace service closes its connection | 0.9 / **1.0** / 1.0 | 1.0 / **1.0** / 1.0 | 1.0 / **1.1** / 1.1 |
| expand the artifact into staging | 37.7 / **38.5** / 39.9 | 76.7 / **78.3** / 79.2 | 422.5 / **427.3** / 499.2 |
| open staging + `quick_check` + lock correction | 7.5 / **8.4** / 10.6 | 39.5 / **46.5** / 53.1 | 945.1 / **997.2** / 1,034.9 |
| **step 3** (displace) | 3.5 / **3.6** / 4.2 | 3.6 / **3.8** / 4.0 | 3.8 / **3.9** / 4.3 |
| **step 4** (install) | 3.4 / **3.7** / 4.0 | 3.4 / **3.6** / 3.7 | 3.5 / **3.6** / 4.4 |
| **the gap between the two renames** | 3 / **4** / 5 | 3 / **4** / 4 | 3 / **4** / 5 |
| re-open, workspace service | 3.4 / **3.7** / 3.8 | 3.6 / **3.8** / 4.2 | 3.7 / **3.9** / 4.2 |
| re-open, run host (round trip through the parent) | 4 / **5** / 5 | 5 / **5** / 6 | 5 / **5** / 6 |
| **store unavailable** | 62.2 / **63.9** / 66.1 | 135.1 / **144.0** / 149.0 | 1,392.1 / **1,450.5** / 1,482.8 |
| whole restore | 119.1 / **120.8** / 133.0 | 231.3 / **241.8** / 251.0 | 2,572.2 / **2,668.5** / 2,692.5 |

Four readings.

**10.1 The two renames are flat and cheap.** Step 3 and step 4 are 3.5–4.4 ms at every size, and **the gap
between them is 3 to 5 ms whatever the store weighs**. The part of the mechanism that is not atomic is the
part that does not scale.

**10.2 Everything expensive is O(store) and most of it is charged twice.** The artifact is extracted once
in gate 1 to be checked and again in step 2 to be installed: 1,205 + 427 = 1,632 ms at 313 MB. The
integrity check runs twice for the same reason — on the artifact's snapshot in gate 1 and on the expanded
store in step 2. ADR-0058 wants both checks deliberately ("lets the integrity check run against the thing
that will actually be used rather than against the copy inside the container"), and the price of wanting
both is now measured. Gate 1's extraction is a property of the harness's container choice, not of the
record; see section 15.

**10.3 The store-unavailable window scales and nothing bounds it.** 64 ms at 68 KB, 144 ms at 11.8 MB,
**1.45 s at 313 MB**. ESC-19's survey records one comparable product's session data reaching 700 MB to
2 GB and ESC-9 leaves retention unbounded, so a multi-second window is a state this design permits.

**10.4 No requirement states a budget for any of this.** The specification was searched for one. The only
numeric budget in the neighbourhood is `REQ-SHELL-150` — a gesture acknowledged within **100 ms**, the
interval between repaints of a surface with pending changes never above **120 ms** — and it binds the
shell, which is a different process from the one doing this work. `REQ-SESSION-201` bounds the *backup*
("MUST NOT pause, delay, throttle or otherwise disturb a run") and says nothing about the restore's
duration, which is coherent, because the restore is refused while anything is live. **Verdict on "does
anything exceed a budget the specification states": nothing does, because the specification states none.**

---

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

## 12. Raw results — path length, which consequence 13 predicts and points at the wrong file

`better-sqlite3@13.0.3` on this machine, measured by opening a store at every absolute database-path length
from 240 to 262 (`D2-threshold.js`):

| absolute `workspace.db` path length | `new Database(file)` | `PRAGMA journal_mode = WAL` | a write | Node's own `fs` |
|---|---|---|---|---|
| ≤ 251 | ok | `wal` | ok | ok |
| **252 – 259** | **ok** | **throws `unable to open database file`** | throws | ok |
| ≥ 260 | **throws `unable to open database file`** | — | — | ok |

`LongPathsEnabled` is `1` on this machine and Node's `fs` created, wrote, read, listed and renamed at every
length tested, up to 328 characters. **The registry opt-in does not reach SQLite.**

The restore's own names cost:

- `<identifier>.restoring-<n>` — **+12 characters**
- `<identifier>.displaced-<UTC timestamp>` — **+35 characters**

Which produces a measured band (`D4-displaced.js`), where a live store works and its displaced copy does
not:

| live store `workspace.db` path length | live store | after step 3, displaced path length | displaced store |
|---|---|---|---|
| 200 | rows=1 | 235 | rows=1 |
| 220 | rows=1 | 255 | rows=1 |
| **230** | **rows=1** | **265** | **OPEN THROWS `unable to open database file`** |
| 240 | rows=1 | 275 | OPEN THROWS |
| 251 | rows=1 | 286 | OPEN THROWS |
| 252 | CREATE THROWS | — | — |

**A store whose database path is 230 to 251 characters works perfectly, and the store the restore keeps for
the user — retained deliberately, never deleted, the one thing that makes a wrong restore recoverable —
cannot afterwards be opened by the product at all.** The rename itself always succeeds.

**This does not bite in the shipped location.** Measured on this machine, the real default is

```
C:\Users\ganga\AppData\Local\rotaris\workspaces\v1-<32 hex>\workspace.db     96 characters
    …\v1-<32 hex>.restoring-1\workspace.db                                  108
    …\v1-<32 hex>.displaced-<UTC stamp>\workspace.db                        131
```

— all far below every threshold, because the store's own path is fixed-length by construction: a per-user
local directory, an identifier of fixed width, and a fixed filename. It bites where that prefix is long: a
long account name, a redirected profile, a junctioned `%LOCALAPPDATA%`. The harness hit it by accident, on
a scenario directory name, mid-restore.

**Consequence 13 names the right hazard and points at the wrong path.** It says the suffixes "add a suffix
to the deepest path in the record, which is where a long-path limit would bite first". The deepest path is
an artifact body under `sessions/<session-id>/artifacts/<name>`, which only Node's `fs` touches and which
worked at 328 characters here. The path with the hard limit is the **shallowest** one — `workspace.db` —
because SQLite, not the filesystem, is what refuses. And the refusal at 252–259 lands in the "opens clean
and throws on the first statement" shape that ADR-0058 rule 3 exists for, reached without a network in
sight.

---

## 13. Verdicts

**`REQ-SESSION-201` — "A restore MUST be an action a person takes deliberately" — PASS.** Nothing in the
harness restores on its own; the action is only ever entered from an explicit command.

**`REQ-SESSION-201` — "Before anything is changed the product MUST convey which workspace the artifact was
taken from, when it was taken, and what the restore will do to the store that is there now" — PASS.** Every
element was read from the artifact's manifest and the target store with nothing mutated (7.3), except that
the read itself creates two files in the target directory (7.1).

**`REQ-SESSION-201` — "MUST be refused while any session in the target store is live" — FAIL as specified
by ADR-0058.** The gate itself is correct: `REQ-SESSION-056`'s predicate refuses a live lock, admits a lock
this machine proves dead, and refuses a lock naming another machine, in 30 of 30. But **the gate is
evaluated before the run host is told to refuse runs, and nothing re-checks.** Measured: a run launched
between the two was admitted, took the lock, began writing at twenty rows a second, was then asked to close
mid-write, complied, and the swap replaced the store — destroying the session and everything it had
written. Requirement identifier for the ordering rule this breaks: ADR-0002 consequence 11, "the run host is
never asked to give up a store it is actively writing".

**`REQ-SESSION-201` — "A restore that fails for any reason MUST leave the store exactly as it was" — FAIL
in one reachable case, PASS in the rest.** Where step 4 fails for a reason that leaves the target name free,
the reversal succeeds and the store is exactly as it was, 30 of 30. Where step 4 fails **because the target
name is occupied**, the reversal fails for the identical reason and the end state is a store directory
holding no database, the real store under a timestamped name, and a workspace service whose re-open throws.
The record's own remedy — naming both paths so a person can finish the rename — worked and is what stands
between this and data loss.

**`REQ-SESSION-201` — "there is no partly restored store, and no reader may observe one" — PASS.** In 20 of
20 gap observations the reader saw an absent store directory and never a mixed one; the artifact's snapshot
is installed whole by one rename. The third state in 5.3 — a directory with no database — is not a partly
restored store, but no requirement says what it is.

**`REQ-SESSION-201` — "Restore never silently merges" — PASS.** No merge exists in the mechanism; the target
is displaced whole and the artifact installed whole.

**`REQ-SESSION-201` — the whole action, end to end, as ADR-0058 writes it — FAIL, 0 of 30.** Section 5.1.

**`REQ-SESSION-197` — "MUST NOT mint a replacement over an identifier it can read" and its one exception —
PASS.** Case (b) establishes by exclusive create and refuses `EEXIST` against a squatter; case (c) outcome 3
replaces only through the confirmed path, names both values, states what becomes unreachable, keeps the
displaced store, and is undoable by hand; all five unreadable shapes are reported and left byte-unchanged.

**`REQ-SESSION-197` — "the identifier MUST NOT change afterwards for any reason", elsewhere — PASS.** No
other path in the harness writes the file.

**`REQ-SESSION-043` — "a workspace for which this machine holds no store at all MUST produce an empty list
rather than an error" — PASS for the gap on the normal path, INCONCLUSIVE for the failure path.** The gap's
observable is an absent directory (5.3), which the requirement covers. A store directory that exists and
holds no database is not covered by its wording and arises in 20 of 20 occupied-name failures.

**ADR-0005 consequence 11 — a restore drops lock rows whose host is not this machine — PASS, and the
counterfactual is measured.** Section 8.

**`REQ-SESSION-198` — the store is machine-local — not exercised.** The restore never leaves the per-user
local directory.

**`REQ-SHELL-150` — 100 ms gesture acknowledgement, 120 ms repaint interval — PASS under Electron, with the
caveat in section 15.** Main-process event-loop lag 6 ms p50, 13 ms max, across restores up to 2.87 s.

**"Does anything in it exceed a budget the specification states" — no, because the specification states
none.** Section 10.4. The store is unavailable for 64 ms to 1.45 s over the range measured and no
requirement bounds that.

**ADR-0056's owed figure — the Electron-ABI rebuild — measured, and the answer is not the one the record
expects.** Sections 11.1 and 11.2.

---

## 14. Defects found

**D1 — The restore cannot complete as ADR-0058 writes it. 0 of 30.** Step 2 opens the staging store
read-write; no step closes it; step 4 renames that directory; Windows refuses. `EPERM`, 30 of 30. The
record's protective rule — "No connection may be open on the target while it is replaced" — is phrased
about *the target* and the staging store is not the target until the rename it is blocking has happened.
One line fixes it and the record does not contain that line.

**D2 — The liveness gate races the refuse-runs instruction, and the loser is a live run.** Gate 3 is
evaluated in the read-only phase; the run host is told to refuse runs only afterwards, as part of the close
request. Measured: a launch admitted in that window acquired a lock, started writing, was asked to close
mid-write, complied, and had its session replaced by the swap. This is the state ADR-0002 consequence 11
says cannot arise and `REQ-SESSION-201` forbids. The refusal has to be in force **before** liveness is
evaluated, or liveness has to be re-evaluated after it is.

**D3 — The close handshake has no bound and does not terminate.** With the run host deaf, and with the run
host exited without answering, the workspace service produced no result and no error within a 15,000 ms
watchdog, twice. ADR-0058 step 1 and ADR-0002 consequence 11 both state the acknowledgement and neither
states a deadline. The dual state is as bad: kill the workspace service after the run host has closed, and
the run host stays closed and refuses every launch for ever, with the store held by nobody. Both were
measured.

**D4 — The reversal fails for the same reason step 4 did, whenever step 4 failed because the name was
occupied.** The record presents "if the reversal also fails" as a rarer, independent event. On this platform
the two failure families are: a held handle (reversal can succeed — measured, 1 of 1) and an occupied name
(reversal cannot succeed — measured, EPERM, both trials). The double-failure branch is not a long tail; it
is half the failure space.

**D5 — Nothing cleans up the staging directory, and nothing knows it exists.** In every failure measured —
30 of 30 literal-reading, 30 of 30 file-manager, 30 of 30 stamp-collision, and the timeout case — a full
copy of the artifact's store was left at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it
"transient" and no step deletes it. The reclamation surface the record owes (consequence 5, OQ-48) is
specified around displaced stores and pre-migration copies; a leftover staging directory is a third kind
nobody has named, and it is the size of the store.

**D6 — The `.displaced-<UTC timestamp>` name has no stated granularity, and at seconds it is a hard
failure.** 0 of 30 at second granularity; step 3 fails `EPERM`. The recovery ladder uses the same shape.

**D7 — The artifact's container layout becomes the store's layout.** Step 2 expands the artifact "in full"
into staging and step 4 makes staging the store. Read literally the store then holds `store.db` where the
layout fixes `workspace.db`, plus the manifest. The harness had to insert an unspecified rename to proceed,
and `manifest.json` was inside the live store after every successful restore. `origin.txt` is absent from
every restored store, which the reclamation surface depends on.

**D8 — "Three gates first, all read-only, none of them touching the target" is false at the filesystem
level.** Gate 3's read-only open creates `workspace.db-shm` (32,768 B) and `workspace.db-wal` (0 B) in the
target store directory. Measured before and after. Harmless to the data; not what the sentence says.

**D9 — A lock row naming another machine makes the target permanently unrestorable.** Foreign-host rows are
dropped on the way in from the artifact and never from the target, and `REQ-SESSION-056` makes them live and
`REQ-SESSION-047` never reaps them, so gate 3 refuses until the user clears each one through
`REQ-SESSION-183`. A machine rename creates the condition for every session at once.

**D10 — `electron-rebuild` against this binding reports success and compiles nothing, and the loader would
ignore the result anyway.** Sections 11.1 and 11.2. Not a defect in the mechanism; a defect in the discharge
of the obligation ADR-0058 consequence 1 and ADR-0056 place on the build.

**D11 — The `.displaced-` suffix can make the kept store unreadable.** +35 characters across SQLite's 251/259
thresholds, measured; the failure begins at a live database path of 230 characters. Not reachable in the
shipped location (96 characters), reachable with a long `%LOCALAPPDATA%`.

**One thing the record got right that is worth naming, because it was tested to fail and did not.** The
error text on the double-failure path names both directory paths, which is the only reason that end state
is recoverable by a person. It was specified before it was ever run, and it is the difference between a
recoverable failure and a lost store.

---

## 15. What this harness does **not** model

- **No product code exists and none of this is a proposal.** The schema is four tables, the transcript is a
  padded string, and no requirement's real row shape is implemented.
- **The container is `tar`.** Gate 1's cost is therefore "extract the snapshot, then check it", and step 2
  extracts the same bytes again. A container whose snapshot could be opened in place would halve that. The
  double *integrity check* is ADR-0058's own choice and would remain.
- **The close handshake is relayed through the parent**, because two Node children have no channel of their
  own. ADR-0002's real topology has main relaying too, so the shape is right, but the transport is not
  ADR-0010's channels and the 1.2–1.5 ms handshake figure is a floor, not a prediction.
- **One machine, one architecture, NTFS on local NVMe.** Nothing here was run over SMB, over a mapped drive,
  or inside a synchronisation client's tree. ADR-0058 puts the store on machine-local storage, so this is the
  configuration that matters, but a restore of an artifact *read from* a network destination is untested.
- **The Electron figures are one run per size.** No repetition, no cold/warm control, no percentile. The
  event-loop lag figure comes from a renderer that draws an `<h1>`; the product's renderer has a state store,
  a transcript and a terminal grid, and `REQ-SHELL-150` must be measured against that, not against this.
- **Nothing was packaged.** No `electron-builder` artifact, no asar, and therefore **no test of the
  asar-unpack obligation** that survives untouched from ADR-0058 consequence 1. The binding was loaded from
  `node_modules` in every run.
- **No power-loss or kill test.** The process was never killed between step 3 and step 4. What a restore
  interrupted exactly in the gap leaves behind is unmeasured, and it is the one state where a user would find
  the store directory absent with no process left to reverse anything.
- **No concurrent second restore.** Two restores of the same identifier at once were not attempted; the
  instance claim ADR-0058 describes was not modelled.
- **`quick_check`, not `integrity_check`.** ADR-0058 names `quick_check` for gate 1 and this harness uses it.
  Neither establishes completeness — consequence 15 already says so.
- **No user interface.** Every "the product must convey" clause was tested by showing that the *values* are
  available before any mutation, never by rendering anything.
- **The identifier cases were driven file-by-file**, not through the two-process harness. The identifier
  write is a `.rotaris/` operation and involves neither store connection, but the ordering against the gates
  and the swap was asserted by construction rather than raced.

---

## 16. Files

All under `C:\Users\ganga\AppData\Local\Temp\claude\D--Development-Apps-Rotaris-crw\8ddb8c86-64f1-495f-8cc7-35576c51f79c\scratchpad\spike-22`.
Working directories (3.2 GB of generated stores) were deleted; `out\` and the harnesses remain.

| File | What it does |
|---|---|
| `lib.js` | store layout, ADR-0058 rule 3's open sequence, identifier read/mint/replace, the backup |
| `restore.js` | the three gates, the swap, the reversal, the lock-row correction, the fault injector |
| `proc-svc.js`, `proc-runhost.js`, `orch.js`, `holder.js` | the two processes, the relay, the gap observer |
| `A-rename.js`, `A2-extra.js` | section 4 |
| `B-restore.js` (21 scenarios), `H-reps.js`, `I-gap.js`, `I-observer.js` | sections 5 and 6 |
| `K-gates.js` | section 7 |
| `J-short.js` | section 8, and the displaced store's retention |
| `E-identifier.js` | section 9 |
| `F-timing.js` | section 10 |
| `e\main.js`, `e\svc-child.js`, `e\rh-child.js`, `e\abi-probe.js`, `e\abi-child.js`, `e\index.html` | section 11 |
| `D-longpath.js`, `D2-threshold.js`, `D3-name.js`, `D4-displaced.js` | section 12 |
| `out\*.json`, `out\F-timing.txt`, `out\ngyp3.log` | every raw result quoted above |

---

## 17. Impact on the record

### ADR-0058 — the workspace store

**The restore section needs one sentence it does not have**, and the mechanism does not work without it:
the staging connection is closed before step 3. Everything else in the section survives the measurement.

**Five statements are contradicted by measurement and should be corrected in place rather than quietly
rewritten**, in the manner this record already uses:

1. "Three gates first, all read-only, **none of them touching the target**" — the liveness gate creates
   `-shm` and `-wal` in the target store directory (D8).
2. "If step 4 fails after step 3 succeeded, step 3 is reversed … if the reversal **also** fails" — the two
   failures are correlated, not independent, and the occupied-name family guarantees both (D4).
3. Consequence 7: "The observable in the gap is an absent store directory" — true on the normal path,
   measured; on the occupied-name failure the durable end state is a store directory with no database in it,
   which `REQ-SESSION-043` does not describe (5.3).
4. Consequence 13: the long-path limit bites at the **shallowest** path, `workspace.db`, and it is SQLite
   that refuses at 251/259 characters while the filesystem is content past 328 (section 12).
5. "Measured, the ABI mismatch is loud on this toolchain … both directions abort the load" — true of
   `better-sqlite3@12.11.1`, false of `13.0.3`, which is Node-API and loads in both directions (11.1).

**Three things the record does not decide and now must.** Where the refusal to start runs takes effect
relative to gate 3 (D2). Whether the acknowledgement wait is bounded and what happens when it expires (D3).
What removes a `<identifier>.restoring-<n>` left by a failed restore, and whether the reclamation surface
sees it (D5). A fourth, smaller: the granularity of the displaced timestamp (D6), and the shape of the
staging directory's contents against the store layout (D7).

**Consequence 6's open scale question is answered for the restore, not the backup.** The store-unavailable
window is 64 ms at 68 KB, 144 ms at 11.8 MB and **1.45 s at 313 MB**, and the whole action is 2.67 s at
313 MB. The renames themselves are flat at 3–5 ms. Whether progress reporting is owed is now a question with
numbers behind it.

**Alternative U is untouched.** The backup half was already vindicated and nothing here reopens it.

### ADR-0005 — the session lock

**Consequence 11 is confirmed by the case it was written for, and the counterfactual is measured.** No
change is owed. One addition is: the rule drops foreign-host rows **on the way in** and says nothing about
foreign-host rows already in the **target**, which make that target permanently unrestorable (D9).

### ADR-0002 — process topology

**Consequence 11's capability is real and is not sufficient as stated.** It requires the run host to be able
to close, refuse, and re-open. Measurement adds three obligations: the refusal must be in force before
liveness is judged, the acknowledgement must be bounded, and the failure path must re-open the run host —
none of which the consequence or ADR-0058 currently says. Its own closing sentence — "the run host is never
asked to give up a store it is actively writing" — is the invariant D2 breaks.

### ADR-0056 — the build toolchain

**The Electron-ABI rebuild figure is: 27.7 s and 29.2 s cold, 4.2 s incremental, for a from-source build of
`better-sqlite3@13.0.3` against Electron 44.1.0 on this machine — and it is not needed, because the binding
is Node-API and the shipped prebuild loads under both runtimes.** What is needed instead is a build check
that the binding actually loaded under the packaged runtime, because `electron-rebuild` reports success
without producing anything and the loader prefers the prebuild over any build sitting beside it (11.2). A
build that trusts `electron-rebuild`'s exit status is verifying nothing.
