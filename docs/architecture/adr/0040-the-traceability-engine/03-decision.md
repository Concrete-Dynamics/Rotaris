# ADR-0040 — The traceability engine is a stateless streaming library over files, with a single I/O owner — Decision

Part 3 of 8 of [ADR-0040](../0040-the-traceability-engine.md), which indexes every part.

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
