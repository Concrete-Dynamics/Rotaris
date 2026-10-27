# ADR-0004 — One document primitive, three write shapes, and a guarded read side — Decision

Part 3 of 5 of [ADR-0004](../0004-the-atomic-document-primitive.md), which indexes every part.

## Decision

**Alternative B, with the read side inside the primitive and three write shapes on it.**

**Write side — replace.** Stage into the target's own parent directory, creating the parent when the store
declares it may be missing (`REQ-TRACE-061`); write; `fsync` the staged file; replace by rename; remove the
staged file on every failure path; apply the store's declared mode, and where the store declares one,
**read the protection back** before reporting success (`REQ-PROVIDER-016`). **The staged file's own
descriptor need not be closed first** — measured: a handle on the rename's source does not block it.

*Corrected 2026-09-13, by A9's destination-failure coverage.* **Creating the parent is inside the
primitive's contract, not beside it.** The implementation created it before the `try`, so a parent that
cannot be created — a file standing where the folder would go, a folder the account may not write into —
**raised** rather than returning the `Result` every other failure here returns. The shape that made it
reachable is exactly the one this primitive exists for: `REQ-EVENTS-145`'s export writes to a destination
the *user* chose in a save dialog, so the parent is not the product's own directory and its refusal is an
ordinary outcome rather than a programming error. The failure is now reported as `document.parent`,
alongside `document.stage`, `document.replace` and `document.mode`.

*Corrected again 2026-10-04, the synchronous form's first execution of this path (fin15).* ~~"The implementation
created it before the `try`… The failure is now reported as `document.parent`"~~ held of `replaceDocument` alone:
`replaceDocumentSync`, the form ADR-0042's theme save and the configuration bootstrap use, kept its `mkdirSync` outside
any `try` and threw `EEXIST` for a file standing where the parent would go. Reached when the first-run starter repair
put a regular file at `<workspace>/.rotaris` (`bootstrapConfigFile` threw, and the workspace service would have answered
`request.failed` rather than the configuration refusal REQ-CONFIG-028 describes). Both forms now answer
`document.parent` for it (`../../../defects/fixed/replace-document-sync-throws-when-the-parent-cannot-be-created.md`).
**Measured** by `platform.test.ts` (both forms, one and two levels below the file, no staging file left), by
`writers.test.ts` and `open-bootstrap.test.ts`, all red on the unrepaired form; the refused-permission case is written
and skipped as root on this host. Found beside it and **not** repaired: the staged file's cleanup itself throws
`ENOTDIR` under a file parent when no parent creation was asked for, and `exclusiveCreate` still creates its parent
before its `try` (`../../../defects/fixed/the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md`;
repaired since, next paragraph).

*Corrected a third time 2026-10-04, the first execution of the remaining failure paths (fin17).* ~~"remove the staged
file on every failure path"~~ was written as a bare `rmSync(staged, { force: true })` in every `catch`, and `force`
forgives a missing path only: under a regular file `f`, the target `f/doc` with no parent creation asked for, staging
failed with `ENOTDIR` and the cleanup then threw `ENOTDIR` over it, out of both replace forms. The removal is now
**best-effort as `REQ-TRACE-061` says it is**: a refused cleanup is swallowed, and the failure it follows is the one
reported (`document.stage`, `document.replace`, `document.replace.sync`). Exclusive create kept its parent's `mkdirSync`
before any `try` and threw `EEXIST` (`ENOTDIR` deeper down); it now answers `document.parent` like the replace forms.
A write that fails after the exclusive create (a full disk) threw out of its `try`/`finally` too; it now answers
`document.exclusive.write` and removes the partial file this call minted, best-effort, so the next create mints rather
than reading a truncated identity as the one already established (D-29). **Measured** by `platform.test.ts` (each of
the three functions, `f/doc` and `f/deeper/doc`, no staging file left, `f` untouched; the refused-permission case for
exclusive create written and skipped as root on this host) and `document-write-failure.test.ts` (ENOSPC injected into
`writeSync`), every case red on the unrepaired form. **Reached by no product caller with a file parent** that the trace
found: `REQ-SESSION-197`'s identifier (`establishWorkspaceId`, and the restore's `establish` decision) reads first, and a
file at `<workspace>/.rotaris` makes that read `unreadable` (ENOTDIR is not ENOENT), which answers before any create;
`REQ-GIT-128`'s integration lock has no implementation calling this primitive yet. The other callers (the machine
identifier, the instance record, the credential and project-settings locks) put their file in a per-user directory, and
a file at that directory's place now reaches each as its own refusal rather than an exception
(`../../../defects/fixed/the-document-primitive-still-throws-on-a-file-parent-without-parent-creation-and-in-exclusive-create.md`).

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

   **The call is now in a harness beside the rule's own shape (2026-09-04, `spikes/power-loss.md`).** The
   power-loss writer replaces two documents on every twenty-fifth commit: one by this rule's shape and one by
   the same shape followed by the write-opened directory `fsync`. After a process death both were whole and
   current, ten of ten, which the rule already predicts. What the directory `fsync` guarantees — the *revisit
   if* below — is read from the two documents' lag against each other after the owner's fault, and that
   table is empty until the owner fills it.

   **A second measurement now supports the rule from the other side, and the two must be read together
   rather than one replacing the other.** The remote-storage spike found directory `fsync` returning
   `EPERM` on **every** spelling including local NTFS, where the writer-handle spike found it succeeding
   200 of 200 times. **The two are consistent and the reconciliation is inferred rather than measured:**
   the earlier spike opened the directory handle for **write** and said so; the later one used the
   ordinary call an implementer writes and did not record the handle mode. **What that gives the rule is
   an operational fact it did not have** — the naive call, the one a well-meaning simplification would
   add, fails everywhere, so the durability step cannot assume the containing directory is flushed and an
   implementation that "added the missing `fsync`" would get an error rather than a guarantee. The
   sharper reading is that the directory `fsync` is not one call but two: an available one that needs a
   deliberately write-opened handle and whose guarantee is unestablished, and an unavailable one. Neither
   is a reason to add it now.

**Rule 3 stays deleted, and the spike confirms it was right before it became moot.** It required a writer to
close its append handle, stage, `fsync`, rename and reopen, around a compaction of a file the writer itself
held open. Measured, the naive shape it was written against completed **0 of 115 trims**, left the journal
over its cap and growing, produced **no observable symptom at any reader**, and collapsed append throughput
by roughly seventy-fold, because the requirement it served makes every subsequent append carry a whole
failed retry ladder. The prescription was correct. It is nevertheless deleted, because **every file it
governed is now a row** — the event history under `REQ-EVENTS-091`, the permission audit under
`REQ-TOOLS-078` and `REQ-SESSION-137`, the verification-gate record under `REQ-TOOLS-190`, and the ring-
capped evidence records under `REQ-SESSION-133`, each of which now fixes content and ordering and explicitly
fixes no path.

**The session log is the only file left opened in append mode and nothing compacts it, so no file in the
product is replaced by rename over a handle its own writer holds.** Constraint D-28 goes with the rule.
Recording the confirmation matters because the diagnosis, not the prescription, is what generalises: an
append-and-compact file whose writer holds it open is a silent cap-enforcement failure, and nothing in the
product may reintroduce that shape.

### The trim's transaction boundary — settled, against this record

The previous version of this record went one sentence further than deleting rule 3, and that sentence is
withdrawn. **It is preserved here in full, because it was a real argument and because a reader who meets only
its replacement cannot see what changed:**

> A trim is a `DELETE` inside the transaction that made the insert (`REQ-SESSION-133` requires exactly that:
> "the trim MUST take effect in the same durable operation that records the entry"), so `REQ-EVENTS-098`'s
> "a trim cannot race the recording of an event" is discharged by the transaction rather than by a queue
> discipline.

ADR-0009 disputed both halves for the event history and neither record settled it; each stated the
disagreement from its own side and left it in the corpus. **It is settled now, and it is settled against this
record. Both halves are wrong as stated, for two different reasons, and only one of them was in dispute.**

**First half — the transaction boundary. Right for the rings, wrong for the event history, and the
specification decides it rather than taste.** `REQ-SESSION-133` names one durable operation and this record
reads it correctly: for the seven ring-capped evidence kinds the displacement belongs inside the insert.
`REQ-EVENTS-091` names no such operation, and it states a **failed-trim outcome that a shared transaction
cannot produce**: a trim that did not complete "MUST leave the previous contents in force, MUST NOT be
reflected in the truncation record, and MUST record a warning; the history then exceeds its cap, which is a
bounded and visible cost, rather than losing events to a failed trim." A `DELETE` inside the append's
transaction makes a failed trim roll back the append, so the overflowing event is lost — which is the one
outcome the sentence names and refuses.

**And the loss does not stop at one event.** Under a shared transaction a failed trim *is* a failed
recording, and `REQ-EVENTS-088` makes a failed recording **sticky**: the store is "marked failed for the
remainder of that run, no further event may be recorded for it", with exactly one warning. So the shared
transaction converts `REQ-EVENTS-091`'s bounded, visible, recoverable cost into the permanent end of that
session's history. The two requirements are not merely differently worded; they prescribe opposite failure
behaviour, and collapsing them silently picks the destructive one. ADR-0009 is right, and its arrangement —
the trim as its own transaction on the same serialised queue, immediately after the commit of the append that
overflowed the headroom and before the next event is recorded — is what `REQ-EVENTS-091` describes.

**What the specification pass amended does *not* decide this, and it is worth saying why**, because it is the
amendment a reader will reach for. `REQ-EVENTS-092` now requires the truncation record "made durable in the
same indivisible step as the trim that produced it". That binds the truncation record to the **trim**. It says
nothing about binding the trim to the **append**, and it is satisfied identically under either arrangement.
What it does do is close a crash window the file design accepted — measured at p50 2.6–3.2 ms, p95
3.6–6.8 ms, max 99 ms, plus a second structural window because the marker and the history were two files read
at two instants (`../spikes/windows-writer-handle-compaction.md`, §5). That is a real improvement and it is
ADR-0009's to record; it is not the answer to this question.

**Second half — the queue. Not in dispute, and wrong anyway.** The claim that `REQ-EVENTS-098`'s no-racing
rule is "discharged by the transaction rather than by a queue discipline" was already false when it was
written and is now false in the requirement's own words: serialization "is required even where the store's own
guarantees already make two writers unable to corrupt one another, because what is at stake is emission
**order** (`REQ-EVENTS-076`) as much as record integrity, and no store supplies that on its own." A
transaction gives atomicity and isolation. It does not give emission order. A reader who finds the queue and
concludes it is redundant beside a transaction is reading half the requirement — and would be entitled to
think so on the strength of the withdrawn sentence, which is why it is withdrawn rather than quietly amended.

**The rule that generalises, so the next store does not have to relitigate it:** *put the trim inside the
recording transaction exactly where the requirement says the trim and the record are one durable operation,
and nowhere else.* `REQ-SESSION-133` says it; `REQ-EVENTS-091` does not, and states a failure mode that
depends on it not being said. The divergence is in the requirements, it is deliberate on both sides, and the
two stores must not be unified on this point. ADR-0024 owns the ring side and reaches the same place from
there.

**Write side — lock and hold.** For a per-user target under `REQ-PROVIDER-152`, take an exclusive lock on the
adjacent lock file, bounded at 5 s, and hold it across the whole read-modify-write — which is several
primitive calls, not one. The lock file is never read for content and never replaced. On timeout the
operation fails with an error that conveys that the store is being updated and that the action can be
retried, and that **does not assert that a second instance is running**, because under SR-1 none can be.

**Policy per store.** A small declarative record naming the **write shape** (replace, exclusive create, or
locked read-modify-write), the temp-name scheme, the file mode or none, whether the protection is read back,
whether failure is fatal, best-effort, reported or re-raised, and **the retry ladder or none**. Every
difference it carries is a difference the specification fixes, and **each entry cites the requirement that
fixes it** — which is what makes the table in the context section checkable against the code rather than a
second copy of it that can drift, as it did.

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

**The ladder is now evidence-backed rather than inherited, and the evidence has a different cause and a
much higher rate than the one it was derived from.** Both the requirement and this record derive the ladder
from *contention* — a foreign handle held for a moment by anti-malware, an indexer or a sync client, on
local NTFS. On a share there is no contention and it fails anyway: **37 of 600 first attempts, 6.2 %,
with no other opener present at all**, against 0 of 300 local. Every one of them was absorbed — 30 retried
renames, 29 on the second attempt, one on the third, **0 of 600 gave up**. So on shared storage the ladder
is not a defence against a rare case; **it is the normal path for about one document write in sixteen**,
and an implementer who reads it as belt-and-braces and drops it converts a routine condition into a routine
user-visible failure.

**Which makes the ladder's *scope* the problem, and this is the sharp end of consequence 9.** Under ESC-15
the one target that has a ladder — `summary.md` — is the one target that moved to machine-local storage, so
it is the one this measurement does not reach. It keeps its ladder for the reason `REQ-SESSION-033` gives,
which is contention and which reaches every path. **The targets this measurement does reach have no ladder
at all**, and they are precisely the ones `REQ-SESSION-198` guarantees stay in the workspace and on the
user's own storage: `agents.yaml`, `secrets.yaml`, `.gitignore`, the Copilot gateway's two files, and the
traceability artifacts in the user's repository. A user whose repository sits on a corporate file server —
which `REQ-SESSION-198` requires to be fully usable — meets a 6.2 % first-attempt failure rate on writes
whose stated failure policies are, respectively, unstated, *reported* (`REQ-CONFIG-216`), *swallowed*
(`REQ-CONFIG-013`) and ***re-raised*** (`REQ-TRACE-061`). The last of those is a user-visible failure of a
regeneration the user asked for, once in sixteen, for no reason the user can act on.

**This record still declines to invent the constants** — see below — but the gap it names has changed
character. It was "sufficient and unspecified". It is now **necessary on ordinary corporate storage and
unspecified**, and it is measured rather than reasoned.

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
controlled material. So: a bounded Windows retry for the traceability store is **sufficient and
unspecified**, the specification must supply it, and until it does a traceability artifact write blocked by
a foreign handle re-raises per `REQ-TRACE-061`. C-11 may stop asserting a property with no mechanism behind
it only once that ladder exists. **OQ-44's own statement of the problem needs correcting rather than
answering** — it says the corpus states no ladder anywhere, and since the amendment that is no longer true.
The gap is narrower and sharper than OQ-44 records: one domain has a ladder for exactly the case
`REQ-TRACE-061` faces, and the other does not.

**The measurement raises OQ-44's priority and supplies the shape of the answer without supplying its
numbers.** "Sufficient" was the strongest thing this record could say when the failure was a foreign handle
on local NTFS. On a share the failure is the redirector's own close behaviour, it needs no foreign handle,
and it fires on **6.2 % of first attempts**; the traceability artifacts are in the user's repository, which
`REQ-SESSION-198` deliberately leaves wherever the user put it, including a share. What the measurement
*does* fix is that two extra attempts sufficed in every one of 30 retried renames, so whatever ladder the
specification supplies does not need to be long — which is useful to whoever writes it, and is still not
this record's to write.

**Decode is the store's own.** Each store owns its decode-and-validate step, because each has a different
notion of a valid document and a different error text: `REQ-CONFIG-018`'s parser detail including line and
column, `REQ-TRACE-117`'s `<path>:<line>: ` form, and `REQ-SESSION-197`'s pattern match, whose failure is a
condition to be reported and never a licence to re-mint.
