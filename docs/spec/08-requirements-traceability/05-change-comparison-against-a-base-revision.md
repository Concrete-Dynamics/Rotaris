# Requirements Board and Traceability — Change Comparison Against a Base Revision

Part 5 of 13 of [domain 08](../08-requirements-traceability.md), which indexes every part. Defines REQ-TRACE-156 – REQ-TRACE-209.

### Change Comparison Against a Base Revision

- **REQ-TRACE-156** — The change comparison SHALL answer a question the check is structurally incapable of answering. Where a requirement's **prose** is rewritten but every annotation naming it is left in place, verification continues to report success even though the code now implements an older statement. The comparison SHALL convert such a change into an actionable worklist by comparing each requirement's content hash at a base revision against its hash in the working tree.

- **REQ-TRACE-157** — The "before" state of every requirement SHALL be taken from the **generated artifact as committed at the base revision**, and SHALL NOT be reconstructed by re-reading the requirement documents as they stood at that revision. Only entries in that artifact that are well formed and carry a requirement number SHALL contribute; an entry that cannot be interpreted SHALL be passed over while the remaining entries still contribute. A requirement SHALL therefore be reported as unchanged exactly when the content hash the base artifact records for it equals the hash computed from the working tree, whatever the historical documents contained.

- **REQ-TRACE-158** — Given the base artifact cannot be retrieved, is empty, fails to load, or carries no usable mapping, the base SHALL be reported unavailable: no changes are computed, the comparison states that there is no base artifact to compare against, and nothing is reported as drift. A base revision that exists but at which the generated artifact had not yet been introduced SHALL take exactly this path and SHALL be indistinguishable in behaviour from a base revision that does not exist: in both cases there is no recorded "before" state, and inventing one by re-reading the historical requirement documents is forbidden by REQ-TRACE-157.

- **REQ-TRACE-159** — The changed-file set SHALL be the union of two version-control queries: tracked changes between the base revision and the working tree, and untracked-but-not-ignored files. Each SHALL be merged only when it succeeded; a failing query SHALL contribute nothing rather than aborting. Untracked files SHALL be included so a brand-new implementation or test file counts as touched.

- **REQ-TRACE-160** — Classification SHALL be pure given the current requirements, the base snapshot, the site index and the changed-file set. For every current requirement: no base entry means **added**; differing content hashes mean **modified**, with drift computed, and — when the lifecycle also differs — the transition recorded on the same entry so a combined change is reported once as modified carrying the transition, not twice; equal hashes with a differing lifecycle mean **status**; equal hashes and equal lifecycle emit nothing. Every base number missing from the current set means **removed**, carrying the base title, lifecycle and source path. The result SHALL be sorted by requirement number.

- **REQ-TRACE-161** — Drift for a **modified** change SHALL be defined as: the requirement is `approved`, **and** it has at least one recorded annotation site, **and** none of those site files appears in the changed-file set. Consequences: a `draft` requirement can never drift; a requirement with no annotations can never drift; and drift is judged at **file** granularity, so touching any part of a file containing a site clears it.

- **REQ-TRACE-162** — Drift for a **removed** change SHALL omit the approved precondition: it is simply "has sites and none touched".

- **REQ-TRACE-163** — The site index SHALL be **all** references in both directions, not the direction-filtered maps, so a coverage annotation in a test root and a trace annotation in an implementation root both count as sites to review.

- **REQ-TRACE-164** — Each change SHALL be presented as one entry carrying: the change kind, the identifier, the quoted title, an optional lifecycle transition stated only when a transition was recorded **and** differs from the current lifecycle, a fixed obligation text per kind, and a drift marker when drift was found. Beneath that entry SHALL come one `<file>:<line> (<kind>)` entry per site.

- **REQ-TRACE-165** — Each change kind SHALL carry a fixed obligation text. For **added**: implement the requirement, then attach both annotations. For **removed**: delete each listed reference or point it elsewhere. For **modified**: re-check every site in the list against the rewritten text. For **status**: bring the existing references into line with the requirement's new lifecycle.

- **REQ-TRACE-166** — Given an **added** or **modified** change with no sites, a single placeholder SHALL state that there are no annotation sites yet. Given a **removed** or **status** change with no sites, no site entries SHALL be presented at all.

- **REQ-TRACE-167** — Given no changes at all, the comparison SHALL state that there are no requirement changes against the base.

- **REQ-TRACE-168** — Given a non-empty drift set, the comparison SHALL state, as a finding distinct from the per-change entries, the number of requirements that changed without their implementing or covering code being updated, and SHALL instruct the user to propagate the change or update the annotations and then commit the requirement and the code together. Drift SHALL always be reported; it is never suppressed and never selected for.

- **REQ-TRACE-169** — The comparison SHALL parse the store freshly and return parse errors before touching version control at all; on parse errors it SHALL present no worklist whatsoever and SHALL report those errors in their place.

- **REQ-TRACE-170** — The comparison's version-control queries SHALL each be a read-only child process rooted at the repository, capturing output, not raising on a non-zero status, and treating an unavailable version-control executable as a failed query with empty output. Every such invocation SHALL be bounded by a **30-second** timeout, the same bound the consumer layer applies (REQ-TRACE-201). An invocation that exceeds it SHALL be terminated and SHALL count as a failed query with empty output, which the surrounding rules already accommodate: the changed-file set simply gains nothing from that query (REQ-TRACE-159), and a base artifact that could not be retrieved is reported as unavailable (REQ-TRACE-158). **No operation SHALL be able to block indefinitely on a child process.**

- **REQ-TRACE-511** — The desktop application SHALL offer a **change comparison** against a base revision, and that surface SHALL be where a user reaches REQ-TRACE-156 through REQ-TRACE-170. The base revision SHALL be selectable and SHALL default to the revision the working tree currently sits on. The comparison SHALL present the classified changes of REQ-TRACE-160 in requirement-number order, each carrying the facts of REQ-TRACE-164 and the obligation text of REQ-TRACE-165, with every listed site openable at its own file and line by the route of REQ-TRACE-266. The drift finding of REQ-TRACE-168 SHALL be presented distinctly from the changes themselves, an unavailable base (REQ-TRACE-158) and an absence of changes (REQ-TRACE-167) SHALL each be stated in words, and the comparison SHALL write nothing.

### Read-Only Coverage Query

- **REQ-TRACE-171** — A side-effect-free query API SHALL answer "what covers requirement X?" without running verification. Its only inputs SHALL be the requirement store together with the configured source roots: it SHALL consult no version-control system, open no network connection and write nothing. Asked about a requirement that has no coverage, or one it does not recognize at all, it SHALL return empty collections rather than raising.

- **REQ-TRACE-172** — Its shapes SHALL be: a site carrying a repository-relative POSIX path, a line and a kind; and a per-requirement result carrying the number, the implementation sites and the test sites, with derived "is traced" and "is test covered" predicates.

- **REQ-TRACE-173** — Entry points SHALL be: one requirement; every requirement keyed by number; and a pure projection of an already-computed sweep. An existing parse MAY be supplied for reuse. The sweep itself SHALL NOT be reused across single-requirement calls, so querying N requirements one at a time costs N full scans — a documented cost.

- **REQ-TRACE-174** — The keys of the full map SHALL be the union of two sets, sorted ascending: the numbers of the declared requirements, **and** every number the sweep saw referenced anywhere. A caller can therefore spot references to requirements that no longer exist without running verification again. A requirement with no sites SHALL still appear as a key, holding empty collections rather than being omitted.

- **REQ-TRACE-175** — Coverage sites obtained from a sweep SHALL be flagged as **not executed**. A static scan can establish only that a test is present in the source; it cannot establish that the test was ever run. Downstream, such sites SHALL project as *stale* evidence. The boundary of what the static scan can assert is presence, never execution.

- **REQ-TRACE-176** — The library SHALL be importable in a repository where the generated artifact has never been produced, and importing it SHALL neither parse the store nor require that artifact to exist. The metadata record, the lifecycle enumeration and both annotation kinds SHALL be usable immediately on import. Asking for a name the public surface does not offer SHALL raise the language's ordinary missing-attribute error, naming both the package and the name asked for.

### Store Probing

- **REQ-TRACE-177** — A probe SHALL answer whether a repository keeps a store **of this kind** without parsing it, so that workspace selection can distinguish "no requirements" from "requirements we cannot read". The mere presence of a directory bearing the expected name proves nothing: another project may store its requirements at that exact path but in a document convention this parser does not understand, in which case an ordinary parse yields an empty list and reports no errors at all.

- **REQ-TRACE-178** — The probe result SHALL carry three fields: whether some document under the store declares a requirement identifier; how many documents carry frontmatter that is *not* an identifier block — a positive count here alongside a negative answer to the first field is precisely the situation the probe exists to detect; and how many documents were inspected, a figure limited only by how large the store is, since the probe scan applies **neither a document cap nor a time limit**.

- **REQ-TRACE-179** — Where the store directory is absent, the probe SHALL answer at once with no identifier found, no frontmatter documents counted and nothing inspected. Otherwise it SHALL walk the store in the same path order as the store scan, normalizing each document it reads and passing over any it cannot read, and SHALL **stop at the first document that declares a requirement identifier** — so the inspected count reported with a positive answer covers only the documents reached up to that point. The probe SHALL compute no hashes, produce no requirements, write nothing and consult no version-control system.

- **REQ-TRACE-180** — A workspace SHALL be claimed as carrying a store of this kind only by **reading** it, never by the directory existing.

### Enforcement Layers

- **REQ-TRACE-181** — Enforcement SHALL be layered so that drift is caught at five different moments: (1) in the editor and at compile time, free of charge, through the generated symbols — a deleted requirement's symbol vanishes and every reference becomes a build error, and a deprecated requirement's symbol carries the language's deprecation marker so every reference warns at the exact spot; (2) the test session's own regeneration (REQ-TRACE-182), which turns an edited requirement into a failure inside that same test run; (3) meta-tests inside the ordinary test suite (REQ-TRACE-183), so that any continuous-integration run of that suite enforces it with no extra configuration; (4) the traceability check of REQ-TRACE-508, together with the board's continuous evaluation (REQ-TRACE-334, REQ-TRACE-347), which states a violation on the requirement's own card as soon as the repository changes; (5) the completion conditions the engine evaluates before a requirement may be recorded as delivered (REQ-TRACE-399, REQ-TRACE-402), which no surface may relax.

- **REQ-TRACE-182** — Before collecting tests, the test session SHALL regenerate the compiled requirement-symbol artifact, so that editing a requirement surfaces as a verification failure within that same test run. It SHALL report a regeneration notice and any parse errors through the test run's own diagnostic reporting, and SHALL NEVER block collection: any failure SHALL be caught and reported as a skipped-regeneration notice, leaving parse errors for the meta-tests to surface. **"Any failure" includes a failed replacement** (accepted amendment 2026-09-06, OQ-41): this session is the one concurrent invocation the product still has (REQ-TRACE-502), it writes the artifact the same checkout may have open, and REQ-TRACE-061's ladder can exhaust there. The catch SHALL therefore sit around the whole regeneration and not around its parse alone, and a failure SHALL leave the suite running against the artifact already on disk — stale at worst, never partial.

- **REQ-TRACE-183** — Meta-tests SHALL assert, over the real repository, that the store parses with zero errors and is non-empty, that the generated artifact is up to date (with a failure message naming the regeneration action of REQ-TRACE-509), and that verification reports **zero errors**. The repository's steady state SHALL therefore be: no violations, only baseline-suppressed debt.

- **REQ-TRACE-184** — *Withdrawn.* A continuous-integration workflow enforced traceability by invoking the withdrawn command line, which no longer exists to be invoked. The capability — a repository being told about traceability violations without anyone remembering to look — is carried by the meta-tests of REQ-TRACE-183, which any continuous-integration run of the project's own test suite exercises, and by the desktop check of REQ-TRACE-508 together with the board's continuous evaluation (REQ-TRACE-334, REQ-TRACE-347).

- **REQ-TRACE-185** — *Withdrawn.* A commit-time hook exists only to invoke a command from a shell, and the product offers no command to invoke. The capability it carried — a violation stopping work before it is committed — is carried by REQ-TRACE-508, which states every violation over the repository as it currently stands, by REQ-TRACE-183, which fails the project's own test suite on the same findings, and by REQ-TRACE-402, which refuses to record a requirement as delivered while its text has moved on. The staging behaviour has no successor and needs none: the two paths the toolchain may write are written by REQ-TRACE-509 and REQ-TRACE-510 and are committed by the user like any other change.

- **REQ-TRACE-186** — *Withdrawn.* There is no command-line invocation for a build target to wrap and none for a contract to rest on. The operations of REQ-TRACE-508 through REQ-TRACE-511 are the contract, and they are reached the same way on every supported platform.

- **REQ-TRACE-187** — An implementation SHALL be accepted only where all five of these hold:
  1. the full test suite passes and the check of REQ-TRACE-508 reports **no violation**;
  2. taking one approved requirement that has no implementation reference and setting `trace: required` on it makes that check report an error naming that requirement and makes the traceability meta-test fail; reverting the edit and regenerating restores both;
  3. the same exercise with `test: required` on a requirement that has no covering test produces the equivalent error and the equivalent recovery;
  4. editing only a requirement's prose causes the artifact to be regenerated with a changed content hash at the next compile, test run or regeneration (REQ-TRACE-509), and causes no other failure;
  5. a violation introduced while the board is open is stated on that requirement's own card and on the check surface without the application being restarted, and the requirement cannot be recorded as delivered while it stands (REQ-TRACE-402).

### Authoring and Propagation Workflow

- **REQ-TRACE-188** — Five triggers SHALL each start the propagation procedure: verification reporting errors; a traceability meta-test failing; a missing-attribute failure raised where a symbol was removed; a deprecation warning fired at a reference site; and **any** edit made anywhere under the requirement store.

- **REQ-TRACE-189** — The procedure SHALL be, in order: (1) obtain the worklist from the change comparison of REQ-TRACE-511, optionally against a chosen base revision, and read each changed requirement's current text in full rather than its diff; (2) act on each entry according to the obligation its change kind carries (REQ-TRACE-165); (3) regenerate the artifact (REQ-TRACE-509) and run the check of REQ-TRACE-508, taking the reported violations as the work queue; (4) visit every reference site the worklist lists, implementation sites and covering tests alike; (5) bring each implementation site into line with the current text, keeping its trace annotation attached to the behavior it names; (6) add or amend covering tests until the check reports no errors; (7) commit the requirement documents, the generated artifact, the baselines, the implementation and the tests as **one commit**, whose message names the requirement identifier. The procedure is complete when, at that commit, the check of REQ-TRACE-508 reports no violation and the comparison of REQ-TRACE-511 against the base reports no drift.

- **REQ-TRACE-190** — Hard authoring rules SHALL be: never hand-edit the generated artifact; never leave production code or a test untraced, authoring a technical requirement where no product requirement fits; never quiet a violation by stripping annotations, watering down the requirement text, or writing a fresh baseline entry; never reuse or renumber an identifier — deprecate instead of deleting anything ever referenced in code.

- **REQ-TRACE-191** — A requirement's flip to `approved` and the addition of its annotations SHALL land in the **same change**, because an approved requirement without annotations is a verification error unless baselined. When baselined debt is paid, it SHALL be pruned by the baseline-update action of REQ-TRACE-510.

- **REQ-TRACE-192** — New or materially changed **product** requirements SHALL model a test portfolio before implementation, as a table with columns for level, productive scenario, exercised boundary and planned or covering test, and rows for unit, integration and user-flow end-to-end. Every "not applicable" SHALL carry a reason. At least one hermetic end-to-end test through the real public product boundary SHALL carry the coverage annotation for the product requirement. One end-to-end flow MAY be counted as coverage for more than one requirement only where it asserts something substantive about each of them and names every one it claims. **Technical** requirements SHALL instead specify unit or integration coverage suited to the seam they sit on, reaching the originating product flow by way of their origin link; no separate end-to-end test is owed for them.

- **REQ-TRACE-193** — A requirement statement, its acceptance criteria and its scope SHALL be written in terms of observable behavior alone, and SHALL name no class, function, module, file path or other artifact of the implementation. It SHALL be possible to read a requirement without opening any source file and, from that reading alone, write a test that decides whether it holds.

- **REQ-TRACE-194** — An epic document SHALL itself be a requirement whose body contains a one-paragraph scope description, an index table of its children, and a history section preserving the description, implementation notes and acceptance criteria of any documents merged into it. The observed index columns SHALL be: identifier as a relative link, title, priority, lifecycle.

- **REQ-TRACE-195** — The epic index table SHALL be maintained by the authoring workflow and by the source write path (a deletion also removes the index row), but SHALL NOT be machine-checked by the verifier and MAY therefore drift from the actual documents without any tool complaining.

- **REQ-TRACE-196** — Human-readable reciprocal navigation lines between a derived requirement and its origin SHALL be treated as convention for readers only. The **forward** frontmatter link SHALL be the single source of truth for the derived relation; the reverse direction SHALL be computed so it cannot silently drift. No tool SHALL validate those navigation lines: a missing, stale or wrong reciprocal line SHALL produce no error and no warning from any operation, and their absence SHALL never affect the derived-from integrity checks of REQ-TRACE-098, which read the frontmatter link alone.

### Consumer Integration Contracts

- **REQ-TRACE-197** — There SHALL be exactly **one parser**: all requirement metadata — identifiers, lifecycle, type, obligation flags, origin links and content hash — SHALL come from the store's own parser. Any additional frontmatter reader would amount to a rival definition of the repository's requirement set, and the two definitions would diverge as soon as the document format changed. An adapter reading the store as a source SHALL add no second parse.

- **REQ-TRACE-198** — The metadata record SHALL deliberately **not** carry the requirement's prose. The documented extraction rule SHALL be: for a single-identifier document, the text between the top-level identifier heading and the first second-level section; for a multi-identifier document, the text of that identifier's own section.

- **REQ-TRACE-199** — The parent-epic relation SHALL be derived from the store layout, not from a frontmatter field: an index document at the store root owns the sibling directory of the same stem, and a requirement's epic is the lowest-numbered identifier declared by its index document — which for a multi-identifier document is the document itself. A document sitting directly in the store directory is its own index, and index documents are therefore parentless.

- **REQ-TRACE-200** — Requirement history SHALL be read from version control at an **explicit revision**, using read-only queries, so nothing about the working tree can change the answer. A revision the version-control system does not know SHALL NOT be an error — it means the artifact did not exist then, a real answer for a requirement added later. A store outside version control SHALL declare no history.

- **REQ-TRACE-201** — Every version-control call made by the consumer layer SHALL be bounded by a **30-second** timeout. A call that stalls SHALL therefore come back as a failure rather than blocking whichever refresh issued it.

- **REQ-TRACE-202** — Prose reads SHALL be keyed to the store's own content hash: where a document's hash is unchanged since the previous refresh, its text SHALL NOT be fetched a second time. A request naming particular artifacts SHALL fetch exactly those and nothing besides.

- **REQ-TRACE-203** — Incremental reading SHALL be an **optional** source capability: a source that can address artifacts individually lets a one-document change in a large store cost one document, while a source that cannot is still first-class and simply re-reads in full when the revision moves. Scanning is therefore not incremental by default.

- **REQ-TRACE-204** — All writes SHALL be performed under the store's own conventions. Three consequences SHALL hold: editing a document preserves frontmatter fields the model does not represent; a newly created requirement satisfies the project's own check without further hand-editing; and removing a requirement also strips its row from the owning epic's index table.

- **REQ-TRACE-205** — Where the store is read as a requirement source, the result SHALL satisfy: each declared identifier appears exactly once, carrying its identifier, title, lifecycle, type and content hash unchanged from the store; a document declaring several identifiers yields one requirement per identifier, each with that document's hash and with whatever lifecycle its own override block sets; and a workspace holding no store yields **no source at all, and not an error**.

- **REQ-TRACE-206** — A consuming surface SHALL acquire coverage by **calling the library directly** and receiving plain data back. No consuming surface SHALL launch the checking engine as a process, and none SHALL interpret rendered output in place of the data. On this path there is consequently no child process, no exit status to inspect and no text to parse.

- **REQ-TRACE-207** — A sweep performed for a consuming surface SHALL use **the project's own layout**, never the toolchain's built-in defaults, which name this repository's roots and would be wrong for every other one — without which every card in a foreign workspace would show no implementation and no covering test, and a re-derived worklist digest would find nothing and refuse every approval as "the sites have moved".

- **REQ-TRACE-208** — Where a consuming surface cannot read the layout configuration, it SHALL log a **warning** describing the failure and carry on with an **empty sweep result**, showing no coverage anywhere. It SHALL NOT report a read failure to the user and SHALL NOT decline to display.

- **REQ-TRACE-209** — Requirements with no sweep entry — an unknown number, or one with no annotations — SHALL yield empty implementation and covering-test collections, never an error.
