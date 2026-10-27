# Spike — the whole-store backup and restore, run end to end — 5. Raw results — the two renames, the reversal, and what is observable between them

Part 5 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

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
