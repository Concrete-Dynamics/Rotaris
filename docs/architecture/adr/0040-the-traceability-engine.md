# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, under `owner-decisions.md` SR-1, SR-3 and SR-4
- **Origin:** DATA (ADR-DATA-06)
- **Depends on:** ADR-0001, ADR-0002, ADR-0003, ADR-0038

> **Summary of what the rulings change here.** The store does not move: requirement documents, the
> generated symbol artifact, the three baselines and the retired-identifier log are all **plain files in
> the user's own repository**, which is where SR-4's table puts them and where SR-4's principle puts
> them. What does change is the population of concurrent invocations — SR-1 collapses it to one process
> plus the project's own test session — and that is enough to reach most of `REQ-TRACE-502` and to
> narrow OQ-41 to a case a third of the size. It is **not** enough to close it, and this record says so
> rather than claiming otherwise.

## Context

`REQ-TRACE-089` is the decisive constraint and is stated in the plainest language in its domain: "Every
operation shall report the repository as it stands at the moment that operation runs. **No result shall
be carried over from an earlier invocation and no stored summary shall be consulted in place of reading
the files**, so an edit made between two invocations shall be reflected by the second without anything
having to be cleared first, and two invocations over an unchanged repository shall report the same
thing. How often the work is repeated within one invocation shall make no difference to what that
invocation reports." `REQ-TRACE-173` accepts the consequence explicitly: "querying N requirements one at
a time costs N full scans — a documented cost". `REQ-TRACE-152` limits the toolchain's writes to two
named actions, **so there is nowhere an index could legally live**. `REQ-TRACE-203` is explicit that
"scanning is therefore not incremental by default". `REQ-TRACE-090` and `REQ-TRACE-408` forbid a read
path from writing at all.

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

**C — Index the parsed store in the workspace database (new under SR-4).** The obvious thing to try
once a database exists, and it must be refused explicitly rather than by silence, because it is the
single most likely accidental regression in this area.

*Against, and each is independently sufficient:* the requirement documents are **the project's own
Markdown under the project's version control**, written back "into the original artifact — the project's
own file, never a local copy" (`REQ-TRACE-434`), so SR-4's principle places them in files without
argument. A parsed copy in rows is a **second definition of the requirement set**, which
`REQ-TRACE-197` forbids in terms. Maintaining the index is a **write**, and `REQ-TRACE-090` and
`REQ-TRACE-408` require every read path to write nothing. And detecting the index's staleness cheaply
requires consulting exactly the **stored summary `REQ-TRACE-089` forbids consulting**. Alternative C
does not fail on performance; it fails on four separate stated observables.

**D — Keep the artifacts as files but hold a coordination record for them in the database.** A lock in
a table is still a lock: `REQ-TRACE-502`'s opening clause refuses "any lock, lease or coordination
file", and a row is a coordination record whatever it is stored in. It would also make the toolchain
undeployable in a project's test session, which has no workspace database. Refused.

## Decision

**Alternative B**, with seven specifics. Specifics 1 to 5 are unchanged. Specific 6 is rewritten under
SR-1. Specific 7 is new and is the guard SR-4 makes necessary.

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

   **The residual, stated plainly.** One toolchain reader remains outside the application:
   `REQ-TRACE-182`'s test-session regeneration and `REQ-TRACE-183`'s meta-tests, running in the
   project's own test process against the same checkout. That process's handles are invisible to ours
   and ours to it, so on Windows either can still block the other's replace. The residual therefore has
   a definite shape:

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
   action must report it as `REQ-TRACE-508`'s surface reports what each operation did.

   **What would close it:** a runtime API exposing share-delete on open, which would let the test
   session's reader coexist with our replace; or the specification accepting a bounded retry for this
   store, which `REQ-TRACE-061` currently forecloses by declaring no ladder. Both are outside this
   record. The remedies OQ-41 listed as unavailable stay unavailable — a lock or lease is what the
   requirement names and refuses, and bounding concurrency for this store contradicts C-10 and C-13.

7. **The engine takes no database handle, and that is the guard against `REQ-TRACE-089`'s stored
   summary.** SR-4 puts a database in the product for the first time, and `REQ-TRACE-089` forbids
   consulting a stored summary in place of reading the files. The line is drawn mechanically rather than
   by intention: **no entry point of this engine accepts a database handle, so there is nothing for a
   later change to consult.** This is the same device `REQ-TRACE-207` already forced for the layout
   value — a parameter with no default, so omitting it is a compile error — and it is applied for the
   same reason.

   The distinction that matters, because the delivery store sits next to this engine and *is* rows:

   - A **stored summary** is a value *derived from the files* and read *instead of* reading them: a
     cached parse, a cached sweep, a cached coverage count, a cached staleness verdict. Every one of
     those is forbidden, in a row exactly as in a file.
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
     `REQ-TRACE-089`. That sentence is the one to quote at a review.

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
- **SR-4 does not dissolve OQ-41**, and `owner-decisions.md` says otherwise. The ruling's own table
  keeps the generated artifact, the baselines and the tombstone log as files in the user's repository —
  correctly, under the ruling's own principle — so a store whose readers do not block its writers is not
  where these artifacts live. What narrows OQ-41 is **SR-1**, not SR-4. Reported for correction rather
  than quietly reconciled.

## Consequences accepted

1. `REQ-TRACE-173`'s N-scans cost stands, exactly as the specification accepts it.
2. Every board refresh re-reads the store and re-sweeps the repository. `REQ-TRACE-225` accepts this and
   states the mitigations: the read runs off the interface thread, the board says a refresh is in
   progress, the last good board stays on screen, and every external call the read makes is bounded.
   **The presence of a database is not a licence to change this**, and specific 7 is the guard.
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

## Revisit if

`REQ-TRACE-089` is relaxed to permit a cache with a stated invalidation rule; or a measured failure to
meet `REQ-TRACE-088` or `REQ-TRACE-501` on a real repository at the stated scale, which would make the
streaming design a correctness problem rather than a memory-hygiene one; or a runtime API exposes
share-delete on open, or `REQ-TRACE-061` gains a retry ladder, either of which would close the residual
in specific 6; or a second product process that reads these artifacts is reintroduced, which would undo
specific 6's premise and put OQ-41 back at full size.
