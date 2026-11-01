# Archived open questions — Spikes, and the questions raised since (32 of 35)

The ruled, closed, resolved and withdrawn entries of [part 65](../../../architecture/open-questions/65-spikes-and-later-questions-32.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-362"></a>

**OQ-362 — When the workspace has no TypeScript or JavaScript project file, what makes a code-intelligence symbol rename reach the
files that import the symbol?** *(REQ-MCP-015, the EDIT tier's symbol rename, "throughout the entire codebase" as the runtime
describes it; [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004), which rules the reference search before every rename and
nothing else; [OQ-273](58-spikes-and-later-questions-25.md#oq-273), whose options (b) and (c) were rejected for the case it measured; REQ-MCP-011 and ADR-0035, the
pinned runtime driven as it is; REQ-MCP-116, the binding manifest; [OQ-245](52-spikes-and-later-questions-19.md#oq-245), the reach observation. Raised 2026-10-15 by
fin47 (`fin47-rename-and-optionals`) from the live `rename` scenario's failure at `3c03287`, reopening
[`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md);
the plan's range OQ-361 to OQ-380, its second number (OQ-361 was taken on main by a sibling bundle) — renumbered at landing if
another sibling took it first. **Ruled 2026-10-20.**)*

**What is open.** PD-MCP-004's search makes a cold rename reach the importing files when a `tsconfig.json` or `jsconfig.json`
covers them (`code-intel-proof` launch 11), and does nothing when none does. The TypeScript language server then puts each file in
an inferred project of the files open in it, and the pinned runtime opens only the declaring file, for the search and for the
rename alike, so the search answers `{}` and the rename changes the declaring file alone while saying it succeeded. Measured
2026-10-15 over the bundled runtime's stdio server and its language-server layer (the note's table): the live run's `todo-app`
fixture (a Vite React shape, `.js`/`.jsx`, no project file) renamed `src/todos.js` alone after the search, after a second search
15 s later, and after symbol overviews of both importers; with an empty `jsconfig.json` at its root it renamed all three files;
with the two importers held open in the language server it renamed all three. A Vite or plain Node JavaScript project ships no
project file, so this is the common shape of a JavaScript workspace, not a corner of it.

**What the build proceeds under.** PD-MCP-004 as ruled: the search is sent and discarded, the rename is forwarded, the result is
the runtime's, and the reach observation lists the one file it changed, which the child's report and artifact repeat. The model is
told nothing more; a live model that greps afterwards mends the importers by hand (the run at `3c03287` did). `code-intel-proof`
launch 13 (`child-rename-cold-js`) and the live `rename` scenario's PD-MCP-004 check both read this as a failure.

**What a ruling decides.** Which of these, or none:

- **(a) A project file for the call.** When no `tsconfig.json` or `jsconfig.json` stands at the workspace root or above the
  declaring file, the run host writes a minimal `jsconfig.json` (`{}`, measured sufficient) at the workspace root before the
  search, and removes it after the rename answers, whatever it answered. Costs: a file the person did not ask for appears in their
  workspace for the call's duration (a watcher, a build or `git status` may see it; a crash leaves it behind until the next rename
  or the next open removes it); the reach observation must leave it out; it changes which files the server sees for every later
  request of that server session until the server notices the removal; and a project whose real configuration sits elsewhere
  (a monorepo package's `tsconfig.json` not at the root) is not this case and is left as it is.
- **(b) The runtime holds the importers open.** The bundle recipe patches the pinned distribution so that, before a rename (and a
  references request) on a TypeScript or JavaScript file that no project file covers, it opens the workspace's files of that
  language that mention the symbol's name, holds them for the request and closes them after. Costs: a patched third-party tree the
  recipe and the drift check must carry (ADR-0035, ADR-0054; OQ-273 rejected (b) for that reason when the search alone sufficed),
  one file open per candidate, and a textual pre-filter that a re-exported or aliased name can miss.
- **(c) Tell the model.** After a rename whose reach observation lists the declaring file alone, the run host appends to the result
  that files which may import the symbol were not renamed — naming them from a textual search of the workspace for the old name, or
  not naming them. Costs: OQ-273 rejected the same advice as one a model may ignore; a symbol used in one file only would trip it,
  so it needs a search to stay quiet there.
- **(d) The run host completes the rename.** It applies the old name's replacement in the files the textual search names. Costs:
  a textual rename the person and the model did not ask for, which can rename an unrelated identifier of the same name.
- **(e) Nothing, recorded.** PD-MCP-004 is amended to say its search reaches only files a project file covers; the live scenario's
  check becomes a NOTE for a workspace with no project file, and launch 13 asserts what changed rather than that both did.

**What a live run then shows.** The opt-in `rename` scenario (`live-run.mjs --only=rename`) on the unchanged `todo-app` fixture:
under (a) or (b), the first `rename_symbol` call says `3 changes applied` and no other tool writes `src/App.jsx` or
`src/todos.test.js` after it; under (c), the result carries the appended sentence and the model's own edits follow; under (d), the
three files carry the new name with the rename's one row; under (e), the scenario's check reads NOTE.

*Confirmed release-blocking 2026-10-15:* fin47's acceptance round 1 at `cb6d1d5` read `code-intel-proof` launch 13 red twice
(finding A1), and bundle `fin47-accept1-5` read it red again at `8baf9e4`, whose repair task waits on this ruling; the runs are in
[the note](../../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md). Ruled
2026-10-20, below.

**Ruled 2026-10-20 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** The ruling is option (a), refined, of kind change-behaviour. It is recorded as [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004) **revision 2**: clause 5, "the project file", and the sentence after it. Revision 2 extends REQ-MCP-116 and REQ-MCP-015 further, and both back-pointers are amended in place.

The case is a symbol rename on the bundled server where both of these hold:
- the declaring file has an extension that the pinned runtime serves with its TypeScript language server;
- no `tsconfig.json` or `jsconfig.json` stands in that file's directory, or in any directory between it and the project root the server was launched for, the root included. That root is REQ-MCP-034's appended path, which is an isolated run's tree root for an isolated run.

In that case the run host places a `jsconfig.json` of its own at that root before clause 2's search. It keeps the file while the search and the rename are answered. It removes the file once the rename has answered or the call has ended in another way: an error result, a thrown fault, or clause 4's spent allowance or cancel. The removal happens inside the call's reach observation.

The refinements:
- **Never a person's file.** The file is created only where no file of that name exists, and never overwrites one. Its bytes are one constant of the build: a comment line that names the product and says the file is temporary, was written for one rename and is safe to delete, then `{}`, with LF endings. It is removed only while its bytes are still that constant. Otherwise it is left in place and a `warn` line is logged. A create that fails also logs a `warn` line, and clause 2 then proceeds as it did before this ruling.
- **One file per root.** Renames that overlap at one root share one file. The run host counts them across all its sessions: the first places the file, each keeps it, and the last to end removes it.
- **A file left behind.** This covers a run host that ended during a rename, or a removal that failed. Such a file is removed at the next run start at that root and before the next rename there, provided its bytes are the constant and no rename keeps it.
- **The record.** As with clause 3's search, the file writes no tool-call record, total, histogram bucket or notice. No child's report or child-report artifact lists it, the renaming child's included. To achieve this, the run host notes each placement and removal in OQ-245's write journal under a name no agent bears, so every observation whose window holds one of them leaves the path out. One `info` line is logged for each placement and each removal. The model is told nothing, and the rename's result is the runtime's.
- **The manifest.** The binding manifest records the clause beside `warmUps`, keyed by capability. It records the rename, the runtime's `typescript` language, the extensions that language serves (read from the runtime as the indexed extensions are), the two names that count as a project file, and the one name written. The generator refuses a runtime that does not name the language.
- **The walk stops at the project root.** No directory above the root is consulted. The evidence for this bound is launch 13. Its workspace sits inside the repository checkout, below a `tsconfig.json` that does not include it, so a walk past the root would place nothing there. The launch's uncommitted control run, with an empty `jsconfig.json` at the workspace root, renamed both files.

**Measured, and owed before the work is reported complete.** So far the file has been measured only when present before a fresh server: the note's table says "one fresh server per row", and launch 13's control run wrote the file before the launch. The clause places it inside a live server session, and that has not been measured.

The builder measures first over the bundled runtime's stdio server, as the note's table was measured, in four cases:
1. the file placed after the server is up and before any file is opened;
2. the file placed after the server has opened the declaring file;
3. the file placed a second time, after one removal;
4. two `.ts` files with no project file.

Then the builder measures in the built app, with `code-intel-proof` launches:
- launch 13;
- a new launch 14 (`child-rename-opened-js`), which takes a symbol overview of the declaring file before the rename;
- a new launch 15 (`child-rename-cold-ts`), with two TypeScript files and no project file.

Each of these launches also asserts that no `jsconfig.json` remains afterwards. Launch 11 also asserts that none was written beside its `tsconfig.json`.

Any case in which the clause leaves an importing file behind is recorded here, reopens this question for that case, and stays a held failure; no other remedy is improvised. Launches 11, 13, 14 and 15 are re-run on every pin change.

**The two recommendations weighed.** Both advocates recommended (a), refined, of kind change-behaviour, and the ruling followed **both**.

- **Advocate A (the user's lens).** A argued that in the ordinary JavaScript workspace the tool says it succeeded and leaves every importer naming a removed symbol. A further argued that only (a) and (b) make the rename itself true, and that only (a) gives the language server the whole project while leaving the runtime untouched.
  - The ruling took from A:
    - the exclusive create, the distinctive bytes and removal only while the bytes are unchanged;
    - the per-root count;
    - the `info` line, with no row, total or notice;
    - the explicit subtraction of the file from every observation, preferred over B's reading that none is needed. `snapshotChanges` names created and removed paths, so three cases would otherwise list the file: a sibling's call observed across the placement or the removal, a leftover removed inside another call's window, and a failed removal;
    - the mid-session and TypeScript-only measurements;
    - the live check that no file remains;
    - the noticed defect of the model's own reference search and safe deletion in such a workspace, to be recorded and raised, not ruled here.
  - The ruling declined A's numbering, "revision 1": the register counts the minted text as revision 1. It also moved A's cleanup at each connection to the next run start at the root, which runs whether or not a session reaches the server.
- **Advocate B (the system's lens).** B argued three things: (a) is the one measured remedy that no earlier ruling refused; it composes with clause 2 in the executor every code-intelligence call goes through; and it keeps literally true both REQ-MCP-011's "one exact release" and ADR-0035's evidence about the artifact.
  - The ruling took from B:
    - revision 2 as the vehicle, with revision 1's "the search changes nothing in the workspace" quoted beside its replacement;
    - the walk bounded at the root the server is bound to;
    - the manifest record keyed by capability;
    - the count shared across sessions;
    - the fallback when the create fails;
    - the unit cases under PD-MCP-004 in `apps/desktop/src/run-host/mcp.test.ts`;
    - the launches, and the new assertion in launch 11;
    - B's reasons against (b).
  - The ruling declined B's pending marker under `.rotaris/`. The product's bytes are a constant, so equality identifies its file without a second record that could itself be left stale.

**Rejected:**
- **(b), a patched distribution.** OQ-273's reason stands unanswered. `bundle.mjs` (recipe 4) has no patch stage, and `--check` compares only the pins' hash, so a drift check of the runtime's contents would have to be built. The pinned release would no longer be the tree that runs (REQ-MCP-011). Every pin change would have to re-apply the patch for each target the recipe builds (OQ-400).
- **(c), telling the model.** This is advice that leaves a broken project whenever the model ignores it, behind a success that stays false.
- **(d), a textual rename.** Nobody asked for it, and it can rename an unrelated identifier.
- **(e), doing nothing.** This is a success reported for a rename that left the project unbuildable, in the ordinary shape of a JavaScript workspace.
- **Deferral.** A first-release user meets this at the first rename in such a project.

**Costs kept on record:**
- A file the person did not ask for stands at their workspace root while the search and the rename run. A watcher, a dev server, an editor's language service or `git status` may see it. A commit made in that window may capture it, and so may a checkpoint that includes untracked files (REQ-GIT-034, REQ-GIT-051).
- A leftover stays until the next run start or rename at that root.
- On a large workspace the search loads the whole project, which spends the rename's allowance and the language server's memory.
- The server keeps seeing that project for later requests of its session until it notices the removal.
- A configuration above the root is not consulted. Where the language server would read one, the product's file is the nearer one for the call.
- A workspace whose project file stands in the chain but does not include the declaring file or its importers is left as built.
- One more product behaviour rests on the language server's project discovery.

**Reopening condition:** any of the following.
- In a workspace no project file covers, a rename by the bundled server leaves behind a file that imports the symbol. This applies to a cold rename, a rename after the server has opened the declaring file, and a second rename in one session.
- The product's file is found at a root where no rename keeps it, other than after a run host that ended during a rename.
- A person's file is overwritten or removed.
- The product's file appears in any child's report or artifact.
- Launch 11, 13, 14 or 15 turns red after a pin change.

**What a proof and a live run then show.**
- `code-intel-proof` launches 13, 14 and 15: "(2 changes applied)", both files changed on disk, the report and the artifact listing exactly those two, no reference-search row, and no `jsconfig.json` at the root afterwards.
- Launch 11: as before, with no `jsconfig.json` written.
- The opt-in `rename` scenario on the unchanged `todo-app` fixture: the first `rename_symbol` says `3 changes applied`, no other tool writes `src/App.jsx` or `src/todos.test.js` after it, `node --test` is green, and no `jsconfig.json` stands at the workspace root afterwards.

*The reading the build proceeded under until this ruling ("PD-MCP-004 as ruled: the search is sent and discarded …", above) is kept as the falsified reading for a workspace no project file covers.*

**Built 2026-10-20 by loc1 (`loc1-rename`).** The spike first, over the bundled runtime's own stdio server on Windows 11 ARM64
(the emulated `win32-x64` bundle, OQ-401; the shipped arguments; the product's exact bytes; copies of the `todo-app` fixture): in
the four cases above — the file placed after `tools/list` with no file opened, after a symbol overview had opened the declaring
file, a second time in one session after one removal, and two `.ts` files with no `tsconfig.json` — the search named the importers
and the rename reached every one ("3 changes applied", the `.ts` pair "2"); the control without the file renamed `src/todos.js`
alone. No case left an importer behind, so nothing reopens. Then the build: the manifest's `projectFiles` and its refusals
(`manifest.mjs`, `projectFileRefusals`), the reader and the bytes constant (`codeIntelligenceProjectFile`,
`CODE_INTELLIGENCE_PROJECT_FILE_BYTES`), and the MCP executor's clause (`holdProjectFile`, `releaseProjectFile` in the observed
call's `finally`, the per-root count, the leftover removal at every `prepare`, the journal under a name no agent bears; `run-host/mcp.ts`).
Pinned by seven cases under "PD-MCP-004 revision 2 (OQ-362)" in `apps/desktop/src/run-host/mcp.test.ts`, red before, four guards
green before and after, and the reader's and the generator's cases. In the built app `code-intel-proof` launches 13, 14 and 15 are
green ("(2 changes applied)", both files, report and artifact listing exactly those two, no search row, one placement and one
removal in the log, nothing left at the root), launch 11 green with no `jsconfig.json` written, launch 10 unchanged; with the clause
switched off in the same build, 13 to 15 renamed the declaring file alone; and the whole proof passed in one run (launches 1 to 6
and 8 to 15; the seventh needs a packaged tree). **Owed:** the live `rename` scenario, refused at its
launch by the session's permission classifier and the orchestrator's to run; and the noticed defect of the model's own search and
safe deletion in such a workspace, measured (the deletion removed a symbol two files import) and raised as [OQ-378](68-spikes-and-later-questions-35.md#oq-378). The
directive's report-back is "First execution of revision 2" under [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004); the note is in
[`fixed/`](../../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).

<a id="oq-363"></a>

**OQ-363 — Should a configuration that loads but cannot start a run — a `default_persona` naming no role this build knows, or
referential errors while no presenter is live — refuse a retrospective?** *(`PD-LIBRARY-002` with ADR-0065 decision 5, the
retrospective as an analysis pass on its own model; REQ-CONFIG-245/246, referential errors fatal "for a run no person is watching";
the entry role's resolution, which a run's first request needs; REQ-NOTIFY-254. Raised 2026-10-15 by fin47 (`fin47-accept1-4`) while
repairing
[`a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested`](../../../defects/fixed/a-retrospective-is-refused-as-an-unloadable-configuration-when-confinement-is-requested.md),
which asked it; the plan's range OQ-361 to OQ-380, its third number (OQ-361 and OQ-362 were taken on main) — renumbered at landing
if a sibling took it first. **Ruled 2026-10-20.**)*

**What is open.** A retrospective's setup is prepared by the run start's `prepareRun`. Two of its refusals concern a run and not the
pass: the entry role (`default_persona`) must resolve, and with `presenters.attended` false — no live presenter, ADR-0019 — any
referential error is fatal (REQ-CONFIG-246). The retrospective sends nothing to the entry role: its one request goes to
`retrospective_model`, then `medium_model`, and an entry role with no usable *model* already does not refuse it (fin47, the
sibling note). REQ-CONFIG-246 speaks of "a run no person is watching"; a retrospective is started by a person's gesture
(PD-LIBRARY-002's trigger) and is no run, but its analysis can still be reached after the presenter has lapsed. Neither text says
whether these refusals bind the pass.

**What the build proceeded under, and no longer does (falsified by the ruling below).** Both refuse the retrospective, said truthfully since this repair: `leasedSetup` answers
`refused` with code `retrospective.configuration`, headline "The workspace configuration refused the retrospective" and
`prepareRun`'s reason as the detail; main posts "The retrospective could not be started" with it at the gesture, and the analysis
carries it inside PD-LIBRARY-002 (c)'s failure warning. Until 2026-10-15 both read "The workspace configuration could not be
loaded". The confinement gate no longer refuses a retrospective at all (the same note): it protects the shell a run would open.

**What a ruling decides.** Which of these, or none:

- **(a) Keep both refusals.** A configuration a run cannot start under is not one a retrospective reads either; the wording stays
  as built. Cost: a workspace whose `default_persona` names a role that a newer or older build knows — or a typo — cannot run the
  retrospective, which needs no role, until it is corrected.
- **(b) Neither refuses the pass.** The unknown persona is completed on a stand-in as the unusable entry model is (the
  retrospective's own model; the system text is the analyst's own and never the role's), and referential errors are warnings for
  a retrospective whatever the presenter (it is user-started). Cost: a pass runs over a configuration that would refuse the next
  run, and the referential messages appear only in the log.
- **(c) The persona does not refuse; referential errors still do without a presenter.** REQ-CONFIG-246 read as binding whatever
  is unattended, the persona as a run's concern only.

**What a proof then shows.** `retrospective-proof` with a workspace whose `default_persona` is unknown: under (a) the gesture's
error notice carries "names no role this build knows" and nothing is stored; under (b) or (c) the pass stores its artifact and
no refusal notice is raised.

**Ruled 2026-10-20 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** Option (b), refined; kind
change-behaviour. Neither refusal binds a retrospective. Of a configuration that loads, a retrospective is refused only for
what [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002)'s "The model" states: no resolvable retrospective model, and
revision 5's lease refusal. None of a run's refusals refuses it:

- **A `default_persona` naming no role this build knows** does not refuse the pass. Its setup is completed on the
  retrospective's own model (`retrospective_model`, then `medium_model`) with no role's system text, as fin47 completes an
  entry role with no usable model, and the run host logs that it did. The pass's one request goes to that model with the
  analyst's own system text and no tools (`analystSystem`, `packages/engine/src/improvements/analyst.ts`), so nothing in it
  reads the role. Where no retrospective model resolves either, the pass is refused as the missing retrospective model
  (`retrospective.no-model`, "The retrospective needs a model").
- **Referential errors (REQ-CONFIG-232)** do not refuse the pass, whether or not a presenter is live at its capture or at its
  analysis. REQ-CONFIG-246 binds "a run no person is watching — one the board scheduled, and any other run started without a
  person present". A retrospective is no run: it starts no session and runs no tool, and only a person's gesture starts it
  (`PD-LIBRARY-002`'s trigger). REQ-CONFIG-198, which REQ-CONFIG-246 cites, divides runs by who started them. The pass's setup
  therefore reads no attendedness. `presenters.attended` stays ADR-0019's test for routing an approval, and the pass raises
  none. Until this ruling the test was taken again at the queued analysis. A pass captured with a live window was refused there
  whenever main had not answered the presenter's poll for 3,000 ms, and the person who had pressed the gesture was told that no
  one was present. The post-run pass beside it in REQ-LIBRARY-123's FIFO is analysed on its run's own setup and was never
  refused this way.
- **The configuration's load warnings and referential messages** are written to the application log at the pass's capture,
  one `warn` line each, prefixed `retrospective: `. No retrospective path wrote them anywhere before: only a run's start and
  continuation write a setup's warnings (`packages/engine/src/sessions.ts`). Settings › Models lists the referential messages
  under "Unresolved references", as before.

Every run start and continuation keeps both refusals word for word, the improvement run that applies a retrospective's
proposal included. REQ-CONFIG-246's protection, that no run starts silently on a configuration the product could not validate,
is therefore whole. Recorded as `PD-LIBRARY-002` **revision 6**: one passage, with its reason and its cost, at the end of "The
model", and REQ-CONFIG-246 added to the Extends line with its "Extended by" back-pointer. The requirement reads word for word for
every run, and nothing is replaced. The build's reading above, that both refuse the pass, is falsified by this ruling and kept
as written. **What the ruling leaves open.** Nothing new. A notice of the retrospective's own naming the messages would need
wording no text has, and is not ruled.

The two recommendations weighed, and the ruling followed **both**:
- **Advocate A (the user's lens)** recommended (b) refined: the pass counts as attended because a person started it; an
  unknown `default_persona` is completed on the retrospective's own model, as the unusable entry model is; the referential
  messages are written to the log for the pass; and runs keep both refusals. A recorded it as revision 6 in "The model", with
  REQ-CONFIG-246 on the Extends line. The ruling took from A:
  - the placement and the disposition;
  - the messages written once, at the capture;
  - the `no-model` answer where no retrospective model resolves;
  - the finding that the entry's stated cost of (b) understated the tree.

  It did not take the framing that the pass "counts as attended". REQ-TOOLS-053 and REQ-SANDBOX-101 define attendedness as the
  capability to put a prompt before a person, which a lapsed presenter lacks. The ruling leaves attendedness unread for the
  pass rather than redefining it.
- **Advocate B (the system's lens)** recommended (b) with three refinements: referential errors never refuse the pass
  whatever the presenter, the unknown persona is completed on the retrospective's model, and the messages are logged. B
  recorded it as clause (i) of the revision-2 departures paragraph, with REQ-CONFIG-246 on the Narrows line. The ruling took
  from B:
  - the statement of the referential half: REQ-CONFIG-246 binds runs, and a retrospective is none;
  - the red-first proof launch, with the run start's refusal read in the same launch;
  - the run-start cases pinned beside the pass's;
  - the defensive `retrospective.configuration` branch.

  It did not take the Narrows placement. That paragraph narrows, for the retrospective, requirements that govern the per-run
  pass, and REQ-CONFIG-246 never reached an analysis pass. Its text stands for every run, and Extends is the disposition
  [`README.md`](../../../product/README.md) defines for that. B allowed it: "the behaviour is the same".

Neither advocate recommended (a) or (c), and both found what rules them out:
- **(a)** keeps a refusal `PD-LIBRARY-002` never states, over a field the pass never reads, beside fin47's stand-in for an
  entry model the pass never calls. It also leaves the analysis's outcome to presenter timing.
- **(c)** cannot be built as worded. An unknown `default_persona` is itself a referential message
  (`packages/config/src/validate.ts`), so with no presenter REQ-CONFIG-246's branch refuses it before the persona is read.
  `launch.test.ts`'s unattended case shows this on exactly that configuration.

*Built 2026-10-20 by loc1 (`loc1-confinement-retro`).* `prepareRun` (`apps/desktop/src/run-host/configuration.ts`) completes a retrospective's setup on its own model where `default_persona` names no role this build knows (refused as `no-model` where none resolves), and reads no attendedness for it, so REQ-CONFIG-246's referential messages are its warnings; `retrospective.capture` writes each warning of the setup once at `warn`, prefixed `retrospective: `, and `improvement.analyze` none. Every run start and continuation keeps both refusals word for word. Pinned by four `launch.test.ts` cases and a `dispatch.test.ts` case, each red before, beside the run start's two refusals; and by `retrospective-proof` launch 13 (`unknown-persona`), red on five checks on the base and green after (the whole proof 83 of 84 on Windows 11 ARM64, the one red Windows-only and recorded). Reported back in [ADR-0065](../../../architecture/adr/0065-the-retrospective-pass.md) and [`PD-LIBRARY-002`](../../../product/directives/pd-library-002.md#pd-library-002)'s "First execution of revision 6".
