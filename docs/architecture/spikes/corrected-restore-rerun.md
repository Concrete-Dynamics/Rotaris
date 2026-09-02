# Spike — the corrected restore, re-run (IC-1)

- **Date:** 2026-09-02
- **Discharges:** `implementation-conditions.md` **IC-1**, set by owner ruling GD-3.
- **Host:** Windows 11 Pro 10.0.26200, Node v24.11.0, `better-sqlite3` as spike 22 used it.
- **Under test:** ADR-0058's restore **as corrected on 2026-09-02** — steps 1, 2, 3, 3a, 3b, 4, 4a, 5, 6, 7,
  8, 9, 9a and the R1/R2 reversal — against the three defects spike 22 found and this record fixed on
  paper.
- **Harness:** `…\scratchpad\spike-22`, extending the spike 22 model. New files: `restore2.js` (the
  corrected mechanism), `proc-runhost2.js` (the run host with step 1's refusal, step 4a's release and step
  3b's lease), `M-ic1.js`, `M-ic1b.js`. Raw JSON in `out\ic1.json` and `out\ic1b.json`.

**Verdict: all five experiments pass, and each counterfactual reproduces the original defect.** The three
corrections do what the record says they do. Two refinements to the record's wording are owed and are given
in section 6. Nothing found here reopens a decision.

---

## 1. What was measured, and what "the window" means

The corrections could not be checked by reading, which is the whole reason IC-1 exists. Two of the three
turn on **when** something happens relative to something else, so the harness has to place a run inside a
window that the record says exists. That window is made of three intervals, each of which is real in the
product and none of which the record puts a number on:

| Interval | Modelled as | Why it exists |
|---|---|---|
| the refusal of new runs is instructed → the run host acts on it | 150 ms | step 1's instruction crosses a process boundary and is queued behind whatever the run host is doing |
| a launch is admitted → that run holds its lock and is writing | 160 ms | admission and lock acquisition are not the same instant |
| the close is asked for → the run host has unwound and answers | 200 ms | the run host has to stop its writers before it can answer |

**The widths are chosen; the intervals are not.** A reader should treat the widths as a way of making a
race observable on purpose rather than as a measurement of the product. What the experiment establishes is
that **when a run lands in that position, the second liveness evaluation catches it** — not how often a run
lands there.

---

## 2. E1 — a run raced into the window, against the second liveness evaluation

The launch is admitted at t≈40 ms, before the refusal bites at t≈150 ms. Its lock row appears at t≈200 ms,
**after** the first liveness evaluation has already passed and **before** the close acknowledges at
t≈352 ms. That is the exact position of the run spike 22 measured being destroyed.

| | 30 reps |
|---|---|
| the raced run was admitted in the window | **30 / 30** |
| the **first** liveness evaluation passed — it saw no lock | **30 / 30** |
| the **second** liveness evaluation caught it | **30 / 30** |
| the restore abandoned | **30 / 30** |
| the sessions already in the store are unchanged | **30 / 30** |
| no displaced store and no staging copy left beside the target | **30 / 30** |
| the raced session **and its rows** survived | **30 / 30** |
| the run host was released and accepts runs again | **30 / 30** |
| the run host re-opened the store | **30 / 30** |

The second evaluation costs **0.23 / 0.42 / 1.27 ms** (min / median / max), against 0.25 / 0.39 / 0.89 ms
for the first. The whole refused action ran 366–399 ms, which is the injected window plus the work.

**The counterfactual, which is what makes this evidence rather than a demonstration.** The same race against
the mechanism with **one** liveness evaluation — step 4 removed, everything else identical:

| | 10 reps |
|---|---|
| the restore completed | **10 / 10** |
| the raced session and every row it wrote were **destroyed** | **10 / 10** |

Destroyed exactly: `sessions` row count 0, `transcript` row count 0, for a session that existed and was
being written to seconds earlier. **The second evaluation is doing the work, and removing it reproduces the
original defect on the first attempt.**

A note on what the raced run had written: 2 rows at the point the close reached it. Small because the
injected window is short. The measurement that matters is that the rows survived, not how many there were.

---

## 3. E2 — the install rename forced to fail on an occupied name

The failure family in which the pre-correction reversal failed with the identical error.

| | 30 reps |
|---|---|
| the install rename failed as forced (`EPERM`) | **30 / 30** |
| R1 displaced the obstruction | **30 / 30** |
| R2 renamed the store back | **30 / 30** |
| the target store is **byte-identical** to its state before the restore | **30 / 30** |
| the target store re-opens | **30 / 30** |
| a store directory holding no database was reached | **0 / 30** |

Displacement costs 3.15 / 3.63 / 3.75 ms and the install rename 3.00 / 3.08 / 3.85 ms, both flat as spike
22 measured. The whole reversal is 6.43 / 6.91 / 7.36 ms.

**The counterfactual**, the single-rename reversal against the same forced failure:

| | 10 reps |
|---|---|
| the reversal failed, with `EPERM` — the same error as the step it was undoing | **10 / 10** |
| a **store directory holding no database** was reached and persisted | **10 / 10** |
| the error text named both directory paths, so a person could finish the rename | **10 / 10** |

The forbidden end state ADR-0058 names as testable is reached in 10 of 10 without the correction and 0 of
30 with it.

---

## 4. E3 — the bound, and the lease

**E3a, an unanswered close.** The run host acknowledges the refusal and then ignores the close entirely.

| | 10 reps |
|---|---|
| the restore terminated rather than hanging | **10 / 10** |
| it **refused** rather than proceeding | **10 / 10** |
| the target store is byte-identical | **10 / 10** |
| a staging copy was left behind | **0 / 10** |

Elapsed 2,008–2,020 ms against the 2,000 ms bound. Against spike 22's measurement of the same condition —
no result and no error inside a 15,000 ms watchdog — this is the defect closed.

The release reported `reopened: false`, correctly: this run host never closed its store, so there was
nothing to re-open. The release is not blindly re-opening whatever it finds.

**E3b, the lease.** The run host is told to refuse, closes its store, and the workspace service then dies
with nothing left to release it.

| | 10 reps |
|---|---|
| a launch was refused while the lease held | **10 / 10** |
| a launch was **accepted** once the lease expired | **10 / 10** |
| the run host re-opened the store by itself on expiry | **10 / 10** |

Spike 22 measured this state persisting for the life of the instance. The lease is the exit.

---

## 5. E4 — D6, the aside-name under a forced stamp collision

Part a never exercised this: at millisecond granularity R1 needed one attempt in all 30 reps, so the
counter was never reached. **A correction that is never exercised is not measured**, so the stamp was forced
to collide.

| | corrected: milliseconds **and** a counter, 30 reps |
|---|---|
| the first displacement succeeded | **30 / 30** |
| the second displacement succeeded | **30 / 30** |
| the second **needed the counter** | **30 / 30** |
| both displaced stores were kept, distinguishable and openable | **30 / 30** |

| | pre-correction: second granularity, bare rename, no counter, 30 reps |
|---|---|
| the second displacement failed, `EPERM` | **30 / 30** |
| a displaced store was lost | **30 / 30** |

**This settles which half of the D6 correction is load-bearing.** Granularity alone is not: a bare rename to
a colliding name fails whatever the resolution, and finer resolution only makes the collision rarer.
The counter is what makes the name safe, and it was needed in every forced collision.

---

## 6. Two refinements the record is owed

**(a) On this platform the rename *is* the exclusive claim, and ADR-0058 should say so.** The corrected text
says the aside-name is "claimed by an exclusive create". No separate create is needed or was used: a
directory cannot be renamed onto an existing directory here, so the rename itself fails on a taken name
rather than merging into it. The property the record wants — a name assumed unique is not unique — is
delivered by the rename plus the counter. Stating it as a create invites an implementation to add a
create-then-rename pair with a gap between them, which is a race the single rename does not have.

**(b) The corrected reversal leaves two leftovers, not one, and both were observed.** Every E2 rep ended
with `<identifier>.obstruction-<stamp>` **and** `<identifier>.restoring-1` beside the store. The obstruction
is intended and ADR-0058 says it is kept. The staging copy is **defect D5**, still open, still the size of
the store, and this confirms it on the corrected path as well as the original one.

---

## 7. What this spike does not establish

- **It is a model, not the product.** Same store engine, same platform, same rename semantics; not the same
  process topology, and the intervals in section 1 are injected rather than measured.
- **The window's width is chosen.** How often a real launch lands between the two evaluations is not
  measured and is not measurable without the product.
- **Nothing here tests D5, D7's `origin.txt` beyond its presence, D8, D9, D10 or D11.** D7's layout
  conversion and `origin.txt` write run on every successful path and neither failed, which is weaker than a
  test of them.
- **No power-loss case.** Still owed, by this spike as by spike 22.

---

## 8. The finding about the harness, which belongs in the record

**The measuring instrument had three defects on its first run, and the pattern that produced them is the one
this record has been tracking.** The first version of `M-ic1.js` reported the second liveness evaluation
firing 0 times in 3, and every one of the three reasons was a defect in the measurement rather than in the
mechanism:

1. **The race landed in the wrong window.** The harness let the raced run take its lock before the first
   liveness evaluation, so the *first* evaluation caught it and the second never ran. The experiment would
   have been reported as a pass while testing nothing it claimed to test — the most dangerous kind of green.
2. **The "byte-identical" test counted files that are not the store's content.** Any open connection
   creates `workspace.db-wal` and `-shm` in the store directory, so the target hashed differently before and
   after for a reason that had nothing to do with the restore. **That is defect D8 arriving uninvited in a
   measurement built for something else**, and it is the second time a spike has met D8 without looking for
   it.
3. **The assertion was wrong for the case it was asserting.** E1's whole point is that a live run keeps
   writing, so requiring the store to be byte-identical afterwards was requiring the run to have been
   stopped. It was replaced by the honest test: the sessions that were already there are unchanged, and no
   leftover of a swap exists.

Recorded because ADR-0058 consequence 17 is about mechanisms that were argued and not run, and **a harness
is a mechanism.** Three of three became four of four, and the fourth was written by someone who had just
finished writing the other three up.
