# Conditions that bind at implementation time

Created 2026-09-02 by owner ruling GD-3. **Extended 2026-09-03 by the Architecture Gate**, which added
IC-4, IC-5 and IC-6 under its decision 2 and recorded its decision 3 at the end of this file.

This file holds obligations that are **not** conditions of the Architecture Gate but **are** conditions on
building the thing they name. It exists because the alternative to holding a whole gate for one mechanism's
measurement is not "trust the reasoning" — it is "bind the measurement to the mechanism". Without somewhere
to write that down, deciding an obligation is an implementation-time condition is indistinguishable from
deciding it is nothing.

**How an entry here binds.** The work it names may not be reported as complete until its condition is
discharged. Discharging a condition means recording the result where the entry says, in the record, whether
or not it passed — a condition that quietly disappears has not been discharged. Nothing here may be
downgraded by the person doing the work; a condition is removed by the same authority that set it.

**How an entry gets here.** Someone with the authority to set a gate condition decides that an obligation
binds the mechanism rather than the gate. The entry names what must be shown, what would count as showing
it, and where the result goes.

---

## IC-1 — the corrected restore is re-measured before its implementation is signed off

> **DISCHARGED 2026-09-02.** Run as `../spikes/corrected-restore-rerun.md`. **All five experiments pass and
> every counterfactual reproduces the original defect**: the second liveness evaluation caught the raced run
> 30 of 30 and removing it destroyed the session 10 of 10; displace-then-rename returned the target
> byte-identical 30 of 30 where the single-rename reversal reached the forbidden empty-store-directory state
> 10 of 10; the bound refused in 2,008–2,020 ms where the unbounded handshake had returned nothing inside
> 15,000 ms; the lease re-admitted runs 10 of 10 where the state had persisted for the life of the instance;
> and the aside-name's counter was needed in 30 of 30 forced collisions, where the pre-correction name lost a
> displaced store 30 of 30. Two wording refinements are owed to ADR-0058 and are applied. **The condition is
> met; the entry is kept rather than deleted, because what it required is now evidence.**


**Set by:** GD-3, 2026-09-02. **Binds:** the first implementation of the store restore of ADR-0058 and
`REQ-SESSION-201`. **Discharged into:** a dated spike report in `docs/architecture/spikes/`, and a note on
ADR-0058.

**Why it exists.** Spike 22 built ADR-0058's restore for the first time and it failed in 30 of 30 attempts,
destroyed a live session, and had a reversal that failed in exactly the case it exists for. Those three
defects are now corrected — **on paper**, which is precisely the state ADR-0058 consequence 17 records as
not being evidence. Three mechanisms in this record have gone from paper to first execution and all three
held a defect no reading had caught. The corrections have not been run.

**What must be shown.** Two experiments, both narrow, and both aimed at the corrections rather than at the
mechanism generally:

1. **The window is closed.** Launch a run into the interval between the refusal of new runs being put in
   force and the run host's acknowledgement of it, and confirm the second liveness evaluation refuses the
   restore, that the run continues, and that its session and every row it wrote survive intact. This is the
   defect that destroyed a session at twenty rows a second in the measured run, so the counterfactual is
   already known: without the correction, the session and all its rows are gone.
2. **The reversal survives the case it exists for.** Force the install rename to fail with the target name
   occupied — the case where the original reversal failed with the identical error — and confirm
   displace-then-rename returns the target store byte-identical to its state before the restore began, and
   that no store directory exists holding no database.

**What would count as failing it.** Either experiment producing a result the corrected ADR-0058 does not
predict. A run that cannot be raced into the window is not a pass; it is an inconclusive result and the
harness needs fixing, because the unmodified mechanism admitted one on the first attempt.

**What it does not cover.** The eight defects spike 22 found and did not correct (D3, D5, D6, D7, D8, D9,
D10, D11) are open items in their own right and are not discharged by this condition.

---

## IC-2 — no screen is built before the approved visual design reference is available

**Set by:** GD-1, 2026-09-02. **Binds:** the construction of any of the seven primary views, the benchmark
card, and the diagnostics view. **Discharged by:** the reference being approved and available, and OQ-30
being closed against it.

**Why it exists.** GD-1 ruled that the reference does not block the Architecture Gate, because every
mechanism in the record was shown to be independent of it. The same paragraph of `open-questions.md` that
establishes that independence also states the other half: **no screen can be built without it**. Recording
only the half that unblocks the gate would be reading the finding selectively.

**What is still owed from the reference**, beyond OQ-30's theme palettes and token values: the information
architecture inside each of the seven primary views; the visual form of the benchmark card and the
diagnostics view, both of which have specified content and specified budgets and no specified layout; and
the glyph vocabulary that `REQ-SHELL-149`'s no-state-by-colour-alone rule requires to exist.

**What is explicitly not blocked.** Everything the record settles about mechanism — process topology, where
state lives, what crosses a boundary, what paints a row, the recycler, theme application as data. ADR-0050's
theme mechanism in particular is buildable and testable with placeholder values, because it computes
corrections and asserts contrast from rendered pixels rather than depending on which values are present.

**What is no longer blocked by the reference.** OQ-31, the Markdown dialect, was ruled without it by GD-1.

---

## IC-3 — the Linux and macOS build-host obligations, deferred to hardware

**Set by:** GD-5, 2026-09-02. **Binds:** any release artifact for Linux or macOS, and the store binding's
acceptance on any platform. **Discharged into:** dated spike reports and a note on the ADR each obligation
belongs to.

**Why it is here rather than in the gate verdict.** These four cannot be closed on the machine this record
was produced on. Deferring them to a machine that exists is a scheduling fact; leaving them in a verdict
category is how an obligation becomes a paragraph nobody owns. They remain owed and none of them is smaller
for being written here.

1. **Spike 12 — the Linux artifact's runtime on a host that has never had the legacy FUSE library
   installed.** Decides which of ESC-11's two applied options the release takes. The measurement's whole
   content is the never-had-it condition, which a machine cannot reach by uninstalling.
2. **Spike 17's macOS and Linux platform keys.** `REQ-STARTUP-155` binds all four artifacts; two were built.
3. **ADR-0056's build-time load proof on all three release runners.** This one grew rather than waited. It
   was always the only check that catches an unloadable store binding, and defect D10 established that the
   rebuild it confirms **exits 0 while compiling nothing**, and that the binding's loader prefers a prebuilt
   binary over anything built beside it. Rule 4 is now the entire check rather than one of several, and it
   must be shown constructible on each runner rather than assumed.
4. **The instance claim on macOS and Linux.** SR-1 made this entirely ours on three platforms and it is
   measured on one. `REQ-STARTUP-156`'s release gate does not require launching the entry point twice on one
   user account, which is the check that would catch a failure.

**What deferral is not.** It is not a judgement that these will pass. Every one of them is in the class of
things this record has never executed, and every mechanism this record has taken from paper to first
execution has held a defect no reading caught — three for three. **An implementation that reaches a Linux or
macOS artifact before this condition is discharged is shipping on an untested platform.**

---

## IC-4 — the foreign-host lock row's fix is measured before the restore is signed off

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first implementation of
`REQ-SESSION-046`'s machine identifier and of `REQ-SESSION-201`'s foreign-lock report.
**Discharged into:** a dated spike report in `docs/architecture/spikes/`, and a note on ADR-0058.

**Why it exists.** D9 was the last specification defect in the build-wrong class and it was closed at both
ends on argument. **Spike 22 measured the defect; nothing has measured the fix.** The two halves fail
differently and neither covers the other, so both are named:

1. **The root cause.** `REQ-SESSION-046` now requires `host` to be an identifier the product mints once for
   this machine and keeps machine-locally — never the operating-system name, never anything a user or an
   administrator can change — and **renaming a machine must not change it**. The whole defect was that the
   field was described as stable and left unsourced, and the obvious source is the one thing that is not.
2. **The deadlock.** `REQ-SESSION-201` no longer lets a lock row naming another machine block recovery.
   Such rows are reported **together, as one condition**, and the user may confirm and proceed on a
   confirmation that **states the risk** — never per-session clearing as a precondition, never a bare
   refusal.

**What must be shown.** Rename the machine — actually rename it, not simulate the rename — with a store
holding lock rows, and confirm that `host` is unchanged, that no row becomes foreign, and that a restore
proceeds without any release action by the user. Separately, with a genuinely foreign row present, confirm
the restore reports the whole set as one condition, that the confirmation states the risk rather than only
the condition, and that proceeding does not require clearing rows one at a time.

**What would count as failing it.** `host` moving for any reason a rename can cause. A report that names
sessions individually as things to clear. A confirmation that states the condition without the risk — that
if the store genuinely is reachable elsewhere, a run there may be writing now.

**What it does not cover.** Whether two machines can reach one store at all, which is ESC-21's second
premise and is owed separately.

---

## IC-5 — the artifact-layout conversion is tested by something aimed at it

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first implementation of ADR-0058's
restore steps 6, 9 and 9a. **Discharged into:** a dated spike report or a conformance test, and a note on
ADR-0058.

**Why it exists.** D7's correction — staging is *arranged into the store's layout* before the install
rename, the manifest stays outside the store, and `origin.txt` is written by the restore — **ran on every
successful path of IC-1 and never failed.** That is not a test of it. It is the weakest evidence in the set
and the spike report says so in its own section 7. The failure mode is quiet in exactly the way the original
was: a restored store that opens, works, and is missing the one field the reclamation surface identifies it
by.

**What must be shown.** After a restore, the store directory holds the layout this record fixes and not the
container's: the database under the name the layout block fixes, no `manifest.json` inside the live store,
and **`origin.txt` present and naming the right project**. Show it against an artifact whose container
layout differs from the store layout, because an artifact that already matches tests nothing.

**What would count as failing it.** Any of the three absent or wrong. A restored store the reclamation
surface cannot describe is an orphan produced on the recovery path.

---

## IC-6 — the build rule that replaced a command's exit status is shown to catch what the command hid

**Set by:** the Architecture Gate, decision 2, 2026-09-03. **Binds:** the first construction of ADR-0056's
build. **Discharged into:** a note on ADR-0056 and, for the per-runner half, IC-3 item 3.

**Why it exists.** D10 measured that `electron-rebuild` **exits 0, prints `✔ Rebuild Complete`, and produces
no `.node`**, and that the binding's loader prefers a shipped prebuild over anything built beside it.
ADR-0056 rule 1a therefore makes the *artifact* the evidence rather than the command, and rule 4's load is
now the entire check. **The rule has never been run.** It closed a defect on argument, and the defect it
closed was itself a check that reported success without checking anything — which is the one shape a builder
must not take on trust twice.

**What must be shown, and it can be shown on the machine this record was produced on.** Construct the
condition D10 measured — a rebuild that exits 0 and compiles nothing — and confirm the build **fails**:
that rule 1a finds no binary newer than the rebuild step, and that rule 4's load resolves and loads the file
the loader actually reaches rather than one sitting beside it. A rule that passes only when everything is
already fine has not been demonstrated.

**What would count as failing it.** The build passing under D10's measured condition. That is the original
defect with an extra step.

**What it does not cover.** Whether the rule is constructible on the macOS and Linux release runners, which
is IC-3 item 3 and is deferred to hardware by GD-5.

---

## How the unstarted spikes bind — the Architecture Gate's ruling on decision 3, 2026-09-03

**No unstarted spike is a condition of anything by itself, and none is a gate condition.** Eleven numbered
spikes have never been started and four sub-cases are owed; each one **prices a decision that has already
been taken** rather than blocking one. The ruling is that **a spike is taken as the first act of building
the thing it prices**, and its result goes into the record that made the decision — whether or not it
passes, and whether or not it found anything.

Taking them up front delays every decision they price and measures nothing that is being built yet. Leaving
them to judgement is how a measurement becomes a paragraph nobody owns; the difference between the two is
this paragraph.

**Three are named because a build reaches them first and cannot honestly proceed past them**, and naming
them is not promoting them to conditions:

- **Spike 8** — store query latency against **declared** indexes, plus store open, log recovery, an
  integrity check on the startup path, long-path behaviour, and the cost of `REQ-EVENTS-179`'s write probe.
  Spike 21 measured a schema with no indexes beyond two primary keys and one listing index, so
  `REQ-SESSION-042`'s listing budget and `REQ-TRACE-239`'s board budget are unmeasured against anything real.
- **Spike 18** — two run hosts on one store, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit and which no
  spike has measured; spike 21 measured only run-host-against-workspace-service.
- **The power-loss test** — OQ-12's outstanding half, and now the **sole** stated ground for forcing the
  stronger durability setting on a terminal save. No spike has performed one, and it is the only route to an
  absent store directory that the restore's corrections do not close.
