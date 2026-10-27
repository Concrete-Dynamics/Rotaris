# Architectural constraints extracted from the specification — The nine structural rulings, and what the specification now compels

Part 2 of 22 of [the constraints](../constraints.md), which indexes every part.

## The nine structural rulings, and what the specification now compels

[`owner-decisions.md`](../owner-decisions.md) carries nine structural rulings — SR-1 (one running
application instance), SR-2 (a run this application does not own cannot be viewed), SR-3 (the polling
cadences are withdrawn), SR-4 (a store, not files, for what only the application reads), SR-5 (a
workspace held by another machine is refused, and the refusal is a safety feature), SR-6 (the export
obligation covers every record a user could previously read), SR-7 (the `onefile` portable prepares
itself once), SR-8 (`REQ-ORCH-155`'s 100 ms is a percentile), SR-9 (two gaps SR-4 and SR-6 left) — plus
rulings on ESC-1 to ESC-18, of which ESC-15 (the store is machine-local) and ESC-16 (a store that will
not open means no run) reach further into this document than any other — **and, since 2026-09-01, rulings
on ESC-19, ESC-20 and ESC-21**, which the owner asked to be decided by comparison with seven other coding
harnesses rather than from first principles. Those three reach this document through W-20 (the
integration lock now refuses on replicated storage), W-22 and W-23 (both relabelled **MET**), W-24 (the
whole-store backup and restore) and D-30 (the index `REQ-TRACE-089` permits).

**The amendment pass those rulings authorised has landed, and the rows below have been re-derived
against the amended text rather than patched.** That distinction matters: a row that recorded a
*mechanism* the specification fixed is not "differently met" now, it is **wrong at the source**, because
the specification withdrew the mechanism and states an observable in its place. Every such row was
re-read against the requirement as it now stands.

**What the amendment actually did, in one paragraph, because it is not what a reader expects.** It did
**not** write SR-4's vocabulary into the specification. No live requirement anywhere names a database, a
table, an index, a query or a schema migration (**D-22**). What it did was replace fixed paths, fixed
byte formats and fixed write disciplines with **observables over a store whose form it does not fix**:
one workspace plus one session id resolves one record (`REQ-SESSION-001`); the store is machine-local
and found by a workspace identifier (`REQ-SESSION-197`, `REQ-SESSION-198`); a save is all-or-nothing
(`REQ-SESSION-028`); a reader may not delay the writer (`REQ-EVENTS-098`); a listing's cost grows with
the number of sessions and with nothing else (`REQ-SESSION-042`); the line-delimited form is the
**export's** format and not the store's (`REQ-EVENTS-090`, `REQ-EVENTS-166`). Engine, schema and indexes
are therefore architecture's to choose — and architecture's to be wrong about.

**Rows re-derived in this pass**, because the requirement behind each changed rather than merely being
met differently: **D-01**, **D-06**, **D-08**, **D-09** (withdrawn), **D-10**, **D-11**, **D-13**,
**D-14**, **D-15**, **D-19**, **D-22**, **D-25**, **D-27**, **E-01**, **E-03**, **E-06**, **E-07**,
**E-08**, **E-17**, **C-01**, **C-02**, **C-04**, **C-08**, **C-10**, **C-11**, **T-25**, **T-34**,
**T-41**, **U-04**, **U-05**, **I-04**, **I-10**, **B-03**, **B-11**, and reconciliation 7.
**D-29**, **D-30**, **U-22**, **T-42**, **X-19**, **B-23** and **I-31** are new rows the amended text
forces and that nothing carried before.

**Rows re-derived in the second amendment pass of 2026-09-02**, against requirements that landed after
the rows above were written: **C-01**, **C-10**, **C-11**, **D-25**, **D-27**, **D-30**, **W-19**,
**W-20**, **W-22**, **W-23**. **W-24**, **W-25** and **W-26** are new. Three of those corrections
withdraw a sentence that said a requirement **did not exist** — W-22's, W-23's and W-20's — and each is
kept beside its replacement rather than deleted, because a claim that reads as verified and is wrong is
worse than no claim.

**Rows corrected in the measurement round of 2026-09-02, and this is a different kind of correction from
every round above it.** Four spikes were run and **every owner ruling survived** — but several rows here
stated a *reason* the measurements disprove, and a row whose conclusion is right and whose reason is false
is a row that gets simplified back into the defect by the next reader. Where that happened the row now
states three things in order: the conclusion, that the original reason was **tested and found false**, and
the reason that actually holds. Rows so corrected: **P-16**, **D-10** (its defect half is closed by an
amendment, not by a measurement), **D-25**, **D-27**, **T-31**, **B-03**, **B-23**, **W-04**, **W-05**,
**W-06**, **W-08**, **W-17**, **W-20**, **W-24**. **W-27** and **W-28** are new and both come from
measurement rather than from a requirement.

**Three platform facts this document asserted were disproved, and they are named here so a reader knows
the class exists rather than meeting them one at a time.** (1) That write-ahead logging is unsupported on
network filesystems and the store therefore opens read-only — false in both clauses (W-04). (2) That
reading the journal mode back is a sufficient check that it was set — the reason is confirmed, the
sufficiency is false, and only a write detects the states that matter (W-04). (3) That the readability
clause of `REQ-SESSION-070` is what forces the stronger durability setting on a terminal save — false; a
separate process using a different binding read a terminal status back immediately at the weaker setting
(W-06). Two further corrections belong to the same class and are in the ADRs rather than here: the
platform single-instance primitive was measured and refused, and the packaging tool's portable-executable
environment variable is unavailable to our own launcher.

**Rows corrected in the SR-1/SR-2/SR-3 pass and unchanged since:** **P-14**, **P-16**, **C-13**,
**C-14**, **E-18**, **E-19**, **U-01**, **U-06**, **U-11**, **U-15**, **U-16**, **U-18**, **U-20**,
**U-21**, and reconciliations 2 and 4.

**Rows the rulings do not bear on at all:** **D-03**, **D-04**, **D-05**, **D-07** (for the stores that
remain files), **D-21**, **D-23**, **D-24**, **M-05**, **M-06**, **G-01** to **G-19**, **I-15**, **V-01**
to **V-14**. Configuration, credentials, the per-user directories, the user's own repository and the
version-control invariants are exactly what the principle keeps as files — and two of them are no longer
architecture positions at all but **stated boundaries in the specification** (**D-30**), so moving either
is an amendment rather than a decision.

Constraints the rulings impose that the specification has **not** carried are recorded separately in
**section 17**, labelled RULING rather than HARD, so a reader can tell the two apart at a glance. That
section is much shorter than it was: most of what it held has landed above. What remains there is what
the specification still does not say.

---
