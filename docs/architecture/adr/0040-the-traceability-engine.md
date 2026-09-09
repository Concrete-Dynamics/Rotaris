# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-09-02, under `owner-decisions.md` SR-1, SR-3, SR-4 and ESC-14, and against the
  specification as amended — `REQ-TRACE-513` (new), `REQ-TRACE-089` (index clause, new),
  `REQ-TRACE-514` (new, ADR-0041's)
- **Origin:** DATA (ADR-DATA-06)
- **Depends on:** ADR-0001, ADR-0002, ADR-0003, ADR-0038
- **Evidence:** `spikes/windows-writer-handle-compaction.md` §3.1–3.2

> **Summary of what changed, and it is two things pulling in opposite directions.** The store still does
> not move — `REQ-TRACE-513` now states as a requirement that the requirement documents, the generated
> symbol artifact, the three baselines and the retired-identifier log **SHALL be plain files in the
> user's own repository and SHALL NOT be moved into any store the application keeps for itself**, on
> four independently sufficient grounds. That closes the placement question against the record's own
> earlier hedging. But `REQ-TRACE-089`, which this ADR treated as an absolute prohibition on any derived
> state, has been amended to **permit an index** — held anywhere, including in the application's own
> store — subject to exactly one distinction: an index that is *consulted* is forbidden, an index that
> is *validated against the files* is allowed. `REQ-TRACE-513` closes with the same permission and no
> other: "what MAY be held in a store is an **index** over these files, on the terms `REQ-TRACE-089`
> fixes and on no others."
>
> So alternative C is not refused wholesale any more, and this record must say which half of it survives
> and which does not. Specific 7 is rewritten to be that boundary rather than a blanket. `REQ-TRACE-502`
> is unchanged, and OQ-41 is unchanged in kind: SR-1 narrows it sharply, SR-4 does not dissolve it, and
> `REQ-TRACE-513` now makes that non-dissolution a requirement rather than this record's objection.

## Context

`REQ-TRACE-089` is the decisive constraint and its first paragraph is stated in the plainest language in
its domain: "Every operation shall report the repository as it stands at the moment that operation runs.
**No result shall be carried over from an earlier invocation and no stored summary shall be consulted in
place of reading the files**, so an edit made between two invocations shall be reflected by the second
without anything having to be cleared first, and two invocations over an unchanged repository shall
report the same thing. How often the work is repeated within one invocation shall make no difference to
what that invocation reports." `REQ-TRACE-173` accepts the consequence explicitly: "querying N
requirements one at a time costs N full scans — a documented cost". `REQ-TRACE-203` is explicit that
"scanning is therefore not incremental by default". `REQ-TRACE-090` and `REQ-TRACE-408` forbid a read
path from writing at all.

**`REQ-TRACE-089`'s second paragraph is new and it changes what this record may conclude.** It must be
read in full, because every clause of it is load-bearing:

> An **index** over the store and the repository — held wherever the application likes, including in a
> store it keeps for itself — is permitted, and exactly one distinction decides whether a given index is
> admissible. An index that is **consulted** is forbidden: if what an operation reports can depend on
> what the index last recorded, then a stale index and a current one are indistinguishable to the
> caller, and the guarantee above is gone however accurate the index usually is. An index that is
> **validated** is allowed: it is checked against the files themselves before any answer is given, and
> it is rebuilt from the files wherever that check fails or cannot be completed, so every answer still
> comes from the files and the index decides only how much work was avoided in producing it. The
> distinction is behavioural and SHALL be testable exactly as stated: with the application still open,
> change a requirement document, a baseline, the generated artifact or the retired-identifier log by any
> means at all — including means the application has no way to observe, such as a checkout of another
> revision, an edit by another program, or a restored backup — and the very next operation SHALL report
> the changed repository, with nothing to clear and no action by the user. An index that cannot meet
> that test is being consulted, whatever it is called, and SHALL NOT be used. Nothing here weakens
> `REQ-TRACE-091`'s rule that one verification run judges every check against one reading of the store
> and one reading of the repository.

`REQ-TRACE-513` is the placement requirement and did not exist when this record was written. It fixes
the four artifacts as "plain files in the user's own repository" that "SHALL NOT be moved into any store
the application keeps for itself", recorded "so that relocating them is a change someone has to argue
for rather than an optimisation that can be made while every other requirement still appears satisfied".
Its four grounds are worth having in one place because between them they answer most of what a later
reader will ask: the documents are **the user's versioned material and the product is a guest in it**
(authored by hand and by the creation surface, never by a migration — `REQ-TRACE-155`, `REQ-TRACE-442`;
baselines carrying headers written for a person — `REQ-TRACE-121`; the retired-identifier log parsed
tolerantly precisely because people edit it by hand — `REQ-TRACE-130`, `REQ-TRACE-135`);
**version-control history is load-bearing**, because the change comparison takes each requirement's
"before" from the generated artifact **as committed at the base revision** and is forbidden to
reconstruct it any other way (`REQ-TRACE-157`, `REQ-TRACE-158`); **the generated artifact is imported by
the user's own program** (`REQ-TRACE-053`), and "a record in a store cannot be imported by the
repository's code"; and **a shrink-only ratchet and an append-only log earn their value in a diff**
(`REQ-TRACE-116`, `REQ-TRACE-130`) — adding a baseline entry by hand is forbidden by a rule "enforceable
by people reading a diff and by nothing else". Two consequences the requirement attaches are this
record's: the concurrency obligation of `REQ-TRACE-502` **stays live over all four**, and "no property
of a store's concurrency control may be cited as discharging it"; and the only thing that may be held in
a store is an index, on `REQ-TRACE-089`'s terms and no others.

`REQ-TRACE-152` limits the toolchain's writes to two named actions — the regeneration of
`REQ-TRACE-509` and the baseline update of `REQ-TRACE-510` — "every other operation SHALL be read-only".
This record previously read that as "so there is nowhere an index could legally live". That reading is
now wrong and the correction is stated in alternative C: `REQ-TRACE-152`'s subject is what the toolchain
writes **in the repository**, and an index is not there.

`REQ-TRACE-501` fixes the cost of the store parse: linear in documents and bytes, roughly a thousand
requirement documents in about one second, and — the sharper half — "**peak memory shall be bounded by
the size of the largest single document plus the accumulated metadata records, never by the total prose
of the store: a document shall be normalised, hashed and reduced to its metadata record before the next
document is read, and no phase of the parse shall require every document's text to be resident at
once.**" `REQ-TRACE-088` fixes the sweep: linear, roughly a thousand source files carrying ten thousand
annotation sites in about a second, on one execution thread, timing enumeration, reading and matching
and excluding process start-up and the store parse — "the linear-growth clause is the binding one".

`REQ-TRACE-197`: there shall be **exactly one parser**; "any additional frontmatter reader would amount
to a rival definition of the repository's requirement set". `REQ-TRACE-013`: that parser shall be
self-contained and **depend on no third-party YAML, TOML or validation library**, so that it can run
wherever the engine is embedded — and for the same reason the layout configuration format shall be
JSON. `REQ-TRACE-008` to `REQ-TRACE-011` fix a frontmatter grammar that **is not YAML**: the first line
must strip to exactly three dashes; a field line opens with a letter, continues with letters, digits,
underscores or hyphens, then a colon; any other line is appended to the field most recently opened with
one space between; the value is everything after the first colon, stripped, with one matching outer
quote pair removed and **no other escape or quote processing**; an unterminated block means the document
has no frontmatter and produces **no diagnostic of any kind**. A key outside the model's own set is
**carried through untouched and otherwise ignored**, and survives a write (`REQ-TRACE-204`).

`REQ-TRACE-104` requires a **parsed** test for a re-export-only module: its parsed contents must consist
of nothing beyond import statements, module-level assignments naming exported symbols, and documentation
or bare string-literal statements; any function declaration, any class declaration, any conditional and
any other executable statement disqualifies it; and a module whose text cannot be parsed is not excused
by the rule. `REQ-TRACE-109` requires a **syntax tree** for test collection. `REQ-TRACE-110` requires a
syntax error to yield an empty function list rather than a failure. `REQ-TRACE-182` requires the **test
session itself** to regenerate the artifact before collecting tests, reporting through the test run's
own diagnostics and **never blocking collection: any failure shall be caught and reported as a
skipped-regeneration notice**.

`REQ-TRACE-079`: discovery is a **static text scan** — not an import and not runtime introspection.
`REQ-TRACE-077`: an annotation whose argument list itself contains a call is **not** recognised and no
diagnostic is produced. `REQ-TRACE-078`: plain call sites must be recognised as well as
decorator-position uses, "required for bootstrap: the toolchain's own modules cannot use decorator
syntax before the artifact they generate exists". `REQ-TRACE-084` and `REQ-TRACE-087` fix reporting to
the line the identifier actually occupies with an exact character span, and require offset-to-line
mapping verified exhaustively over an empty text, a text of only newlines, a text with no trailing
newline and a text with carriage-return line endings.

`REQ-TRACE-073` makes project-declared conventions a **regex-driven language seam**: six keys per entry,
patterns evaluated against the file's normalised text, a non-compiling pattern being a configuration
error naming the convention, the key and the compilation failure. `REQ-TRACE-074`: registration is a
single ordered sequence with the built-in convention at position one, and a later registration claiming
an already-claimed extension is accepted without diagnostic and simply never consulted.

`REQ-TRACE-091`: a verification run judges every check against **one reading** of the store and one of
the repository, with findings grouped by check in a fixed enumerated order, "so two implementations
cannot interleave the checks differently and both be conformant". `REQ-TRACE-092`: any parse error
short-circuits, returning only the parse errors. `REQ-TRACE-100`: every diagnostic carries a
machine-parseable prefix which "is a de facto public contract".

`REQ-TRACE-206` and `REQ-TRACE-377`: a consuming surface acquires coverage by **calling the library
directly** and receiving plain data; **no consuming surface may launch the checking engine as a
process**, parse rendered output in place of the data, or re-compute evidence health, requirement health
or epic progress — and **a guard test shall assert it**. `REQ-TRACE-378`: a board surface takes every
engine-derived value already translated, through the bridge and from no other route. `REQ-TRACE-337`:
evaluation and projection work shall **never** run on the interface event loop.

`REQ-TRACE-207` and `REQ-TRACE-208`: a sweep performed for a consuming surface uses **the project's own
layout**, never the toolchain's built-in defaults; where the layout cannot be read, log a warning and
carry on with an **empty sweep result**, showing no coverage anywhere.

`REQ-TRACE-154` and `REQ-TRACE-225` state that the absence of any time, document or resource limit on
the scan is **a deliberate decision and not a gap**, with every external call it makes bounded
separately (`REQ-TRACE-170`, `REQ-TRACE-201`: 30 s per version-control call, and "no operation shall be
able to block indefinitely on a child process").

**There is no command line, and this is now load-bearing.** `REQ-TRACE-142`, `REQ-TRACE-144` to
`REQ-TRACE-151`, `REQ-TRACE-153`, `REQ-TRACE-184`, `REQ-TRACE-185` and `REQ-TRACE-186` are all
withdrawn on the grounds that the product has no command-line surface. The operations that remain are
`REQ-TRACE-508` (check), `REQ-TRACE-509` (regeneration), `REQ-TRACE-510` (baseline update) and
`REQ-TRACE-511` (change comparison), each of which the **desktop application** offers. The only
invocation of the toolchain outside the application is `REQ-TRACE-182`'s test-session regeneration and
`REQ-TRACE-183`'s meta-tests, both of which run inside the *project's own* test session.

`REQ-TRACE-502` is the coordination rule, and it must be read whole, because its middle sentence
defines what its last sentence means:

> Concurrent invocations SHALL be safe without any lock, lease or coordination file. Every artifact the
> toolchain writes — the generated artifact, the three baselines and the retired-identifier log — SHALL
> be written by the atomic replace of `REQ-TRACE-061`, `REQ-TRACE-126` and `REQ-TRACE-137`, so a reader
> concurrent with a writer SHALL observe one complete version of a file and never a partial one, and two
> concurrent writers SHALL leave one complete file rather than a blend of both. Beyond that, **no
> invocation SHALL wait for another**: where two invocations race, each SHALL report the repository as
> it read it, so a check running beside a regeneration MAY legitimately report the artifact stale even
> though the other invocation is in the act of refreshing it, and re-running the check afterwards SHALL
> report it up to date. An invocation SHALL NEVER fail, hang or leave a lock behind because another was
> running.

Two things in that text decide the analysis below. First, it **names the four artifacts and requires
them to be written by atomic replace of a file**, so the requirement is about files by construction and
is not reachable by relocating a store. Second, its own gloss on "no invocation shall wait for another"
is about **views**, not about I/O scheduling: two racing invocations must each report what they read,
and one must not be made to observe the other's result. `REQ-TRACE-061` fixes the write's failure
behaviour in the opposite direction from a retry: on any failure the temporary file is removed
best-effort and **the failure is re-raised**. No retry ladder is stated for this store anywhere.

## Alternatives considered

**A — Parse the store into a resident model and refresh it incrementally**, watching the filesystem.
This is the design most boards get, and it would make the N-scans cost disappear. `REQ-TRACE-089`
forbids it in the plainest language in the domain, and `REQ-TRACE-203` makes incremental reading an
*optional source capability* rather than the engine's behaviour. What survives of A is the
**within-invocation** reuse the same requirement's last sentence permits and `REQ-TRACE-202` invites —
prose reads keyed to the store's own content hash, so an unchanged document's text is not fetched twice
within one refresh.

**B — A stateless engine invoked per operation, streaming its parse.** Chosen. Within one invocation,
values are shared freely — `REQ-TRACE-091` requires one reading of each to serve every check and
`REQ-TRACE-128` says how much of the work the invocation repeats shall not be observable. Between
invocations, nothing is retained.

**C — Move the parsed store into the workspace database as a second definition of the requirement set.**
The obvious thing to try once a database exists, and still refused. *Against, and each is independently
sufficient:* the requirement documents are **the project's own Markdown under the project's version
control**, written back "into the original artifact — the project's own file, never a local copy"
(`REQ-TRACE-434`), and `REQ-TRACE-513` now forbids the move outright rather than leaving it to a
principle. A parsed copy in rows that anything reads *as the requirement set* is a **second definition
of it**, which `REQ-TRACE-197` forbids in terms — "any additional frontmatter reader would amount to a
rival definition of the repository's requirement set, and the two definitions would diverge as soon as
the document format changed."

> **What this record used to say here, and why one third of it is now wrong.** The previous version
> listed a fourth objection: "detecting the index's staleness cheaply requires consulting exactly the
> **stored summary `REQ-TRACE-089` forbids consulting**", and concluded that C "fails on four separate
> stated observables". It also read `REQ-TRACE-152` as leaving "nowhere an index could legally live",
> and `REQ-TRACE-090`/`REQ-TRACE-408` as forbidding the index's own maintenance write.
>
> **The argument was sound and its premise has been removed.** `REQ-TRACE-089` now says an index is
> permitted and says exactly what makes one admissible. Read against the amendment, the old objection
> proves something narrower and still true: an index cannot be validated *cheaply*. The requirement
> agrees — it requires the check to be "against the files themselves", names a restored backup and a
> checkout of another revision as changes "the application has no way to observe", and thereby rules out
> every cheap validator anyone would reach for first. A modification time is not a validator, because a
> restore can preserve one. A size is not a validator. A file-system watcher is not a validator, because
> the requirement's test is that the change may arrive by means the application cannot observe. What
> survives as an argument is a **cost** statement, not a prohibition, and it is carried into alternative
> E where it belongs.
>
> `REQ-TRACE-152`'s "nowhere an index could legally live" was a misreading. Its subject is what the
> toolchain writes **into the repository**; `REQ-TRACE-513` confirms that framing by naming exactly the
> repository artifacts and then permitting an index elsewhere. The `REQ-TRACE-090`/`REQ-TRACE-408`
> objection is *not* fully answered and is carried into alternative E as a live tension rather than
> resolved here.

**E — A validated index, on `REQ-TRACE-089`'s terms.** *Newly available, and not adopted now.* Distinct
from C in the only way that matters: nothing ever reads the index **as an answer**. It is offered a
freshly-read file and either recognises it or does not, and what it saves is interpretation — frontmatter
parsing, prose extraction, derived-from closure, and above all the project-supplied regular-expression
matching of `REQ-TRACE-073`, which is the one phase of the sweep that no requirement bounds
(`REQ-TRACE-154`, consequence 4). What it cannot save is **reading**, because every admissible validator
is over content. This record fixes E's shape so that it cannot be built wrongly later, and declines to
build it now (see specific 7 and *Revisit if*): `REQ-TRACE-088` and `REQ-TRACE-501` are the budgets, no
measurement says they are missed, and an accelerator adopted before its need is demonstrated is an
accelerator whose correctness nobody is motivated to keep.

**D — Keep the artifacts as files but hold a coordination record for them in the database.** A lock in
a table is still a lock: `REQ-TRACE-502`'s opening clause refuses "any lock, lease or coordination
file", and a row is a coordination record whatever it is stored in. It would also make the toolchain
undeployable in a project's test session, which has no workspace database. `REQ-TRACE-513` adds a second
refusal that is independent of the first: "no property of a store's concurrency control may be cited as
discharging" `REQ-TRACE-502`. Refused.

## Decision

**Alternative B**, with seven specifics, and **alternative E's shape fixed but not built**. Specifics 1
to 5 are unchanged. Specific 6 is rewritten under SR-1 and corrected against measured evidence.
Specific 7 is rewritten around `REQ-TRACE-089`'s consulted/validated distinction, which is what the
guard has to be now that a blanket no-handle rule would forbid something the specification permits.

1. **Streaming parse.** `REQ-TRACE-501`'s memory bound is a design constraint, not a performance note:
   normalise, hash and reduce each document to its metadata record **before reading the next**. That
   rules out the natural read-all-then-parse-all shape, which holds every document's text at once. The
   content hash is computed over the normalised text as it streams, and the prose extraction happens in
   the same pass.
2. **The frontmatter reader is hand-written and shares nothing with ADR-0036's YAML library.**
   `REQ-TRACE-013` requires it, and the grammar is not YAML anyway. A YAML parser would reject documents
   this reader must accept and would interpret constructs this reader must not. **Two parsers in one
   product is the right answer here and it is required rather than tolerated.**
3. **A syntax-tree parser for the implementation language ships inside the product.** `REQ-TRACE-104`
   and `REQ-TRACE-109` cannot be satisfied by regular expressions, and `REQ-TRACE-110` presupposes a
   parser that reports syntax errors. Under ADR-0001's TypeScript decision the realistic options are the
   compiler API — correct, heavy, and already present if the build uses it — or a fast native parser,
   which would reintroduce a native-module burden. **This choice is left open and is the first thing to
   measure**, because `REQ-TRACE-088`'s one-second budget covers the sweep only, and no budget is
   stated for the parse-requiring checks (OQ-24).
4. **Choosing the implementation language chose the built-in annotation convention.** The generated
   symbol module is a TypeScript module, the built-in convention's four patterns are authored against
   TypeScript, and the two skip components are the TypeScript toolchain's. The regenerate-before-
   collection hook is an input to the test-framework choice (ADR-0001).
5. **The board projection is one immutable value per pass.** `REQ-TRACE-348`: "a board pass shall be
   held in one value so a reader can never observe half an update, and a detail read during a pass shall
   describe one generation of the board". All the joining, closure and sorting that a database would
   have been wanted for happens **here**, over data already in memory for the pass, and is handed across
   already translated. `REQ-TRACE-380` makes the projection-to-display mapping **pure with every input
   supplied including the current time**, so it reads no file, consults no repository, reaches no engine
   and requires no interface toolkit — and is therefore directly testable. **SR-4 does not change
   this.** The arrival of a database is not a reason to move the joins into it; the joins are over data
   that must be freshly read anyway, so a query would read the same files first and then do the same
   work.

6. **One I/O owner for the four written artifacts, and `REQ-TRACE-502` reached inside the
   application.** This replaces the previous specific 6, which concluded the requirement was
   unreachable. The conclusion has changed because its premise has.

   The previous reasoning ran: readers block replaces on Windows, the readers are other invocations of
   the same toolchain, and `REQ-GIT-145` puts no ceiling on how many run at once, so overlapping read
   windows can occupy a target indefinitely. **Two of those three premises no longer hold.**

   - *There are no other toolchain processes belonging to the product.* Every operation is a desktop
     operation (`REQ-TRACE-508` to `REQ-TRACE-511`); `REQ-TRACE-206` forbids a consuming surface from
     launching the engine as a process; and the command line those premises assumed is withdrawn
     (`REQ-TRACE-153`, `REQ-TRACE-184` to `REQ-TRACE-186`). **SR-1** finishes the job: a second launch
     surfaces the running instance, so there is no second application either. Every invocation the
     product makes is an in-process call.
   - *`REQ-GIT-145`'s unbounded concurrency does not multiply readers of one file.* Each isolated run
     gets its own worktree, and `REQ-GIT-140` gives each attempt its own directory. The generated
     artifact and the baselines are working-tree files, so N isolated runs read N different files. C-13
     is real but it does not apply to a single artifact.

   What remains is one process whose handle lifetimes are entirely ours, and the mechanism is
   correspondingly plain. **Every read and every replace of the generated artifact, the three baselines
   and the retired-identifier log is performed by one owner in the workspace service** — reads as
   open-read-close of the whole file, writes as ADR-0004's stage-and-replace — and no other execution
   context opens those paths. Engine passes run on terminable worker threads (below); a worker receives
   the *bytes* of an artifact from the owner and never opens the path itself. Because no descriptor on
   those paths is ever open when the rename runs, the `EPERM` failure mode does not arise, the read-side
   empty-read guard is not needed for this store, and:

   - *no lock, lease or coordination file* — there is none; the ordering is the natural ordering of I/O
     calls issued from one place;
   - *no invocation waits for another* — what is ordered is individual whole-file operations on small
     artifacts, not invocations. An invocation's scan, its version-control calls and its parse are not
     held; two invocations still proceed simultaneously and still each report the repository as they
     read it, which is `REQ-TRACE-502`'s own stated race semantics, including its example of a check
     legitimately reporting stale beside a regeneration;
   - *no invocation fails because another was running* — inside the application.

   **The residual, stated plainly, and it is two things rather than one.** *First*, one toolchain
   reader remains outside the application: `REQ-TRACE-182`'s test-session regeneration and
   `REQ-TRACE-183`'s meta-tests, running in the project's own test process against the same checkout.
   That process's handles are invisible to ours and ours to it, so on Windows either can still block the
   other's replace. *Second, and this record previously omitted it* — a **foreign** process can hold one
   of these files: the user's editor, a language server, a search indexer, anti-malware, a
   file-synchronisation client. Constraint C-11 and ADR-0004 both now carry this half, and it is not a
   `REQ-TRACE-502` conformance gap, because that requirement's subject is failing "because another
   **invocation** was running" and an editor is not an invocation. It is a `REQ-TRACE-061` problem
   instead: the failure is re-raised, so a user's editor can fail a regeneration the user asked for.
   Two different requirements, one symptom, and conflating them is what makes the residue look either
   larger or smaller than it is.

   The first half has a definite shape:

   - *Test session blocked by the application.* Already conformant, and not by our doing:
     `REQ-TRACE-182` requires the test session's regeneration to **never block collection** and requires
     **any failure to be caught and reported as a skipped-regeneration notice**. That is a stated
     downgrade of `REQ-TRACE-061`'s re-raise for this one caller, and it means a blocked replace on this
     side produces a notice rather than a failure.
   - *Application regeneration blocked by a test session.* **Not conformant with `REQ-TRACE-502`.**
     `REQ-TRACE-509` is a user-asked action, `REQ-TRACE-061` requires the failure to be re-raised, and
     the user sees a regeneration that failed because something else was reading the artifact. This is
     what is left of OQ-41: one platform, one direction, and only while a test run in the *same*
     checkout holds the artifact open.

   That is a **partial resolution, and it is recorded as one.** It is smaller than OQ-41 as filed by
   two orders: the unbounded reader population is gone, and one of the two directions is already
   answered by the specification. It is not zero, and the honest statement is worth more than a claimed
   closure. Callers of `REQ-TRACE-509` must still treat a write failure as a real outcome, and the
   action must report it as `REQ-TRACE-508`'s surface reports what each operation did. `REQ-TRACE-513`
   forecloses the one escape a later reader would look for: these four artifacts never enter a store, so
   no store's concurrency control can be cited as discharging `REQ-TRACE-502`.

   **What would close it — corrected against measurement, because the remedy this record named does not
   exist.** The previous version proposed "a runtime API exposing share-delete on open, which would let
   the test session's reader coexist with our replace". The writer-handle spike (§3.2) establishes that
   this is not the mechanism, and the correction changes the answer rather than the wording:

   - **Node's `open` already requests share-delete.** The discriminator is clean: `fs.unlinkSync` and
     .NET's `File.Delete` both succeed against a Node-held handle, while both fail against a .NET holder
     that requests only `FileShare.ReadWrite`. There is no share-mode flag to add and none is missing.
   - **The blocker is the replace-by-rename call.** `fs.renameSync` returned `EPERM` on 0/50 attempts
     for every distinct open flag the runtime exposes, and it fails "even when the holder explicitly
     permits delete" — 20/20 `EPERM` against a .NET holder opened `FileShare.ReadWrite | Delete`, where
     .NET's own `File.Replace` succeeds. It fails under exactly the conditions in which
     `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` returns `ERROR_ACCESS_DENIED`.
   - **`ReplaceFileW` succeeds** against a Node-held handle on every flag tried, 6/6, and a held reader
     goes on reading the complete previous contents — no torn read, no empty read.

   So the closer is a **replace primitive**, not an open flag, and it is available at a measured price
   rather than unavailable. Out of process it costs a shell spawn: **p50 767 ms, min 732, max 815,
   10/10 successful**. The spike prices that out of a *compaction* path, correctly. This store is not a
   compaction path: `REQ-TRACE-509` is a deliberate user action that already spends about a second
   parsing the store (`REQ-TRACE-501`) and is bounded by nothing tighter, and it replaces at most five
   small files. A second on the failure path of an action a user asked for is a different trade from a
   second on a per-event path, and this record states that rather than inheriting the spike's verdict
   from the domain it was measured for. In a native addon the same call is cheap, which is the shape
   ADR-0004 and ADR-0056 would have to own; it is not this record's to take, because a native module is
   a build-toolchain and packaging decision with an Electron-ABI rebuild obligation the comparison in
   ESC-21's section already flagged as a live failure mode.

   The other route stays what it was: the specification accepting a **bounded retry** for this store,
   which `REQ-TRACE-061` currently forecloses by declaring no ladder and requiring the failure re-raised.
   OQ-44 is where that question now sits, and it is sharpened rather than answered by the above —
   bounded contention is precisely the condition a bounded ladder is for, and the corpus states exactly
   one such ladder (`REQ-SESSION-033`), in the wrong domain to borrow from, over a file that is not the
   user's version-controlled material. The remedies OQ-41 listed as unavailable stay unavailable — a
   lock or lease is what `REQ-TRACE-502` names and refuses, and bounding concurrency for this store
   contradicts C-13.

7. **Consulted versus validated, and the port shape that makes the difference mechanical.** This
   replaces the previous specific 7, which drew the line as *the engine takes no database handle, so
   there is nothing for a later change to consult*. That guard was correct when the only thing
   `REQ-TRACE-089` said was "no stored summary shall be consulted in place of reading the files", and it
   is worth preserving as the alternative it now is: it was cheap, it was checkable by reading a
   signature, and it made the wrong design impossible rather than merely discouraged. **It is now too
   strong.** `REQ-TRACE-089` and `REQ-TRACE-513` between them permit an index in exactly the store the
   guard excluded, so a rule that forbids the handle forbids something the specification allows, and a
   later implementer who wants the index will delete the guard rather than reshape it — losing the
   protection along with the prohibition. A guard that will be removed is worse than one that bends.

   **The distinction, stated once, in the form a reviewer can apply.** It is not about where the value
   lives, what it is called, or how accurate it usually is.

   - A value is **consulted** when what an operation reports can depend on what the value last recorded.
     The requirement's own reason is the decisive one: "a stale index and a current one are
     indistinguishable to the caller". A cached parse, a cached sweep, a cached coverage count, a cached
     staleness verdict — every one of these is consulted, and is forbidden in a row exactly as in a file.
   - A value is **validated** when it is checked against the files themselves before any answer is
     given, and rebuilt from the files wherever the check fails or cannot be completed, "so every answer
     still comes from the files and the index decides only how much work was avoided in producing it".

   **What follows, and it is the part that constrains the build.** Every admissible validator is over
   **content**, and this is forced rather than chosen. `REQ-TRACE-089`'s test names a restored backup
   and a checkout of another revision as changes the application has no way to observe — a restore can
   preserve a modification time, so mtime is not a validator; size is not a validator; and a
   file-system watcher is not a validator, because the test is that the change may arrive by means the
   application cannot observe. **An index therefore cannot save reading. It can only save
   interpretation.** Anyone who reaches for an index to avoid I/O has already left the admissible set.

   **The mechanical guard, reshaped.** The engine's entry points still take no database handle **for
   answering**. If an index is ever built, it enters through one port and one port only, whose
   signature is the whole of the discipline:

   > the index is offered a path **together with the bytes just read from it**, and answers *recognised*
   > or *not recognised*. It is never asked a question about a path alone.

   Passing the freshly-read bytes is a required argument, so an implementation cannot obtain an answer
   without having done the read that makes the answer sound; there is no overload that omits them and no
   default value to supply. This is the same device `REQ-TRACE-207` already forced for the layout value —
   a parameter with no default, so omitting it is a compile error — applied to the one place the
   specification's distinction could otherwise be lost inside a function body.

   **Three obligations attach, and each of them is a thing that can be got wrong quietly.**

   - **The index must be droppable, and the engine must meet its budgets with the index cold.**
     `REQ-TRACE-088` and `REQ-TRACE-501` are stated over the files and no requirement offers relief for
     a cold index. So deleting the index must change timing and nothing else. This is also what settles
     the one tension the amendment leaves open: `REQ-TRACE-090` requires verification to write nothing
     and `REQ-TRACE-408` requires reading the board to write nothing, while `REQ-TRACE-089` requires the
     index to be **rebuilt** from the files where validation fails — which is a write on a read path.
     The reconciliation this record takes is that those two requirements' subject is the repository and
     the delivery store, both of which a user or another tool can observe, and that a value whose
     deletion has no observable consequence beyond timing is not a write in their sense. **That reading
     is arguable and is recorded as arguable.** If it is wrong, the index is not available at all — and
     the design survives that outcome intact precisely because nothing depends on the index.
   - **One reading per run stays one reading.** `REQ-TRACE-089` closes by saying it does not weaken
     `REQ-TRACE-091`, and the failure mode is easy to reach: validating an index by re-reading a file
     the run has already read would make two readings of the same file within one verification run,
     which is exactly what `REQ-TRACE-091` exists to forbid — "no two of its findings can describe
     different states of the same file". The bytes handed to the port must be the run's own single read,
     not a second one taken for validation.
   - **The behavioural test is a conformance test and must be written as the requirement states it.**
     With the application open, change a requirement document, a baseline, the generated artifact and
     the retired-identifier log by means the application cannot observe — a checkout of another
     revision, an edit by another program, a restored backup preserving timestamps — and assert the very
     next operation reports the change with nothing cleared and no user action. `REQ-TRACE-089` says an
     index that fails this "is being consulted, whatever it is called". The test must therefore exist
     whether or not an index does, because it is also the test that catches an index arriving by
     accident.

   **Why the delivery store next door is not an exception to any of this.** It sits beside this engine
   and *is* rows, so the boundary is worth stating in the same breath:

   - A **delivery record** is not derived from the files at all. It records what a person or the
     scheduler decided (`REQ-TRACE-405`, `REQ-CONFIG-198`), and `REQ-CONFIG-192` requires the delivery
     store to hold "operational records only" and never requirement text. Reading it is not reading a
     summary of the repository; it is reading a fact the repository does not contain.
   - The one place the two touch is `REQ-TRACE-405`'s stored *hash at that instant*, and it is the
     model for the whole distinction: that hash is **never consulted as an answer about the file**. It
     is only ever compared against a hash computed fresh from a fresh read, under `REQ-TRACE-402`'s rule
     that a requirement whose text has changed since its run's snapshot is not recordable as delivered.
     A stored value used **as an answer** is a cache and is forbidden; a stored value used **only as one
     side of an equality test against a freshly derived one** is a validation and is required. If a
     future change ever short-circuits that comparison — trusting the stored hash when some cheaper
     marker says the file has not moved — it has turned a validation into a cache and has broken
     `REQ-TRACE-089`. That sentence is the one to quote at a review, and it is now also the sentence
     that describes the only index this engine may ever have.
   - One naming trap, because `REQ-TRACE-514` puts the two words next to each other: the delivery store
     keeps its own record of **retired ids** so a retired id is never re-issued, and that is a
     *different thing* from the **retired-identifier log** this engine keeps as a file in the user's
     repository (`REQ-TRACE-130`, `REQ-TRACE-513`). The first is a row and exports with the delivery
     store; the second is the user's own file and "needs no export". Neither is derived from the other
     and neither is a validator for the other.

`REQ-TRACE-207`'s "the project's own layout, never the toolchain's built-in defaults" deserves a
**mechanical guard**: the sweep entry point takes a layout value **with no default**, so omitting it is a
compile error rather than a silent fall-back to this repository's own roots. That is exactly the failure
the requirement describes.

The engine runs in the workspace service (ADR-0002), with its passes on **terminable worker threads** so
a project-supplied regular expression with catastrophic backtracking can be killed without taking the
service down — and, per specific 6, with the four written artifacts' I/O performed by the owner rather
than by the workers.

### What the SR rulings dissolve here

- **SR-3** removes nothing that was here. This engine never polled: `REQ-TRACE-089` forbids carrying
  results between invocations, so a refresh is always a fresh read, and `REQ-TRACE-225` deliberately
  places no wall-clock bound on it. Where a board surface needs to know its view has fallen behind, it
  uses the same monotonic per-view sequence with gap detection SR-3 introduces everywhere else; that is
  a property of the view channel, not of the engine.
- **SR-4** dissolves, for this store, ADR-0004's read-side empty-read guard and the retry ladders it
  would have needed (there was never one for this store, and OQ-11's two candidates belonged to stores
  that have moved). ADR-0004 **rule 3** and constraint D-28 — the writer's-handle close-stage-rename-
  reopen discipline — never applied here, because this toolchain has no append-and-compact file, and
  are dissolved product-wide. ADR-0004 **rule 1** survives in the strengthened form of specific 6: not
  merely "readers must not hold descriptors" but "one owner performs all I/O on these four paths".
- **SR-4 does not dissolve OQ-41, and this is no longer this record's objection to argue.** The
  previous version reported it for correction: the ruling's own table kept the generated artifact, the
  baselines and the tombstone log as files in the user's repository, so a store whose readers do not
  block its writers is not where these artifacts live, and what narrows OQ-41 is **SR-1**, not SR-4.
  That correction has since been made and made twice over. `owner-decisions.md` ESC-14 withdrew the
  claim inside SR-4 itself — "**That reasoning is wrong and must not be cited**" — and `REQ-TRACE-513`
  now states the positive form as a requirement, with the consequence spelled out: because these four
  never enter any store, "no property of a store's concurrency control may be cited as discharging"
  `REQ-TRACE-502`. The entry is kept rather than deleted because a reader may still meet the withdrawn
  reasoning in an older quotation, and because the shape of the mistake — a storage decision quietly
  crediting itself with a defect that lives outside the store — is worth being able to recognise again.

## Consequences accepted

1. `REQ-TRACE-173`'s N-scans cost stands, exactly as the specification accepts it.
2. Every board refresh re-reads the store and re-sweeps the repository. `REQ-TRACE-225` accepts this and
   states the mitigations: the read runs off the interface thread, the board says a refresh is in
   progress, the last good board stays on screen, and every external call the read makes is bounded.
   **The presence of a database is not a licence to change this.** What has changed is that the guard is
   no longer "there is no handle to reach for" but "an index may only be offered bytes already read", so
   an index can make a refresh cheaper and can never make one stale.
3. A syntax-tree parser ships inside the product, with a bundle-size and start-up cost that
   `REQ-STARTUP-155`'s 5 s first-paint budget must absorb (ADR-0055).
4. **Project-supplied regular expressions run unbounded** by requirement. The worker-thread placement
   makes them terminable; **whether they should be terminated, and what the user is told, is not
   specified** (OQ-25). Note the pattern arrives with a checked-out repository, not from the user.
5. The board's ratchets shrink only and the tombstone log grows only (`REQ-TRACE-116`, `REQ-TRACE-130`,
   `REQ-TRACE-136`), and the retirement date comes from an **injectable clock** (`REQ-TRACE-140`) — the
   `WallClock` port of ADR-0006, not a global.
6. **The single I/O owner is a real constraint on how the engine is threaded**, and it costs something:
   a worker cannot read the generated artifact for itself, so the owner reads it and passes the bytes.
   For four small files that is negligible; it is written down because "just open the file on the
   worker" is a one-line change that would silently reintroduce the `EPERM` window.
7. **`REQ-TRACE-502` is reached inside the application and not against a concurrent test session on
   Windows.** OQ-41 stays open at that reduced scope, and C-11 should be restated to it rather than
   either asserting the property or denying it wholesale. A caller of `REQ-TRACE-509` must still handle
   a raised write.
8. The streaming parse of specific 1 holds a read descriptor on one document at a time. That is
   compatible with specific 6 only because the toolchain never replaces a requirement document —
   `REQ-TRACE-152` limits its writes to two named actions, so the documents it streams and the artifacts
   it replaces are disjoint sets. If a future operation writes into the store, the two collide directly.
9. **The engine may acquire an index and must not need one.** Specific 7 fixes the shape and declines to
   build it. The cost of deciding that way is that the accelerator is unavailable when someone first
   wants it and then has to be built under pressure. The cost of deciding the other way is an
   accelerator whose validation nobody exercises, because every test passes whether or not the
   validation is correct — a cold index and a correct one are indistinguishable to a passing test suite,
   which is the same failure `REQ-TRACE-089` describes one level up. The second is the worse outcome
   and it is the silent one.
10. **A validated index buys interpretation and never I/O, so the argument for one is narrower than it
    looks.** If a measurement ever motivates it, the thing it can accelerate is the regular-expression
    matching of `REQ-TRACE-073` and the metadata reduction of `REQ-TRACE-501` — not enumeration and not
    reading. An index proposed on the grounds that "the disk is the bottleneck" is proposing an
    inadmissible one.
11. **The residue is two failure modes with two different owners, and this record closes neither.**
    `REQ-TRACE-502`'s conformance gap is the test session — specific 6, OQ-41 at its narrowed scope.
    `REQ-TRACE-061`'s re-raise against a foreign handle is a user-visible failure that `REQ-TRACE-502`
    does not speak to at all, because its subject is another *invocation*; that is OQ-44. A reader who
    sees only "regeneration can fail on Windows" will reach for one remedy for both, and only one of
    them is a conformance question. C-11 should carry both halves and should still not assert
    `REQ-TRACE-502` satisfied.

## Revisit if

`REQ-TRACE-089`'s index clause is amended in either direction — relaxed to permit a cache with a stated
invalidation rule, which would make alternative E ordinary engineering, or withdrawn, which would
restore the previous specific 7 unchanged and is why its argument is preserved above rather than
deleted.

A measured failure to meet `REQ-TRACE-088` or `REQ-TRACE-501` on a real repository at the stated scale,
which would make the streaming design a correctness problem rather than a memory-hygiene one — **and
which is also the only thing that should start a build of alternative E.** No such measurement exists.
The budgets are ~1 s for 10^3 documents parsed and ~1 s for 10^3 source files swept, both under
`REQ-TRACE-088`'s reference conditions, and neither has been run against a repository of that size with
this design. A second workflow is taking measurements as this is written and its results are not in
hand; **if they show either budget missed, the question that opens is which phase misses it**, because
an index answers only for the interpretation phases and answers not at all for enumeration and reading.
A measurement that reports one number will not decide this.

`REQ-TRACE-061` gains a bounded retry ladder (OQ-44), or a native replace primitive is adopted — the
writer-handle spike establishes `ReplaceFileW` succeeds where `fs.renameSync` cannot, so the remedy now
has a known mechanism and a measured out-of-process cost of ~767 ms; what it lacks is an owner and a
decision about a native module. Either would close specific 6's residual.

A second product process that reads these artifacts is reintroduced, which would undo specific 6's
premise and put OQ-41 back at full size. Or `REQ-TRACE-513` is amended, which is now the only route by
which alternative C reopens.

## First execution — 2026-09-09 (Part AJ)

*Recorded under GD-10: a mechanism's first execution reports back into the record that decided it, including when
it found nothing. Spike 7 (`spikes/traceability-scale.md`) was taken as the first act, as the plan required.*

**Built and run:** `packages/workspace/src/traceability/` — alternative B with specifics 1, 2, 6 and 7 as decided,
and the four operations of `REQ-TRACE-508` to `REQ-TRACE-511` reached from the workspace service through
`traceability.operate` / `traceability.cancel` (`apps/desktop/src/workspace-service/traceability.ts`). The proof
`pnpm traceability-proof` drives the engine in-thread over a copy of a fixture store, then forks the built
workspace service as a real `utilityProcess` and speaks the process protocol to it, so the worker thread, the shared
cancel flag and the single I/O owner executed before merge.

- **Specific 1 (streaming parse):** one document resident at a time — read, decode with replacement, normalise,
  hash, reduce, drop. Measured: 1,501 documents (3.54 MB) in 448–619 ms warm; heap delta 6–25 MiB, which is the
  1,500 records under garbage-collection timing; half the store in 213–279 ms. `REQ-TRACE-501` met with a ~2× margin and linear.
- **Specific 2 (the hand-written reader):** `frontmatter.ts` shares nothing with ADR-0036's YAML library; the
  grammar of `REQ-TRACE-008..011` exactly, with an unterminated block yielding no frontmatter and no diagnostic.
- **Specific 3 (a syntax-tree parser):** *not built, as this record left it* — `REQ-TRACE-104` rule 1 and
  `REQ-TRACE-109/110` for the built-in TypeScript convention are reported as `requires-parse` findings that state
  why, never approximated by a pattern. A pattern-declared convention (`REQ-TRACE-073`) runs both checks in full,
  because it is regex by specification. The measurement OQ-24 asks for is wave 2's.
- **Specific 4 (TypeScript chose the convention):** the artifact is a TypeScript module — `export enum Requirement`
  with one JSDoc per member carrying the status marker and `@deprecated` on a deprecated one (`REQ-TRACE-181`
  (1)), the deprecated set, the metadata map of positional `new RequirementMeta(...)` calls; the built-in convention
  claims `.ts` and recognises `traces(...)` and `covers(...)` in decorator position and as plain calls, with the
  enum's members, `Requirement.`-qualified members, or bare integers inside; `skip_parts` defaults to `fixtures`,
  `node_modules` and `dist`.
- **Specific 6 (one I/O owner):** every read of the five artifacts is an open-read-close in `engine.ts`, every
  replace is platform's `replaceDocument` with `REQ-TRACE-061`'s ladder (five attempts, 0.05/0.1/0.2/0.4 s), and a
  job receives bytes and returns an ordered write list; the worker never opens one of those paths. The tombstone is
  written before the artifact (`REQ-TRACE-133`), asserted by the write order in two proofs. OQ-41's "one replace":
  every replace in the proof succeeded on the first attempt with no contention staged; the residue stands.
- **Specific 7 (consulted versus validated):** no index was built and the engine's entry points take no database
  handle. The behavioural test `REQ-TRACE-089` states is written (`engine.test.ts`): a document, a baseline, the
  artifact and the retired log changed by another program are reported by the very next operation with nothing
  cleared — it exists so that an index arriving by accident is caught.
- **Worker placement:** `worker.ts` posts a job with an `Int32Array` over a `SharedArrayBuffer`; a cancel raises it
  atomically and the pass's next per-document checkpoint observes it inside a synchronous loop; a worker that does
  not answer within a 2 s grace is terminated and respawned for the next job. Measured over the process: a `check`
  over the 1,500-document store cancelled 49–55 ms after it began, the cancel answered by the service's own loop
  while the worker was inside the parse (`REQ-TRACE-337`, `REQ-TRACE-497`).

**Found — three, the forty-sixth to the forty-eighth, two in the engine and one in the harness that measured it:**

- **Defect forty-six — one file's occurrences came back in pass order, not text order.** The scan matched every
  annotation, then every `covers:` comment, and reported them in that order, so a consumer walking a file's sites
  "at its own line" (`REQ-TRACE-084`, `REQ-TRACE-508`) met a comment on line 2 after a call on line 3. No reading
  caught it: `REQ-TRACE-082`'s occurrence is a tuple with no stated order, and "sorted by path" was read as the
  whole ordering rule. The sweep now sorts each file's occurrences by offset before reporting.
- **Defect forty-seven — a project convention's line-anchored pattern never matched.** The four patterns of
  `REQ-TRACE-073` were compiled with the global flag only, so a `test_pattern` written `^def (test\w*)` — the
  natural declaration matcher — matched at the file's first character and nowhere else; the first Python fixture
  collected zero test functions. Patterns "evaluated against the file's normalized text" were read as a single
  string match. They are now compiled with the multiline flag, and that reading is recorded beside its replacement
  as R7 below.
- **Defect forty-eight — the proof's cleanup failed one run in three on Windows.** The fixture drive commits a
  base for the change comparison inside a copy of the fixture under `.traceability-proof/`; removing that copy at
  the end answered `EPERM` on the directory itself, on the first run of a series, even with ten retries over two
  seconds. **The first explanation was wrong and is kept here:** Git's `commit` detaching `gc --auto` (ADR-0039
  §3's finding), holding the directory open — the proof and `engine.test.ts` were given `-c gc.auto=0`, and the
  next series failed its first run exactly as before. The holder is outside the product (an indexer or scanner
  taking a freshly written `.git` and artifact for seconds after the last process using them exited) and cannot be
  waited out reliably. The remedy that held: the two fixture copies now live under the system temp directory, so a
  copy that cannot be removed is a stated warning and never a leftover `.ts` tree the linter would parse under
  the repository; the `gc.auto=0` stays, harmless and consistent with ADR-0039. A harness defect, counted because
  the harness is the mechanism's measurement.

**Two toolchain notes, not counted:** MSYS's path conversion turns a `// Part AJ` argument into `/ Part AJ`
when a banner line is passed to a script through Git Bash — the two package indexes were briefly unparseable; and
ESLint's project-wide run parses any `.ts` a proof leaves under the repository, so a proof that generates source
trees must remove them (the plan's `.traceability-proof/**` ignore lines are in the handoff).

**Readings taken where the specification fixes nothing, each stated in code at the site:**

- R1 — a `status` key that is absent is a parse error naming the accepted set: `REQ-TRACE-017/018` give `trace`,
  `test` and `type` defaults and `REQ-TRACE-016` gives `status` none, so absence is not a lifecycle.
- R2 — `skip_parts` applies to the store scan as well as the sweep (`REQ-TRACE-039`: "no file beneath a skipped
  component is parsed").
- R3 — `REQ-TRACE-049`'s "current working directory" is the directory the caller supplied; the service's own cwd
  names nothing, and `REQ-TRACE-512` fixes the start as the open workspace.
- R4 — "each member followed by a documentation string" (`REQ-TRACE-054`) is read as "each member carries one": a
  TypeScript doc comment precedes its member. `REQ-TRACE-055`'s two rewrites are applied, and `*/` — the terminator
  TypeScript has — is rewritten too, since the observable is that a title cannot terminate the string.
- R5 — the artifact imports `Lifecycle` and `RequirementMeta` from the bare specifier `rotaris-traceability`; where
  that module lives in a consuming project is wave 2's consumer-integration question (`REQ-TRACE-176/182/183`),
  raised in the handoff, and the specifier is the one thing fixed now so the artifact's shape does not move.
- R6 — the derived-from tuple in the metadata record is numbers (`REQ-TRACE-019`); the fingerprint's comma-joined
  list is identifiers (§Hashes).
- R7 — project patterns run with the multiline flag (defect forty-seven).
- R8 — a project convention's captured annotation kind is coverage when the capture contains `cover` or `test`
  (case-insensitive), implementation otherwise; the built-in names are exact.
- R9 — `REQ-TRACE-160`'s `status` kind (equal hashes, differing lifecycle) is unreachable from the documents alone,
  because a status line is document text and moves the hash; it arises only when the base artifact's recorded
  lifecycle disagrees with the text at an equal hash. Implemented as specified; the fixture cannot plant it and
  `classifyChanges` is where a unit case would go.
- R10 — the empty-store warning of `REQ-TRACE-503` leads the findings; `Finding.message` is the whole
  `REQ-TRACE-100` line and `path`/`id`/`line` carry it structured beside.
- R11 — the orphan-test baseline is **preserved, not rewritten**, while `.ts` test roots have no parser: a
  shrink-only file written from an undecided set would be empty and could never regain what wave 2 finds. The
  baseline update reports the existing entry count for it and says so in the log; orphan-module candidates the
  parser cannot excuse ARE recorded, since pruning is the direction the ratchet allows.
- R12 — the seam's `sweep(parse)` re-reads the layout from `parse.root`, because the seam's `LayoutConfig` cannot
  carry the exempt marker, the excused roots or the structured conventions (handoff §6).
- R13 — `REQ-TRACE-214`'s callbacks happen on the pass's thread inside the worker and are marshalled to the owner
  by the host, which the requirement allows the host to do for itself.

**Not exercised:** a contended replace (OQ-41's residue); a project pattern with catastrophic backtracking beyond
the fake-worker test of the grace-and-terminate path (OQ-25); a real consuming project importing the artifact;
macOS and Linux (IC-3). **The tally stands at forty-eight.**
