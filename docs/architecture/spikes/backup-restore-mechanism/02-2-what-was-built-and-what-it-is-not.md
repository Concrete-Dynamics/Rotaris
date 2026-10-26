# Spike — the whole-store backup and restore, run end to end — 2. What was built, and what it is not

Part 2 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

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
