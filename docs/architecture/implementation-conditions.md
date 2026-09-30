# Conditions that bind at implementation time

Created 2026-09-02 by owner ruling GD-3. **Extended 2026-09-03 by the Architecture Gate**, which added
IC-4, IC-5 and IC-6 under its decision 2 and recorded its decision 3 at the end of this file. **IC-7 was proposed
2026-09-06 by ADR-0035's first execution and adopted by the owner the same day (ESC-32, option 2)**; it stayed on the
release until both halves of that option were shown, and **the second half was shown on 2026-09-27** by the notices
generator's first execution (see its entry).

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

> **DISCHARGED 2026-09-04.** `spikes/theme-proof.md` records the built token data, the live preference and
> native-theme path, and fifteen rendered-pixel runs: all three themes at scale factors 1, 1.25, 1.5, 1.75
> and 2. Every run passed contrast, native-surface mapping, inset focus indication, vector-icon scaling,
> the 9 px “Requirements” label fit and theme completeness across a switch. Both counterfactuals exited
> non-zero at their named item. One active display was attached, so the different-scale multi-monitor drag
> remains the owner measurement; macOS and Linux remain IC-3. **The condition is met and this entry remains
> as evidence of both its original false breadth and its narrow discharged remainder.**

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

> **DISCHARGED 2026-09-04.** Run as `../spikes/native-load-proof.md`, the first packaging of the product.
> **Under D10's condition the build fails at rule 1a** — the rebuild ran 138 s, exited 0, compiled nothing,
> and the build was refused for want of a binary newer than the rebuild marker. **With a prebuild in the
> loader's path the build fails at rule 4**, the packaged Electron's own `dlopen` naming
> `better-sqlite3/prebuilds/win32-x64.node` as the file it opened. The straight build passes both, the
> installer is produced, and the packaged application opens a store at schema v5 in a real utility process
> and settles a terminal call through the compiled bindings. Ten runs, six findings, one of them the ninth
> defect of the pattern: the first packaged window was blank. **The per-runner half is IC-3 item 3 and
> stays with the hardware.** Kept rather than deleted, because what it required is now evidence.

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
  **Taken 2026-09-04 in its harness half** — `spikes/power-loss.md`: the writer, the process-death baseline
  (ten of ten lost nothing at `NORMAL`), the verifier and its dry run (ten of ten detected a truncated tail
  exactly). **The fault half awaits the owner** — a forced power-off or a kernel crash on this machine, the
  steps and the empty table in the report's section 4. Two harness defects on first execution, in the
  report's section 6; nothing in the product.

  *Updated 2026-09-13, with OQ-12's wording closure.* The **specification** half of OQ-12 is applied:
  `REQ-SESSION-034` now defines durability in three levels — process-crash atomicity for every successful
  write, operating-system and power-loss survival for an acknowledged terminal commit and a completed backup
  artifact subject to the device honouring flushes, and a stated permitted loss of intermediate updates — and
  `REQ-LIBRARY-043` and `REQ-LIBRARY-138` cite which level they mean instead of implying one. **That changed
  nothing about this debt.** The two figures the test decides are unmeasured, the ground for forcing the
  stronger setting is unchanged, and the wording explicitly records the measurement as outstanding rather
  than resolving it by definition. The proof is tracked **per supported platform**: on Windows it is owed and
  needs the owner's physical act; on Linux and macOS it cannot be attempted at all while **IC-3** stands, so
  those two are recorded as blocked rather than owed. This entry closes only when the table is filled.

## The permission gate and the first tools — 2026-09-03: no condition bound, none was downgraded

The gate (ADR-0016 to ADR-0019), the evidence rings (ADR-0024), the first eight tools and the terminal
(ADR-0020) were built and run without a condition in this file naming them and without an unstarted spike
named above pricing them. Their first-execution notes are on the ADRs that decided them; ADR-0020's holds
the seventh defect of the pattern this file's decision 3 exists for. What those notes leave owed, stated
here so it is not mistaken for discharged: the export of the four records (`REQ-SESSION-199`, ADR-0024),
the `fetch` executor over ADR-0023's classifier (needs ADR-0036), confinement (ADR-0022, no backend on this
platform), the terminal's live streaming (ADR-0021), and the sizing of ADR-0019's lapse window under load
(OQ-39 — the window is 3,000 ms as a first figure, not a measurement).

## Children and the scheduler — 2026-09-03: no condition bound; one route found missing

ADR-0012 was built and run without a condition naming it and without an unstarted spike pricing it. Its
first-execution note holds the slot-cap reading (a slot is held from the claim) and one finding: REQ-ORCH-053's
settle-on-continue sweep has no route in the product until the `continue`/`resume` controls land, because every
prompt mints a new session. Owed and stated: the loop supervisor, the fallback-model and rate-limit paths, the
artifact payload items, REQ-ORCH-030's per-item attempt limit, and the persisted `runtime.*` keys and personas
(ADR-0036).

## Lifecycle hooks — 2026-09-03/04: no condition bound; the eighth defect sat in a mechanism built earlier

ADR-0015 was built and run without a condition naming it and without an unstarted spike pricing it, with the
first slice of ADR-0036's loader beneath it. Its first-execution note holds the Windows cost of "kill the
started process only" (`cmd.exe` is never the command; a timeout always spends the 5 s grace) and the
REQ-HOOKS-013 consequence a reviewer will read as a bug. The eighth defect of decision 3's pattern was found by
it and not in it: kernel's redaction pass (ADR-0007) was quadratic and had never run at size. Owed and stated:
worktree working directories, `verifier_finished`, REQ-HOOKS-082 with checkpoints, ADR-0049's single notice
slot losing the advisory, the benchmark harness for REQ-HOOKS-139.

## Intent classification and the playbooks — 2026-09-04: no condition bound; found nothing

REQ-ORCH-005..027 were built and run without a condition naming them and without an unstarted spike pricing
them; the first-execution notes are on ADR-0016 (the bundle by facet), ADR-0026 (structured output on the
port), ADR-0012 (the BUDGET clamp) and ADR-0036 (two readers). Every mechanism ran clean against the scripted
client: the four fallback arms, the ladder's degradation to text, the grant, the override, the clamp. What that
leaves owed, stated so it is not mistaken for discharged: the classifier against a real provider (the
rejection heuristic of REQ-ORCH-010 has met none); REQ-ORCH-012/013 in the product, which need a resumed
session (the same missing `continue` route as REQ-ORCH-053); the three model slots and the tier, still
environment stopgaps; plan mode (REQ-ORCH-152..154), which reads the intent and is not built.

## The build's load proof — 2026-09-04: IC-6 discharged; the ninth defect was in the renderer

ADR-0056's packaging ran for the first time under IC-6 and the condition is discharged above. Both
counterfactuals refuse at the named rule. What the run found is on ADR-0056's second execution note — the
ninth defect of decision 3's pattern was a blank packaged window, React twice in the renderer bundle, a fault
the unpackaged build shared and no test rendered. Owed and stated: the portable and its stub (ADR-0054),
signing, `REQ-STARTUP-156`'s gate, an icon, and the per-runner half (IC-3 item 3).

## IC-7 — the bundled code-intelligence runtime fetches its language servers; the release is bound until the owner decides (ADOPTED 2026-09-06, option 2 — DISCHARGED 2026-09-27, the pipeline's evidence owed)

> **DISCHARGED 2026-09-27 — the second half, by the notices generator's first execution** (`first-release-plan.md`
> §4.3; `tools/notices/`, `pnpm notices`). The criterion option 2 set — "the specification carries the amendment and
> the notices generator lists them" — is met. The generator writes the `Tools provisioned after installation` section
> from the setup manifest this build carries (`apps/desktop/scripts/code-intelligence/pins.json`). Under a sub-heading
> naming the runtime (`serena-agent 1.7.0`), it lists `typescript` 5.9.3 (Apache-2.0,
> https://registry.npmjs.org/typescript), `typescript-language-server` 5.1.3 (MIT,
> https://registry.npmjs.org/typescript-language-server) and `pyright` 1.1.403 (MIT, https://pypi.org/project/pyright/),
> each with its language. It states that the runtime downloads each at the first use of that language, that none is
> contained in the artifact, and that a further language obtains its server by the same route and is not declared.
> Rendered over this tree and asserted by `tools/notices/notices.test.ts`, both over a fixture and over the real
> manifest. A manifest that cannot be read or parsed, or a package missing any of the four fields, fails validation.
> *Corrected the same day by the gate review's second round: that sentence was false for one input.* A manifest
> holding only `null`, `false`, `0` or `""` parsed without complaint. Over an otherwise valid fixture the step exited
> 0 and printed "0 language servers", and this section's list was empty. Every input the generator reads must now be
> a JSON object, or it fails as unparsable. A package field that is only whitespace also counts as missing.
> `notices.test.ts` covers each case.
> **What this does not show, stated so it is not read as shown:** a notices file frozen into a release. The first run
> wrote none, because REQ-STARTUP-143's validation failed on six things IC-7 does not own: the LGPL address (O-3),
> `dotenv` 0.9.9's missing identifier (OQ-74), and three npm packages and one Python distribution that carry no
> licence text and await a maintainer's review (O-11). *Corrected the same day by the gate review: fourteen things.*
> Eight more components carry only a file that refers to their licence without carrying its text: six npm packages
> (`@workflow/serde`, `ai` and four `@ai-sdk` packages) and two Python distributions (`certifi`, `mslex`). The first
> run had counted such a file as the text (OQ-75). O-11 is now twelve reviews. That binds every release by itself, so
> IC-7 no longer binds anything REQ-STARTUP-143 does not. The machine tools this section also names in
> REQ-STARTUP-142 are OQ-73's, not IC-7's. Of the three records this entry is "discharged into", the notes on
> ADR-0035 and ADR-0054 are written in place. **The third, the release pipeline's evidence, is owed**: no pipeline
> exists yet (first-release-plan.md §4.2). Its first run must show this section in a frozen file.
> *Pointer added 2026-09-27 (first-release-plan.md §4.4): `electron-builder.yml`'s `extraResources` now carries the
> file into the artifact, and `afterPack`'s "assets" rule compares it byte for byte with the one in the source tree. No
> Windows package has run since, so the first one to pass validation freezes this section for the first time and runs
> that rule for the first time too (ADR-0054, "The two bundled assets").*

> **ADOPTED 2026-09-06 by the owner — option 2, ESC-32 (`owner-decisions.md`).** The language servers are tools
> provisioned after installation, like Git and ripgrep. **Shown so far, the same day:** `REQ-STARTUP-159`, `058`,
> `142`, `064` and `REQ-MCP-116` amended in place with the prior wording quoted, `REQ-MCP-118` minted (the
> disclosure); the binding manifest declares TypeScript's two packages and Python's one with name, version, source
> and licence, **checked against the runtime's own defaults at generation** — the check's first execution refused a
> doctored pin (`pyright` 1.1.402 against the runtime's 1.1.403) and accepted the true ones; the MCP category's
> code-intelligence card carries the disclosure on every status, idle included, with the store path under the
> per-user data directory; `pnpm code-intel-proof` launch 5 read 3 declared packages on the card and the store
> present, true to the runtime's own provisioning lines (not exercised (the profile was warm)); launch 7 on the packaged binary with
> outbound blocked: tried typescript@5.9.3 — a declared package at its declared version. **Not yet shown, and the reason the condition stays:** the notices generator's
> "Tools provisioned after installation" section listing them (`REQ-STARTUP-141/142/143`) — the generator is not
> built (ADR-0054). That half is owed with it; until then a Windows release carrying the runtime is bound by this
> entry exactly as before. Nothing here is a downgrade by the person doing the work: the owner set the option, and
> the entry records what was shown and what was not.

> **PROPOSED 2026-09-06 by Part T (ADR-0035's first execution), for the owner to set or refuse.** Nothing below is
> a downgrade of REQ-STARTUP-159; it is the measured gap between that requirement and the runtime the owner chose.

**Set by:** proposed under ADR-0035's spike (`spikes/code-intelligence-bundle.md` §3), 2026-09-06; binds only once the
owner adopts it. **Binds:** any Windows release artifact (`pnpm package`'s installer, ADR-0054) that carries the bundled
code-intelligence runtime — not the mechanism, which is built and proven with the bundle as it is. **Discharged into:** a
note on ADR-0035 and ADR-0054, and the release pipeline's evidence.

**Why it exists.** `REQ-STARTUP-159` requires that what the user installs is self-contained — nothing fetched at run
time beyond the machine tools of `REQ-STARTUP-058` and the package caches of `REQ-STARTUP-064` — and `REQ-STARTUP-015`
requires the bundled tool server to run "from what the user installed". The bundle (Python 3.13.15 with
`serena-agent==1.7.0`, 175 MB under `resources/code-intelligence/`) satisfies that for the **runtime**: it answers
`tools/list` and the protocol with nothing else installed. It does not satisfy it for the **language servers** the
runtime's symbol tools need: measured with outbound blocked and a fresh home, the TypeScript server is obtained by
`npm install typescript@5.9.3` and `typescript-language-server@5.1.3` (requiring `node` and `npm` on PATH), the Python
server by `uvx --from pyright==1.1.403` (requiring `uv` on PATH and PyPI, and `pyright` itself downloads a Node runtime
on first run), and every other language's server by its own download at first use — into the product's per-user data
directory. Without them the symbol-level tools error ("The language server manager is not initialized") while the
pattern search and the memory tools keep working.

**What must be shown, and what would count.** One of:

1. **Bundle the servers for the languages the release claims.** Serena accepts pre-provisioned servers (a present
   `<home>/language_servers/static/<Server>/` is used without installing; `ls_specific_settings.<language>.ls_base_cmd`
   overrides the launch outright). For TypeScript and Python that means shipping a Node runtime and two npm packages
   beside the Python tree (an estimated 60–100 MB more, a second interpreter to pin and license under
   `REQ-STARTUP-142`), and stating which languages the release supports offline. Counts as shown when the proof's
   launch 7 (`pnpm code-intel-proof` under `ROTARIS_CODE_INTEL_PACKAGED=1`) answers a symbol overview on a TypeScript
   file and a Python file from the packaged artifact with outbound blocked and an empty npm cache.
2. **Amend the requirement.** Read `REQ-STARTUP-159`'s "machine tools of REQ-STARTUP-058 … the only things fetched
   after installation" to include the code-intelligence language servers as tools provisioned after installation
   (the way Git and ripgrep are), declared in the setup manifest with name, version, source and licence
   (`REQ-STARTUP-142`'s "Tools provisioned after installation" section), and surfaced to the user before the first
   fetch. Counts as shown when the specification carries the amendment and the notices generator lists them.
3. **Ship without symbol-level tools for languages whose server is absent**, the pattern-search and memory tools
   still offered, and say so on the MCP category. Counts as shown when the category's text names the languages the
   installed runtime can serve without a fetch (today: none) and the proof asserts the wording.

Until one of the three is adopted and shown, a release carrying the runtime does not meet `REQ-STARTUP-159` as
written, and this entry says so where the next reader will look. The interim reading taken by Part T, recorded in
ADR-0035's note: the mechanism is complete; the fetch happens only when a run first uses a symbol tool for a
language, from the runtime's own dependency providers, into the per-user data directory, and the failure with the
network blocked is the server's own error result, not a host failure (`REQ-MCP-113`).

**After ESC-32 (2026-09-06).** The three ways above are kept as written because the owner chose between
them; the second is in force. What remains to discharge the entry is one artifact — the notices file's
section — and it is named in ADR-0054 beside the generator that will produce it.

## IC-8 — the confinement backends are written but not proven; the rendering is not the contract (PROPOSED 2026-09-15)

**Raised by:** ADR-0022's first execution (Part AR, 2026-09-15). **Binds:** the two per-platform
renderers and any claim that OS-level confinement works.

`REQ-SANDBOX-127` states it in terms that leave no room to read them down:

> The rendered invocation is a means, not the contract. A confinement backend SHALL be judged
> conformant only by the observable effect on a live process on a real host of the platform
> concerned, and a rendering that matches `REQ-SANDBOX-075` to `REQ-SANDBOX-079` word for word but
> does not produce that effect is non-conformant. … No backend may be reported `available` on the
> strength of a rendered string alone, and no substitute or emulated backend may satisfy this check
> on behalf of an absent one.

The six effects it enumerates, each to be demonstrated on **each** supported platform under an active
mode: a write inside an effective writable root succeeds; a write outside every writable root and
outside the platform's temporary locations is refused; a write under `<root>/.git` or
`<root>/.rotaris` is refused **whether or not the subpath existed beforehand**; a read outside every
writable root succeeds; an outbound socket is refused while `runtime.sandbox_allow_network` is false
and succeeds while it is true; and the working directory the command observes is unchanged.

**None of the six has been demonstrated.** The build host is `win32`, which `REQ-SANDBOX-065` places
outside the closed two-member platform set, so the product on this machine correctly reports
`available: false` and every run that asks for confinement is refused before it starts. That path
**is** proven — `pnpm sandbox-proof`, five scenarios — and it is the path ESC-6 ruled the first
release accepts. What is not proven is the other path.

**What has been done instead, stated plainly so it is not mistaken for the check.** The shared
specification, the quoting and both renderers carry unit tests over their exact output: the bubblewrap
option sequence including all three carve-out cases of `REQ-SANDBOX-077`, the Seatbelt profile
including the denials-after-allowances rule of `REQ-SANDBOX-075`, both trial invocations including
`REQ-SANDBOX-070`'s final `-- /bin/sh -c 'true'`, and property tests over hostile paths for
`REQ-SANDBOX-064`. These establish that the product renders what the specification says to render.
`REQ-SANDBOX-127` says in advance that this is not the same claim.

**This condition binds the work it names.** The two renderers may not be reported complete, and no
conformance claim may be made for either backend, until the six effects have been run on a real macOS
host and a real Linux host and **the result recorded here whether or not it passed**. No agent may
downgrade it while doing the work.

**Its shape is IC-3's.** Both wait on hosts this project does not have; ESC-6 option 2 already named
extending `REQ-SANDBOX-127`'s obligation to a further continuous-integration platform as the real
cost of admitting one. If the owner wants the renderers proven rather than written, that is the same
hardware decision, and it is theirs.

### First execution on Linux — 2026-09-28 (R-062): the six effects held; the absent-subpath residue that the third one cites failed REQ-SANDBOX-077

**Not discharged, and this measurement cannot discharge it.** IC-8 requires the six effects on a real macOS host
**and** a real Linux host. This section covers Linux only, and one of the checks failed. The condition stands as
written above.

**What ran.** `pnpm sandbox-proof` scenario 6 was added for this measurement
([`the fixed note`](../defects/fixed/sandbox-proof-asserts-the-windows-verdict-on-every-platform.md)). Each effect is
one `terminal` call from a scripted agent in an unattended run with `sandbox_mode: workspace-write`. That call goes
through ADR-0022's enforcement point in the built application, exactly as a model's call would. Every verdict is read
from the **host** side after the run: what exists on disk, and what a listener in a separate host process accepted.
The confined command's own report is kept only as the explanation. There were two launches. In the first,
`sandbox_allow_network: false` and `.git` was absent beforehand. In the second, `sandbox_allow_network: true` and
`.git` was present beforehand. `.rotaris` was present in both.

**The host.** Ubuntu 24.04.4 in a virtual machine (kernel `6.18.44-fc-v37`), running as **root** under Xvfb, Node 24. bubblewrap
0.9.0 was installed through the proxy for this measurement. It was not on the host before, and without it the
product correctly reported the launcher-missing verdict and refused the confined run. The product's own trial
reported `confinement: available (bubblewrap)`, and so did the proof's independent trial.

| REQ-SANDBOX-127 effect | network denied, `.git` absent | network allowed, `.git` present |
| --- | --- | --- |
| a write inside the effective writable root succeeds | held | held |
| a write outside every root and every temporary location is refused | held (`exit=2`, nothing on the host) | held |
| a write under `<root>/.git` is refused | held (`exit=2`, nothing under the name) | held |
| a write under `<root>/.rotaris` is refused (present before) | held | held |
| a read outside every writable root succeeds | held | held |
| an outbound socket is refused while the network is off, and succeeds while it is on | held (`ECONNREFUSED`; the host listener accepted 0) | held (`pong`; the host listener accepted 1) |
| the working directory the command observes is unchanged | held | held |
| REQ-SANDBOX-077 (c): an absent protected subpath is still absent afterwards | **FAILED**: an empty `.git` directory remained on the host | not applicable (present before) |

**What it found.** One defect, in the product. To mount case (c)'s tmpfs, bubblewrap creates the mountpoint, and it
creates it through the writable bind, so it lands on the host. The write under the name was refused, which means a
hook cannot be planted. But the name now exists on the host, and REQ-SANDBOX-077 says in so many words that it must
not. The renderer's comment says both options "leave nothing on the host". That reason is falsified and is kept where
it stands until the repair replaces it:
[`the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md`](../defects/fixed/the-bubblewrap-carve-out-leaves-an-empty-protected-directory-on-the-host.md).
~~The proof stays red on a Linux host with `bwrap` until the defect is repaired.~~ *(Repaired 2026-09-29; see below.)*

**What it could not show, stated so it is not read as shown.**

- **macOS.** Nothing here touches Seatbelt.
- **An unprivileged user.** The run was as root, so bubblewrap needed no unprivileged user namespace. This does not
  measure the AppArmor userns restriction that Ubuntu 24.04 applies to ordinary users, which is the path most Linux
  users meet. That path is REQ-SANDBOX-073's trial-failure verdict, and it was not reached.
- **`read-only` mode.** Only `workspace-write` ran.
- **Configured writable roots beyond the workspace.**
- **`.rotaris` absent beforehand.** The configuration lives there, so it was present in both launches. Case (c) was
  measured on `.git` only.
- **The network effect against a destination off the machine.** The listener was on the host's loopback. The
  "denied" reading shows a separate network namespace, and the "allowed" reading shows the host's own. Outbound
  traffic from this VM goes through a proxy, so a remote destination would have measured the proxy.

**What the proof checks on every host.** It now reads the host's own verdict and checks the product against it:
`win32`, launcher missing, trial failed, or available. So `pnpm sandbox-proof` is the check this condition names on
Linux and on macOS, and on win32 it is still ESC-6's path.

### Linux again — 2026-09-29 (R-067): the absent-subpath case is refused, and nothing remains on the host

**Not discharged.** The macOS half has still not run.

**The repair.** The 2026-09-28 measurement falsified the renderer's reason for case (c): "both options live in the
confined process's own mount view and leave nothing on the host". It stays in `render-bwrap.ts`, beside what replaced
it. There is no mount arrangement that hides an absent name without a mountpoint at that name, so case (c) is no
longer rendered on Linux. The renderer refuses the command under REQ-SANDBOX-083, which is REQ-SANDBOX-077's own
fallback, and names each absent path in the cause. The consequence is raised as
[OQ-140](open-questions.md): on Linux, a writable root that lacks `.git` or `.rotaris` refuses every confined command,
while Seatbelt runs them.

**What ran.** `pnpm sandbox-proof`, as root under Xvfb, Node 24, bubblewrap 0.9.0, on the same kind of host as
before (kernel `6.18.44-fc-v50`). There were three confined launches. The first two ran the six effects with `.git`
present, one with the network denied and one with it allowed. The third, `effects-absent-git`, ran with the network
denied, `.git` absent and `.rotaris` present, and made two `terminal` calls: the `.git` plant and a write inside the
root. The whole proof exited 0. The same proof on the code before the repair exited non-zero on
`denied.absentGitStaysAbsent`, because an empty `.git` directory remained on the host.

| REQ-SANDBOX-127 effect | network denied, `.git` present | network allowed, `.git` present | `.git` absent (`effects-absent-git`) |
| --- | --- | --- | --- |
| a write inside the effective writable root succeeds | held | held | refused with the command (below) |
| a write outside every root and every temporary location is refused | held | held | not run |
| a write under `<root>/.git` is refused | held (`exit=2`) | held (`exit=2`) | held: the command never ran |
| a write under `<root>/.rotaris` is refused (present before) | held | held | not run |
| a read outside every writable root succeeds | held | held | not run |
| an outbound socket is refused while the network is off, and succeeds while it is on | held (the host accepted 0) | held (`pong`; the host accepted 1) | not run |
| the working directory the command observes is unchanged | held | held | not run |
| REQ-SANDBOX-077 (c): each command is refused (`sandbox_unavailable`, 126), and nothing runs | — | — | **held**: 2 of 2 refused, read from the store's `tool_calls`; the cause names `<root>/.git` |
| REQ-SANDBOX-077 (c): an absent protected subpath is still absent afterwards | — | — | **held**: absent |

**What it could not show, beyond the list above.** `.rotaris` absent was still not measured live, because the
configuration lives there. It takes the same code path as `.git`, which the unit tests pin with both names absent.
A configured additional root was not measured either. Under this repair such a root refuses every command, and OQ-140
names that.
