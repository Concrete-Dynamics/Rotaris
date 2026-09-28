# The first release — Windows only, skills and workspace-context injection

*Drafted 2026-09-25 from [R-051](../product/requests.md#r-051). A plan, not a decision: it schedules work the
record already decides, and every ruling it needs is named as the owner's rather than taken here.*

**The owner's words.** "ok lets go with windows only first. skilsand workspace injection is a must have. thats it."

**What the plan does with them:**

- **Windows only** narrows what a release publishes. That is a change to four live requirements, so it is a
  directive: [`PD-STARTUP-001`](../product/directives.md#pd-startup-001). It narrows REQ-STARTUP-026, 030, 035 and 156.
- **Skills** and **workspace-context injection** are already specified (REQ-CHAT-034, REQ-CHAT-162,
  REQ-WORKSPACE-041..073). They are mostly built. The plan finishes them and proves them in the built app.
- **"thats it"** defers everything else on the go-live gap list from the first release. Deferring is scheduling
  only. No requirement is superseded, and each deferred item stays owed where it is recorded now.

## 1. Scope

| In the first release | Where it stands | Section |
|---|---|---|
| Skills — discovery, the catalog, load modes, the Settings tab, skill commands, `/skill <path>` | built 2026-09-15 (ADR-0063; `pnpm skills-proof`) | §2 |
| Skills — `/skills`, REQ-CHAT-162's listing | ~~**not built** (`SKILLS_LISTING_NOT_BUILT`, `packages/ui/src/slash/skills.ts`)~~ **built 2026-09-27** (`pnpm skills-proof`, launches 1c and 1d); OQ-67 open against its reach from Settings | §2 |
| Skills — ESC-37, ESC-38, ESC-39 | **ruled 2026-09-27** as recommended ([R-052](../product/requests.md#r-052)); amended | §2 |
| Workspace-context injection, REQ-WORKSPACE-041..050 | built 2026-09-22 under `PD-WORKSPACE-002` | §3 |
| Injection — REQ-WORKSPACE-049's latency bound, a built-app proof | **built 2026-09-27** (`pnpm injection-proof`); the bound **met on Linux**, the Windows gate-class reading **owed**; OQ-64 **ruled 2026-09-27**; OQ-68 raised | §3 |
| The Windows release pipeline, REQ-STARTUP-027..038, 141..143, 156, 158, 167, 168 | the installer built once (ADR-0054, 2026-09-04); **the version guard built 2026-09-27** (§4.1), and the setup manifest it checks is owed; **the notices generator built 2026-09-27** (§4.3), its validation refusing until O-3, O-11 and OQ-74; **the two bundled assets wired into `pnpm package` 2026-09-27** (§4.4), so a package refuses with it | §4 |
| The updater, REQ-STARTUP-107..124 | ~~**not built** — no module in `apps/desktop/src/main/`~~; **in the first release**, ruled 2026-09-27; **built 2026-09-28** (`apps/desktop/src/main/updater/`, `pnpm updater-proof`; the compiled-in key set empty until O-2; the apply and the restart unit-tested over fakes, their run against a real artifact owed to the next Windows package, IC-3); OQ-76, OQ-77, OQ-78 raised; repaired at verification the same day (classification order, the record pass, the re-offer, the launch-time cleanup), OQ-79 raised; and at the second verification (a refused record pass now fails the restart) | §4.6 |

**Deferred by "thats it".** Each item stays owed where the record already carries it:

- The other product gaps in `codebase.md`'s "Where the next work lands", for example providers' device-code and
  PKCE authenticators, Git integration and merge, the manual compression part, and persona memory.
- The open notes in `../defects/`.
- The four red proofs: `transcript-proof`, `library-proof`, `part-h-proof`, and `theme-proof`'s contrast section
  (OQ-56). *Two more were measured red on 2026-09-27 while §2.2 was built, both before it and unchanged by it:*
  `slash-proof` at its first catalogue assertion since ADR-0063
  ([note](../defects/slash-proof-expects-every-built-in-to-carry-the-action-badge.md)), and `skills-proof`'s policy
  launch on Linux only ([note](../defects/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md)).
- The unbuilt directives `PD-TOOLS-003`, `PD-TOOLS-004`, `PD-TOOLS-005`, `PD-ORCH-004` and `PD-MONITOR-002`.
- The macOS and Linux artifacts, which are bound by IC-3 and IC-8 and now also by `PD-STARTUP-001`.

**One deferral the owner should look at twice.** Persona memory is a named empty slot in REQ-WORKSPACE-060's
ordered unit list, and REQ-WORKSPACE-050 decides where it is discovered. It is outside "workspace injection" as
the specification uses the words, so it is deferred. If the owner meant it to be included, it is the largest
item this plan would gain.

## 2. Must-have: skills

**Built and proven.** The following exist and are measured by `pnpm skills-proof`:

- portable-skill discovery, and the run host's catalog;
- skills as ordered context units;
- the Settings Skills tab;
- one composer command per user-invocable skill, using REQ-SHELL-056's catalogue normal form and `-2` suffixing;
- `/skill <path>`.

**2.1 The three rulings.** *Ruled 2026-09-27 ([R-052](../product/requests.md#r-052)), each as recommended below.
`REQ-CHAT-034`, `REQ-CHAT-162` and `REQ-CONFIG-343` are amended, and `owner-decisions.md` holds the rulings.*
Each changed what §2.2 builds, so they came before it.

- **ESC-37: what invoking a skill delivers.** Either a force-loaded block for the session (domain 13, which is
  what is built) or a payload attached to one prompt (domain 03). This ruling decides whether the `/skills`
  listing has REQ-CHAT-162's "already in context" column: REQ-WORKSPACE-067 forbids that indicator by name.
  *Recommended: domain 13 stands.* The alternative needs a per-prompt attachment path the engine does not have.
- **ESC-38: the Skills table's columns.** Either five (REQ-CONFIG-343) or seven (REQ-WORKSPACE-067 with the
  invocation selector; what is built). *Recommended: seven, with REQ-CONFIG-343's count amended.*
- **ESC-39: a taken command name.** Either skipped (REQ-CHAT-034) or suffixed (REQ-SHELL-056; what is built).
  *Recommended: suffixed, with REQ-CHAT-034's clause amended to cite REQ-SHELL-056.*

Each recommendation is what is built, so ruling all three as recommended costs an amendment round and no code.
OQ-58 and OQ-59 are also open against the same feature. Neither blocks the release, and both are named here so
that the release notes do not have to find them later.

**2.2 `/skills`, REQ-CHAT-162's listing.**

*What it must do.* The listing is one saved system row in the transcript: normalized name, scope, triggers,
description clipped to 120 characters with an ellipsis, the `SKILL.md` path, and a count. It carries the
no in-context flag: ESC-37 ruled for domain 13, and the amended REQ-CHAT-162 drops that column.

*Why it is not built.* A saved row is written through the session writer. The session writer belongs to the
run host, and no renderer command reaches it today.

*What building it needs.* Following the seam order in `views/04-seams.md`:

1. a `skills.list` command that the composer sends to the run host;
2. a system-row kind that the transcript's one row renderer draws;
3. the session writer appending that row, so it is saved with the session and exported with it.

The skills catalog is already the run host's, so no new owner of state appears. The command replaces
`SKILLS_LISTING_NOT_BUILT` where it would register. `skills-proof` gains one scenario: `/skills` in a session,
the row drawn, the session reopened, and the row still there.

*First execution — 2026-09-27. Reported in place, with one row in `first-executions.md`.* **The three-step path
held as written, the reason it was not built held, and building it found one defect and one open question.**

- *The path.* `skills.list` renderer → main (`main/commands/skills.ts`, which names the followed session) → run
  host (`dispatch.ts` → `run-host/skills.ts`'s `writeSkillListing`) → the session's own writer's `appendRow`. "Only
  the run host can do it" was exactly right: the writer that saves the row, records its `transcript.row` event and
  feeds the projection owner is the one every other row of the session goes through, so *saved with the session*,
  *drawn in every window following it* and *exported with it* (the trajectory reads those events) came from that
  writer rather than from new code. A live run's writer and a loaded idle session's are one object, so the row lands
  in order whether or not a run is going.
- *"A system-row kind".* Read as a kind **of** system row, not a new persisted role: REQ-CHAT-047 maps the role
  `system` to the system-notice category and any other role to a message, and REQ-CHAT-046 closes the categories
  at twelve and gives a row its text and no field shaped like a listing. So the row is `system`, its body IS the
  listing, and the one row renderer draws a system row whose text has the listing's shape as the listing. The text
  is fixed once, in `contracts/skills.ts` — one writer, one reader, a round-trip test — and a body the reader does
  not accept is drawn as the plain notice it also is. **No store column and no migration.** No in-context column,
  per ESC-37. The description is clipped as REQ-CHAT-068's task text already is: at most 120 characters, the last
  the ellipsis where the text was cut.
- *The defect.* `/skills` is the second fixed catalogue command with the `skill` kind badge, and the registrar read
  any `skill`-kind holder as its own earlier work — so a skill named `skill` took `/skill <path>`'s name or lost its
  own, depending on which React effect ran first (REQ-SHELL-056, both halves). Repaired with it:
  [`a-skill-named-skill-takes-the-skill-command.md`](../defects/fixed/a-skill-named-skill-takes-the-skill-command.md).
- *The open question.* [OQ-67](open-questions.md): REQ-CHAT-162 wants the listing reachable from the settings
  surface, and REQ-WORKSPACE-067 fixes that tab's header actions at two, so no action was added — the tab's table
  already shows every fact the listing carries; and `/skills` from a window following no session has no transcript
  to save a row into, so it is refused with a stated reason rather than creating a session.
- *The evidence.* `skills-proof` launch 1c types `/skills` into a scripted session and reads one system row listing
  the six discovered skills in the table's order, with `ws-skill`'s scope, triggers, description and path; 1d
  reopens that session from the browser in a new launch and reads the same row back, with no second listing
  logged. Both sit before the policy launch, which fails on Linux before and after this change at "the baseline
  over a global override was not written explicitly"; on Linux the two new launches are therefore the last that
  pass, and the cause is recorded as
  [`skills-proof-writes-its-global-policy-where-only-windows-reads-it.md`](../defects/skills-proof-writes-its-global-policy-where-only-windows-reads-it.md).
  A temporary copy of the proof with that one path spelled for Linux passed all 10 checks over 9 launches with
  `/skills` built, so the later launches are unaffected by it; the copy was not committed.
  `rows-proof` passes unchanged. `slash-proof` stops at its first catalogue assertion with and without this change —
  it expects every built-in to carry the `action` badge, which `/skill` has not since ADR-0063 — recorded as
  [`slash-proof-expects-every-built-in-to-carry-the-action-badge.md`](../defects/slash-proof-expects-every-built-in-to-carry-the-action-badge.md).
- *Gate round 1 of the same change found two more defects, both repaired before it merged.* (1) Drawing the listing
  as its own block took the system row off `PlainText`, so a bare URL in a skill's description stopped being a link
  (REQ-CHAT-076). Every field is now drawn through `PlainText`; `rows.test.ts` renders a listing and reads the link,
  and launch 1c gives `home-skill` a description ending in a URL and reads the link drawn for it, the full stop
  outside the target. `skills-proof` passes to the same Linux-only policy check as before, and `rows-proof` passes.
  (2) A prompt file named `skills.md` took `/skills` back from the listing on the first prompt re-read after mount
  (REQ-CHAT-160, REQ-CHAT-162): the collision repaired above held for the skill registrar only —
  [`a-prompt-file-named-skills-takes-the-skills-command.md`](../defects/fixed/a-prompt-file-named-skills-takes-the-skills-command.md).
- *Readings stated here rather than left in code.* Search matches the row's text (REQ-CHAT-074), and the text's
  punctuation between fields (`- `, the brackets round the scope, ` triggers: `) is not drawn, so a match falling
  only there selects the row and paints nothing in it. `/skills` is sent from `renderer/main.tsx`'s slash host
  beside `/skill`'s `loadSkillFile`, not from `renderer/session-actions.ts`, where `views/04-seams.md` §1 step 5
  puts a gesture against the followed session: main, not the renderer, names the session here, as it does for
  `skills.forceLoad` and `skills.loadFile` (ADR-0063). The listing's other readings — which skills it lists, when
  its refusal is stated, how the 120 is counted, the badge, and the improvement analyst reading the row — are
  OQ-67 (c) to (g).

**2.3 A skills live run.** One `pnpm live-run` scenario invokes a skill command and asserts that the model's
first turn shows the skill's body was in its context. It spends the owner's money, so it runs only when the
owner asks (AGENTS.md).

## 3. Must-have: workspace-context injection

**Built** (first-executions row 2026-09-22):

- the Instructions category as an editor over four bases past the workspace root;
- a per-file switch;
- `instructions.overrides`, written sparsely;
- injection through `apps/desktop/src/run-host/skills.ts` and `packages/config/src/instructions.ts`.

~~These are unit-tested only.~~ **Executed in the built app 2026-09-27** by `pnpm injection-proof` (§3.2, §3.3 below).

**3.1 OQ-64.** The question: when an instruction override is switched off, does it still suppress its base?
The build computes suppression over the enabled set. *Ruled 2026-09-27 as built: switching an override off
returns its base to the merge.* §3.3's proof asserts that answer.

**3.2 REQ-WORKSPACE-049's bound.** The requirement: discovering and merging the context files completes within
200 ms for a workspace holding up to 20 context files totalling 1 MiB on local storage, and never delays first
input. It is not measured. The plan is:

- a fixture workspace at exactly that bound;
- the p95 over cold-cache runs, taken in the built app on the Windows gate machine's class of hardware;
- the result recorded in `first-executions.md` whether it passes or not.

If it fails, the fix is a separate change, and the reading stays next to it.

> **First execution, 2026-09-27 — the Linux reading; the Windows gate-class reading is still owed.** Taken in the
> built app by `pnpm injection-proof`'s latency section (first-executions row 2026-09-27).
>
> **Hardware.** A Linux container: 4 vCPU Intel Xeon @ 2.10 GHz, kernel 6.18 in a Firecracker VM, with the workspace
> on the VM's virtio block device. That device is local and non-removable. The machine is not the gate machine's
> class, so this reading does not stand in for it.
>
> **Fixture.** Fourteen instruction files, every slot discovery can reach, totalling exactly 1,048,576 bytes. Twenty
> cannot be built: **OQ-68**. Twelve of the fourteen are read by the merge. The two bases suppressed by their on
> overrides hold one line each. Every read file exceeds the per-file limit, and the total limit drops eight of them.
>
> **What was timed.** The run host's own cold path, `SkillHost.workspaceContext`, on the monotonic clock port: the
> saved-policy read, the discovery and the merge. The policy read is included on purpose, because `PD-WORKSPACE-002`
> made it part of deciding what is merged.
>
> **What "cold" means here.** Twenty consecutive launches, each a new Electron process. Before each launch, every
> fixture file's data pages were dropped (`POSIX_FADV_DONTNEED`, after one `sync`). `mincore(2)` then confirmed that
> 0 of 266 pages were resident. Dentries and inodes were not dropped. The workspace service stats every instruction
> file at workspace open anyway, before any merge can run. **Cold means the guest's page cache only.** The disk is a
> Firecracker virtio device, and the hypervisor's own cache, outside this VM, can still serve those reads; nothing
> inside the guest can drop it.
>
> **Reading.** The figure of record, retaken after the gate's fixes with its evidence kept in
> `.proof/injection-proof/latency.json`: **p95 20.29 ms** (nearest rank, 20 runs), median 11.16 ms, minimum 7.97 ms,
> maximum 21.34 ms. Discovery and merge alone had a p95 of 15.76 ms, and the policy read alone 4.64 ms. The product
> code timed was unchanged by those fixes; the proof's launches now also move `HOME` into the scratch profile on POSIX.
> Three earlier runs of 20 gave p95 15.42 ms (the first reading reported here, from the first committed code), 25.4 ms
> and 28.64 ms (maximum 46.82 ms; both taken while the proof's reporting was still being finished). The first
> reading's evidence is gone: a later `--skip-latency` run clears the evidence directory. **The bound is met on this
> machine** in all four runs. The worst p95 is about a seventh of it.
>
> **The unconditional halves.** All twenty separate processes produced byte-identical merged context (one SHA-256).
> In all twenty, the merge ran only after the typed prompt was accepted and recorded as row 0: that is the measured
> half of "never delays first input". The requirement's other clause, that the window keeps responding to input while
> the merge runs, is **argued from placement, not measured**: the merge runs in the run host, never in the window's
> process, so nothing in the window waits on it.
>
> **Still owed.** The same measurement on the Windows gate machine's class of hardware (§5, O-6). The script has no
> per-file page-cache eviction on Windows: there it labels its reading **warm** and does not assess it against the
> bound. A cold method for Windows is owed with that reading.

**3.3 A built-app proof.** `pnpm injection-proof` is new and belongs in the AGENTS.md index. It opens a
workspace with instruction files at each base, switches one off, starts a scripted run, and reads what the
model port received. It asserts four things:

- order;
- presence;
- the switched-off file's absence;
- the OQ-64 outcome.

It also covers REQ-WORKSPACE-050's worktree case: a run in an isolated worktree reads context from the run's
execution root.

> **First execution, 2026-09-27 — built, and green on Linux** (`apps/desktop/scripts/injection-proof.mjs`; the
> AGENTS.md index; first-executions row 2026-09-27). It reads what the model port **received**. A new seam,
> `ROTARIS_CAPTURE_MODEL_REQUESTS`, makes the scripted client append each call's system text to a file. The seam is
> compiled out of a packaged build, and only the scripted client can write through it, so no real provider is called
> or recorded.
>
> **Every instruction base is a scratch directory.** The home-relative bases use `ROTARIS_CAPTURE_INSTRUCTIONS_HOME`.
> The global base is the profile's own configuration directory. The machine-wide base uses a second new seam,
> `ROTARIS_CAPTURE_INSTRUCTIONS_MACHINE`, which is also compiled out. Without it, the only way to place a file at
> `/etc/codex` was to write into the machine's own `/etc`. The same gap had left the unit tests reading the host's
> real `/etc/codex`: [`the-instruction-discovery-tests-read-the-machines-own-etc-codex.md`](../defects/fixed/the-instruction-discovery-tests-read-the-machines-own-etc-codex.md).
> The first repair of that note missed the catalog cases' `host()` helper, and the gate's verification found it; it is
> now repaired, with a case that decides the isolation on any host. On POSIX the proof also sets `HOME` to its scratch
> home, after the gate traced a launch reading the operator's `~/.agents/prompts`. **One root of the operator's machine
> is still read**: the skill search's `/etc/codex/skills`, which has no seam
> ([`three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md`](../defects/three-proofs-and-the-catalog-tests-read-the-machines-own-etc-codex.md)).
>
> **Four launches.**
>
> 1. **All on.** Ten blocks arrived in discovery order. The on override suppressed its own base and nothing else.
>    The context unit arrived ahead of the skill catalog.
> 2. **Switch.** Two files were switched off through Settings → Instructions and saved. The inventory listed all
>    eleven present files, each under its source label, and the policy was written sparsely.
> 3. **Switched.** The switched-off file sent nothing, not even its source comment. **OQ-64 as ruled:** with the
>    override off, `AGENTS.md` came back into the merge.
> 4. **Isolated.** The run executed in `.rotaris/worktrees/<sid>`. Its workspace blocks carried the **committed** text
>    under the worktree's paths, not the base's working copy. The base's switches still governed them by identity.
>
> **Two falsifications, each red.** Suppression computed over presence failed launch 3. Context read from the base
> root instead of the execution root failed launch 4. Both were rebuilt and run, then reverted.
>
> **What it does not observe.** REQ-WORKSPACE-047 gives the block to "each agent built for that session". The scripted
> run never delegates, so the proof reads the entry agent's call only. A delegated child receiving the block is shown
> by neither the proof nor a unit test: the child's system text goes through the same `withContextUnits` call
> (`packages/engine/src/children/orchestration.ts`), which is an argument, not an observation. The recorded calls are
> the classifier, the entry agent (the only one carrying context) and the post-run analyst, which rightly carries none. Two defects in the same requirements were
> noticed by the gate and recorded, not repaired here:
> [`an-instruction-file-that-is-not-utf-8-is-injected-with-no-warning.md`](../defects/an-instruction-file-that-is-not-utf-8-is-injected-with-no-warning.md)
> (REQ-WORKSPACE-045's decoding half) and the `/etc/codex/skills` read above.

**3.4 A live run.** One `pnpm live-run` scenario with a workspace `AGENTS.md` whose instruction the model can
only follow if it was injected. Owner-approved, like §2.3.

## 4. The Windows release pipeline

Everything here is ADR-0054's decided architecture, narrowed by `PD-STARTUP-001`. The decisions it builds on:

- `electron-builder` with publishing off;
- the pipeline writes the manifest;
- the portable is assembled from `win-unpacked` plus a project-owned launcher stub (SR-7, P4);
- names come from `tools/release-naming`;
- a bespoke main-process updater;
- the ESC-8 ruling: the manifest is signed, the key is a pipeline secret, and a record of keys per shipped
  release is kept from the first release.

The binaries themselves stay unsigned by design (REQ-STARTUP-021/023). Nothing in this plan buys an Authenticode
certificate, and "signing" below always means the manifest signature.

**4.1 One version.** REQ-STARTUP-158 and REQ-STARTUP-028 require one release version. Today the declared
versions disagree: `package.json` is `0.0.0`, `apps/desktop/package.json` is `0.1.0`, and
`tools/release-naming/package.json` is `0.0.0`. The work:

- choose which places declare the version;
- bring them to one value;
- write the guard. It fails with exit 1, naming the tag version, each place that differs, and where each
  place is. It also checks REQ-STARTUP-059's package-pin agreement in the same stage.

The guard is a script under `tools/` and is unit-tested beside itself.

*Built 2026-09-27; the first execution is reported in ADR-0054 ("One version and the pre-build guard") and in
`first-executions.md`.* `pnpm release:guard <tag>` (`tools/release-guard`) is the guard. The tag grammar it parses
lives in `tools/release-naming`. What the build decided and found:

- **One place declares the version: `apps/desktop/package.json`, at `0.1.0`.** Everything the running product reports
  as its version reads that file back through one reader (`@rotaris/platform`, `installedProductVersion`): the About
  row, which used to report Electron's own `44.1.1` from the unpacked entry, and the MCP client's `clientInfo.version`,
  which the gate round found hard-coded as a second product version, `0.1.0`, that the guard could not see (both
  repaired). The workspace root's `version` is removed. `tools/release-naming` and the other `@rotaris/*` packages keep
  `0.0.0`: they are never packed as packages, so their `0.0.0` is not a product version. A prerelease tag needs the
  declaration to match its text exactly, for example `0.1.0rc1` for step 5's `v0.1.0rc1`. With no manifest the app
  reports `dev`, **OQ-71**'s reading of a conflict between REQ-STARTUP-004 and REQ-STARTUP-007.
- **The setup manifest (`REQ-STARTUP-058`) does not exist, and no step of this plan builds it.** The pin half reads it,
  so on this tree `pnpm release:guard v0.1.0` exits 1 on that half alone, naming `@playwright/mcp` `0.0.80`, both files
  and the missing manifest. §5's first check therefore cannot pass until the manifest is built. §4.3 needs the same
  file, because `REQ-STARTUP-142`'s "Tools provisioned after installation" section is generated from it and
  `REQ-STARTUP-143` fails a platform whose manifest cannot be read. The guard reads it at
  `apps/desktop/resources/setup-manifest.json` and needs only `schemaVersion: 1` and `toolServerPackages`; that field
  name is the guard's reading, and that directory is not packed, so whoever writes the manifest also adds it to
  `extraResources` (ADR-0054's note). **Owed; see §7.**
- **electron-builder hyphenates a prerelease version** (`0.1.0rc1` → `0.1.0-rc1`), so step 5's prerelease would be named
  `Rotaris-0.1.0-rc1-…` unless §4.2/§4.5 render the name from the tag through `tools/release-naming`
  (`../defects/a-prerelease-version-reaches-the-installer-hyphenated.md`).
- Two readings were raised rather than taken silently: **OQ-69**, whether the switched-off `browser` default counts
  (built: it does), and **OQ-70**, whether tag numbers are canonical decimals (built: they are).

**4.2 The tag workflow.** `.github/workflows/release.yml` does not exist yet. It is triggered only by tags
matching REQ-STARTUP-027's grammar. Channel classification follows REQ-STARTUP-029. The stages, each failing
the release on its own:

1. guards — after `pnpm symbols`, which the version guard needs (it reads `@rotaris/config`, whose kernel re-exports
   the generated symbols; without them it fails closed), and as `pnpm release:guard <tag>`;
2. the notices step;
3. `pnpm package` on a `windows-latest` x64 runner;
4. portable assembly;
5. manifest and signature;
6. the release body.

The workflow creates the GitHub release as a **draft**. It becomes public only when §5's gate passes. Where the
release is published is the owner's choice (§6).

**4.3 The notices generator.** REQ-STARTUP-141..143 and IC-7 cover it:

- It writes `THIRD-PARTY-LICENSES.txt`, including the "Tools provisioned after installation" section that IC-7's
  second half waits on, taken from the code-intelligence manifest.
- It writes the LGPL relink statement and the owner's contact address (§6).
- It fails the platform's job on each condition REQ-STARTUP-143 lists.

While this is built, the About page's lowercase lookup has to be repaired
(`../defects/fixed/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`). Otherwise the first
release carries the file and the About page still says it does not.

*Built 2026-09-27, with the About repair; first execution reported into ADR-0035, ADR-0054 and IC-7.* `pnpm notices`
(`tools/notices/`) writes `apps/desktop/resources/THIRD-PARTY-LICENSES.txt` only when validation passes, and exits 1
naming each problem otherwise (REQ-STARTUP-149). It builds under four readings, each an open question:

- OQ-72, what one entry is;
- OQ-73, Manrope and the machine tools;
- OQ-74, an identifier a dependency does not declare;
- OQ-75, when a licence file carries the licence's text. It was added by the gate review the same day.

**Where the owner writes the O-3 address.** In `tools/notices/release-inputs.json`, as the value of
`lgplCorrespondingSourcesAddress`. That file is the one place the generator reads it. The value must be one literal
address in one of two shapes:

- one e-mail address, alone or after a display name, as in `Rotaris Maintainers <sources@example.org>` with the
  owner's own domain in place of `example.org`. The example as written is refused, because `example.org` is reserved
  for examples, so a copied example cannot pass;
- a postal address of more than one part, separated by commas or lines, with a number and words in it.

Validation refuses each of these, naming what it found:

- a web page;
- more than one e-mail address, since REQ-STARTUP-142 asks for a single address;
- a no-reply route, which no maintainer monitors;
- a placeholder word (`N/A`, `none`, `TBA`, `TODO`, `REPLACE_ME` and the like), or a template's field name standing
  where the value goes (`Name <…>`, `Street 1, 12345 City, Country`);
- a stock template address: "Address line 1", "123 Main Street", Anytown, Nowhere, "Fake Street", Musterstadt, or a
  number made only of zeros;
- a domain reserved for examples and tests;
- a top-level label no mail reaches (`.tld`, `.domain`, `.local`, `.lan`, `.internal` and the like);
- a template's domain (`domain.com`, `host.com`, `test.com`) or local part (`test@`, `foo@`, `user@`, `john.doe@`).

Until an address that passes is written, validation fails and names the key.

**The check is a word-and-shape heuristic, and nothing more.** It refuses the placeholders it knows. It cannot tell
whether an address is the owner's, so an invented address that looks real still passes. In the other direction, a
real address that contains one of its words is refused, for example a street named "Sample Lane", a company named
"Unknown Pleasures", or a domain such as `sample-labs.com`. REQ-STARTUP-142 makes a truthful address the owner's
act. The check only catches a template left in place.

*Corrected 2026-09-27 by the gate review's second round.* The check as the first round left it still accepted
`Name <sources@domain.tld>`, which was the example this paragraph then gave. It also accepted `test@test.com`,
`noreply@…`, two addresses in one value, and the stock postal templates. The second round also found that an input
file holding only `null`, `false`, `0` or `""` was read as having nothing to report. With `release-inputs.json` set to
`null` over an otherwise valid fixture, the step exited 0 and the header read "(no address)". Every input that is not
a JSON object now fails as unparsable.

**What the first run refused, besides O-3.** Twelve shipped components carry no licence text. Four ship no licence
file at all:

- `@ai-sdk/provider-utils` 5.0.36;
- `@xterm/addon-serialize` 0.14.0;
- `@xterm/headless` 6.0.0;
- `proxy_tools` 0.1.0, in the code-intelligence runtime.

Eight ship a file that only refers to their licence (OQ-75):

- `@workflow/serde` 4.1.0, whose `LICENSE.md` points to a file it does not ship;
- `ai` 7.0.92, `@ai-sdk/gateway` 4.0.74, `@ai-sdk/openai` 4.0.58, `@ai-sdk/openai-compatible` 3.0.43 and
  `@ai-sdk/provider` 4.0.10, each with Apache-2.0's per-file notice only;
- `certifi` 2026.7.22, in the runtime, with MPL-2.0's Exhibit A only;
- `mslex` 1.3.0, in the runtime, with the Apache-2.0 notice and an authors list.

*Corrected 2026-09-27 by the gate review. This paragraph first said "Four shipped components carry no licence text",
listing only the first four. The generator had then counted any non-empty licence file as the text, so the eight
files that only refer to their licence passed.*

Each of the twelve passes only with a maintainer's reviewed exception in `tools/notices/reviewed-exceptions.json`
(O-11), and the file states why each is there. `dotenv` 0.9.9, in the runtime, declares no licence identifier.
REQ-STARTUP-143 as worded gives that no route, which is OQ-74.

**4.4 The two bundled assets.** The About page already has both "absent" branches (ADR-0054, 2026-09-08). The
build must now produce two files under `process.resourcesPath`:

- `build-id.txt` for REQ-SHELL-140;
- the notices file for REQ-SHELL-142.

`settings-proof` gains the present branch for each.

Two facts from §4.3 bear on this step:

- `pnpm notices` writes no file until O-3, O-11 and OQ-74 are answered. The notices file's present branch therefore
  needs a file the proof supplies itself. Once `pnpm notices` succeeds in a worktree, the built app finds its output
  through `about.ts`'s source-tree fallback, and the proof's absent-caption check turns red.
- REQ-STARTUP-015 asks for "exactly one copy" of the bundled tool server's licence text inside the bundle, citing
  REQ-STARTUP-142. ADR-0054 recorded the dist-info `LICENSE` as that copy. The notices file reproduces the same text
  again, so carrying the file makes two copies. This step decides which copy stands, or raises the question.

*Built 2026-09-27; first execution reported into ADR-0054 ("The two bundled assets") and ADR-0035.* What landed:

- **The build identifier.** `pnpm build-id` (`tools/build-id/`) writes `apps/desktop/resources/build-id.txt` (git-ignored)
  as one line: the full commit name of HEAD, with `-dirty` when the working tree differs from it. It is deterministic
  per commit and uses no network. ADR-0054 records why neither an abbreviation nor a tag is used.
- **The packaging.** `pnpm package` runs `pnpm notices` and then `pnpm build-id` before `electron-vite build`.
  `electron-builder.yml` carries both files to the root of `process.resourcesPath`, and `afterPack`'s "assets" rule
  checks them in the artifact.
- **While O-3 is owed, a local `pnpm package` fails** at the notices step (REQ-STARTUP-143). `ROTARIS_PACKAGE_WITHOUT_NOTICES=1`
  makes a development package without the notices file instead, removing any earlier one; any other value is a usage
  error (exit 2). Its About page shows the absent caption, the package says it is not releasable, and a build for a
  tag refuses the flag, in `package.mjs` and in `afterPack` alike. Its installer still carries a release artifact's
  name (ADR-0054 records this).
- **The licence copy.** The notices file's copy stands, because REQ-STARTUP-142 requires it there. The dist-info copy
  is filtered out of the artifact and kept in the source tree for the generator. The requirements decide this between
  them, so no question is raised.
- **The proof.** `settings-proof` launch 1′ measures the present branch of each asset. The notices file there is a
  fixture, as the first fact above says it must be. The proof puts back whatever `apps/desktop/resources/` held, byte
  for byte, so a successful `pnpm notices` no longer turns the absent check red. A real file written between a killed
  run and the next is kept, not taken for the proof's (the gate review's correction, ADR-0054); so is a real writer's
  removal of the proof's file, which leaves the name empty (its second round's).

**Owed:** the "assets" rule's first run against a real `win-unpacked`, at the next Windows `pnpm package`. No package
was run here (IC-3).

**4.5 The portable and its launcher stub.** REQ-STARTUP-031 names two Windows artifacts, so the portable is part of
the first release. The stub is ADR-0054's second build technology and has never been built. It is the largest
unknown in this plan, so its spike is taken as the first act of building it (CLAUDE.md), and the result goes
back into ADR-0054. Dropping the portable would need a further directive. This plan does not propose one.

**4.6 The updater.** The updater is the one part of this plan the owner did not name. A release that carries no
updater can never update itself: each of its users would have to download every later release by hand. The key
record of REQ-STARTUP-168 (b) starts with whichever build first carries a key. *Recommended: build it into the
first release*, following REQ-STARTUP-122's strict sequence. *Ruled 2026-09-27 as recommended (O-10,
[R-052](../product/requests.md#r-052)).* The sequence:

1. fetch the manifest and the signature;
2. verify the signature against the compiled-in key set;
3. parse the manifest;
4. stream the download to staging;
5. verify the digest;
6. apply, using the installer and portable strategies only. The dmg and AppImage strategies wait for the
   directive's withdrawal.

It shows no override anywhere (REQ-STARTUP-167). If the owner defers it, the release still compiles the key in,
so that the next release can add the updater without stranding anyone.

> **First execution, 2026-09-28 — built on Linux; the steps that need a Windows artifact are owed to the next Windows
> package.** Reported in ADR-0054 ("The updater") and in `first-executions.md`; built under
> [R-062](../product/requests.md#r-062).
>
> **What landed.** `apps/desktop/src/main/updater/`: the flavour classified once from the artifact the launch started
> from (REQ-STARTUP-106; a source-tree or development launch performs no check and issues no request), the one endpoint
> with the 10.0 s timeout and the Accept header (105), the offer rule with exact-name matching through
> `tools/release-naming` and the strict order (107/108/109), every check failure one `info` line (110), the summary
> (112), the manifest parser as the writer's exact inverse with a round-trip test (113, the format now in the naming
> authority), the six steps of 122 in order with the signature verified before the manifest is parsed, 123's exact
> sentences, the 1 MiB streaming into a `rotaris-update-` directory (118/124), the portable and installer strategies
> (115/125/126), the offer notice updated in place with the action disabled during the download (116, REQ-SHELL-114/118),
> the `updates/dismissedVersion` key written only by that notice's dismissal (116/117/146), the applied, hand-off and
> failure notices with `Restart now` and `Try again` (119/120/121), the 1200 ms single auto-close, the restart as
> ADR-0055's hand-over of the record to a successor (121, 161–164), and a quit that waits at most 5000 ms (046).
>
> **The key set is empty.** `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts` ships with no member
> because O-2 is owed. On this tree every install refuses at the signature step with one sentence saying the build
> carries no verification key, and nothing is downloaded — the mechanism whole, its trust anchor absent. **O-2 writes
> the public half there, as an SPKI PEM block** (§6). The signature is Ed25519, raw, over the manifest's exact bytes;
> §4.7's pipeline signs with `openssl pkeyutl -sign -rawin` or its equivalent, and OQ-76 asks whether the record
> should fix that form.
>
> **What was executed.** 145 unit cases over fakes (`pnpm vitest run apps/desktop/src/main/updater/ …`), and one
> driven launch of the built application under Xvfb (`pnpm updater-proof`, 7 checks): the development launch writes
> exactly one `update check:` line at `info` saying the build is not updatable and that no request is made, and a proxy
> sink standing in for the network saw no connection for `github.com`. **What was not, and is not faked (IC-3):** a
> check reaching the endpoint, an offer, a download, the installer and portable apply against a real artifact, and the
> restart between two processes — all owed to the next `pnpm package` on Windows.
>
> **Found beside it:** the built application's runtime opens `CONNECT redirector.gvt1.com:443` on its own — Chromium's
> component updater — which REQ-STARTUP-160's disclosure cannot name
> ([note](../defects/the-built-app-opens-a-connection-to-chromiums-component-updater.md)). **Raised:** OQ-76 (the
> signature's form), OQ-77 (a packaged Windows build with neither a registry match nor the launcher's variable —
> ADR-0054 says not updatable, REQ-STARTUP-106's copied-tree sentence says portable), OQ-78 (REQ-STARTUP-118 against
> REQ-SHELL-118 on the download notice's title, persistence and the pause before the apply). **Two obligations the
> portable stub (§4.5) inherits:** publish `ROTARIS_PORTABLE_ARTIFACT` with the artifact's absolute path, and forward
> its arguments to the payload, which the successor launch's token depends on.
>
> **Repaired at verification, the same day.** The independent verification found three defects and the repair's tests
> a fourth, each now pinned beside its unit (ADR-0054 "The updater", *Repaired at verification*): an inherited
> `APPIMAGE` made a source-tree launch updatable and contacted the feed (the released-artifact test now runs first, the
> AppImage test on a packaged Linux build alone; `pnpm updater-proof` now launches with both artifact variables set, 8
> checks); the instance record passed to any announced successor, not only one a waiting restart started (a second
> instance — `acceptSuccessor`); a later window's check re-offered an installed update and dropped `Restart now`; and
> the `<name>.old` cleanup ran per window rather than per launch, deleting the backup the same process had just made.
> 152 unit cases. **Raised by it:** OQ-79 (whether the installer's auto-close and the restart's close ask
> REQ-STARTUP-046's active-run confirmation); OQ-77 now cites REQ-STARTUP-147's sentence too.
>
> **Repaired at the second verification, the same day.** A successor that started and was accepted, but that the
> record could not be passed to (the record no longer this instance's, or the atomic replacement failed), left the
> restart waiting for ever and every later update action `update.busy`; the claim now reports the refusal
> (`onRecordPassFailed`), main's wait (`updater/successor.ts`) rejects, and `Update not installed` surfaces with the
> reason (REQ-STARTUP-121). 162 unit cases in 15 files. A successor whose 5 s bound expired while the predecessor was
> blocked can still be passed the record after it has gone — filed in `../defects/`, not repaired.

**4.7 The manifest, the signature and the key record.** The pipeline writes and signs these:

- `SHA256SUMS.txt`, sorted, with two-space separators, covering every asset except itself and the signature;
- `SHA256SUMS.txt.sig`, a detached signature, made with the pipeline secret;
- the key record, meaning which verification keys each shipped build carries, committed to the repository with
  each release so that REQ-STARTUP-168 (b) can be decided before publishing.

**4.8 The release body.** A generator writes REQ-STARTUP-035's seven elements, narrowed by `PD-STARTUP-001`, and
REQ-STARTUP-033's changelog. The first release reads "First release — no previous tag to compare against." The
release is named "Rotaris &lt;version&gt;" (REQ-STARTUP-034). The generator is unit-tested per element.

**4.9 The icon.** The owner supplies it (§6). `apps/desktop/resources/` is created for it, and
`electron-builder.yml` names it.

## 5. The release gate

This is REQ-STARTUP-156 narrowed to one key. Each check is recorded as pass, fail, or "not performed". A check
that was not performed fails the gate.

| Check | Where it runs |
|---|---|
| The version guard and the package-pin guard pass | pipeline |
| Notices validation passes | pipeline |
| `SHA256SUMS.txt` covers every asset, and every digest matches | pipeline |
| The signature verifies, against a key every offerable build carries (168 b) | pipeline, against the key record |
| The body carries its seven elements, as the directive narrows them | pipeline |
| Installer and portable launched to first paint under REQ-STARTUP-159's four conditions; the portable twice | the gate machine (§6) |

**The gate machine** must meet REQ-STARTUP-156's four conditions:

- a Windows x64 machine that is not used for building or development;
- no Node, no Python and no other separately installed runtime;
- outbound network blocked for the whole check;
- the artifact is downloaded from the draft release and matches its manifest line.

A snapshot-restored virtual machine meets all four, and restoring it between releases is allowed. This repo's
development machine is Windows ARM64, and REQ-STARTUP-026 makes emulation carry no acceptance criterion, so it
cannot be the gate.

**The conditions that bind this release:**

- **IC-7** is discharged by §4.3. *Discharged 2026-09-27: the generator lists the language servers.*
- **IC-4** half 2 is the owner's (§6). It binds the restore's sign-off, and the restore ships in this release.
- **IC-3 and IC-8** bind only artifacts this release does not publish.
- **ESC-6** already accepted win32 reporting confinement as `available: false` for the first release.

## 6. What only the owner can do

| # | What | Needed by |
|---|---|---|
| O-1 | ~~Rule ESC-37, ESC-38, ESC-39 and OQ-64~~ **ruled 2026-09-27** as recommended (R-052) | §2.2, §3.3 |
| O-2 | Generate the manifest signing key pair and store the private half as a repository secret. The public half is committed. **Where and how (2026-09-28, §4.6's first execution):** the pair is Ed25519 (`openssl genpkey -algorithm ed25519 -out release-signing.pem`); the public half (`openssl pkey -in release-signing.pem -pubout`) is written as one element of `RELEASE_SIGNING_KEYS` in `apps/desktop/src/main/updater/keys.ts`, the SPKI PEM block verbatim, `-----BEGIN PUBLIC KEY-----` to `-----END PUBLIC KEY-----`; the pipeline signs `SHA256SUMS.txt`'s exact bytes with `openssl pkeyutl -sign -inkey release-signing.pem -rawin -in SHA256SUMS.txt -out SHA256SUMS.txt.sig` (a raw 64-byte signature). Until the element exists every install refuses at the signature step and downloads nothing | §4.6, §4.7 |
| O-3 | Give the literal contact address for the LGPL source request (REQ-STARTUP-142). It must be a single address, reachable without an account and monitored by the maintainers. **Written in `tools/notices/release-inputs.json`, key `lgplCorrespondingSourcesAddress`**, in one of the two shapes §4.3 states; validation fails naming that key until it is | §4.3 |
| O-4 | Supply an icon, with the `.ico` sizes `electron-builder` asks for | §4.9 |
| O-5 | ~~Choose where releases are published~~ **ruled 2026-09-27** (R-053): GitHub releases of `theUpsider/Rotaris-crw`, the product repository REQ-STARTUP-038 names | §4.2 |
| O-6 | Provide the gate machine of §5. **Form ruled 2026-09-27** (R-053): a snapshot-restored Windows x64 virtual machine, restored between releases. The owner still provides it | §5 |
| O-7 | IC-4 half 2: rename the machine and reboot (`ROTARIS_IC4_PHASE=prepare`, then `verify`) | the restore's sign-off |
| O-8 | The power-loss test's fault half: a forced power-off during a save (`spikes/power-loss.md` §4) | the store's sign-off |
| O-9 | ~~Approve the §2.3 and §3.4 live runs~~ **approved 2026-09-27** (R-053). The agent still states the scenario and its spending bound immediately before each run (AGENTS.md) | §2.3, §3.4 |
| O-10 | ~~Decide §4.6~~ **ruled 2026-09-27**: the updater ships in the first release (R-052) | §4.6 |
| O-11 | As a maintainer, review each shipped component that carries no licence text, and record the review in `tools/notices/reviewed-exceptions.json`: the component, the version range, the identifier claimed, why no text is obtainable, the reviewer, the date and an expiry at most 365 days later (REQ-STARTUP-143). The first run named twelve (§4.3). Four ship no licence file: `@ai-sdk/provider-utils` 5.0.36, `@xterm/addon-serialize` 0.14.0, `@xterm/headless` 6.0.0 and `proxy_tools` 0.1.0. Eight ship a file that only refers to the licence (OQ-75): `@workflow/serde` 4.1.0, `ai` 7.0.92, `@ai-sdk/gateway` 4.0.74, `@ai-sdk/openai` 4.0.58, `@ai-sdk/openai-compatible` 3.0.43, `@ai-sdk/provider` 4.0.10, `certifi` 2026.7.22 and `mslex` 1.3.0. For those eight, OQ-75 asks whether the generator should reproduce the declared licence's standard text instead. *Added 2026-09-27 by §4.3's first execution. It first named only the four without a licence file; the gate review corrected it the same day* | §4.3 |

O-2, O-3, O-4, O-7 and O-8 carry no recommendation to take: each is a value or an act only the owner can
supply, and each stays owed (R-053). O-11 is the same kind of item: a review only a maintainer may sign.

## 7. Order of work

1. ~~**Rulings.** O-1 and O-10, then one amendment round for whichever ESC readings stand.~~ **Done 2026-09-27**
   ([R-052](../product/requests.md#r-052)): every ruling as recommended, and the amendment round landed with it.
2. **In parallel, after step 1.** Each item is its own worktree with its own first-execution row:
   - ~~§2.2 `/skills`;~~ **built 2026-09-27** (§2.2's first-execution note);
   - ~~§3.2 the latency measurement plus §3.3 the injection proof;~~ **built 2026-09-27** (the Windows gate-class
     reading owed);
   - ~~§4.1 the version guard~~ **built 2026-09-27**. It found that **the setup manifest is owed and scheduled nowhere**.
     The manifest has to exist, with Git, ripgrep, the language servers and the `@playwright/mcp` pin
     (`REQ-STARTUP-058/059`), before §5's first check can pass. §4.3's section is generated from the same file, so
     that step is where it most naturally lands, and it lands packed: an `extraResources` entry, and either the
     guard's `toolServerPackages` field or a change to the guard's constant;
   - §4.3 the notices generator with the About defect — *built 2026-09-27; validation refuses until O-3, O-11 and OQ-74.
     OQ-72 does not stop validation, but until it is ruled the file knowingly leaves out the libraries linked into
     the bundled interpreter*;
   - §4.4 the bundled assets — *built 2026-09-27; its "assets" rule waits for the next Windows package.*
3. **The portable stub (§4.5).** Spike first, and report the result into ADR-0054.
4. ~~**The updater (§4.6)** if O-10 includes it~~ **built 2026-09-28** (§4.6's first-execution note; its apply and
   restart steps owed a real Windows artifact), then the manifest and signature (§4.7) against O-2's key.
5. **Assembly.** The release body (§4.8), the icon (§4.9) and the tag workflow (§4.2), run end to end against a
   prerelease tag (for example `v0.1.0rc1`) as a draft.
6. **The gate (§5)** on O-6's machine, with the §2.3 and §3.4 live runs. When the gate is green, the owner
   publishes `v0.1.0`.

Each step owes what CLAUDE.md states for any change: `pnpm check` green, the affected view updated, and a
mechanism's first execution reported into its record and into `first-executions.md`.
