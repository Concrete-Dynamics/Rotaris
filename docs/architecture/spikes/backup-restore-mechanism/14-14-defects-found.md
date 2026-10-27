# Spike — the whole-store backup and restore, run end to end — 14. Defects found

Part 14 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

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
