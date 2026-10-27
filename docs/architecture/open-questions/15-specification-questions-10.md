# Open questions — Specification questions (10 of 27)

Part 15 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-86 – OQ-94.

<a id="oq-86"></a>

**OQ-86 — Does the update's own close ask REQ-STARTUP-046's active-run confirmation?** *(REQ-STARTUP-046, REQ-STARTUP-119, REQ-STARTUP-121; ADR-0054 "The updater". Raised 2026-09-28 by the verification of the updater, first-release-plan.md §4.6, under R-062. Raised as OQ-79 on its branch; renumbered OQ-86 at the merge, because OQ-76 to OQ-82 were already on `main`. Ruled 2026-10-06 by the owner, and built.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** REQ-STARTUP-046's confirmation governs the
update's closes and is asked when the user clicks the action, before the installer or the successor starts, so a run is
never ended without warning. Read, where the ruling leaves it open, as: `Restart now` always asks, `Update now` and `Try
again` ask only on the installer flavour (the one whose hand-off closes the windows, REQ-STARTUP-119); "a run is active"
is the run host's instance-wide count, since every window closes, and a count that cannot be read asks; the returning
answer starts nothing and leaves the notice as it was; accepted, the closes are made as before without a second ask. No
requirement's text is departed from — REQ-STARTUP-119/121 still close as they say, after the confirmation — so the ruling
alone settles it. Built the same day (`UpdaterDeps.confirmClose`, `apps/desktop/src/main/updater/updater.ts`; plan fin21).
Corrected the same day at the build's verification, which found "without a second ask" leaves a run unwarned: the
installer's download follows the click and can take minutes while the window accepts input, so a run started then (or
any run, where none was active at the click and nothing was asked) was ended by REQ-STARTUP-119's auto-close with no
confirmation. Read since: the count is re-read again **immediately before the installer is spawned or the successor
started** (`UpdaterDeps.activeRuns`, `runInstall`'s `beforeApply`, `mustAskAtHandOff`). After the download any run active
then is asked about again, since a count carries no identity and cannot say the run is one the click's answer covered;
`Restart now`, with nothing between the click and the start but the click's own box, asks again only for a run past the
count the click was asked about, or where the click asked nothing. Declined at that point, the verified download is
discarded, nothing is started, and the offer comes back in the same notice. The confirmation is part of the one update
operation in flight (REQ-STARTUP-114), so a second click while its box is open is refused rather than opening another.
The reading below is kept as the build proceeded under it until then. *Since [OQ-311](61-spikes-and-later-questions-28.md#oq-311) (ruled 2026-10-14 under R-072,
built by fin46): the same clicks are user-initiated closes for REQ-SHELL-119 guard (1), so every main window's unsaved-settings
guard is asked first, at the click and again at the hand-off, and this confirmation follows it; this ruling said nothing of
guard (1).*

REQ-STARTUP-046: "When a run is active, a confirmation SHALL be presented before anything is torn down; declining it SHALL abort the close, leaving the window open and accepting input and the run still executing." REQ-STARTUP-119: "when the hand-off requires quitting (Windows installer), the window SHALL auto-close after a 1200 ms single delay." REQ-STARTUP-121: "the current window closes only after the successor has started". The installer's auto-close and the restart's close are closes of a window, and a run may be active in it when the user chooses `Update now` or `Restart now`. If the confirmation is asked and declined, the installer is already running against the tree the window runs from, and after a restart the record has already passed to the successor, so the declining instance would stay beside the one that now holds the record.

**What the build proceeds under.** ADR-0054's stated reading: both closes destroy the main windows without the confirmation (`mainWindows.dispose()`), because the user chose the action and, after the record has passed, the predecessor must not stay. **What a ruling decides.** Whether REQ-STARTUP-046's confirmation governs these two closes — then it has to be asked *before* the installer is spawned and before the successor is started, which moves it from the close to the action — or whether REQ-STARTUP-119/121 are exceptions REQ-STARTUP-046 should name.

**OQ-87 — What does a machine tool's "archive layout" comprise, and what are its expected executables relative to?** *(REQ-STARTUP-058 with REQ-STARTUP-085, REQ-STARTUP-086 and REQ-STARTUP-088. Raised 2026-09-28 by building the setup manifest, first-release plan §4.1. Raised as OQ-76 on its branch; renumbered OQ-87 at the merge, because OQ-76 to OQ-86 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built, before the first manifest ships: `layout` is the archive `format` with its `topLevelDirectory` (or `null`), and expected executables are relative to that directory when one is declared and to the archive root otherwise.

REQ-STARTUP-058 has each per-platform archive artifact declare "archive layout, expected executables" and says no more
about either. REQ-STARTUP-085 fixes the three archive formats extraction accepts and normalises entry names;
REQ-STARTUP-086 requires every expected executable to exist in staging before the tree is promoted, but names no base
the paths are relative to. The archives the manifest pins differ in exactly this respect: MinGit's entries sit at the
archive root (`cmd/git.exe`, `mingw64/bin/git.exe`), ripgrep's under one directory named after the archive
(`ripgrep-15.2.0-x86_64-pc-windows-msvc/rg.exe`). Whether the managed tool directory (`tools/<tool>/<provisioned_version>/`,
REQ-STARTUP-070) holds that directory or its contents decides which paths REQ-STARTUP-088 can prepend.

**What the build proceeds under.** `layout` is two things (`ArchiveSchema` in `packages/config/src/setup-manifest.ts`):
the archive `format`, one of REQ-STARTUP-085's three, and `topLevelDirectory`, the one directory every entry sits under,
or `null` when entries sit at the archive root. `executables` are written relative to that directory when one is
declared and to the archive root otherwise — `rg.exe` and `cmd/git.exe`, never `ripgrep-15.2.0-…/rg.exe` — which reads
the consumer as promoting the directory's contents, so a managed tool directory holds the executables at the same
paths whatever the archive did. Which subdirectory of a tool's managed directory is prepended to PATH is the consumer's
(REQ-STARTUP-088); the manifest names executables and nothing about PATH.

**What a ruling decides.** Whether "archive layout" is the format alone, the format with the top-level directory, or
something else (a list of entries to keep, a strip depth); and whether expected executables are relative to the archive
root or to the promoted tree. A different reading changes the schema's `layout` object and the shipped file, and the
fingerprint of REQ-STARTUP-061 with them, so it is cheapest before the first release ships a manifest that installations
have set up from.

**OQ-88 — May a setup manifest key an archive under REQ-STARTUP-060's raw `<os>-<machine>` fallback?** *(REQ-STARTUP-060 with REQ-STARTUP-058. Raised 2026-09-28 by the independent verification of the setup manifest, first-release plan §4.1. Raised as OQ-77 on its branch; renumbered OQ-88 at the merge, because OQ-76 to OQ-86 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: a setup manifest keys an archive under the three platform keys alone, and a host whose key is REQ-STARTUP-060's raw fallback finds no archive to select.

REQ-STARTUP-060 names three platform keys, "with a raw `<os>-<machine>` fallback for anything else", and says the keys
are shared between release artifact naming, updater asset selection and manifest artifact selection. It does not say
whether the fallback is a key a manifest may *write* an archive under, or only one a host may *compute* and then find
nothing under. The first reading makes the manifest's key set open-ended (any `<os>-<machine>` string); the second keeps
it to the three, which is what artifact naming (`PLATFORM_KEYS` in `tools/release-naming`) already does.

**What the build proceeds under.** The second. `SetupManifestSchema` (`packages/config/src/setup-manifest.ts`) admits an
archive only under one of the three keys, and `tools/release-guard/src/pins.test.ts` pins that an archive under
`freebsd-x86_64` is refused and that `config`'s key list equals release naming's. A host whose key is a fallback finds
no archive to select; what machine setup then does (REQ-STARTUP-060 onward, REQ-MCP-112's setup half) is the consumer's,
not built.

**What a ruling decides.** Whether a manifest may carry an archive for a platform outside the three. A ruling for the
first reading widens the schema's key to a pattern and changes nothing in the shipped file; either reading leaves the
consumer to state what a host with no matching archive is told.

**OQ-89 — Under a burst, is REQ-CHAT-055's append comparison read on the update as it arrived, or on an update that arrived alone?** *(REQ-CHAT-055, REQ-CHAT-154, REQ-CHAT-157; ADR-0045's measurement point. Raised 2026-09-28 by the measurement round R-048 authorized, taken under [R-062](../../product/requests.md#r-062); the note is `docs/defects/fixed/appending-at-1200-rows-costs-two-to-three-times-an-empty-transcript.md`. Raised as OQ-76 on its branch; renumbered OQ-89 at the merge, because OQ-76 to OQ-88 were already on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** the first reading is taken, as the entry recommends: REQ-CHAT-055's comparison is read on every update as it arrived, the queue in front of it included, with the third sentence read at one frame of slack as `transcript-proof` reads it. A conformance harness need not construct the quiet-surface case, and work proportional to the visible rows is within the requirement.

REQ-CHAT-055 fixes "cost" as the time from an update's application to the frame that shows it, and compares that
figure for an appended row at a thousand rows with the same figure on an empty transcript. The round found the proof's
scripted run to be a burst: thirty increments arriving 4–13 ms apart, faster than the renderer shows them, so 57 of 62
samples a side measured the queue in front of them and the median stood at five to seven frames on BOTH sides while an
increment that arrived alone showed in two. The requirement does not say which of these the comparison is made on:

- **the update as it arrived**, queue included — what the reader waits, and the reading under which any work the
  product does per increment is multiplied by the increments queued in front of the one measured; or
- **an update that arrived to a quiet surface** — the cost of showing one row and nothing else, which in a scripted
  run is a handful of samples a launch, too few for a verdict on their own.

A second reading is bound up with it. The requirement's first sentence permits work proportional to **how many rows
are visible**, and its third compares against **an empty transcript** — which, once the run has appended to it, shows
eight rows where the loaded transcript shows a full viewport of nineteen. Work the first sentence permits therefore
moves the comparison the third sentence makes, and the requirement does not say by how much it may.

**What the build proceeds under.** `transcript-proof` reads the comparison **both ways and requires both to hold**
with one frame of slack at the cadence it measured: on every update as it arrived (pooled, sixty-two a side,
alternating launches) and on the row appends among them; it reports the samples that arrived alone and the isolated
ones beside them without a verdict of their own, because their count does not carry one. The burst is the same on
both sides, so the first reading is a fair comparison of per-increment cost; the repair made that cost independent
of the rows held (one bounded projection per increment, no row re-rendered for a value it could not see change), and
the residual difference — a full viewport of rows moving under the tail pin against a part-empty one — is inside the
slack. **A ruling would decide** whether a conformance harness must construct the quiet-surface case (spacing its
updates so each is shown before the next arrives, which the benchmark domain's phases do not do), and whether a
visible-row term is within the requirement while the third sentence's comparison holds, or is itself the thing the
third sentence forbids. Recommended: the first reading, as the one a reader experiences and the one the benchmark's
phases can measure, with the third sentence read at one frame of slack as the proof reads it.

**Evidence, 2026-09-29 — the CPU-profile round (recorded for the ruling; not a ruling).** The paragraph above says the
2026-09-28 repair made the per-increment cost independent of the rows held. V8's CPU profile of the built app showed it
had not: the transcript's own code still walked every displayed row on every increment — 1.03 ms of +1.50 ms of script
an increment at 1,234 rows against 35 — repaired the next day (the note, "The CPU profile"), after which twelve
consecutive runs of the proof passed both cuts, the loaded side above the empty side at the median in four of twelve;
with five more, sixteen of seventeen, on a host other agents shared. The profile also measured what bears on this
question's second half. The pooled empty side holds two viewport states: its first launch starts at one row and gains
seventeen, so its viewport never fills and an append binds one new slot while every other slot keeps its row; its second
starts at eighteen and fills within a few appends. The loaded side is always at the tail of a full viewport, where each
append moves the bound range and rebinds every bound slot. Profiled apart on the repaired build (two pairs, a fresh
one-row `S0` against `S1200` at 1,200), that shape still costs the loaded side about **2.0 ms more an increment**:
layout +0.84 ms, nearly all of it forced by the tail pin, over twice the layout objects (72.0 and 79.5 dirty objects an
increment against 34.9 and 35.3; 11.6 and 13.0 text-shaping passes against 5.7), React's DOM writes for the rebound
slots +0.21 ms, style, paint and native time +0.6 ms, and the residue over the rows held +0.4 ms, which a one- to
eighteen-row empty side does not cancel. Bar the residue it is visible-row work, which the first sentence permits, and
under a burst the queue multiplies it as it multiplies everything else — so on this harness the third sentence's
comparison, read against the first launch's part-empty viewport, charges a full viewport's rebinding to the loaded side;
the runs above pass with it charged. What the comparison **can** decide here: a per-increment term that grows with the
rows held and is large enough to move the pooled median by a frame — the one this round repaired failed it in eight of
the twenty-one runs before the repair, and after it the comparison failed once in seventeen, on a saturated host. What
it **cannot**: whether a residual inside a frame is depth-dependent work, visible-row work or the host, because a run's
two sides are separate launches whose medians move by 20 ms with the host's load — two runs on the repaired build with
no other Electron process but a load of up to 9 on four vCPUs read +21.15 ms (the one red since the repair) and −19.70
ms; only a profile of the same increments names that, which is why the proof now carries one.

**OQ-90 — Are the variables that name a launch's artifact removed from what the product's children inherit, and which requirement says so?** *(REQ-STARTUP-147, REQ-STARTUP-106, REQ-HOOKS-032; ADR-0054, "The updater", item (6). Raised 2026-09-28 by repairing `docs/defects/fixed/the-artifact-variables-reach-the-products-own-child-processes.md` under [R-062](../../product/requests.md#r-062).)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed, with one sentence added to REQ-STARTUP-147 that REQ-HOOKS-032 cites, as the entry recommends: main removes the variables naming its launch's artifact from its own environment before it starts any child, and a hook sees the application's environment less those two. [`PD-STARTUP-004`](../../product/directives/pd-startup-004.md#pd-startup-004) states it and narrows both requirements.

REQ-STARTUP-147 says a variable naming the artifact a launch started from is "set by the artifact's own runtime rather
than by a user" and "decides which file an update replaces", and REQ-STARTUP-106 takes the classification from "the
artifact the launch started from". Neither says what the product's own children receive. REQ-STARTUP-147's closing
sentence lists the "Variables written for child processes" — `PATH`/`Path`, `UV_CACHE_DIR`, `npm_config_cache` — and
names none removed; REQ-HOOKS-032 says a run started from the desktop application "sees exactly the environment the
application itself was started with", which read literally includes `APPIMAGE` and the portable launcher's
`ROTARIS_PORTABLE_ARTIFACT`.

**What the build proceeds under.** Main takes both names out of its own environment before it starts any child, so no
run host, workspace service, tool, terminal, hook, MCP server or code-intelligence branch carries them: a copy a child
inherits names an artifact that is not the child's launch, and a Rotaris started from inside one would otherwise
classify itself from the other's file. A hook therefore sees the application's environment less those two names.
**A ruling would decide** whether REQ-STARTUP-147 gains the removal beside the variables it writes for child
processes, and whether REQ-HOOKS-032's "exactly" is read over the environment less the artifact's own variables.
Recommended: both, as one sentence in REQ-STARTUP-147 that REQ-HOOKS-032 cites.

**OQ-91 — Does REQ-CHAT-048's "per agent" scope the comparison, or only the row that is dropped?** *(REQ-CHAT-048;
ADR-0046 step 4, the lookback its bounded form preserves. Raised 2026-09-28 by repairing
`docs/defects/fixed/duplicate-reasoning-hygiene-compares-with-the-previous-thinking-row-of-any-agent.md` under
[R-062](../../product/requests.md#r-062); raised as OQ-90 on its branch and renumbered at the merge, OQ-90 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: "per agent" scopes the whole rule, so an agent's unstamped repeat is compared with that agent's own previous thinking row, whatever other agents reasoned in between.

REQ-CHAT-048 reads: "per agent, an unstamped (no duration) thinking row whose content equals the immediately previous
thinking row's content MUST project to zero rows". When two agents' reasoning interleaves — agent A's burst, then
agent B's, then an unstamped repeat of A's — the sentence has two readings:

- **"per agent" scopes the whole rule**: "the immediately previous thinking row" is A's own, so A's repeat is dropped
  whatever other agents reasoned in between, and an agent's burst is never compared with another agent's; or
- **"per agent" scopes only the dropped row**: "the immediately previous thinking row" is the transcript's, so the
  repeat is compared with B's row, is not equal to it (or names another agent), and is kept — A's duplicated burst
  is displayed twice whenever any other agent reasoned between the two copies.

**What the build proceeds under.** The first reading: the requirement's purpose clause — "so sessions recorded with
duplicated streamed reasoning display each burst once" — is met by it for every interleaving and by the second only
when no other agent reasons between the copies, which is the common case once children run in parallel. The
projection keeps, per agent, that agent's immediately previous thinking row (`previousThinkingByAgent` in
`packages/ui/src/transcript/project.ts`), and the bounded form of ADR-0046 step 4 looks each agent's row up lazily
below its cut, so the two forms agree (`projector.test.ts`'s seeded walk). Agent identity is the row's `name`, as the
comparison always read it. **A ruling for the second reading** would restore the any-agent lookback
(`lastThinkingBefore`, one scan below the cut) and turn the interleaved cases in `transcript.test.ts` around; nothing
else depends on it.

**OQ-92 — Where does `THIRD-PARTY-LICENSES.txt` report the tool-server package versions REQ-STARTUP-152 asks it to?** *(REQ-STARTUP-152 with REQ-STARTUP-142 and REQ-STARTUP-058. Raised 2026-09-28 by repairing the notices file's tools section under [R-062](../../product/requests.md#r-062); the note is `../../defects/fixed/the-notices-file-says-the-setup-manifest-pins-no-machine-tools.md`; raised as OQ-90 on its branch and renumbered at the merge, OQ-90 and OQ-91 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** confirmed as built: the notices file's `Tools provisioned after installation` section gains a third sub-heading, `Tool-server packages`, after the language servers. [`PD-STARTUP-005`](../../product/directives/pd-startup-005.md#pd-startup-005) extends REQ-STARTUP-142.

REQ-STARTUP-152 requires "the tool and MCP package versions a build provisions and warms" to be "the same versions its
`THIRD-PARTY-LICENSES.txt` reports". REQ-STARTUP-142 says what the file's `Tools provisioned after installation`
section contains. It holds Git and ripgrep, then a sub-heading naming the bundled code-intelligence runtime with its
language servers. It names no place for the MCP packages REQ-STARTUP-058 pins, `@playwright/mcp` 0.0.80 in this
build. Nor are they "dependencies present in the shipped artifact": the built-in configuration launches them through
`npx`, which fetches them.

**What the build proceeds under.** A third sub-heading of the same section, `Tool-server packages`, after the language
servers, lists each package the manifest's `toolServerPackages` pins with REQ-STARTUP-142's four fields. It states
that a tool server of the built-in configuration launches each through its package runner, which downloads it when
that tool server is first started, and that none is contained in the artifact. The sub-heading is left out for a
manifest that pins no package. REQ-STARTUP-142's order, machine tools then the runtime's sub-heading, is kept.

**What a ruling decides.** Whether REQ-STARTUP-142 gains the sub-heading, with its wording, or the versions belong
somewhere else in the file.

**OQ-93 — Is a text field spell-checked, and if so, from what?** *(REQ-STARTUP-160, REQ-SHELL-005, REQ-STARTUP-159. Raised 2026-09-28 by the repair of `docs/defects/fixed/the-built-app-opens-a-connection-to-chromiums-component-updater.md`, under [R-062](../../product/requests.md#r-062). Numbered OQ-91 on its branch because OQ-90 was already taken on a branch in flight beside it; renumbered OQ-93 at the merge, OQ-91 and OQ-92 having been taken on `main`.)*

**Ruled 2026-10-06 by the owner ([R-071](../../product/requests.md#r-071)):** no text field is spell-checked in the first release: the dictionary list is emptied and the spellchecker turned off for every session on every platform, as built (`apps/desktop/src/main/runtime-requests.ts`).

The specification says nothing about spell-checking the composer or any other text field. The runtime's built-in
spellchecker, left at its default, fetches a Hunspell dictionary for the OS locale from `redirector.gvt1.com` whenever a
session is created — on Linux measured, on Windows owed to the next package (IC-3 — *corrected 2026-10-13: a Windows x64 host, deferred with the pipeline under R-071; IC-3 binds Linux and macOS artifacts*); on macOS the OS spellchecker is used
and nothing is fetched. That request is one REQ-STARTUP-160's disclosure may not name ("SHALL name no host, endpoint, or
request this document does not require"), one REQ-SHELL-005's demo mode forbids for the whole lifetime, and one the
offline launch of REQ-STARTUP-159 would attempt and fail. Three readings:

- **no text field is spell-checked** — the dictionary list is emptied and the spellchecker turned off for every session,
  on every platform, so the product's behaviour is one and its network activity is exactly what the document names;
- **spell-checking from what was installed** — dictionaries carried inside the artifact (REQ-STARTUP-159's "resolves
  from within what was installed"), which adds payload and a licence line under REQ-STARTUP-142, and a choice of
  languages the specification does not make; or
- **the OS spellchecker where the platform has one** — macOS's (and Windows' if the runtime uses it there), none on
  Linux, so the behaviour differs by platform.

**What the build proceeds under:** the first reading (`apps/desktop/src/main/runtime-requests.ts`), because it is the
only one that needs no requirement the specification lacks and adds no request. **A ruling would decide** whether
spell-checking is a behaviour the product owes; either of the other readings is additive to this build.

**OQ-94 — How does a `paused` agent present, and is it settled with its session?** *(`PD-ORCH-005` over REQ-MONITOR-300; REQ-MONITOR-014, REQ-MONITOR-046, REQ-MONITOR-211, REQ-MONITOR-213, REQ-SESSION-078 and REQ-SESSION-180, none of which the directive names. Raised 2026-09-27 by building `PD-ORCH-005` revisions 2 and 3 under [R-060](../../product/requests.md#r-060) and [R-061](../../product/requests.md#r-061). Numbered OQ-67 while it was built; renumbered when it reached `main`, where OQ-67 had been taken meanwhile.)*

`PD-ORCH-005` adds `paused` to the states REQ-MONITOR-300 governs. Three families of requirements it does not name meet
that state, and under `docs/product/README.md` each governs exactly as it did:

- **REQ-MONITOR-014** lists exactly ten states. REQ-MONITOR-300, which the directive narrows, says a state another
  domain needs is added there rather than described elsewhere; the build reads REQ-MONITOR-014's list as the table's
  restatement and adds `paused` to both.
- **REQ-MONITOR-046** maps engine states onto six presentation states and ends "anything else→queued". The mapping is
  total, and `paused` falls into its catch-all: **a paused agent presents as `queued`, as the requirement says.**
- **REQ-MONITOR-211/213 and REQ-SESSION-078/180** settle, for display, every running, waiting or queued agent of a
  session whose status neither claims a live run nor is `idle` — a `paused` session among them — to the run's outcome:
  `cancelled`, "ended with the run", tool chips cleared, on every surface. Applied to a `paused` agent this shows as
  cancelled an agent clauses 2 and 4 keep resumable, and that clause 6's Continue action counts as resuming.

**What the build proceeds under.** `paused` is added to REQ-MONITOR-014's list with the table. A paused agent presents
as `queued`, REQ-MONITOR-046's catch-all, with no change to that requirement. It is **not** settled for display: the
projection (`toAgentRecord`) exempts `paused` from REQ-MONITOR-211's settle and presents it as it is, carrying its
`interruption` on the agent record and no active tool chip. That exemption is a departure from four requirements
nothing narrowed, and it is recorded here rather than made quietly. Every other unfinished agent of a session at rest is
settled exactly as before.

**What a ruling decides.** Whether PD-ORCH-005 should name REQ-MONITOR-211/213 and REQ-SESSION-078/180 (and REQ-MONITOR-014)
as narrowed by `paused`, as built; and whether a paused agent should present as `queued` or as a presentation state of
its own (widening REQ-MONITOR-046's closed vocabulary), which would change the chip every agent surface draws for it.

**Ruled 2026-09-28 — by [`PD-ORCH-005`](../../product/directives/pd-orch-005.md#pd-orch-005) revision 4, [R-064](../../product/requests.md#r-064).** The owner took both recommendations. REQ-MONITOR-211/213,
REQ-SESSION-078/180 and REQ-MONITOR-014 join the Narrows list, as built, and each carries its back-pointer. A `paused`
agent presents in a presentation state of its own, `paused`, and REQ-MONITOR-046 is narrowed to map it so (clause 13).
Until that is built, a paused agent presents as `queued`, as the reading above says.

**Built 2026-09-28 under [R-065](../../product/requests.md#r-065).** A `paused` agent presents as `paused` on every agent
surface, and the "until that is built" readings above are superseded. Building it raised OQ-100: how the counters and the
run-level agent read it, and how the agents a crash left present before the crash is recorded.
