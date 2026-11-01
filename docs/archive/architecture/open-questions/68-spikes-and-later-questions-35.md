# Archived open questions — Spikes, and the questions raised since (35 of 35)

The ruled, closed, resolved and withdrawn entries of [part 68](../../../architecture/open-questions/68-spikes-and-later-questions-35.md) of the [open-questions record](../../../architecture/open-questions.md), each moved here whole, under its own anchor, by `pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script writes here ([the archive](../../../README.md#the-archive)).

<a id="oq-378"></a>

**OQ-378 — Where no project file covers the workspace, what do the model's own reference search and safe symbol deletion do?**
*(REQ-MCP-015, the READ tier's referencing-symbol search and the EDIT tier's safe symbol deletion; [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004)
revision 2, whose clause 5 gives the symbol rename alone a project file of the product's own; [OQ-362](65-spikes-and-later-questions-32.md#oq-362), whose ruling
asked that this be recorded and raised, not ruled there; REQ-MCP-011 and ADR-0035, the pinned runtime driven as it is;
REQ-MCP-116, the binding manifest. Raised 2026-10-20 by loc1's `rename` bundle (`loc1-rename`) with
[`with-no-project-file-a-safe-delete-removes-a-symbol-its-importers-still-use`](../../../defects/with-no-project-file-a-safe-delete-removes-a-symbol-its-importers-still-use.md);
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

**Ruled 2026-10-21 under the owner's delegation ([R-072](../../../product/requests.md#r-072)).** The ruling is option (b), refined, of kind change-behaviour. It is recorded as [`PD-MCP-004`](../../../product/directives/pd-mcp-004.md#pd-mcp-004) **revision 3**: the case sentence, clause 5 and the sentence after it, with revision 2's words quoted beside them. Revision 3 extends REQ-MCP-116 further. It governs what REQ-MCP-015's EDIT-tier safe symbol deletion decides on the bundled server. Both back-pointers are amended in place.

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

    Every cost revision 2 accepted for a rename would be multiplied by the search's frequency. The record shows agents spending a whole child on a workspace change they could not account for ([`the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it`](../../../defects/fixed/the-load-adds-serena-to-the-users-gitignore-and-the-agents-cannot-account-for-it.md)). It also shows the owner moving the runtime's marker line out of the person's `.gitignore` (OQ-161). A's timings come from one fresh server per row, not from searches across a session.
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

<a id="oq-459"></a>

**OQ-459 — What does the application grant the renderer's device requests?** *(ADR-0030, REQ-CHAT-007. Raised 2026-10-30 by R-089.)*

**What is open.** Nothing set a permission handler before this, so Electron's default answered yes to every request. Capture needs a secure context, and a request refused without a reason looks like a broken button.

**What the build proceeds under.** Handlers on the default session: `media` is granted for audio only, to the application's own pages; the clipboard write the copy buttons use stays granted, under both names Chromium asks it by (`clipboard-sanitized-write` and, for a write with no press behind it, `clipboard-read`, which therefore also admits a read); every other request is refused, to any page. A non-secure page shows a specific reason in the control's two channels instead of attempting capture, and a device refusal or absence states its own reason. Measured on the built app, 2026-10-30: `isSecureContext` true on `file:`, `getUserMedia({video:true})` `NotAllowedError`, `Notification.requestPermission()` `denied`, `writeText` granted.

**What decides it.** A ruling on the list.

**Ruled 2026-11-01 under the owner's delegation (R-072).** Advocate A (the user's lens) asked for the build's list plus an audio grant tied to a dictation press and three distinct refusal reasons; Advocate B (the system's lens) asked for the same list with its fail-open gaps closed and the two unset handlers refusing everything. Ruled: the list stands, as one default-deny policy in `main/permissions.ts` on every session. `media` is granted only to the application's own pages and only when every requested type is `audio` and the list is not empty or `unknown` (today `[].every` grants it). The clipboard write stays granted to own pages under both measured names; a test pins that the renderer calls no `navigator.clipboard.read*`. Everything else is refused to every page: `setDevicePermissionHandler` false for every device, `setDisplayMediaRequestHandler` no stream, the rest refused. “Own page” is the built `file:` renderer under the application's renderer directory, and the dev-server origin only while `app.isPackaged` is false. The press-gated grant is not adopted (the OS consent sits above this handler). Under REQ-CHAT-007 a refused or impossible capture (non-secure page, OS or application refusal, no device) publishes its own reason through tooltip and accessible description, never claiming the application refused when the OS did. ADR-0030 grounds nothing here. No requirement is departed from; no directive. The build adds the two handlers, unit rows, and a driven built-app check (a first execution).
