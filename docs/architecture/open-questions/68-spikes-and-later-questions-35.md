# Open questions — Spikes, and the questions raised since (35 of 35)

Part 68 of 68 of the [open-questions record](../open-questions.md), which indexes every part. Holds OQ-378, OQ-450 – OQ-454.

<a id="oq-378"></a>

**OQ-378 — Where no project file covers the workspace, what do the model's own reference search and safe symbol deletion do?**
*(REQ-MCP-015, the READ tier's referencing-symbol search and the EDIT tier's safe symbol deletion; [`PD-MCP-004`](../../product/directives/pd-mcp-004.md#pd-mcp-004)
revision 2, whose clause 5 gives the symbol rename alone a project file of the product's own; [OQ-362](65-spikes-and-later-questions-32.md#oq-362), whose ruling
asked that this be recorded and raised, not ruled there; REQ-MCP-011 and ADR-0035, the pinned runtime driven as it is;
REQ-MCP-116, the binding manifest. Raised 2026-10-20 by loc1's `rename` bundle (`loc1-rename`) with
[`with-no-project-file-a-safe-delete-removes-a-symbol-its-importers-still-use`](../../defects/with-no-project-file-a-safe-delete-removes-a-symbol-its-importers-still-use.md);
the bundle's range OQ-378 to OQ-379, its first number — renumbered at landing if `main` holds it. **Ruled 2026-10-21.**)*

**What is open.** In a workspace no `tsconfig.json` or `jsconfig.json` covers (a Vite or plain Node JavaScript project, the live
run's `todo-app`), the TypeScript language server holds only the files open in it, and the pinned runtime opens the declaring file
alone. PD-MCP-004 revision 2 places a `jsconfig.json` of the product's own for the rename's call, so the rename reaches the
importers; the model's own calls are left as they were. Measured 2026-10-20 over the bundled runtime's stdio server (the note's
table): the model's `find_referencing_symbols` of `remaining` in `src/todos.js` answered `{}`, and its `safe_delete_symbol` of the
same symbol answered `OK` and deleted it, while `src/App.jsx` and `src/todos.test.js` still import and call it; with the product's
file placed for the two calls, the search named both importers and the deletion refused, naming them.

**What the build proceeds under.** PD-MCP-004 as revised: the product's file is placed for the symbol rename alone; the model's
search and its safe deletion are forwarded as the model made them, and their results are the runtime's.

**What a ruling decides.** Which of these, or none:

- **(a) Clause 5 for both calls.** The manifest's `projectFiles` gains the two capabilities, and the run host places and removes its
  file for them as it does for the rename. Costs: the file stands in the person's workspace for every such search, which a model
  makes far more often than a rename, and a READ-tier call then writes into the workspace, which no read-only persona's call did.
- **(b) The safe deletion alone.** The deletion gets clause 5's file; the search stays as it is. Costs: a model that looks before it
  edits is still told nothing uses the symbol; the destructive call is the one made safe.
- **(c) Refuse the deletion there.** The run host answers the deletion, where no project file covers the declaring file, with an
  error saying its reference check cannot see the project. Costs: a product refusal of a granted tool; the model's search is left
  wrong.
- **(d) Tell the model.** The run host appends to the search's empty answer, and to the deletion's result, that references outside
  the open file are not seen in such a workspace. Costs: advice a model may ignore, the reason OQ-273 and OQ-362 rejected telling
  the model.
- **(e) Nothing, recorded.** REQ-MCP-015's two tools are read as reaching only what a project file covers.

**What a live run then shows.** No scenario asks either call today. Under (a) or (b), a deletion of a symbol two files import is
refused, naming them, and under (a) the search names them; under (c) the deletion's result is the product's refusal; under (d) the
results carry the appended sentence; under (e) the deletion succeeds and the project no longer loads.

**Ruled 2026-10-21 under the owner's delegation ([R-072](../../product/requests.md#r-072)).** The ruling is option (b), refined, of kind change-behaviour. It is recorded as [`PD-MCP-004`](../../product/directives/pd-mcp-004.md#pd-mcp-004) **revision 3**: the case sentence, clause 5 and the sentence after it, with revision 2's words quoted beside them. Revision 3 extends REQ-MCP-116 further. It governs what REQ-MCP-015's EDIT-tier safe symbol deletion decides on the bundled server. Both back-pointers are amended in place.

The ruling has four parts.

- **The safe deletion is given clause 5's file.** The case is a safe symbol deletion on the bundled server, under whatever name the model calls it, where both of these hold:
  - its declaring file has an extension the pinned runtime serves with its TypeScript language server;
  - no person's `tsconfig.json` or `jsconfig.json` stands in that file's directory or in any directory up to the project root, the root included.

  In that case the run host places its `jsconfig.json` at that root before it sends the deletion. It removes the file once the deletion has answered or the call has ended in another way, before the call returns. The file is placed, kept, shared and recorded on clause 5's terms, as for the rename. Clauses 1 to 4, the warm-up search, stay the rename's.
- **The model's own referencing-symbol search is left as the runtime answers it.** This is option (e) for the search. It is forwarded as the model made it, no file is placed for it, and its answer, `{}` included, is the runtime's. The same holds for every READ-tier call. Revision 3's "what it costs" records this.
- **Clause 5's keep is brought to its own text.** The bundle reviewer's finding holds at `0c7b1753`:
  - `holdProjectFile` adopts a leftover holding the product's bytes (`apps/desktop/src/run-host/mcp.ts:510`) before the covering walk (`:516`). Where a person's file covers the declaring file, the leftover stands through the call, although clause 5 removes it "before the next rename there".
  - With the root's count above 0 (`:505`), a call is counted with no check that the file still stands.

  Revision 3 repairs both:
  - The walk never reads the product's own file at the root as a person's file. The reordering needs this, because the walk would otherwise find the leftover itself.
  - A call that a person's file covers neither places nor keeps the product's file. If a leftover stands there and no call keeps it, that call removes it before it is sent.
  - A call that begins while calls keep the file, but the file no longer stands, places it again.
  - A call that no person's file covers still adopts a leftover holding this build's bytes.

  Revision 2's first execution said "the rule held as written". That report is corrected in place for the covered leftover.
- **The file's bytes** now say that it was written for one code-intelligence call. The constant revision 2 wrote is recognised as the product's, for removal only. A file an earlier build left is therefore neither stranded as a person's file nor read as covering.

**Measured first, as the first act of building.** No row of the note's table measured the deletion as the first request over the product's file: in its second row the search ran first in the same fresh server. The builder therefore measures first. The set-up for every case:
- the bundled runtime's stdio server, with the shipped arguments;
- the new bytes, placed inside a live session;
- copies of the `todo-app` fixture.

The cases:
1. The deletion of `remaining` as the server's first request, the file placed after `tools/list` and before any file is opened.
2. The same deletion after a symbol overview has opened the declaring file.
3. A second placement and deletion in one session, after one removal.
4. Two `.ts` files with no `tsconfig.json`.
5. A symbol no file references. It must still be deleted.
6. Launch 11's two TypeScript files with their `tsconfig.json`, cold, with no file placed.
7. The control: case 1 without the file. It deletes, as the note's first row did.

Cases 1 to 4 and 6 must refuse, name every importing file and change nothing. Where one of them deletes a symbol another file imports, the builder repeats it with clause 2's search sent first.
- If the deletion then refuses, it is also warmed under clauses 1 to 4, as the rename is. The manifest's `warmUps` gains it, and a dated ruling note under clause 1 cites this ruling and the measured row.
- If the two tools do not share both arguments as the runtime lists them, or the deletion still deletes after the search, the case is recorded here. It reopens this question for that case and stays a held failure. No other remedy is improvised.

Then, in the built app, `code-intel-proof` gains two launches:
- launch 16 (`child-safe-delete-cold-js`), in launch 13's shape, with the deletion as the child's only call;
- launch 17 (`child-safe-delete-cold`), in launch 11's shape.

Launches 10, 11 and 13 to 15 are re-run. Launches 16 and 17 join launches 11 and 13 to 15 as gates re-run on every pin change.

**The two recommendations weighed.** Advocate A recommended (a), refined; Advocate B recommended (b), refined; both were of kind change-behaviour. The ruling followed **B**, and took four refinements from A.

- **Advocate A (the user's lens).** A argued three points. In the commonest JavaScript workspace both calls are false on screen. The search is the look that informs every other edit. The remedy is measured for both calls, and the search over the file was even faster (2.5 s against 7.8 s).
  - The ruling took from A:
    - the reworded bytes, with the earlier constant recognised;
    - the cold deletion, measured before anything is built, with clause 2's warm-up named as the next step where the file alone does not suffice;
    - A's reading that `codeIntelligenceProjectFile` answers only for a capability with an `editArguments` path, so a project file for any other capability is dropped without a word; the generator now refuses such an entry;
    - the row with an unreferenced symbol;
    - the reviewer's two repairs.
  - The ruling declined A's file for the search. That file would stand at the person's root around every reference search. The reference search is the commonest cross-file query, and any of the twelve personas that carry the server may make it (REQ-MCP-014), coordinators included. Things that would meet the file around a call that only reads:
    - a watcher;
    - a dev server;
    - an editor's language service;
    - `git status`;
    - a commit;
    - a checkpoint taken with untracked files (REQ-GIT-034, REQ-GIT-051).

    Every cost revision 2 accepted for a rename would be multiplied by the search's frequency. The record shows agents spending a whole child on a workspace change they could not account for ([`the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it`](../../defects/fixed/the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md)). It also shows the owner moving the runtime's marker line out of the person's `.gitignore` (OQ-161). A's timings come from one fresh server per row, not from searches across a session.
- **Advocate B (the system's lens).** B argued four points. The deletion is the harm OQ-273 and OQ-362 ruled out for the rename. The binding was built for it: the manifest's `editArguments` already names the deletion's `relative_path`. Under (b) the product writes only around an EDIT-tier call. A wrong search is not a forwarded edit's false success.
  - The ruling took from B:
    - revision 3 as the vehicle, with clauses 1 to 4 left the rename's;
    - (e) for the search, recorded among the costs;
    - the covered cold deletion, as spike case 6 and launch 17;
    - the unit cases for a `tool_name_map` rename and for another server's tool;
    - launch 16;
    - the reviewer's two repairs.
  - The ruling declined three things from B:
    - B's reliance on REQ-TOOLS-006, which describes the five native tools `coordinator_only` removes. The runtime already writes `.serena/` under the workspace.
    - B's hold of a failed cold deletion for a further round, where the remedy is already measured.
    - B's split of the note. The note moves whole to `fixed/`, and its search half is answered by this ruling's recorded limit.

**Rejected:**
- **(a) for the search.** For the reasons above. A false `{}` misleads but changes nothing. The two EDIT-tier tools whose results rest on the cross-file view, the rename and the safe deletion, are both made true.
- **(c), a product refusal.** It withdraws a granted tool where the measured remedy makes the tool work.
- **(d), telling the model.** For the deletion, it is the advice OQ-273 and OQ-362 declined, behind a deletion that still removes the symbol. For the search, both advocates declined it.
- **(e) for the deletion.** It is a success reported for a deletion that left the project unable to load, in the ordinary shape of a JavaScript workspace.
- **A new directive.** It would restate clause 5's refinements and let them drift.
- **Deferral.** A first-release user meets the deletion in any Vite or plain Node JavaScript project.

**Costs kept on record:**
- In a workspace no project file covers, a model that looks before it edits is still told that nothing uses the symbol, and so is a persona asked who uses it. The person reads the same `{}` in the transcript, until the model greps (REQ-MCP-016) or the deletion refuses.
- A search made while the server still sees the project that a rename's or a deletion's file gave it can answer differently from one made later in the same session.
- The READ tier's implementation search looks in the same direction and is not measured.
- A refused deletion places and removes the file around a call that changes nothing.
- In a large workspace the deletion spends part of its allowance, and of the language server's memory, loading the project.
- Two more launches rest on the runtime's internals and the language server's project discovery.

**Reopening condition:** any of the following.
- A safe deletion by the bundled server removes a symbol another file imports, either in a workspace no project file covers or cold in one a `tsconfig.json` covers.
- The product's file is placed for a READ-tier call.
- The product's file is found at a root where no call keeps it, other than after a run host that ended during a call.
- A person's file is overwritten or removed.
- The product's file appears in any child's report or artifact.
- Launch 11, 13, 14, 15, 16 or 17 turns red after a pin change.
- A run or proof in which the model's own reference search answered `{}` in such a workspace, and an edit made after it left an importer naming a removed symbol. This reopens the question for the search, with (a) as the measured remedy on record.

**What a proof and a live run then show.**
- Launch 16: the deletion's result names the importing file, and both files are unchanged on disk. There is no reference-search row. The log holds one placement, one removal and no `warn` line, and no `jsconfig.json` stands at the root afterwards.
- Launch 17: the same refusal, with no `jsconfig.json` written.
- Launches 11 and 13 to 15: as before.
- With the deletion's project file withheld in the same build, launch 16 deletes the symbol.
- No live scenario asks the deletion. The opt-in `rename` scenario is unchanged. Its reading also prints the answer of each search the model made. An empty answer in that workspace is read as this ruling's recorded limit, a NOTE.

*The reading the build proceeded under until this ruling ("PD-MCP-004 as revised: the product's file is placed for the symbol rename alone …", above) is kept as the falsified reading for the safe deletion. It still stands for the model's own search.*

<a id="oq-450"></a>

**OQ-450 — What do REQ-STARTUP-014's bundle name and REQ-STARTUP-023's "no code signature" mean for the macOS ARM64 bundle?** *(REQ-STARTUP-014, REQ-STARTUP-022, REQ-STARTUP-023; `PD-STARTUP-001`, IC-3; ADR-0054, "Linux and macOS configuration prepared". Raised 2026-10-22 by preparing the macOS configuration under [R-080](../../product/requests.md#r-080), `apps/desktop/scripts/lib/platform-targets.mjs`. OQ-400 to OQ-449 are the Windows ARM64 session's range, so this takes the next number after it.)*

**What is open.** Two things.

- **(a) The bundle's name.** REQ-STARTUP-014 names the bundle `rotaris.app`, in lower case. electron-builder names a bundle after the product name, and the product name is `Rotaris` (`electron-builder.yml`'s `productName`, which also names the Windows artifacts' installed tree and what the platform shows). The only way to get a lower-case bundle is a macOS-only product name. That also changes the name the running application reports to the platform, and possibly the per-user directories REQ-STARTUP-145 derives from it. Neither effect is measured. Display keys such as `CFBundleDisplayName` could restore `Rotaris` where the user reads it.
- **(b) "No code signature" on Apple silicon.** REQ-STARTUP-023 says that no code signature is applied to the macOS artifacts. On ARM64 the platform refuses to run native code that carries no signature at all. An ad-hoc signature carries no identity and no notarization, so it is what an unsigned build has in practice. electron-builder's `identity: null` skips signing outright, while `identity: "-"` signs ad hoc. Whether an ad-hoc signature counts as "a code signature" under the requirement decides which of the two the build uses. It also decides whether REQ-STARTUP-023's disclosed Gatekeeper confirmation is the only obstacle on first launch, or whether the platform reports the bundle as damaged.

**What the preparation proceeds under.** For (a), electron-builder's default: the bundle is named after `productName` (`Rotaris.app`), which departs from REQ-STARTUP-014's spelling, and the identifier is `ai.rotaris.app` as the requirement says. For (b), `identity: null`, the requirement's literal reading. Both are inert. No macOS artifact may be produced under IC-3 or `PD-STARTUP-001`, and `build-hooks.cjs` refuses the platform.

**What decides it.** A ruling on each reading. Then a macOS ARM64 host (IC-3, spike 17) must show that a bundle built under the ruling launches from the disk image on an unmodified machine, and what the user sees on first launch.

<a id="oq-451"></a>

**OQ-451 — Where may a remote MCP entry's `headers` go when its server answers with a redirect to another origin?** *(REQ-MCP-001, REQ-MCP-020, REQ-MCP-043; ADR-0033. Raised 2026-10-22 by the dependency patch of [R-081](../../product/requests.md#r-081), which moves `@modelcontextprotocol/client` from 2.0.0 to 2.3.0 for GHSA-6prh-2h8m-c8cw. OQ-400 to OQ-449 are the Windows ARM64 session's range and OQ-450 is taken, so this takes the next number.)*

**What is open.** REQ-MCP-001 and REQ-MCP-020 give a remote entry a `url` and optional `headers`. REQ-MCP-043 hands both to the connection. None of them says what happens when the server at `url` answers with a redirect. Until this patch the SDK's transports followed any redirect and sent the request again, configured headers and body included, to whatever origin the server named; a credential in `headers` reached a host the person never configured. From 2.3.0 the SDK follows a redirect only when it keeps the request's origin (same scheme, host and port, or http to https on the same host with default ports) and its method. Any other redirect fails the request with an error naming the target. Two things are therefore unspecified:

- **(a) Whether a cross-origin redirect is ever followed.** A person whose server's address moved to another host now meets a connection failure where before they met a working connection. The SDK offers `redirectPolicy: 'follow'` to restore the old behaviour, and the product does not set it.
- **(b) What the person is told.** The SDK's error names the target. The product reports it as it reports any other connection failure (REQ-MCP-042's discovery warning, REQ-MCP-092's `unreachable`, REQ-MCP-107's diagnostic), and nothing in the specification says the redirect is named as a redirect or that the configured `url` should be changed to the target.

**What the build proceeds under.** The SDK's default. A remote entry's `headers` go to the origin of its `url` and nowhere else. A cross-origin redirect is not followed, and the connection fails with the SDK's message. `packages/mcp/src/client.test.ts` holds it for both transports: a second origin receives nothing. On 2.0.0 the same cases fail, with the second origin receiving `x-auth`.

**What decides it.** A ruling on (a) and (b). If the ruling keeps (a), a person moved off a redirecting address needs to read the target from the failure, so (b) may want the notice to name it.

<a id="oq-452"></a>

**OQ-452 — Does the Rust standard library compiled into the portable's launcher stub owe an entry in the notices file?** *(REQ-STARTUP-142, REQ-STARTUP-143, IC-7; ADR-0054 P4, consequence 5. Raised 2026-10-23 by building the stub under the packaging brief of that day. OQ-450 and OQ-451 are taken, so this takes the next number.)*

**What is open.** The portable is the stub (`apps/desktop/launcher`) with the payload appended. The stub links no crate, but every Rust binary carries the compiler's standard library — `std`, `core`, `alloc` and the compiler builtins, licensed MIT OR Apache-2.0 — statically. REQ-STARTUP-142 asks for "one entry for every dependency present in the shipped artifact" and excludes "any component of the product's own build". The standard library is present in the artifact and is not the product's own code, so the literal reading lists it; the notices generator (`tools/notices/`) reads `node_modules` and the code-intelligence runtime and knows nothing of a Rust toolchain. The installer does not carry the stub, so the question is the portable's alone.

**What the build proceeds under.** No entry: the generator is unchanged. The stub depends on nothing else, on purpose, so the standard library is the whole of the question.

**What decides it.** A ruling on whether the standard library is a dependency in REQ-STARTUP-142's sense. If it is, the generator gains an entry naming the toolchain's version (`rustc --version` on the packaging host) with both licence texts, and REQ-STARTUP-143's validation must fail a portable built without it.

<a id="oq-453"></a>

**OQ-453 — Where are superseded preparations reclaimed: by the application after its window is shown, or by the stub after it has started the application?** *(REQ-STARTUP-165 (b), REQ-STARTUP-043; ADR-0054, "Reclaiming superseded preparations". Raised 2026-10-23 by building the stub.)*

**What is open.** ADR-0054 places reclamation in "a run started from a preparation … after the window is shown and off the critical path". The application has no code for it, and the brief that built the stub excluded product logic outside packaging. The stub reclaims instead, right after it has started the application and before it exits: every directory of another token that carries a marker and that nothing runs from, and every `.stale-…` displacement; `.incomplete-…` and `.run-…` trees only when a day old, since another launch may be writing or running one. "Nothing runs from it" is decided on Windows by renaming the tree aside first — the rename fails while any of its files is open — and on Linux by reading `/proc/*/exe`. Both placements keep it off the paint path, but the stub's competes with the application's own start for the disk for the ~90 ms ADR-0054 measured per deleted payload, and the record's reading put it after the window.

**What the build proceeds under.** The stub reclaims, as above. `pnpm portable-proof` A3 and A5 measure it: no `.stale-…` left after a redo, and a superseded preparation removed after the next artifact starts.

**What decides it.** A ruling on the placement. If the record's placement stands, the stub's `reclaim` moves to a post-show step of main (ADR-0055's order), which must then also read the marker for clause (c)'s notice.

<a id="oq-454"></a>

**OQ-454 — Does an update through the assisted installer show its pages, or install silently?** *(REQ-STARTUP-017, REQ-STARTUP-125, REQ-STARTUP-120; ADR-0054. Raised 2026-10-23 by making the installer assisted.)*

**What is open.** The installer strategy starts the verified setup with no argument and quits (`applyInstaller`, `apps/desktop/src/main/updater/strategies.ts`). With the one-click installer that was a silent install into the same place. The assisted installer instead opens its pages — Welcome, Directory (pre-filled with the installed directory), Install, Finish with "Run Rotaris" checked — so a user who pressed `Update now` meets a setup wizard and could move the installation. REQ-STARTUP-017 states both forms, interactive and silent (`/S`, no pages, never auto-launch), and REQ-STARTUP-125 says only that the installer is started as a process that survives the application. Neither says which form an update takes; a silent update would also need the application restarted by something, since `/S` never auto-launches.

**What the build proceeds under.** Unchanged: the setup is started with no argument, so an update shows the assisted installer's pages, its directory page offering the installed directory.

**What decides it.** A ruling on the form. Silent would mean `applyInstaller` passing `/S` (and `/D=` the installed directory) and a decision on who starts the updated application afterwards.

<a id="oq-455"></a>

**OQ-455 — Does the composer carry a microphone, and what are its states?** *(REQ-CHAT-001, REQ-CHAT-007, REQ-SHELL-135; PD-CHAT-001. Raised 2026-10-30 by [R-089](../../product/requests.md#r-089).)*

**What is open.** No requirement names dictation. PD-CHAT-001 states "The strip SHALL carry every input control the composer draws", then lists them, and a microphone is not in the list.

**What the build proceeds under.** A strip action (`StripActionButton`) between Attach and Stash, enabled in every run state as Stash is (REQ-CHAT-006), reading idle, recording or transcribing. Each state is its icon, its accessible name, its tooltip and a polite live announcement; a second press while recording stops it; a press while transcribing does nothing and says why; every refusal reason takes REQ-CHAT-007's two channels. The recording pulse stops under reduced motion (REQ-SHELL-135). A recording stops itself after 5 minutes. The list in PD-CHAT-001 is read as naming what existed, not as closing the strip.

**What decides it.** A ruling on the control, and on whether PD-CHAT-001 gains the microphone by a revision.

<a id="oq-456"></a>

**OQ-456 — Where does a transcript land?** *(REQ-CHAT-001, REQ-CHAT-003, REQ-CHAT-014, REQ-SHELL-159, REQ-CHAT-017. Raised 2026-10-30 by R-089.)*

**What is open.** Text can change while a transcription runs, since typing is not blocked, and no requirement says which caret applies or how the text meets its neighbours.

**What the build proceeds under.** The caret when the transcript arrives. A selection is kept and the text goes after it, because a dictation never deletes. One space is added where the text would otherwise touch a non-space. The composer takes focus and the draft publishes as for typing; the microphone never submits and records no history entry. An empty transcript inserts nothing and says so.

**What decides it.** A ruling on the caret and on the selection.

<a id="oq-457"></a>

**OQ-457 — What configures the dictation model?** *(REQ-CONFIG-040, REQ-CONFIG-268, REQ-CONFIG-082..097. Raised 2026-10-30 by R-089.)*

**What is open.** No key exists, and a workspace's `agents.yaml` comes with the repository, so a key naming a program or a path would let a cloned repository choose what a press of the microphone runs.

**What the build proceeds under.** A Tier A top-level section, `dictation:`, edited in Settings › Models: `backend` (`off`, the default, `local` or `endpoint`), `local_model`, `base_url`, `model`, `auth_provider` and `language`. There is no command key and no path key: `local_model` is a bare name, refused otherwise, resolved to `<name>.pt` under the Whisper cache, and the program is `whisper` from `PATH` or `~/.local/bin`. A model file that is absent is refused before anything starts, because the CLI would otherwise download it. Nothing is installed or downloaded. The run host reads none of it, so `TIER_B_RUNTIME_KEYS` does not change.

**What decides it.** A ruling on the keys and the default. `off` means the control starts refused, with a reason naming the setting.

<a id="oq-458"></a>

**OQ-458 — What may a dictation send, and where is that disclosed?** *(ADR-0030, REQ-STARTUP-160, REQ-SHELL-005, REQ-PROVIDER-057. Raised 2026-10-30 by R-089.)*

**What is open.** `backend: endpoint` sends the person's voice to a URL. REQ-STARTUP-160's disclosure "SHALL name no host, endpoint, or request this document does not require" and states only its three things, so it has no room for this, and its "never carry … prompt text" is scoped to those requests. A workspace file can state `base_url` and `auth_provider` together, as a `models:` entry can.

**What the build proceeds under.** Only after the person presses the control, and only to the configured `base_url`. The bearer is the named provider's own credential, resolved in main through `ProviderService.lease`, never in the file, the snapshot or the renderer. The disclosure is left unchanged. Demo mode (REQ-SHELL-005) has no code to meet in the product as built; when it lands, the endpoint path must decline with it.

**What decides it.** A ruling on the disclosure, and on whether a workspace file may pair a `base_url` with a credential here when it may for a model.

<a id="oq-459"></a>

**OQ-459 — What does the application grant the renderer's device requests?** *(ADR-0030, REQ-CHAT-007. Raised 2026-10-30 by R-089.)*

**What is open.** Nothing set a permission handler before this, so Electron's default answered yes to every request. Capture needs a secure context, and a request refused without a reason looks like a broken button.

**What the build proceeds under.** Handlers on the default session: `media` is granted for audio only, to the application's own pages; the clipboard write the copy buttons use stays granted; every other request is refused. A non-secure page shows a specific reason in the control's two channels instead of attempting capture, and a device refusal or absence states its own reason. Measured values are in the first-execution row.

**What decides it.** A ruling on the list.
