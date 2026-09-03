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

## IC-2 — the two undesigned themes, and what a screen may not be drawn without

> **CORRECTED AND LARGELY DISCHARGED 2026-09-03.** This entry was written as *"no screen is built before
> the approved visual design reference is available"*, on the belief that the reference did not exist.
> **It does exist, it is in this repository, and it has since 2026-09-01** — `docs/design/`, imported as
> commit `1ad8fee`, carrying the tokens, the type ramp, spacing, radii, elevation, motion, iconography,
> the motif, the copy voice, **27 components** each with a `.jsx`, a `.d.ts` and a `.prompt.md`, twenty
> specimen cards, the self-hosted fonts and the mark, plus a visual mockup. The gate was decided while
> this entry said the opposite. **The error was the manager's and it was corrected the day the owner
> pointed at it.** What was actually missing is much narrower and is stated below.

**Set by:** GD-1, 2026-09-02. **Corrected:** 2026-09-03. **Binds:** the theme mechanism's built-in theme
set, and the drawing of any view. **Discharged by:** the two remaining palettes and the theme metadata
existing, and OQ-30 closing against them.

**What is available and adopted, so nothing waits on it.** `docs/design/README.md` section 2 states the
adoption rule and it is not this file's to restate: **the design language is adopted and authoritative;
the information architecture is not.** Tokens, colour, typography, spacing, radii, elevation, motion, the
component inventory and each component's visual specification, the iconography rules, the motif and the
copy voice are all present, all approved, and all citable by name. **Token names are normative — a screen
cites the token, never a literal colour or pixel value.**

**What a screen's structure comes from, which is not the design.** `docs/spec/` governs which screens
exist, what is on them, how they are grouped, what they are called, what order they appear in and which
tabs they carry — `REQ-SHELL-023` is the single definition of the seven primary views. The design
material's own screen structure was derived outside the clean-room process that produced the
specification, so it is read for craft and never for structure. **Where they disagree the specification
governs, without exception.** Consequently the per-view gaps listed in `docs/design/README.md` §3.2 —
Mission, the Overview body, the Git structure, ten of thirteen Settings categories, the Library tab set,
the auxiliary windows, the shell chrome, the modal surfaces — are **drawing work against an adopted
language and a settled structure**, not material anybody is waiting on. They are a backlog, and a backlog
is not a condition.

**What actually remains, and it is values only the design can supply.**

1. **Two of the three built-in themes have no palette.** `REQ-SHELL-128` fixes the set and the order —
   `rotaris-dim` (default), `nocturne`, `high-contrast` — and the imported language is **one palette**.
   `nocturne` and `high-contrast` are undesigned.
2. **The token set carries no theme metadata.** `REQ-SHELL-129` requires a light/dark flag and seven token
   groups per theme; `REQ-SHELL-133` requires a display label and a one-line description per theme. None
   of the three is declared.
3. **There is no native-surface mapping.** `REQ-SHELL-130` and `REQ-SHELL-160(b)` require native dialogs,
   menus, the text caret and disabled text to follow the theme on every supported platform, and the token
   set says nothing about them.

**What is explicitly not blocked, and this is most of it.** ADR-0050's theme mechanism — themes as data,
corrections computed, contrast asserted from rendered pixels — is independent of which values are present
and was always buildable. So is every component, against the tokens that exist. So is the shell, the rail,
the seven views' structure and each view's contents, all of which the specification fixes. **A view may be
built now against `rotaris-dim` and the adopted language; what it may not do is claim `REQ-SHELL-128`'s
three-theme obligation is met.**

**What must be shown to discharge the remainder.** The two palettes and the metadata exist as token data,
and the six acceptance items in `docs/design/README.md` §5 pass **from rendered pixels on a real display**
rather than from token arithmetic — contrast, native surfaces, focus indication, icon scaling across five
OS scale factors, the rail label fit for "Requirements" at 9 px in every theme, and theme completeness
across a switch. OQ-30 closes against that.

**What this correction cost, and why it is written here rather than fixed silently.** For one day this
register told every reader that no screen could be built and that the material was missing. It was the
broadest block in the record and it was false. It is kept, with its original wording quoted, under the
same rule as every other correction in this record: **a claim that was load-bearing and wrong is more
useful visible than deleted.** It is also the first defect found in this record by the owner rather than
by a measurement.

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

**Discharge, 2026-09-03 — half 1 discharged, half 2 prepared.** The foreign-lock report is shown three ways
(`spikes/machine-identifier-rename.md`): one refusal naming the whole set, the risk stated in the
confirmation, no per-row clearing. The rename experiment is a two-phase harness
(`packages/platform/src/machine-id-rename.spike.test.ts`) the owner runs around a real rename and reboot; IC-4
**stays open on that half** until its figures are recorded in the report.

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

**Discharged 2026-09-03** — `packages/store/src/store.test.ts`, "IC-5": against an artifact in the container
layout, the restored directory holds `workspace.db`, no `manifest.json`, and `origin.txt` naming the project;
the counterfactual (`skipArrange`, D7 as it was) opens, works, and is missing all three. Noted on ADR-0058.

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
  **Taken 2026-09-03 with the session writer** — `spikes/store-schema-and-open-path.md`. It found a
  declared index the planner never used, and it settled the integrity check *off* the startup path.
  `REQ-TRACE-239`'s board remains unmeasured: no board table exists yet.
- **Spike 18** — two run hosts on one store, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit and which no
  spike has measured; spike 21 measured only run-host-against-workspace-service.
  **Taken 2026-09-03** — `spikes/two-writers-one-store.md`. Nothing lost, +12 % at p50, one 258 ms sample.
- **Spike 6** — the Responses dialect through the AI SDK against a non-vendor base URL with custom headers
  (ADR-0027 consequence 2). **Taken 2026-09-03 in its structural half with the adapter** —
  `spikes/responses-dialect.md`: both dialects under one base URL, the credential per request, headers,
  errors and abort all held against a fake `fetch`. **The live half is owed**: no endpoint exists on the build
  machine; the harness is gated on one the owner supplies.
- **The power-loss test** — OQ-12's outstanding half, and now the **sole** stated ground for forcing the
  stronger durability setting on a terminal save. No spike has performed one, and it is the only route to an
  absent store directory that the restore's corrections do not close.

## The permission gate and the first tools — 2026-09-03: no condition bound, none was downgraded

The gate (ADR-0016 to ADR-0019), the evidence rings (ADR-0024), the first eight tools and the terminal
(ADR-0020) were built and run without a condition in this file naming them and without an unstarted spike
named above pricing them. Their first-execution notes are on the ADRs that decided them; ADR-0020's holds
the seventh defect of the pattern this file's decision 3 exists for. What those notes leave owed, stated
here so it is not mistaken for discharged: the export of the four records (`REQ-SESSION-199`, ADR-0024),
the `fetch` executor over ADR-0023's classifier (needs ADR-0036), confinement (ADR-0022, no backend on this
platform), the terminal's live streaming (ADR-0021), and the sizing of ADR-0019's lapse window under load
(OQ-39 — the window is 3,000 ms as a first figure, not a measurement).
