# Spike — the whole-store backup and restore, run end to end — 17. Impact on the record

Part 17 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

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
