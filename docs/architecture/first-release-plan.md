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
| Skills — `/skills`, REQ-CHAT-162's listing | ~~**not built** (`SKILLS_LISTING_NOT_BUILT`, `packages/ui/src/slash/skills.ts`)~~ **built 2026-09-27** (`pnpm skills-proof`, launches 1c and 1d); OQ-66 open against its reach from Settings | §2 |
| Skills — ESC-37, ESC-38, ESC-39 | **ruled 2026-09-27** as recommended ([R-052](../product/requests.md#r-052)); amended | §2 |
| Workspace-context injection, REQ-WORKSPACE-041..050 | built 2026-09-22 under `PD-WORKSPACE-002` | §3 |
| Injection — REQ-WORKSPACE-049's latency bound, a built-app proof | **owed**; OQ-64 **ruled 2026-09-27** | §3 |
| The Windows release pipeline, REQ-STARTUP-027..038, 141..143, 156, 158, 167, 168 | the installer built once (ADR-0054, 2026-09-04); nothing else | §4 |
| The updater, REQ-STARTUP-107..124 | **not built** — no module in `apps/desktop/src/main/`; **in the first release**, ruled 2026-09-27 | §4.6 |

**Deferred by "thats it".** Each item stays owed where the record already carries it:

- The other product gaps in `codebase.md`'s "Where the next work lands", for example providers' device-code and
  PKCE authenticators, Git integration and merge, the manual compression part, and persona memory.
- The open notes in `../defects/`.
- The four red proofs: `transcript-proof`, `library-proof`, `part-h-proof`, and `theme-proof`'s contrast section
  (OQ-56).
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
- *The open question.* [OQ-66](open-questions.md): REQ-CHAT-162 wants the listing reachable from the settings
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

**2.3 A skills live run.** One `pnpm live-run` scenario invokes a skill command and asserts that the model's
first turn shows the skill's body was in its context. It spends the owner's money, so it runs only when the
owner asks (AGENTS.md).

## 3. Must-have: workspace-context injection

**Built** (first-executions row 2026-09-22):

- the Instructions category as an editor over four bases past the workspace root;
- a per-file switch;
- `instructions.overrides`, written sparsely;
- injection through `apps/desktop/src/run-host/skills.ts` and `packages/config/src/instructions.ts`.

These are unit-tested only.

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

**3.3 A built-app proof.** `pnpm injection-proof` is new and belongs in the AGENTS.md index. It opens a
workspace with instruction files at each base, switches one off, starts a scripted run, and reads what the
model port received. It asserts four things:

- order;
- presence;
- the switched-off file's absence;
- the OQ-64 outcome.

It also covers REQ-WORKSPACE-050's worktree case: a run in an isolated worktree reads context from the run's
execution root.

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

**4.2 The tag workflow.** `.github/workflows/release.yml` does not exist yet. It is triggered only by tags
matching REQ-STARTUP-027's grammar. Channel classification follows REQ-STARTUP-029. The stages, each failing
the release on its own:

1. guards;
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
(`../defects/the-about-page-looks-for-the-licence-bundle-under-a-lowercase-name.md`). Otherwise the first
release carries the file and the About page still says it does not.

**4.4 The two bundled assets.** The About page already has both "absent" branches (ADR-0054, 2026-09-08). The
build must now produce two files under `process.resourcesPath`:

- `build-id.txt` for REQ-SHELL-140;
- the notices file for REQ-SHELL-142.

`settings-proof` gains the present branch for each.

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

- **IC-7** is discharged by §4.3.
- **IC-4** half 2 is the owner's (§6). It binds the restore's sign-off, and the restore ships in this release.
- **IC-3 and IC-8** bind only artifacts this release does not publish.
- **ESC-6** already accepted win32 reporting confinement as `available: false` for the first release.

## 6. What only the owner can do

| # | What | Needed by |
|---|---|---|
| O-1 | ~~Rule ESC-37, ESC-38, ESC-39 and OQ-64~~ **ruled 2026-09-27** as recommended (R-052) | §2.2, §3.3 |
| O-2 | Generate the manifest signing key pair and store the private half as a repository secret. The public half is committed | §4.7 |
| O-3 | Give the literal contact address for the LGPL source request (REQ-STARTUP-142). It must be reachable without an account | §4.3 |
| O-4 | Supply an icon, with the `.ico` sizes `electron-builder` asks for | §4.9 |
| O-5 | ~~Choose where releases are published~~ **ruled 2026-09-27** (R-053): GitHub releases of `theUpsider/Rotaris-crw`, the product repository REQ-STARTUP-038 names | §4.2 |
| O-6 | Provide the gate machine of §5. **Form ruled 2026-09-27** (R-053): a snapshot-restored Windows x64 virtual machine, restored between releases. The owner still provides it | §5 |
| O-7 | IC-4 half 2: rename the machine and reboot (`ROTARIS_IC4_PHASE=prepare`, then `verify`) | the restore's sign-off |
| O-8 | The power-loss test's fault half: a forced power-off during a save (`spikes/power-loss.md` §4) | the store's sign-off |
| O-9 | ~~Approve the §2.3 and §3.4 live runs~~ **approved 2026-09-27** (R-053). The agent still states the scenario and its spending bound immediately before each run (AGENTS.md) | §2.3, §3.4 |
| O-10 | ~~Decide §4.6~~ **ruled 2026-09-27**: the updater ships in the first release (R-052) | §4.6 |

O-2, O-3, O-4, O-7 and O-8 carry no recommendation to take: each is a value or an act only the owner can
supply, and each stays owed (R-053).

## 7. Order of work

1. ~~**Rulings.** O-1 and O-10, then one amendment round for whichever ESC readings stand.~~ **Done 2026-09-27**
   ([R-052](../product/requests.md#r-052)): every ruling as recommended, and the amendment round landed with it.
2. **In parallel, after step 1.** Each item is its own worktree with its own first-execution row:
   - ~~§2.2 `/skills`;~~ **built 2026-09-27** (§2.2's first-execution note);
   - §3.2 the latency measurement plus §3.3 the injection proof;
   - §4.1 the version guard;
   - §4.3 the notices generator with the About defect;
   - §4.4 the bundled assets.
3. **The portable stub (§4.5).** Spike first, and report the result into ADR-0054.
4. **The updater (§4.6)** if O-10 includes it, then the manifest and signature (§4.7) against O-2's key.
5. **Assembly.** The release body (§4.8), the icon (§4.9) and the tag workflow (§4.2), run end to end against a
   prerelease tag (for example `v0.1.0rc1`) as a draft.
6. **The gate (§5)** on O-6's machine, with the §2.3 and §3.4 live runs. When the gate is green, the owner
   publishes `v0.1.0`.

Each step owes what CLAUDE.md states for any change: `pnpm check` green, the affected view updated, and a
mechanism's first execution reported into its record and into `first-executions.md`.
