# Spike — the whole-store backup and restore, run end to end — 13. Verdicts

Part 13 of 17 of [the spike report](../backup-restore-mechanism.md), which indexes every part.

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
