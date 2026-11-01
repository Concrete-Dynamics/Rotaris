# Archived open questions — Spikes, and the questions raised since (31 of 35)

The ruled, closed, resolved and withdrawn entries of [part 64](../../../architecture/open-questions/64-spikes-and-later-questions-31.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-334"></a>

**OQ-334 — When a brief asks a child to publish an artifact its grant cannot publish, what is the coordinator, and the child,
told?** *(REQ-LIBRARY-092, which materialises every terminal child report as a `child_report` artifact; REQ-TOOLS-152's
description as [`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) narrows it — revision 4's catalogue, which states only
REQ-TOOLS-001's three facets, and revision 8's "never write in a brief that a command or tool its entry does not show"; REQ-TOOLS-154,
the child's payload; REQ-ORCH-028, the routing table; OQ-212, which keeps every built-in persona's
`can_publish_artifacts` false; [OQ-250](54-spikes-and-later-questions-21.md#oq-250)'s limb "any brief offering a command or tool its target lacks", stated for a duress
run; [OQ-256](55-spikes-and-later-questions-22.md#oq-256), whose duress run held the same false belief at request 98; [OQ-257](55-spikes-and-later-questions-22.md#oq-257). Raised 2026-10-15 from
finding F10 of fin46's final acceptance (round 2 at `3c03287`), recorded in
[`a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for`](../../../defects/fixed/a-coordinator-briefs-a-codebase-analyst-to-publish-an-artifact-it-holds-no-tool-for.md);
written at the number the consortium's ruling names. **Ruled 2026-10-15.**)*

**What is open.** In the default live run's `delegation` scenario at `3c03287` (pack `2026-10-15T03-10-08-908Z`, session
`d0c3a7f0`) the coordinator briefed a codebase-analyst "Publish your findings as an artifact so later steps can attach it." (`#5`).
The child's system text said "ARTIFACT: Produce no artifact beyond your report" and its grant held no `artifact_write`; it called
`artifact_write` (`#10`), refused at the gate as an unknown tool, then `artifact_list` ("No artifacts found"). The run then kept its
report as `art_C1ZUuJ3B`, whose summary says the tool "was unavailable, so no artifact or file was created", tagged `errors` on a
succeeded report, and that artifact was attached whole to the docs-writer. The enforced bound held; the record a person reads in
the Library is false, and the false claim travelled on. Neither agent is told that REQ-LIBRARY-092 keeps every ended child's report
as an artifact, and no catalogue entry can say who publishes. OQ-250's limb is stated for a duress run, so it is not formally met.

**What the build proceeds under.** The child report is the artifact, as built; `delegate`'s description, the catalogue and the
child's payload say nothing of it.

**Ruled 2026-10-15 by the consortium under the owner's delegation ([R-072](../../../product/requests.md#r-072)), kind change-behaviour:**
recorded as [`PD-TOOLS-006`](../../../product/directives/pd-tools-006.md#pd-tools-006) **revision 10** (OQ-331's ruling takes no revision, so revision
10 is this ruling's alone). `delegate`'s description gains one fixed sentence stating that the run keeps every ended child's report
as a `child_report` artifact. Each catalogue entry gains the computed words "publishes artifacts" wherever that child's resolved
grant holds `artifact_write`, and every child's payload gains one fixed sentence stating that its report is kept as an artifact and
meets a request to publish when it holds no tool that publishes artifacts. Three alternatives are rejected: refusing or rewriting
briefs, naming publishers in the routing table, and granting codebase-analyst `artifact_write`. The playbook's ARTIFACT text stays
as built. It narrows REQ-TOOLS-152 (the description's sentence and revision 4's fourth computed word) and REQ-TOOLS-154 (the
payload's sentence after the workspace-root line); both gain their back-pointers in the same commit.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended two fixed sentences: `delegate`'s description telling the coordinator that every
  child's report is published for it as a `child_report` artifact, "never ask a child to publish its findings", and every child's
  payload telling the child the same, so a brief asking it to publish is already met. The ruling took A's `delegate` sentence in
  substance and A's placement in `childPayload`, which reaches every child, made conditional in its own words on the child holding
  no publishing tool so it stays true under every grant; it declined "never ask a child to publish", which would be untrue in a
  workspace that sets `can_publish_artifacts`.
- **Advocate B (the system's lens)** recommended the `delegate` sentence, a computed "publishes artifacts" word on each catalogue
  entry whose resolved grant holds `artifact_write`, and the playbook's ARTIFACT `none` text saying the report is kept. The ruling
  took B's sentence wording and the computed word, so the catalogue stays the one computed place for facts about a persona's tools
  (OQ-250, OQ-257) and, under OQ-212's defaults, the word appears on no entry; it declined B's playbook change, which reaches only
  that variant, can be overridden and alters a string shown in Settings.

Both advocates rejected parsing briefs (not testable, and it refuses valid briefs), granting the tool (it reverses OQ-212 and
duplicates the findings) and per-route clauses (declined twice under OQ-250); the ruling rejects them for the same reasons.

**Reopening condition:** any child call of an `artifact_write` it does not hold, or any `child_report` artifact claiming that
publishing failed, in a default or duress run.

**What a live run then shows.** Every delegating request's `delegate` description carries the report-artifact sentence, about 45
more tokens. Default catalogue entries are unchanged, because no built-in persona publishes. Every child's first request carries
the payload sentence, about 40 more tokens. In the default `delegation` scenario the analyst's brief asks for no publishing, the
child makes 0 `artifact_write` calls, and `art_C1ZUuJ3B`'s successor carries no claim that publishing failed. The harness NOTE
prints both counts — children's unknown `artifact_write` calls and briefs asking a non-publisher to publish — at 0 in default and
duress runs.

*Built 2026-10-15 (fin47, `fin47-delegation-routing`); its first execution is reported in `PD-TOOLS-006` revision 10.*
`REPORT_ARTIFACT_SENTENCE` and `catalogueWords` (`packages/agent-tools/src/tools/delegation.ts`), with `createToolPort` passing
`delegateTool` the run's store presence (`apps/desktop/src/run-host/tools.ts`); `CHILD_REPORT_ARTIFACT_SENTENCE` in `childPayload`
(`packages/engine/src/children/notify.ts`); the live run's `unknownArtifactWrites` and `publishBriefs`
(`apps/desktop/scripts/lib/routing-misses.mjs`), whose NOTE prints both in every run. Pinned by `tools/delegation.test.ts`,
`run-host/tools.test.ts`, `children/notify.test.ts` and `lib/routing-misses.test.ts`, red on the code before. Not yet driven live: the
next default pack is the measure. The note is repaired. The row is in [`first-executions.md`](../../../architecture/first-executions.md).

<a id="oq-400"></a>

**OQ-400 — What a Windows ARM64 host's readings discharge** *(REQ-STARTUP-026, which presents a Windows-ARM64 visitor the
`windows-x64` artifacts and says that running one "under Windows-on-ARM x64 emulation is an expectation and not a supported
configuration: it carries no acceptance criterion of its own, no release is blocked by a failure observed only under emulation";
REQ-STARTUP-030's three platform keys and REQ-STARTUP-156's gate over exactly those; [PD-STARTUP-001](../../../product/directives/pd-startup-001.md#pd-startup-001),
which narrows a release to `windows-x64`; IC-6, discharged 2026-09-04 on an x64 host, its per-runner half carried by the hardware condition; IC-7's
pins; `apps/desktop/scripts/code-intelligence/pins.json`, which pins a uv asset for `win32-x64` and `linux-x64` only. Raised
2026-10-15 by the Windows 11 ARM64 session (`win-arm64-*` branches), the first host of that architecture this record has met; the
session's range OQ-400 to OQ-449, its first number.)*

**What is open.** Every Windows obligation in this record was written for one host class: "a Windows host" in the test-suite and
proof rows, and "a Windows x64 host" where an artifact is named. A Windows 11 ARM64 machine now runs the development tree
natively (Node arm64, Electron arm64, the `win32-arm64` prebuilds of `better-sqlite3` and `node-pty`, an arm64 ConPTY), and can
cross-build the `windows-x64` artifact and run it under the operating system's x64 emulation. Three things are not fixed:

- **(a)** whether a reading of the arm64 development tree counts toward an obligation owed to "a Windows host" — the suite, the
  proofs, the PowerShell and ConPTY first executions — or only toward a windows-arm64 reading the record does not ask for;
- **(b)** whether an x64 artifact cross-built on ARM64 and run under emulation counts toward an obligation owed to "a Windows x64
  host" (ADR-0056 rule 4's load, ADR-0054's naming and assets, the packaged proofs, rule 4's per-runner half). REQ-STARTUP-026
  answers the release side — no acceptance criterion, no blocked release — and says nothing of the record's own first executions;
- **(c)** whether `win32-arm64` needs its own uv and runtime pins (`pins.json`, IC-7), given that `pnpm code-intel:bundle` refuses on
  arm64 without a uv on `PATH`, and that a bundle made there carries an arm64 runtime no published artifact would.

**What the build proceeds under** *(superseded 2026-10-15 for (a) and (c) by the ruling below; kept as the reading the build
proceeded under until then, and its (b) stands)*. An arm64 reading measures `windows-arm64` and nothing else. It is recorded beside the obligation
it bears on, labelled with its host line, and it **discharges no x64 obligation**: every passage that owes "a Windows x64 host"
keeps owing it, and every timing taken here stands beside the x64 or Linux figure, never over it. Where the record owes "a Windows
host" without naming an architecture, the arm64 reading is recorded as the first Windows run since the change that made it owed,
and the x64 half is stated as still owed. An emulated run of the x64 artifact is labelled "x64 artifact cross-built on ARM64, run
under emulation"; a red seen only there is "observed only under x64 emulation on Windows 11 ARM64" until an x64 host reproduces it.
`pins.json` is left as it is.

**What a ruling decides.** For (a), whether the Windows-host obligations are architecture-free (an arm64 run discharges them) or
x64-bound (it only informs them). For (b), whether REQ-STARTUP-026's "no acceptance criterion" extends to the record's first
executions (an emulated run informs and never discharges) or an emulated run may stand in for the x64 host until one exists.
For (c), whether arm64 joins the pinned set (a `win32-arm64` uv asset and its hash, IC-7's record), or arm64 stays an
unpinned development host whose bundle uses a uv on `PATH` that must equal the pin. **The costs:** counting arm64 readings closes
Windows obligations sooner on hardware the release never ships to; not counting them leaves every Windows row owed until an x64
host exists. Pinning arm64 adds one asset to every pin change; not pinning it keeps the bundle step a manual one there.

**What a live run then shows.** Nothing of the question itself: a live run on this host is a windows-arm64 reading under whatever
the ruling decides.

**Ruled 2026-10-15 under the owner's delegation ([R-072](../../../product/requests.md#r-072)), kind change-behaviour, with no
directive:** (a) an obligation the record words as owed to "a Windows host" has no architecture. A native windows-arm64 reading of
the development tree discharges it, recorded with its host line, and no "x64 half" is added to it. (b) An obligation that executes
a shipped binary or the `windows-x64` artifact stays owed to a Windows x64 host: ADR-0056 rule 4's load, the packaged proofs and
REQ-STARTUP-156's launch. An emulated run of that artifact informs and never discharges, consistent with REQ-STARTUP-026. Checks
that only read the `windows-x64` artifact's bytes (naming, assets, notices, digests, the interpreter's machine field) count from
any Windows build host, provided the artifact passed the architecture guard. (c) No `win32-arm64` pin is added. The bundle step
builds its interpreter for the target artifact's architecture; on `win32-arm64` it uses the pinned, hash-checked `win32-x64` uv,
which the operating system runs under its x64 emulation; and packaging refuses an interpreter whose PE machine field differs from
the artifact's architecture. REQ-STARTUP-026, REQ-STARTUP-030, REQ-STARTUP-156 and
[PD-STARTUP-001](../../../product/directives/pd-startup-001.md#pd-startup-001) are read as written: the ruling is build tooling and the record's
reading of its own first executions, so the ruling alone settles it. *The reading kept above, an arm64 reading discharging nothing
and every "a Windows host" obligation keeping an x64 half owed, is the falsified one for (a); for (c), `pins.json` left as it was
with no guard beside it.*

**The recommendations it weighed** (both kinds change-behaviour). **Advocate A** (the user's lens) recommended ruling "by what a
check exercises": "(a) Obligations owed to 'a Windows host' (the suite, the dev-tree proofs, PowerShell and ConPTY behaviour, path
rules) are architecture-free, so a native arm64 run discharges them … (c) … the bundle is built for the target artifact's
architecture, packaging refuses an interpreter of any other architecture, and arm64 joins the uv pins as a build host." **Advocate
B** (the system's lens) recommended taking the record's wording literally: "An obligation owed to 'a Windows host' has no
architecture … For (b), keep the reading as built: a run of the x64 artifact under emulation informs and never discharges. For
(c), add no arm64 pin … the bundled interpreter must report the artifact's target platform (`win-amd64`), and the package refuses
any other." Both followed on (a). On (b), B's on execution and A's on the checks that only read bytes, which hold on any Windows
build host once the guard proves the artifact carries an x64 interpreter. On (c) the ruling took a third way: A's arm64 uv pin
would add an IC-7 hash to every pin change for a platform REQ-STARTUP-026 never publishes, and B's uv on `PATH` equal to the pin
keeps a manual step that checks the version with no hash; Windows 11 ARM64 runs x64 executables, so the already-pinned `win32-x64`
uv gives hashed provenance with no new pin, and build tooling run under emulation is never acceptance evidence. For the guard it
took A's PE machine-field read over B's `sysconfig` platform tag: a byte read that executes nothing and depends on no unverified
string. No earlier ruling is revised; R-071 (3) still defers the x64-host work.

**Built 2026-10-15 by fin47 (`fin47-record-and-windows-reading`).** (c) in code:
`apps/desktop/scripts/code-intelligence/target.mjs` (`parseTarget`, `interpreterKey`, `pinsHashInput`, `uvAssetFor`) under
`bundle.mjs`'s `--target=<platform>-<arch>`, the host by default and `win32-x64` from `package.mjs`: the interpreter installed by
its full uv key, `target` and `targetArch` in `bundle.json` and `targetArch` in the pins' hash (recipe 4), and on `win32-arm64`
the pinned `win32-x64` uv, logged as running under emulation, with `pins.json` unchanged; `build-hooks.cjs`'s `peArchOf` and
`checkRuntime`, which read the packaged `python.exe`'s PE machine field and the marker's `targetArch` before spawning anything and
refuse either one that is not the artifact's. Pinned by `build-hooks.test.ts` (PE-header fixtures; the arm64 case red against the
old `checkRuntime`) and `target.test.ts`; read over the real Windows `python.exe` of both architectures, and the bundle built on
Linux by the full key ([first-executions](../../../architecture/first-executions.md), the row of 2026-10-15 "The bundle's target architecture and the
packaging guard";
[`../../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md`](../../../defects/fixed/the-bundled-interpreter-can-be-built-for-another-architecture-than-the-artifact.md)).
(a) and (b) in the record: the arm64 rows of 2026-10-15 in `first-executions.md` and the pointers they left on the rows of
2026-09-16 and 2026-10-06 amended in place, each struck reading kept; `spikes/native-load-proof.md`'s ARM64 section; ADR-0035,
ADR-0054 and IC-7, dated notes. **Owed:** the first `pnpm package` on the Windows ARM64 host, which shows whether the emulated uv
installs the x86_64 interpreter and takes `win_amd64` wheels.
