[Product directives](../directives.md) › PD-MCP-004

<a id="pd-mcp-004"></a>

### PD-MCP-004 — a code-intelligence symbol rename is preceded by a referencing-symbol search of the same symbol

*Revision 3 (2026-10-21, [R-072](../requests.md#r-072), ruling [OQ-378](../../architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378)) — **the safe symbol deletion's project file**: the case sentence, clause 5 and the sentence after it, revision 2's words quoted beside them. Clauses 1 to 4 are unchanged.*

*Revision 2 (2026-10-20, [R-072](../requests.md#r-072), ruling [OQ-362](../../architecture/open-questions/65-spikes-and-later-questions-32.md#oq-362)) — **a project file for a rename no project file covers**, clause 5 below, and the sentence after it; revision 1's sentence quoted beside it.*

**The case — revision 3.** An agent calls the bundled code-intelligence runtime's **symbol rename** or its **safe symbol deletion** (REQ-MCP-015's EDIT tier) on the server whose entry carries the built-in code-intelligence name, under whatever name the model calls it (a `tool_name_map` rename of REQ-MCP-005, or REQ-MCP-057's collision prefix, included). Clauses 1 to 4 are the symbol rename's; clause 5 is both calls'. The following are not this case: another server's tool of the same name; every other tool of the EDIT tier; and every tool of the READ tier, the model's own referencing-symbol search included.

> **Revision 2 said, and no longer governs:** "An agent calls the bundled code-intelligence runtime's **symbol rename** (REQ-MCP-015's EDIT tier) on the server whose entry carries the built-in code-intelligence name, under whatever name the model calls it (a `tool_name_map` rename of REQ-MCP-005, or REQ-MCP-057's collision prefix, included). Another server's tool of the same name, and every other tool of the EDIT tier, is not this case."

1. **The manifest.** REQ-MCP-116's binding manifest SHALL also record a **warm-up**, keyed by capability: the EDIT tier's symbol rename is warmed by the READ tier's referencing-symbol search, together with the names of the arguments the two share — the symbol's name path and the file that declares it (as the pinned runtime spells them, `name_path` and `relative_path`). The generator SHALL refuse a manifest in which either tool is not reported by the runtime's `tools/list`, or in which either tool's listed input schema lacks either argument, so an upstream rename fails a build and never a rename.
2. **The search.** Before the product forwards every such rename to the server, it SHALL send that server the referencing-symbol search with exactly the two shared arguments copied from the rename's own call, and SHALL discard the answer, an answer marked as an error included. The search is the product's own request, made as REQ-MCP-070's and REQ-MCP-071's are: no persona grant, `disabled_tools` or `tool_name_map` applies to it (REQ-MCP-064 reads post-connect probes the same way), and it never reaches the model.
3. **The record.** The search SHALL write no tool-call record, no total, no histogram bucket, no child-report entry and no notice. The session record shows the rename's one row, as before.
4. **The allowance.** The search and the rename SHALL be held to the rename's one REQ-MCP-003 allowance, measured from the dispatch of the rename: the rename is forwarded with what the search left. A search that exhausts the allowance ends the rename as REQ-MCP-003's failed call, unsent. A search that fails otherwise (an error result, a thrown fault, a lost connection) still lets the rename go ahead, the failure written to the application log. A cancel by the run during the search stops it, and the rename is not sent (`PD-TOOLS-013`'s `interrupted`).

   *Ruling note, 2026-10-14 ([OQ-299](../../architecture/open-questions/61-spikes-and-later-questions-28.md#oq-299), ruled under [R-072](../requests.md#r-072)): when the search ends with the rename's allowance spent and the run's cancel also holds, the allowance governs: the rename ends as REQ-MCP-003's failed call (timeout), unsent, as `PD-TOOLS-013` revision 2 (c) reads the rename's own catch. This holds whether the search failed or answered. The Extends line is unchanged.*

5. **The project file — revision 3.** The clause applies where both of these hold:
   - the call's declaring file has a file-name extension the pinned runtime serves with its TypeScript language server. The declaring file is the call's `relative_path`, read against the project root the server was launched for: REQ-MCP-034's appended path, an isolated run's tree root included;
   - no person's file named `tsconfig.json` or `jsconfig.json` stands in that file's directory, or in any directory between it and that root, the root included.

   Where it applies, the product SHALL place a `jsconfig.json` of its own at that root before it sends the call; for a rename, that is before clause 2's search. It SHALL keep the file while the call is answered; for a rename, while the search and the rename are answered. It SHALL remove the file once the call has answered or has ended otherwise: an error result, a thrown fault and the run's cancel included, and for a rename clause 4's exits too. The removal SHALL come before the call returns, and for a rename before its reach observation (OQ-245) is complete. No directory above the root is consulted, and the product's own file at the root is never read as a person's.
   - **Never a person's file.** The product SHALL place the file only where no file of that name exists, and SHALL never overwrite or remove a file it did not write.
     - Its bytes SHALL be one constant of the build: a comment line naming the product and saying that the file is temporary, was written for one code-intelligence call and may be deleted, then an empty JSON object, with LF line endings.
     - It SHALL be removed only while its bytes are that constant, or the constant revision 2 wrote. The product recognises revision 2's constant as its own for removal alone, and never writes it or keeps a file that holds it.
     - A file of that name whose bytes are neither is a person's file. It counts as a project file and is left where it stands. Where the product expected its own file there, that is written to the application log at `warn`.
     - A placement that fails leaves the call to proceed as it would without this clause, and the failure is written to the application log at `warn`.
   - **One file per root.** Calls of this clause that overlap at one root SHALL share one file, whichever session they belong to: the first to begin places it, each keeps it, and the last to end removes it.
     - A call that begins while the product's file stands SHALL keep that file rather than place another.
     - A call that begins while other calls keep the file, but the file no longer stands, SHALL place it again, as the first did.
     - A call whose declaring file a person's project file covers neither places nor keeps the product's file.
   - **A file left behind.** This covers the product's file standing at a root while no call keeps it: the process ended during a call, or a removal failed. The product SHALL remove such a file at the next run start at that root. It SHALL also remove it at the next symbol rename or safe deletion there whose declaring file the clause's language serves, before that call is sent. The one exception: where no person's project file covers that call's declaring file and the file holds this build's constant, the call SHALL keep the file as if it had placed it.
   - **The record.** The file SHALL write no tool-call record, no total, no histogram bucket and no notice, as clause 3's search writes none. It SHALL be listed in no child's report and no child-report artifact, the calling child's included, whatever an observation of any agent's call saw while it stood. Each placement and each removal SHALL be written to the application log at `info`. The model is told nothing of the file; the call's result is the runtime's.
   - **The manifest.** REQ-MCP-116's binding manifest SHALL record the clause, keyed by capability as clause 1's warm-up is. It records:
     - the symbol rename and the safe symbol deletion, each read through the argument that the manifest's edit arguments name for its declaring file;
     - the runtime's TypeScript language, and the file-name extensions the runtime serves with it, read from the runtime as the extensions it indexes are;
     - the two names that count as a project file;
     - the name the product writes.

     The generator SHALL refuse a manifest whose runtime does not name that language. It SHALL also refuse one that records a project file for a capability whose declaring-file argument the manifest does not name.
   - **The allowance.** The placement, the call and the removal are held to the call's one REQ-MCP-003 allowance. For a rename this is clause 4's allowance, which is unchanged.

> **Revision 2's clause 5 said, and no longer governs:** "Where the rename's declaring file … and no file named `tsconfig.json` or `jsconfig.json` stands in that file's directory or in any directory between it and that root, the root included, the product SHALL place a `jsconfig.json` of its own at that root before it sends clause 2's search, SHALL keep it while the search and the rename are answered, and SHALL remove it once the rename has answered or the call has ended otherwise — an error result, a thrown fault and clause 4's exits included — before the call's reach observation (OQ-245) is complete. No directory above the root is consulted."; "… was written for one symbol rename and may be deleted … It SHALL be removed only while its bytes are that constant; a file whose bytes differ is left where it stands, and that is written to the application log at `warn`."; "A placement that fails leaves clause 2 to proceed as it would without this clause, the failure written to the application log at `warn`."; "Renames that overlap at one root SHALL share one file … A rename that begins while the product's file stands SHALL keep that file rather than place another."; "Where the product's file stands at a root and no rename keeps it — the process ended during a rename, or a removal failed — the product SHALL remove it at the next run start at that root and before the next rename there."; "… the renaming child's included … the rename's result is the runtime's."; "… keyed by capability as clause 1's warm-up is: the symbol rename; … The generator SHALL refuse a manifest whose runtime does not name that language."; "The placement, the search, the rename and the removal are held to clause 4's one allowance, which is unchanged."

Everything else stands — revision 3:
- the rename's and the safe deletion's arguments, results and reach observation (OQ-245) are the runtime's and the run host's, as before;
- clause 2's search changes nothing in the workspace;
- clause 5's project file is the one thing the product writes there for either call, and it is removed when the call has answered;
- every READ-tier call, the model's own referencing-symbol search included, is forwarded as the model made it, and its answer is the runtime's.

> **Revision 2 said, and no longer governs:** "Everything else stands — revision 2: the rename's arguments, result and reach observation (OQ-245) are the runtime's and the run host's as before, and the search changes nothing in the workspace; clause 5's project file is the one thing the product writes there for a rename, and it is removed when the rename has answered."

> **Revision 1 said, and no longer governs:** "Everything else stands: the rename's arguments, result and reach observation (OQ-245) are the runtime's and the run host's as before, and the search changes nothing in the workspace."

**Why, and what it costs.** The pinned runtime (`serena-agent` 1.7.0) waits for the TypeScript language server to load the project before a references request and not before a rename, so the first rename of a server session that needs the server's cross-file view renamed the declaring file alone and reported success: `code-intel-proof`'s eleventh launch (`child-rename-cold`) and four arrangements over the runtime's stdio branch, a copy of the live run's `todo-app` fixture among them, each changed one file, while the same rename after one referencing-symbol search reached every file ([OQ-273](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-273)). A model reaches for a rename precisely so that it does not have to edit the referencing files one by one, and nothing told it they were left behind. What it costs: every rename makes one server request the model did not make, and spends part of its allowance on it; the manifest gains a capability of the binding that rests on the runtime's internals (a later pin may make the search unnecessary, or insufficient), so `code-intel-proof`'s eleventh launch is re-run on every pin change as its acceptance gate; and the product departs from an implementation built from the specification alone, which forwards the rename as the model made it. Precedent for a request the product makes on its own: REQ-MCP-070's `lsp_init` and REQ-MCP-071's binding probe.

**Why revision 2, and what it costs.** Clause 2's search was measured to help only where a `tsconfig.json` or `jsconfig.json` covers the files (revision 1's first live execution, below). Where none does — a Vite or plain Node JavaScript project ships none — the TypeScript language server places each file in an inferred project of the files open in it, the runtime opens the declaring file alone, the search answers `{}`, and the rename changes the declaring file alone while saying it succeeded: the live `rename` scenario at `3c03287`, and `code-intel-proof` launch 13 at every run on record ([OQ-362](../../architecture/open-questions/65-spikes-and-later-questions-32.md#oq-362)). Over the bundled runtime, an empty `jsconfig.json` at the root made the search name both importers and the rename apply three changes; launch 13's control run, with one written into its workspace, renamed both files. A file of the product's own for the length of the call is the measured remedy that leaves the pinned runtime unpatched (OQ-273 rejected a patched distribution) and lets the language server compute the edits from the whole project, as it would from a person's own file. What it costs: a file the person did not ask for stands at their workspace root while the search and the rename run, so a watcher, a dev server, an editor's language service or `git status` may see it, and a commit, or a checkpoint taken in that window with untracked files included (REQ-GIT-034, REQ-GIT-051), may capture it; a process that ends during a rename leaves it until the next run start or rename at that root; the search loads every file the empty object takes in under the root, so a large workspace spends more of the rename's allowance and of the language server's memory; the server keeps seeing that project for later requests of its session until it notices the removal; a configuration above the root is not consulted, so where the language server would read one, the product's file is the nearer one for the call; a workspace whose project file stands in the chain but does not take in the declaring file or its importers is left as built; and one more behaviour rests on the language server's project discovery, so `code-intel-proof` launches 13, 14 and 15 join launch 11 as gates re-run on every pin change.

**Why revision 3, and what it costs.** The safe symbol deletion decides from the language server's view whether a symbol is still referenced. Where no project file covers the workspace, that view holds the open file alone.

What was measured, on 2026-10-20, over the bundled runtime's stdio server in copies of the `todo-app` fixture, one fresh server per row ([OQ-378](../../architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378)):
- With no project file, the deletion of `remaining` answered `OK` and removed the function, while `src/App.jsx` and `src/todos.test.js` still import and call it.
- With the product's file placed, it refused, named both files, and changed nothing.

A deletion the tier calls safe that leaves the project unable to load, behind a result that says it succeeded, is the harm OQ-273 and OQ-362 ruled out for the rename. Clause 5's file is its measured remedy. The executor that places it is the one every code-intelligence call goes through, and the manifest already names this capability's declaring-file argument.

The model's own referencing-symbol search answered `{}` in the same table, and it is left as the runtime answers it. It changes nothing. A file placed for it would stand at the person's root around every reference search, the commonest cross-file query, made by any of the twelve personas that carry the server, coordinators included. A watcher, a dev server, an editor's language service, `git status`, a commit or a checkpoint taken with untracked files (REQ-GIT-034, REQ-GIT-051) would then meet it around a call that only reads.

The keep's repairs bring clause 5 to its own text, which revision 2's build met only for a rename no person's file covers:
- a leftover was adopted before the covering walk, and so kept for a call a person's file covers;
- a call that found the count above 0 kept a file that might no longer stand.

The comment line now says the file was written for one code-intelligence call, because it stands for a deletion too.

What it costs:
- In a workspace no project file covers, a model that looks before it edits is still told that nothing uses the symbol, and so is a persona asked who uses it. The person reading the transcript sees the same `{}`. This lasts until the model greps (REQ-MCP-016) or the deletion refuses.
- A search made while the server still sees the project that a rename's or a deletion's file gave it can answer differently from one made later in the session.
- The READ tier's implementation search looks in the same direction and is not measured.
- A refused deletion places and removes the file around a call that changes nothing.
- In a large workspace the deletion spends part of its allowance, and of the language server's memory, loading the project.
- One more capability rests on the runtime's internals and on the language server's project discovery. `code-intel-proof` launches 16 and 17 therefore join launches 11 and 13 to 15 as gates re-run on every pin change.

> **Extends:** REQ-MCP-116, REQ-MCP-015

*Ruled under the owner's delegation, 2026-10-13 ([OQ-273](../../architecture/open-questions/58-spikes-and-later-questions-25.md#oq-273), option (a)); logged as [R-072](../requests.md#r-072). Extends REQ-MCP-116 (the manifest records the pairing and the argument names) and governs what REQ-MCP-015's EDIT-tier symbol rename reaches on the bundled server.* *Revised under the owner's delegation, 2026-10-20 ([OQ-362](../../architecture/open-questions/65-spikes-and-later-questions-32.md#oq-362), option (a) refined; revision 2); logged as [R-072](../requests.md#r-072). Extends REQ-MCP-116 further (the manifest records the project-file clause) and governs further what REQ-MCP-015's symbol rename reaches on the bundled server; both back-pointers are amended in place.* *Revised under the owner's delegation, 2026-10-21 ([OQ-378](../../architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378), option (b) refined; revision 3); logged as [R-072](../requests.md#r-072). Extends REQ-MCP-116 further: the manifest records the safe deletion's project file, and the generator refuses a project file whose capability names no declaring-file argument. Governs what REQ-MCP-015's EDIT-tier safe symbol deletion decides on the bundled server. Both back-pointers are amended in place. Revision 3's first execution is reported back in place after revision 2's, once built.*

*(Revision 1's report-backs — the first execution of 2026-10-14, the correction of 2026-10-14 and the first live execution of 2026-10-15 — stand below unchanged; revision 2's first execution is reported back in place after them once built.)*

> **First execution, 2026-10-14, built under [R-072](../requests.md#r-072) (fin43):** the rule held as written. The manifest's
> `warmUps` names the pairing by capability with `name_path` and `relative_path`; the generator refuses either tool unlisted or
> either argument missing from either schema, and passed against the bundled runtime (24 tools, `--check` equal).
> `codeIntelligenceWarmUp` (`packages/config/src/mcp/code-intelligence.ts`) answers by the server-reported name; the MCP executor
> (`apps/desktop/src/run-host/mcp.ts`) asks it only of the `code_intelligence` server, after `connect`, inside `observeReach`.
> Clause 4's two exits keep the order the rename's own catch has (the allowance before the abort, `PD-TOOLS-013` revision 2), and
> a search the server answers after the run's cancel, or after the whole allowance, also stops the rename unsent. **What was
> measured.** Eight cases under "PD-MCP-004" in `apps/desktop/src/run-host/mcp.test.ts`, seven red before the change: the order
> and the two arguments, an error answer discarded, a thrown fault logged once at `warn` with the rename still sent, a cancel
> during the search (`interrupted`, nothing sent), one allowance (the rename sent with 180 s after a 120 s search; a search that
> spends it is the REQ-MCP-003 timeout, unsent), a `tool_name_map` rename warmed, another server's same-named tool and another
> EDIT tool not warmed, one settled row and no issue. In the built app, `code-intel-proof` launch 11 (`child-rename-cold`) green:
> both files renamed, report and artifact listing both, no reference-search row; red with the warm-up switched off. **What was
> not measured.** A live run: the opt-in `rename` scenario now reads a cold rename that leaves a referencing file behind as a
> finding against this directive, and is the orchestrator's to run. Repairs
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Corrected 2026-10-14 (fin44, `fin44-optional-findings`):** clause 3 was not held for one failure. The search went through
> the same connection call as a model's, which raises REQ-MCP-069's unreachable notice when the transport closes, so a server
> lost during the search was announced by the search even when the rename then reconnected and succeeded. The search is now
> sent quietly (`SessionConnections.call`'s `quiet`): a lost transport is released and logged as before, and only the rename
> may warn. Repairs
> [`a-rename-warm-up-that-loses-its-connection-raises-the-servers-unreachable-notice`](../../defects/fixed/a-rename-warm-up-that-loses-its-connection-raises-the-servers-unreachable-notice.md).

> **First live execution, 2026-10-15, reported back by fin47 (`fin47-rename-and-optionals`): the rule held as written, and its
> reason is falsified for a workspace with no project file.** The opt-in live `rename` scenario at `3c03287` (pack
> `2026-10-15T05-00-55-983Z`) failed its PD-MCP-004 check: the run host sent the search (no warning logged), the rename said
> `(1 changes applied)` and changed `src/todos.js` alone, and the child mended `src/App.jsx` and `src/todos.test.js` by hand.
> ~~"four arrangements over the runtime's stdio branch, a copy of the live run's `todo-app` fixture among them, each changed one
> file, while the same rename after one referencing-symbol search reached every file"~~ — *the search was measured to help only in
> the arrangement with a `tsconfig.json`. Where no `tsconfig.json` or `jsconfig.json` covers the files, as in the `todo-app`
> fixture (a Vite React shape), the TypeScript language server holds only the open files in an inferred project; the runtime opens
> the declaring file alone, so the search answers `{}` and the rename stays in that file however long the server has run
> (measured over the bundled runtime: the search, a second search 15 s later, and overviews of both importers all left it at one
> file; an empty `jsconfig.json`, or the importers held open, made it reach all three).* What to do there is
> [OQ-362](../../architecture/open-questions/65-spikes-and-later-questions-32.md#oq-362), open; `code-intel-proof` launch 13 (`child-rename-cold-js`) pins it red in the
> built app. Reopens
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md).
> The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **First execution of revision 2, 2026-10-20, built under [R-072](../requests.md#r-072) (loc1, `loc1-rename`): the rule held as
> written.** *The spike, as the first act of building:* over the bundled runtime's own stdio server on Windows 11 ARM64 (build
> 26200; the `win32-x64` bundle under the x64 emulation, OQ-401; the shipped `--context ide` arguments), copies of the `todo-app`
> fixture, the product's exact bytes for the file, the file placed inside a live server session in each of the four cases the
> ruling names — once `tools/list` had answered and before any file was opened; after a symbol overview had opened the declaring
> file; a second time in one session after one removal; and two `.ts` files with no `tsconfig.json` — the search named the
> importers and the rename said "3 changes applied" (the `.ts` pair "2 changes applied") in every row, where the control without
> the file renamed `src/todos.js` alone; no row left an importer behind, so nothing reopened. *Built:* the manifest's
> `projectFiles` (`manifest.mjs`, the runtime's `typescript` language with the twelve extensions the runtime serves with it,
> `.cjs` to `.tsx`; refused by `projectFileRefusals` unless the capability is a tier's and the runtime names the language with an
> extension; `--check` equal); `codeIntelligenceProjectFile` and `CODE_INTELLIGENCE_PROJECT_FILE_BYTES`
> (`packages/config/src/mcp/code-intelligence.ts`); and in the MCP executor (`apps/desktop/src/run-host/mcp.ts`) the clause after
> `connect` and before the search (`holdProjectFile`: a root count above 0 keeps, a root file holding the constant is adopted, a
> covering file in the chain up to the root means nothing is placed, otherwise an exclusive create), the removal in the observed
> call's `finally` (`releaseProjectFile`, only while the bytes are the constant), the leftover removal at every `prepare`, outside
> its memo, and each placement and removal noted in `McpHost.writes` under a name no agent bears and logged at `info`. **What was
> measured.** Seven cases under "PD-MCP-004 revision 2 (OQ-362)" in `apps/desktop/src/run-host/mcp.test.ts`, red on the code
> before, and four guards green before and after; the reader's cases in `code-intelligence.test.ts` and the generator's refusal
> cases in `code-intelligence-warm-ups.test.ts`, red before; revision 1's cases unchanged (their rig now holds a `tsconfig.json`, so
> clause 5 does not apply there). In the built app, `code-intel-proof --steps=10,11,13,14,15`: launches 13
> (`child-rename-cold-js`), 14 (`child-rename-opened-js`, a symbol overview of the declaring file first) and 15
> (`child-rename-cold-ts`) each "(2 changes applied)", both files on disk, report and artifact listing exactly those two, no search
> row, the log's one placement and one removal (the file stood 2.9 s in launch 13), nothing left at the root; launch 11 green with
> no `jsconfig.json` beside its `tsconfig.json`; launch 10 unchanged; with the clause switched off in the same build, launches 13 to
> 15 each "(1 changes applied)", the declaring file alone. The whole proof then passed in one run (`--skip-build`, every launch but
> the packaged-only seventh: launches 1 to 6 and 8 to 15 green, 980 s, CPU load 79 % at the start with eight other trees' Electron
> alive); two earlier whole runs had stopped at launch 1, on another tree's window counted by the window sampler
> ([`code-intel-proofs-window-sampler-counts-another-trees-windows`](../../defects/code-intel-proofs-window-sampler-counts-another-trees-windows.md),
> Windows-only), and at launch 2, whose fixed 25 s capture a load of 99 to 100 % outran (discovery 15.6 and 23.9 s;
> [`code-intel-proofs-discovery-launch-judges-the-connection-inside-a-fixed-25-s-window`](../../defects/code-intel-proofs-discovery-launch-judges-the-connection-inside-a-fixed-25-s-window.md)). **Found:** a sibling's own EDIT call that writes inside the rename's
> window is still listed under the renaming child, as OQ-245's bound states (`mcp.test.ts`'s sibling case reads it); the product's
> file is never listed. The tree's first proof run, in a fresh runtime home, stopped at launch 10 before any rename: on Windows the
> run start's discovery cut the language server's first install short and the session's own install failed
> ([`on-windows-discovery-cuts-the-first-language-server-install-short-and-the-sessions-install-fails`](../../defects/on-windows-discovery-cuts-the-first-language-server-install-short-and-the-sessions-install-fails.md),
> Windows-only, recorded for the Windows session; and
> [`the-code-intelligence-server-provisions-its-language-servers-at-discovery-before-any-symbol-tool-is-used`](../../defects/the-code-intelligence-server-provisions-its-language-servers-at-discovery-before-any-symbol-tool-is-used.md));
> the runs above are on a home provisioned by the spike's runtime. The model's own search and safe deletion in such a workspace are
> left as they were and are raised as [OQ-378](../../architecture/open-questions/68-spikes-and-later-questions-35.md#oq-378). **What was not measured.** The live
> `rename` scenario: its launch (`timeout 3600 node C:/dev/Rotaris-crw-wt-loc1-rename/apps/desktop/scripts/live-run.mjs --confirm
> --skip-build --only=rename`) was refused by the session's permission classifier and is the orchestrator's; it now also fails
> when a `jsconfig.json` stands at the workspace root afterwards. Off Windows nothing of revision 2 was run. Repairs
> [`a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone`](../../defects/fixed/a-symbol-rename-that-is-the-servers-first-cross-file-request-renames-the-declaring-file-alone.md)
> again. The row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
