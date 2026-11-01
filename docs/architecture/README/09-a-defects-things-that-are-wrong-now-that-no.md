# Rotaris-crw — system architecture — A. DEFECTS — things that are wrong now, that no measurement will fix, and that a builder would inherit

Part 9 of 13 of [the architecture README](../README.md), which indexes every part.

#### A. DEFECTS — things that are wrong now, that no measurement will fix, and that a builder would inherit

> **DEFECT-CLOSURE ROUND, 2026-09-02. All four build-wrong defects in this list are now closed, and the
> fifth item adjacent to them is closed with them.** What follows records each one where it was raised,
> with the correction beside the measurement, rather than deleting the entry — this record's rule since the
> first mechanism defect was found. **The class is empty: no defect in this list would now cause a
> conformant implementation to be built wrong.** Closed here: **D9** the foreign-host lock row (both halves
> — the root cause in `REQ-SESSION-046` and the restore deadlock in `REQ-SESSION-201`), **D3** the
> unbounded close handshake, **D6** the timestamp granularity, **D7** the container layout becoming the
> store layout, and **D10** the build check that verified nothing. Still open and **not** in the build-wrong
> class: D5, D8, D11 and the two carried-over architecture items at 10 and 11 below.

**A1. The specification side, which is nearly clear, and this pass verified each closure against the
requirement text rather than against any round's own report.** The three defects this section named on
2026-09-02 as the ones that would each cause a conformant implementation to be built wrong are **all
closed at the definition rather than at the dependents, which is what makes them stay closed**:

- **`REQ-STARTUP-145` now states which per-user location is meant** — the location local to this machine
  and not replicated, copied or synchronised to any other machine or any other copy of the user's profile —
  states that it **governs over the platform's own default**, and states that conformance is decided by the
  directories the product actually writes to rather than by which location the platform would have chosen
  unasked. **Checked in the requirement.** That removes the trap in which `app.getPath('userData')`
  resolving under a roaming profile would have put 507.9 MiB per version of launch preparation, plus the
  workspace store and the instance record, into replicated storage.
- **`REQ-TRACE-061` now states a bounded replacement retry ladder** — at most five attempts, delays of
  0.05 / 0.1 / 0.2 / 0.4 s, the last beginning within 0.75 s of the first — declares itself its domain's
  own rather than borrowing `REQ-SESSION-033`'s, and covers every whole-file replacement the domain
  performs. **Checked in the requirement**, including the clause that decides whether a build absorbs the
  measured failure or none of it: the retry **may not be conditioned on the product being able to attribute
  the failure to another process holding the target**, because the 6.2 % first-attempt failure was measured
  with no other opener present at all. **The second site is closed with it**: `REQ-LIBRARY-176` cites the
  ladder rather than stating a third, and `REQ-EVENTS-145`'s one-step-visibility obligation was made the
  product's single statement of what an export write owes a user-chosen destination — without which a build
  could truncate and write in place, never perform a replacement, satisfy every word of the ladder and still
  destroy a user's previous export. **OQ-44 closes.**
- **`REQ-EVENTS-098`'s unsatisfiable sentence is now three separately citable clauses** — blocking
  absolutely forbidden, durably recorded events eventually observable, and **a measurable scheduling cost
  expressly not a violation**. **Checked in the requirement.** A conformance suite written from the literal
  words no longer fails every possible store, and ADR-0009's reading-rather-than-repair note is superseded
  by the requirement itself.

**Everything else this list carried is closed and must not be re-raised**: the two literal strings for one
integration-lock refusal; the two key inventories for the batch trajectory document; `REQ-STARTUP-165`(c)
against (d), where (c) fixes a closed set of two permitted locations, (d) states that placement as its
single exception, and the residual case is bounded away in terms — **which retires ADR-0054's
"specification defect" block**; `REQ-TRACE-089`'s permitted index; the two export requirements that asked
for a statement no store was obliged to make; `REQ-TOOLS-081`'s unresolvable evidence locator;
`REQ-CONFIG-192`'s withdrawn key; `REQ-PROVIDER-063`'s bearer tokens; `REQ-CHAT-055`'s two readings, which
discharges ADR-0045's reservation; `REQ-STARTUP-163`'s directory identity, closing **OQ-49**; and
`REQ-SESSION-069`'s abandoned-write log line. **`REQ-SESSION-201`'s two new defects, found by running it,
are closed by the amendment recorded in
`docs/clean-room/specification-gate.md` *(removed 2026-10-26)* and by the new
`REQ-SESSION-202`.**

**What remains on the specification side is one real gap and a bundle of surface silences.**

1. **A lock row naming another machine makes a workspace's store permanently unrestorable. CLOSED
   2026-09-02, at both ends. It was the last specification defect in the build-wrong class.** Four requirements compose into it and each is individually correct:
   `REQ-SESSION-056` makes a lock naming another machine **live by construction**, `REQ-SESSION-047` never
   reaps it, `REQ-SESSION-201` refuses a restore while any session in the target is live, and
   `REQ-SESSION-183`'s explicit, per-session, user-confirmed release is the only action that clears one.
   **Measured**: the liveness gate refuses, and it keeps refusing. `REQ-SESSION-054` calls such a row "a
   state that should not arise" — but **a machine rename produces it for every lock row at once**, and the
   user must then clear them one at a time before a restore is possible at all. ADR-0005 consequence 11
   drops foreign-host rows on the way **in** from the artifact and nothing drops them from the **target**;
   the ADR now states that non-coverage explicitly and decides no remedy. **The durative refusal added this
   round makes it bite harder, not less** — a wrongly-live lock no longer merely delays a restore, it blocks
   one for its whole duration. *(Spike 22 D9. It is a domain-07 gap and it needs an assigned decision; it is
   the only candidate for a new escalation this round produced and it is not raised as one because the
   remedy may be entirely specification-side.)*
2. **Minor, and listed so nobody re-discovers them.** `REQ-SESSION-062` and `REQ-SHELL-155` still specify
   the repair notice in the singular where a run-host crash produces one stale session per in-flight run
   (**OQ-46**) — left as recorded because it is a surface choice rather than a reading a builder could get
   wrong. Residual **file** language survives in a store that is now rows — `REQ-LIBRARY-048`'s "neither an
   existing *file* nor recorded history", where the phrase is doing semantic work as the discriminator
   between two causes. `REQ-SESSION-201` fixes no behaviour for **cancelling a backup in progress** on a
   store of unbounded size; the mechanism makes cancellation safe by construction, so this is a surface
   question rather than a correctness one, and it is now a **priced** silence — the snapshot measured a
   median 1,077 ms per 41 MB and ESC-19's own survey cites comparable products reaching 700 MB to 2 GB.
   **One residue is added this round**: domain 20's own three export destinations carry
   `REQ-EVENTS-145`'s one-step obligation and **no ladder**, and whether that document should cite
   `REQ-TRACE-061` or state its own is recorded as unsettled in that domain's resolutions.

**A2. The architecture side, and this is where the balance moved.** Seven defects were raised here and
**three of them would have caused a conformant implementation to be built wrong**; *those three, and the
fourth adjacent to them, were closed on 2026-09-02 and are marked below where they were raised — this
sentence read "seven defects are open here" and that count is the round's, not the current state's.* All
seven come from spike 22 — the first execution of `REQ-SESSION-201`'s restore — and are stated with the
measurement rather than the argument, because every one of them survived being read.

3. **THE CLOSE HANDSHAKE HAS NO BOUND AND DOES NOT TERMINATE. CLOSED 2026-09-02.** ADR-0058's step 1 says both
   closes are acknowledged before anything moves and says nothing about their not coming; ADR-0002
   consequence 11 states the capability and states no deadline. **Measured, twice: with the run host deaf,
   and with the run host exited without answering, the workspace service produced no result and no error
   within a 15,000 ms watchdog** — while the application kept running and a window kept painting, so what a
   user sees is a restore that never finishes and never fails. **A bound alone is not the fix**: with a
   2,000 ms bound the service proceeds and the displace rename fails `EPERM`, because the acknowledgement
   is not advice, it is the precondition that makes the rename possible — so the timeout path must
   **refuse**. **The dual state is as bad and was also measured**: kill the workspace service after the run
   host has closed, and the run host stays closed and refuses every launch **for ever**, with the store held
   by nobody and nothing in the sequence that will ever tell it to re-open. ADR-0058's new abandonment step
   releases the run host on a **refusal**; it does not reach either of these. *(D3. What is owed is not only
   that a bound exists but what expiry does.)*
4. **CLOSED 2026-09-02. THE DISPLACED-STORE TIMESTAMP HAD NO STATED GRANULARITY, AND AT SECONDS IT IS A HARD FAILURE OF THE
   FIRST MUTATING STEP. Build-wrong, and it is one word.** ADR-0058 says the store is "renamed with a UTC
   timestamp" and fixes nothing else; **cut to seconds, two displacements inside one second collide and the
   rename fails `EPERM` in 30 of 30.** The corrected reversal's aside-name reuses the same stamp
   deliberately rather than minting a second one, so it inherits whatever this decision lands on — which
   means fixing it once fixes both, and leaving it unfixed leaves both wrong. The recovery ladder uses the
   same name shape. *(D6.)*
5. **CLOSED 2026-09-02. THE ARTIFACT'S CONTAINER LAYOUT BECAME THE STORE'S LAYOUT — measured on every
   successful run.** Step 2 expands the artifact "in full" into staging and the install rename makes staging
   the store. Read literally — and it was implemented literally — the restored store then holds `store.db`
   where the layout block fixes `workspace.db`, and **`manifest.json` sits inside the live store**. The
   harness had to insert an unspecified rename to get past it. Worse and quieter: **`origin.txt` is
   correctly not in the artifact and is therefore absent from every restored store**, and `origin.txt` is
   what ADR-0058 makes the reclamation surface's only way to say which project a store belongs to — so a
   restore silently costs a store the one field OQ-48's surface would identify it by. *(D7.)*
6. **Nothing deletes a leftover staging directory and nothing knows it exists.** In **every** measured
   failure — 30 of 30 on the literal reading, 30 of 30 with a file manager holding the store's own
   directory, 30 of 30 at second-granularity collision, and the timeout case — a full copy of the artifact's
   store was left at `<identifier>.restoring-<n>`. ADR-0058's layout block calls it "transient" and no step
   deletes it. It is the size of the store. **The corrected reversal adds a second such kind**
   (`.obstruction-<stamp>`), so OQ-48 is now owed **five** shapes of leftover where it was owed three, and
   **ADR-0058 consequence 5, which is the consequence that tracks them, was not updated.** *(D5.)*
7. **"Three gates first, all read-only, none of them touching the target" is false at the filesystem
   level.** The liveness gate's read-only open of a write-ahead-logged store creates `workspace.db-shm`
   (32,768 B) and `workspace.db-wal` (0 B) **in the target store directory** — measured before and after.
   The data is unchanged and no row is written, so the *intent* holds; the literal claim does not, and a
   **refused** restore leaves the target directory different from how it found it. *(D8. Harmless to the
   data; a false sentence in a record that is cited for exactly this kind of guarantee.)*
8. **CLOSED 2026-09-02. `electron-rebuild` against the chosen store binding reports success, compiles nothing, and the loader
   would ignore the result if it did. Build-wrong, in the build rather than in the product.** Measured:
   every invocation exited 0 and printed `✔ Rebuild Complete`; **none produced a `.node`**, because the
   package's own `binding.gyp` skips its sources while a prebuild is present; and `lib/binding.js` tries
   `prebuilds/<platform>-<arch>.node` **first**, so a from-source build sitting beside it is never loaded.
   **A build step that reads "rebuild the native store binding against the Electron ABI" and trusts
   `electron-rebuild`'s exit status is verifying nothing.** On this version it is harmless because the
   binding is Node-API and the prebuild is the right binary — but that is luck, not the check working, and
   it is the precise shape of swallowed failure ADR-0058 says must never be swallowed. *(D10. It makes
   ADR-0056's build-time load proof the only thing standing between the record and an unloadable store
   binding — see category C.)*
9. **The `.displaced-` suffix can make the kept store unreadable, and the kept store is the whole point.**
   The suffix costs **+35 characters**; the store binding throws `unable to open database file` on any
   statement at an absolute database path of 252–259 characters and on open at ≥ 260, **while Node's own
   filesystem calls worked at 328** and `LongPathsEnabled` is `1` on the measuring machine — the registry
   opt-in does not reach the store engine. Measured band: a live store at 230–251 characters works
   perfectly and **its displaced copy cannot afterwards be opened by the product at all**; the rename itself
   always succeeds. **Not reachable in the shipped location** (96 characters, fixed-length by construction);
   reachable with a long account name, a redirected profile or a junctioned per-user directory. *(D11. Also
   corrects ADR-0058 consequence 13, which names the right hazard and points at the deepest path when the
   limit bites at the **shallowest** one, `workspace.db`, because it is the engine and not the filesystem
   that refuses.)*
10. **Architecture's own, carried over and unchanged: the store must resolve to one canonical path
    spelling.** Two processes reaching one store by two spellings of one path silently destroy each other's
    writes — measured, on one machine, with a clean integrity check and no error anywhere. ADR-0058
    prevented it by construction and, in the spike's own words, "by accident, not by stated intent". It is
    now rule 6 of that record and constraint **W-27**. **It needs a conformance test that opens one store
    two ways and asserts the product refuses**, because its violation is silent and there is no repair to
    offer, since there is no error to detect.
11. **Architecture's own, carried over and unchanged: `REQ-STARTUP-164` licenses two processes existing
    "briefly" and nothing bounds "briefly".** Nothing makes a reclaimed-from process stand down, so a wedged
    primary that later recovers still believes it is the instance. ADR-0055 states a design rule — the
    recovered process must re-read the record and stop behaving as the instance where the record names
    another — and that rule has **no measurement behind it**. Low confidence, recorded rather than asserted;
    whether the requirement should say so is the specification's call.

**Eleven entries. Two are the specification's, seven are architecture defects the restore measurement
found, and two are architecture rules the record owes a test or a measurement.** None of the eleven is
blocked on a measurement, and **none of them was visible to any reading of the records that contain them.**
**Four would have caused a conformant implementation to be built wrong** — items 1, 3, 4 and 5 — and
**item 8 would have caused a build to certify something it never checked**, which is a different and
quieter failure. *All five are closed as of 2026-09-02; the counts in this paragraph are the round's
findings, kept because the closures below are only readable against them.* Items 6, 7, 9, 10 and 11 are
real, are **not** in that class, and **are still open**: D5, D8, D11 and the two carried-over architecture
rules are what category A actually holds today.

**A3. How each build-wrong defect was closed, 2026-09-02.** Each entry above keeps its measurement; this
says what changed and where, so the two can be read against each other. **None of these is re-measured
yet**, which is the whole content of IC-1 in [`implementation-conditions.md`](../implementation-conditions.md)
and of the four-for-four finding below.

- **D9, item 1 — closed at the root and at the deadlock, because either alone leaves the defect.**
  `REQ-SESSION-046` now fixes **what supplies `host`**: an identifier the product mints once for this
  machine and keeps where the store lives, never the operating-system name or anything a user or
  administrator can change, and **renaming a machine must not change it**. That removes the mass case
  entirely — the field was described as "stable" and left unsourced, and the obvious source is the one
  thing that is not. `REQ-SESSION-054`'s inference that a foreign host is evidence of a store reachable
  from two machines is sound only under that fix, and now says so. Separately, `REQ-SESSION-201` no longer
  lets such a row block recovery: the refusal exists to stop contention with a run that is **writing**, and
  a lock naming another machine is not one on this machine. Those rows are reported **together, as one
  condition**, and the user may confirm and proceed — never per-session clearing as a precondition, and
  never a bare refusal. **The confirmation states the risk and not only the condition**: if the store
  genuinely is reachable elsewhere, a run there may be writing now. The deadlock was that the recovery
  action for a broken store was blocked by exactly the records it was about to replace.
- **D3, item 3 — closed as a bound, an expiry semantic, and a lease, and the second of those is the part
  that is not obvious.** ADR-0058 gains steps 3a and 3b. The acknowledgement is bounded at **2,000 ms**,
  and **expiry takes the abandonment path**: an unanswered close is indistinguishable from a run host still
  writing and is treated as one. A bound that proceeds on expiry was measured to fail at the rename
  instead — later, after mutation, in the one place the mechanism has no good failure. The dual state is
  closed by making step 1's refusal a **lease the run host expires by itself** at 30,000 ms, renewed while
  a restore is genuinely running; a workspace service that has died then releases the workspace by doing
  nothing, which is the only behaviour available to a process that is gone. ADR-0002 consequence 11 now
  states all three obligations from its own side rather than having them carried by ADR-0058 alone.
- **D6, item 4 — closed as granularity plus a claim, because granularity alone is not a guarantee.**
  The stamp is milliseconds, and the name is taken by an **exclusive create** that fails if it is already
  there, with a decimal counter appended and retried on collision. A name assumed unique is not unique.
  Fixed once and inherited by the recovery ladder's displaced store and the reversal's `.obstruction-`
  aside, both of which reuse the same shape deliberately.
- **D7, item 5 — closed by making the conversion a step instead of an assumption.** The container's layout
  is the container's and the store's is this record's; staging is arranged into the store layout **before**
  the install rename, and the manifest stays outside the store. The measured harness had to insert exactly
  this conversion to proceed, which is the plainest evidence the record was missing one. **`origin.txt` is
  now written by the restore** (step 9a) — correctly absent from the artifact, absent from every restored
  store, and the reclamation surface's only way to say which project a store belongs to. A restore that
  produced a store the reclamation surface cannot describe was producing an orphan on the recovery path.
- **D10, item 8 — closed by discharging the obligation against the artifact rather than against the
  command.** ADR-0056 rule 1 gains 1a: the rebuild's exit status is not evidence anything was rebuilt. The
  build establishes that a compiled binary exists, is newer than the rebuild step, and **is the file the
  loader actually resolves** — the last confirmed by rule 4's load. Rule 4 was written as one check among
  several and is now the entire check, which is why it is also part of IC-3.

**What this leaves in category A.** D5 (nothing deletes or knows about the leftover staging copy, now two
leftover kinds), D8 (the three gates are not read-only at the filesystem level — the liveness gate creates
`-shm` and `-wal` in the target, so a refused restore leaves the target changed), D11 (the `.displaced-`
suffix's +35 characters against the store engine's path thresholds, not reachable at the shipped location),
and the two carried-over architecture items at 10 and 11. **None is in the build-wrong class**, and each is
stated above with what it costs. *(Since 2026-10-13/14: D8 and D11 are repaired, and D5's staging half is repaired
under [OQ-265](../../archive/architecture/open-questions/57-spikes-and-later-questions-24.md#oq-265)'s ruling; its obstruction half stays deferred with OQ-48 — ADR-0058 consequence 18.)*
