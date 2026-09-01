# ADR-0004 — One document primitive, two write shapes, and a guarded read side

- **Status:** proposed
- **Date:** 2026-09-01
- **Rescoped:** 2026-08-31 under SR-4 — rule 3 and the writer's-handle discipline deleted. **Revised
  2026-09-01** against the amended specification and the Windows writer-handle spike: three factual claims
  corrected, a second write shape added, and the retry-schedule field restored with exactly one value in it.
- **Origin:** DATA (ADR-DATA-02, Spike 1); the writer-handle-and-compaction spike, 2026-08-31
- **Depends on:** ADR-0003, ADR-0058
- **Constrains:** ADR-0029, ADR-0032, ADR-0036, ADR-0040, ADR-0042

## Context

SR-4 moved session data, the permission audit, the event history, delivery records and the improvement
library into a store (ADR-0058). This primitive governs what is left. **The previous version of this record
said the remaining set was "a genuinely smaller set" of five stores, all of them replacements, none of them
in the run host. All three of those statements are wrong against the amended specification**, and the
corrections are the substance of this revision.

**What the primitive governs, in two shapes.**

*Replaced in place — stage, write, `fsync`, rename over the target:*

- **Configuration.** `REQ-CONFIG-027` stages the bootstrap write beside the target and swaps it in at mode
  `0644`, and `REQ-CONFIG-444` requires every writer of `agents.yaml` to leave that mode; `REQ-CONFIG-212`
  does the same for the discovery snapshot and must leave the modification time advanced so
  `REQ-CONFIG-211` can detect the change, and must drop the cached entry afterwards; `REQ-CONFIG-216`
  covers `secrets.yaml` and gives it **no mode at all** (OQ-14); `REQ-CONFIG-013` swallows every
  `.gitignore` maintenance failure.
- **Credentials.** `REQ-PROVIDER-018` stages inside the credential directory under a name starting with the
  provider id and ending `.tmp`, at mode `0600` on POSIX, renamed onto `<provider_id>.json`, with a failed
  write deleting the temporary file; `REQ-PROVIDER-016` applies `0700`/`0600` on POSIX and an explicit
  Windows access-control list with inheritance disabled, **read back**, and refuses to write the credential
  at all when the protection cannot be applied. `REQ-PROVIDER-063` extends it to the Copilot gateway
  staging directory.
- **The per-user documents**, written under `REQ-PROVIDER-152`'s cross-process exclusive lock.
- **The user's own repository artifacts.** `REQ-TRACE-061` requires a temporary file in the target's **own
  parent directory**, UTF-8 with LF endings, the parent created when missing, atomic replacement, and on any
  failure the temporary file removed best-effort and **the failure re-raised**. `REQ-TRACE-126` and
  `REQ-TRACE-137` adopt that write whole for the three baselines and the retired-identifier log, and
  `REQ-TRACE-513` now states that they stay files as a boundary.
- **`summary.md`.** `REQ-SESSION-006` makes it derived and unread by the application; `REQ-SESSION-028`
  rebuilds it on every save and calls it "the one part written as a file"; `REQ-SESSION-033` governs its
  replacement and **states a Windows retry ladder**; `REQ-SESSION-140` requires that "a person reading it
  while a run writes it never sees it half-written".

*Created exclusively and never replaced — create-or-read, and delete:*

- **The workspace identifier** (`REQ-SESSION-197`). Minted once when the product first prepares the
  workspace, never changed "for any reason", and never re-minted over one the product can read. ADR-0058
  fixes its form and where it lives.
- **`REQ-GIT-128`'s workspace integration lock**, `<workspace>/.rotaris/integration.lock`, created with
  exclusive-create semantics, read on contention, reaped once under the session lock's rule, and deleted on
  release. ADR-0005 owns its behaviour; this record owns the write.

*Named here so nothing routes them through the primitive by analogy:* `evidence/debug.log` is opened in
append mode and no requirement compacts it (`REQ-SESSION-142`); and artifact, attachment and image
**bodies** (`REQ-LIBRARY-087`, `REQ-SESSION-002`) are written once under a fresh name and referenced by row.
**A revised artifact writes a new body and the row is re-pointed; a body file is never replaced over
itself** — which costs nothing, avoids the whole replace problem for the one write whose size is unbounded,
and keeps the bodies of `REQ-LIBRARY-049`'s recorded versions reachable.

**The differences between the replaced stores are still deliberate and still cannot be unified away.** The
temporary file's location is fixed for the traceability store and the credential store and unstated
elsewhere; its **name** is fixed only for credentials; the **mode** is `0644`, `0600` and none in three
places; the **failure policy** is fatal for a credential, best-effort for `.gitignore` maintenance, and
re-raised for a traceability artifact; and exactly one of them now carries a **retry ladder**.

**Under ESC-15 two of these files moved out of the workspace.** `summary.md` and `evidence/debug.log` are
held with the store, machine-local (`REQ-SESSION-198`, `REQ-SESSION-002`), as are the artifact bodies. That
narrows the population of processes that can hold a foreign handle on them — a file-synchronisation client
scanning the project no longer reaches them — without removing it: the user's own text editor opens
`summary.md` through `REQ-SESSION-191`'s reveal action, and anti-malware reaches every path.

### Spike evidence

Two measurements govern this record. Both were taken on Windows 11 build 26200, NTFS, Node v24.11.0.

**The original DATA spike (replacement under concurrent readers).** `fs.renameSync` over an existing file
fails with `EPERM` while any process holds a descriptor on the target obtained through an ordinary
`fs.openSync(target, 'r')`. Two writer processes replacing a 200 KB document about 500 times each against a
reader loop produced **one zero-length read in 1,850**, and one in 16,250 in a longer run. No torn or
partial content was ever observed and no temporary file was left behind. The failure mode is an **empty**
read.

**The writer-handle-and-compaction spike.** Run to test rule 3, it also re-measured the read side at two
orders of magnitude more samples and **corrected three of this record's claims**:

1. **"Node does not request share-delete" is false on this build**, and the record must stop saying it.
   With a Node handle held on the target under `'r'`, `'r+'`, `'a'`, `'a+'` or `'w'`, an unlink of that
   target **succeeds** and the directory entry goes — as does a delete issued from another process — while
   both fail against a holder that requests read/write sharing without delete. The accurate statement is:
   **the replace-by-rename call cannot replace a destination that has any open handle, whatever that
   handle's share mode.** It fails under exactly the conditions in which the platform's
   replace-existing move returns access-denied, and it fails **even when the holder explicitly permits
   delete**. No open flag reachable from the runtime changes this: every flag spelling and numeric
   combination the build exposes failed, every time.
   **The blocker is the chosen replace mechanism, not the open's share mode and not the filesystem.**
2. **The platform's file-replacement call succeeds against a target this process holds open**, on every flag
   tried — and a held reader goes on reading the **complete previous contents**, with no torn read and no
   empty read. It is not reachable from the runtime's own API. Out of process it costs a shell spawn at
   roughly three quarters of a second, which prices it out of any write path; in a native binding it would
   be cheap.
3. **Directory `fsync` is not unavailable — it is unavailable on a read-only handle.** On a directory handle
   opened for write the call returns success, 200 of 200 times, at about a tenth of a millisecond.
   **Whether it delivers the POSIX guarantee is not established by a success return**, and the harness could
   not establish it; that needs a power-loss test, which nobody has run. This is material to OQ-12.
4. **A handle on the rename's *source* does not block it.** Only the target's handles count. The staged file
   need not be closed before the rename.
5. **Zero empty reads in 172,191 reads** — for *that* workload, which was one writer appending and
   compacting against polling readers, not two writer processes replacing one document against a reader
   loop. The spike is explicit that this is "not a refutation" of the original finding but a different
   workload. The read side's evidence base is therefore one measurement, not two.

## Alternatives considered

**A — One primitive with a uniform policy.** Simple, one place to audit. Still not available, and the
argument has changed sign since the previous version said it had not: the set of differences **grew**. Three
modes, two temp-name contracts, three failure policies, one retry ladder, and now two write shapes. A
uniform primitive would over-constrain the credential store or under-constrain the traceability store, and
the over-constrained case fails conformance quietly.

**B — One write mechanism plus an explicit per-store policy, and store-specific decoders.** Chosen, as
before, with the policy record extended to carry the write shape and the ladder.

**C — A third-party atomic-write package.** Rejected, and one reason has survived every rescoping intact:
**no package addresses the read side**, which the original spike shows is where the requirement actually
breaks. A second reason has strengthened rather than weakened. The previous version said the awkwardness was
down to temp-name contracts and was nearly gone; the writer-handle spike shows the real problem is that a
correct implementation on Windows needs the platform's file-replacement call rather than rename, and no
package in this ecosystem reaches it from the runtime. Adding a dependency that has the same defect we have,
on the path that includes the credential store, buys nothing.

**D — Drop the primitive entirely and let each remaining store write itself.** Rejected, and more firmly
than before. There are now eight write sites in three processes across two write shapes, and the Windows
replace behaviour is a property of the chosen platform call rather than of any one store. Eight independent
rediscoveries of the empty-read guard, and eight independent decisions about whether to close a staged
handle before renaming, is the outcome that argues for one module.

**E — Route the replace through the platform's file-replacement call by way of a native binding.** Newly
plausible, because the spike shows it is the one mechanism that works past a held handle while leaving a
concurrent reader with complete previous contents — it would remove rule 1 and the ladder together. Not
chosen now: it is a second native module (ADR-0058 and ADR-0020 already carry one each), it is
Windows-only so the POSIX path stays anyway, and no requirement is failing for want of it now that
`REQ-SESSION-033` supplies the ladder the one hot replace path needs. It is the *Revisit if*, and it
replaces the trigger the previous version had, which was already satisfied and would have changed nothing.

## Decision

**Alternative B, with the read side inside the primitive and two write shapes on it.**

**Write side — replace.** Stage into the target's own parent directory, creating the parent when the store
declares it may be missing (`REQ-TRACE-061`); write; `fsync` the staged file; replace by rename; remove the
staged file on every failure path; apply the store's declared mode, and where the store declares one,
**read the protection back** before reporting success (`REQ-PROVIDER-016`). **The staged file's own
descriptor need not be closed first** — measured: a handle on the rename's source does not block it.

**Write side — exclusive create.** Create the target with exclusive-create semantics; on success the caller
minted it; on an already-exists failure **read what is there and use it**, which is not an error. This shape
never replaces, so no reader can block it, and deletion of such a file succeeds even while a reader holds it
open (measured). It is what `REQ-SESSION-197`'s "MUST NOT mint a replacement over an identifier it can read"
and `REQ-GIT-128`'s exclusive-create lock both reduce to.

**Read side.** Read; if the result fails the store's own decode **while the file is known to exist**, retry
before reporting the condition. The guard keys on *decode failure after a successful stat*, not on emptiness
alone, because absent and empty are deliberately conflated in configuration: `REQ-CONFIG-016` makes a
missing file an empty mapping and `REQ-CONFIG-017` makes an empty, whitespace-only or comment-only file
"indistinguishable from a missing file for load purposes". The guard applies where a store has no
legitimately empty document — `REQ-CONFIG-019` requires a mapping at the top level, a generated symbol
artifact or a rendered retired-identifier log is never legitimately empty, and `REQ-SESSION-197`'s
identifier must match a fixed pattern.

**The guard's evidence base is one measurement and the record says so.** `REQ-LIBRARY-043`'s "never a
partial, **empty**, or unparseable file" was the sharpest statement of its necessity and that clause has
gone to a row with its store; the amended requirement keeps the observable ("never a partial, empty, or
unreadable one") but no longer describes a file. `REQ-CONFIG-019`, the traceability decode and
`REQ-SESSION-140`'s "never sees it half-written" still require the guarantee, the original spike's empty
read is the only observation of the failure, and the newer spike did not reproduce it in a different
workload. **The guard stays** — it is cheap, and the workload it was observed under (concurrent replacement
of one document) is exactly the shape the remaining stores have.

**Two rules follow from the spike and belong in the primitive.**

1. **Readers must not hold descriptors.** An open reader on the target makes a concurrent replace fail.
   Every read of a store file is open-read-close within one call, on every thread — including the
   traceability engine's terminable worker threads (ADR-0002), which are the one place in the product where
   two reads of the same file can genuinely overlap a write of it, and where the readers and the writer are
   both inside the workspace service. **The rule's stated cause is corrected**: this is a property of the
   replace-by-rename call, which fails against *any* open handle on the target and not against a share mode
   the runtime declines to request. Under the corrected cause the rule is unchanged in force and narrower in
   scope — it binds our own readers, and it cannot bind a foreign one, which is what the ladder is for.
2. **Durability is bounded by what the platform offers, and by what we can establish.** The staged file is
   `fsync`ed before the rename; **no directory `fsync` is performed.** The ground for that has changed and
   the record should not keep the old one: it is not that the call is unavailable — on a write-opened
   directory handle it succeeds, cheaply — it is that **a success return does not establish the guarantee**,
   no power-loss test has been run, and **no requirement on any remaining file asks for one**. Every
   durability obligation left on a file is phrased as an ordering, as *the replace is atomic*, or as *a
   crash leaves one of the two versions* (`REQ-SESSION-033`, `REQ-CONFIG-027`, `REQ-TRACE-061`), all of
   which rename provides. If OQ-12 ever resolves toward a genuine durability obligation, the call is
   available and costs about a tenth of a millisecond; that is now a decision with a price rather than a
   platform limitation.

**Rule 3 stays deleted, and the spike confirms it was right before it became moot.** It required a writer to
close its append handle, stage, `fsync`, rename and reopen, around a compaction of a file the writer itself
held open. Measured, the naive shape it was written against completed **0 of 115 trims**, left the journal
over its cap and growing, produced **no observable symptom at any reader**, and collapsed append throughput
by roughly seventy-fold, because the requirement it served makes every subsequent append carry a whole
failed retry ladder. The prescription was correct. It is nevertheless deleted, because **every file it
governed is now a row** — the event history under `REQ-EVENTS-091`, the permission audit under
`REQ-TOOLS-078` and `REQ-SESSION-137`, the verification-gate record under `REQ-TOOLS-190`, and the ring-
capped evidence records under `REQ-SESSION-133`, each of which now fixes content and ordering and explicitly
fixes no path. A trim is a `DELETE` inside the transaction that made the insert (`REQ-SESSION-133` requires
exactly that: "the trim MUST take effect in the same durable operation that records the entry"), so
`REQ-EVENTS-098`'s "a trim cannot race the recording of an event" is discharged by the transaction rather
than by a queue discipline.

> **This holds for `REQ-SESSION-133`'s rings and is disputed for the event history. ADR-0009 consequence
> and its alternative B place `REQ-EVENTS-091`'s trim in its **own** transaction on the serialised queue,
> because `REQ-EVENTS-091` states failed-trim semantics — previous contents in force, out of the
> truncation record, a warning, the history over cap as a bounded and visible cost — that are
> inexpressible if a failed trim rolls back the append that overflowed. The two requirements say
> different things and the record does not pretend otherwise: `REQ-SESSION-133` names one durable
> operation, `REQ-EVENTS-091` does not. See ADR-0009, which states the disagreement from its side, and
> the entry for it in [`../open-questions.md`](../open-questions.md).

`evidence/debug.log` is the only file left opened in append mode and nothing
compacts it, so **no file in the product is replaced by rename over a handle its own writer holds.**
Constraint D-28 goes with the rule. Recording the confirmation matters because the diagnosis, not the
prescription, is what generalises: an append-and-compact file whose writer holds it open is a silent
cap-enforcement failure, and nothing in the product may reintroduce that shape.

**Policy per store.** A small declarative record naming the **write shape** (replace or exclusive create),
the temp-name scheme, the file mode or none, whether the protection is read back, whether failure is fatal,
best-effort or re-raised, and **the retry ladder or none**. Every difference it carries is a difference the
specification fixes.

**The retry-schedule field is back, with exactly one value in it — which is what the previous version's own
*Revisit if* predicted would happen.** `REQ-SESSION-033` requires that on Windows a transient access-denied
failure of a replacement — "antivirus, indexer, or a cloud-sync client holding a handle" — be retried up to
**5 times with exponential backoff starting at 0.05 s (0.05, 0.1, 0.2, 0.4, 0.8 s)**, "because a foreign
handle held for a moment is not a reason to lose a user's file", with any temporary artifact always removed.
It applies to `summary.md` and to nothing else in its domain, it explicitly does not reach the durable
store, and it declares itself "the only replacement ladder this domain states". The spike's independent
finding is that a bounded ladder of this shape is **load-bearing rather than defensive**: at realistic reader
cadences a small but non-zero fraction of replacements needed a second attempt, and the longest successful
ladder observed took most of a second.

**OQ-11 is resolved — but not for the reason the previous version gave, and the correction matters.** That
version said the two incompatible ladders were dissolved because "neither ladder has a file left to govern".
That is **false of `REQ-SESSION-033`**, which was *narrowed rather than withdrawn* and still governs
`summary.md`. What actually happened is one-sided: `REQ-LIBRARY-043`'s ladder is withdrawn with the document
layout it belonged to, and the amended requirement gives the reason — "no writer outside this application
can reach a record in this store (`REQ-LIBRARY-158`), so the condition it bounded no longer arises" — while
`REQ-SESSION-033`'s ladder survives precisely because its file *is* reachable by a writer outside this
application. **There is now exactly one ladder in the corpus and nothing to reconcile.** The conflict is
gone; the ladder is not.

**`REQ-TRACE-502` and OQ-41 — narrowed sharply, and not by the store.** ESC-14 withdrew SR-4's claim that
the store dissolves this, and `REQ-TRACE-513` now states positively that the artifacts `REQ-TRACE-502`
governs — the generated artifact, the three baselines and the retired-identifier log — are plain files in
the user's own repository and are not moved into any store the application keeps, so the store's concurrency
properties never touch them. What dissolves is OQ-41's **premise**: an unbounded number of concurrent
invocations in independent processes. Under SR-1 there is one instance (`REQ-STARTUP-161`), the product has
no command line and `REQ-EVENTS-178` gives it no programmatic entry point, and ADR-0002 puts the whole
traceability engine inside one workspace service per workspace. Every invocation is now in-process work on a
bounded pool of worker threads, and rule 1 keeps each of their reads to open-read-close.

The residue is real and bounded, and it is two things. First, foreign processes — a user's editor, an
indexer, anti-malware — can momentarily hold one of these files. `REQ-TRACE-502` does not speak to those,
since its subject is "because another **invocation** was running", so this is not a conformance gap; but
`REQ-TRACE-061` requires the failure to be **re-raised**, and a user's editor should not be able to fail a
regeneration the user asked for. Second, two worker threads reading while the main thread replaces is
bounded contention, which is precisely the condition under which a bounded ladder is sufficient.

**And this record still declines to invent the constants.** `REQ-TRACE-061` states no ladder. The corpus now
states exactly one, in `REQ-SESSION-033`, for a different file in a different domain, and that requirement
closes by declaring itself the only ladder **its domain** states. Borrowing its numbers would be
manufacturing a specification, and it would attach a sessions-domain constant to the user's version-
controlled material. So: a bounded Windows retry for the traceability store is now both **sufficient and
unspecified**, the specification must supply it, and until it does a traceability artifact write blocked by
a foreign handle re-raises per `REQ-TRACE-061`. C-11 may stop asserting a property with no mechanism behind
it only once that ladder exists. **OQ-44's own statement of the problem needs correcting rather than
answering** — it says the corpus states no ladder anywhere, and since the amendment that is no longer true.
The gap is narrower and sharper than OQ-44 records: one domain has a ladder for exactly the case
`REQ-TRACE-061` faces, and the other does not.

**Decode is the store's own.** Each store owns its decode-and-validate step, because each has a different
notion of a valid document and a different error text: `REQ-CONFIG-018`'s parser detail including line and
column, `REQ-TRACE-117`'s `<path>:<line>: ` form, and `REQ-SESSION-197`'s pattern match, whose failure is a
condition to be reported and never a licence to re-mint.

## Consequences accepted

1. A read can cost two attempts under contention; the added latency is bounded by the store's policy and is
   zero uncontended. One replace path can additionally cost a bounded ladder of up to five attempts within
   about 1.55 s (`REQ-SESSION-033`), and that ladder is on the save path of a running session.
2. We own the filesystem edge cases for eight write sites rather than a dozen: anti-malware handles, network
   shares, case-insensitive collisions. Two of those sites are now in the per-user data directory rather
   than the workspace, which changes which foreign processes can interfere but not that some can.
3. **The primitive does run in the run host, for exactly one file.** The previous version said it did not;
   that is wrong. `REQ-SESSION-028` rebuilds `summary.md` on every save and makes it "the one part written
   as a file", and the save is taken by the process holding the session lock, which is the run host
   (`REQ-EVENTS-098`, ADR-0002). So the run host owns one replace path, on the save path, with a retry
   ladder on it — and it is the one place in the product where this primitive can add latency to a running
   session. Everything else through the primitive belongs to main (credentials, per-user documents) or the
   workspace service (configuration, the traceability artifacts, the integration lock, the identifier).
4. `REQ-PROVIDER-016`'s read-back remains the only place in the product where a write verifies its own
   effect after the fact, which makes it worth its own test rather than a shared one.
5. Constraint D-27's "file-handle lifetime is a free implementation choice" is true again for append
   handles, because no compaction renames over one — and it stays **false for readers**, which is rule 1.
6. **Two of this record's long-standing factual claims were wrong and were corrected by measurement, not by
   argument.** The share-delete claim and the directory-`fsync` claim were both stated confidently and both
   failed a test. Neither changed a decision, which is worth noticing: the rules were right for a reason the
   record had mis-identified. The lesson is carried rather than the numbers.
7. **The exclusive-create shape is new here and it carries two of the product's identity guarantees** —
   which workspace this is (`REQ-SESSION-197`) and who is integrating (`REQ-GIT-128`). It is a smaller
   mechanism than the replace path and a more consequential one: a bug that overwrites rather than reads
   orphans a user's history, silently.

## Revisit if

The runtime, or a native binding this product already carries, exposes the platform's file-replacement call
— measured to replace a target this process holds open while a held reader continues to see the complete
previous contents. That single capability would remove rule 1 and the ladder together, and it is the correct
trigger; the previous version's trigger, a runtime API exposing share-delete on open, **is already the case
and would change nothing**. Or a power-loss test establishes what a directory `fsync` guarantees on this
platform, which would settle OQ-12 and may add one call to the replace path. Or the specification supplies
the bounded Windows ladder `REQ-TRACE-061` needs, in which case the policy table's ladder field gets its
second value and OQ-44 closes. Or a requirement appears under which a remaining store file may legitimately
be empty and must be read as empty without a retry.
