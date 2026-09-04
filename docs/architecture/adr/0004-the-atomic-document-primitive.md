# ADR-0004 — One document primitive, three write shapes, and a guarded read side

- **Status:** proposed
- **Date:** 2026-09-02
- **Rescoped:** 2026-08-31 under SR-4 — rule 3 and the writer's-handle discipline deleted. **Revised
  2026-09-01** against the amended specification and the Windows writer-handle spike: three factual claims
  corrected, a second write shape added, and the retry-schedule field restored with exactly one value in it.
- **Revised 2026-09-02.** Two things. **The recorded contradiction with ADR-0009 over the trim's transaction
  boundary is settled here and in ADR-0009, and it is settled against this record** — the generalisation this
  record made is withdrawn and preserved below as the reading it now is. And the remaining file surface has
  been re-derived from the specification rather than carried forward: it was **wrong in four places and short
  in three**, and the corrected inventory is the other substance of this revision.
- **Revised again 2026-09-02**, against `../spikes/remote-and-synchronised-storage.md`, which measured this
  primitive on shared storage. **No decision changes. Two of them stop being inherited and become
  evidence-backed** — the bounded retry ladder, and the refusal to `fsync` the containing directory — and
  the open question this record raised in consequence 9 now has the measurement it was waiting for, which
  makes the specification gap it names materially worse than the record estimated. One factual error about
  ADR-0058's backup mechanism is corrected, and ESC-26's exception to the exclusive-create shape is
  recorded.
- **Origin:** DATA (ADR-DATA-02, Spike 1); the writer-handle-and-compaction spike, 2026-08-31;
  the remote-and-synchronised-storage spike, 2026-09-02
- **Depends on:** ADR-0003, ADR-0058
- **Constrains:** ADR-0029, ADR-0032, ADR-0036, ADR-0040, ADR-0042

## Context

SR-4 moved session data, the permission audit, the event history, delivery records and the improvement
library into a store (ADR-0058). This primitive governs what is left. **The previous version of this record
said the remaining set was "a genuinely smaller set" of five stores, all of them replacements, none of them
in the run host. All three of those statements are wrong against the amended specification**, and correcting
them was the substance of the 2026-09-01 revision.

**The inventory itself was then carried forward twice without being re-derived, and it had drifted.** It has
now been taken from the specification as it stands. Four entries were wrong and three were missing, and both
lists are given below rather than quietly repaired, because an inventory whose purpose is to be *small* is
worthless if a reader cannot tell whether it is *complete*.

### The remaining file surface

**Three write shapes, not two.** The third was always there, in a requirement this record already cited.

*Shape 1 — replaced in place: stage in the target's own parent, write, `fsync` the staged file, rename over
the target.*

| Target | Where it lives | Fixed by |
|---|---|---|
| `agents.yaml` | workspace `.rotaris/` | `REQ-CONFIG-027` stages beside the target and swaps in at mode `0644`; `REQ-CONFIG-444` binds **all four** of its writers — bootstrap, the startup model-preference path, the desktop save, and the scoped per-field write — to leave that mode |
| `project_settings.yaml` | per-user configuration directory | `REQ-CONFIG-212`: staged and swapped, parents created, mode `0644`, **modification time advanced** so `REQ-CONFIG-211` can detect the change, no temporary file left, cached entry dropped |
| `secrets.yaml` | workspace `.rotaris/` | `REQ-CONFIG-216`: atomic, target directory created when missing, staged file removed and the failure **reported** — and **no mode at all** (OQ-14) |
| `<workspace>/.gitignore` | the user's own repository root | `REQ-CONFIG-013`: atomic, idempotent, and **every** failure swallowed |
| `<provider_id>.json` | per-user credential directory | `REQ-PROVIDER-018` fixes the temporary file's **name** (starts with the provider id, ends `.tmp`), its mode `0600`, its location inside the credential directory, and its deletion on failure; `REQ-PROVIDER-016` applies `0700`/`0600` on POSIX and an explicit Windows access-control list with inheritance disabled, **reads the protection back**, and refuses to write at all when it cannot be applied |
| `access-token` and `api-key.json` | `<workspace>/.rotaris/copilot-gateway/` | `REQ-PROVIDER-063`, on `REQ-PROVIDER-016`'s protection terms, each written so a reader sees the previous or the complete new content, each on disk before staging reports success |
| the generated requirement-symbol artifact, the three debt baselines, the retired-identifier log | the user's own repository | `REQ-TRACE-061`: temporary file in the target's **own parent directory**, UTF-8 with LF endings, parent created when missing, atomic replacement, temporary file removed best-effort on failure and **the failure re-raised**; adopted whole by `REQ-TRACE-126` and `REQ-TRACE-137`; `REQ-TRACE-513` now states as a boundary that these stay files |
| `summary.md` | with the store, machine-local | `REQ-SESSION-006` derived and unread by the application; `REQ-SESSION-028` rebuilt on every save, "the one part written as a file"; `REQ-SESSION-033` **states the one retry ladder**; `REQ-SESSION-140` "never sees it half-written" |
| **an export document, at a destination the user names** | wherever the user's save dialog points | `REQ-EVENTS-145`: parents created, pretty-printed JSON with sorted keys and a trailing newline, and it **MUST become visible at its destination in one step** — "the only place this document requires a file to be replaced in one step" |

*Shape 2 — created exclusively and never replaced: create-or-read, and delete.*

- **The workspace identifier** (`REQ-SESSION-197`). Minted once when the product first prepares the
  workspace, never changed "for any reason" — not on move, rename, copy, sync or version change — and the
  product "MUST NOT mint a replacement over an identifier it can read". ADR-0058 fixes its form and where it
  lives. **`REQ-GIT-128`'s lock and this file were both measured on a share and both are correct there**:
  exclusive create produced exactly one winner in 2,500 races across five path spellings, and
  read-after-write through a second spelling was coherent in 900 documents. That is the measured form of
  ESC-15's split — the identifier file and the integration lock are safe on a share in a way the workspace
  *store* is not, which is why one stayed and the other moved.
- **This shape has gained exactly one replace, and it is not this shape's.** ESC-26 grants
  `REQ-SESSION-197` one narrow exception: **a restore may establish the workspace identifier over a
  readable one when the user explicitly confirms it, and no other action in the product ever may.** That
  write is a replace of an existing file and therefore runs through *shape 1*, staged in `.rotaris/` itself
  and renamed over the target; ADR-0058 owns when it is offered, what the confirmation must say, and the
  prohibition on every other path. It is listed here rather than in the shape-1 table above because
  **`REQ-SESSION-197` does not yet carry the exception** — ESC-26 authorises the amendment and the
  amendment is owed — and an inventory whose value is that it was derived from the specification must not
  quietly contain something the specification does not say. It moves into the table when the amendment
  lands.
- **`REQ-GIT-128`'s workspace integration lock**, `<workspace>/.rotaris/integration.lock`, created with
  exclusive-create semantics, read on contention, reaped once under the session lock's rule, deleted on
  release. ADR-0005 owns its behaviour; this record owns the write. **The requirement has since gained a case
  in which the file is not written at all**: where the open workspace is classified as replicated by a
  file-synchronisation agent, the integration is refused before anything is attempted and "the lock SHALL NOT
  be created at all", because exclusive create is not exclusive inside such a tree (ESC-21).

*Shape 3 — locked and held, for the duration of a read-modify-write.*

- **`REQ-PROVIDER-152`'s adjacent lock file**, one beside each per-user target — the credential files and
  `project_settings.yaml`. Every read-modify-write over one of those is performed while holding an exclusive
  lock on that file, so overlapping sequences serialize instead of interleaving; a lock not taken within
  **5 s** fails the operation with an error that "SHALL NOT assert that a second instance of the application
  is running, because none can be" (SR-1). This is neither a replace nor an exclusive create: the file is
  never read for content and never replaced, and its lifetime spans several primitive calls.

*Named here so nothing routes them through the primitive by analogy:*

- **The session's log** is opened in append mode and no requirement compacts it (`REQ-SESSION-142`), which
  is what leaves constraint D-27 true again for append handles.
- **Artifact, attachment and image bodies** (`REQ-LIBRARY-087`, `REQ-SESSION-002`) are written once under a
  fresh name and referenced by row. **A revised artifact writes a new body and the row is re-pointed; a body
  file is never replaced over itself** — which costs nothing, avoids the whole replace problem for the one
  write whose size is unbounded, and keeps the bodies of `REQ-LIBRARY-049`'s recorded versions reachable.
  **This does not exempt the body from an atomicity obligation, and the previous version read as if it did.**
  `REQ-LIBRARY-087` routes every artifact write through `REQ-LIBRARY-043`, which still requires that "at any
  instant a concurrent read returns either the complete previous state of the artifact or the complete new
  one". That obligation is discharged **by the row's transaction, not by a file replace**: the artifact's
  identity is its record, a reader reaches the body only through the reference the record holds, and the
  reference flips in one commit. Re-pointing is therefore not an avoidance of `REQ-LIBRARY-043` but the way
  it is met — and `REQ-LIBRARY-043` itself now says the whole-document replacement and its ladder "are all
  mechanism, and they are withdrawn with the document layout they belonged to".
- **The whole-store backup artifact** of `REQ-SESSION-201` is not produced by this primitive. *(Corrected
  2026-09-02: this entry said it was "produced by the store engine's own online-backup facility". It is
  not. ADR-0058 weighed that facility as its alternative **T** and **refused it**, because the copy is
  restarted whenever the source is written through another connection and ADR-0002 puts two writer
  processes on this store. ADR-0058 chose alternative **U**, `VACUUM INTO` in a read transaction.)* Either
  way the point this entry makes stands and is now measured: the artifact must be "a state of the store
  that a reader could have observed at one moment" while runs are live, which is a property of the store
  engine and not of a rename. **A naive file copy of a live store produced 625 unopenable copies out of
  627; `VACUUM INTO` produced 8 valid snapshots out of 8** while 108,525 commits landed. What this
  primitive *does* own on that path is the last step — the artifact is written to a sibling temporary of
  the user's chosen destination and renamed onto it, which is shape 1 and is subject to consequence 9.

### What was wrong, and what was missing

Recorded rather than silently fixed, because three of the four errors were the *same* error — a path or a
name carried forward after the requirement that fixed it had stopped fixing one.

1. **`evidence/debug.log` does not exist.** The path belonged to the withdrawn session-directory layout;
   domain 18, which held the layout diagram, is retired in full. `REQ-SESSION-142` now names only "the
   session's log, which is a file so that a person can open it in an ordinary text reader", and
   `REQ-SESSION-002` closes the per-session file set at three **kinds** — log, summary, artifact bodies —
   and fixes no names. This record and constraint D-28's note both used the old path.
2. **The discovery snapshot and the per-user documents were the same file counted twice.** `REQ-CONFIG-212`'s
   snapshot and `REQ-PROVIDER-084`'s discovered-provider catalogue are both `project_settings.yaml` in the
   per-user configuration directory. "The per-user documents" was not a fifth store; it was
   `REQ-PROVIDER-152`'s **lock discipline** over two stores already listed.
3. **`REQ-PROVIDER-063` is not "an extension of the credential store to a staging directory".** It is two
   files in a directory whose **path is part of the observable contract**, because consumers are pointed at
   it through `GITHUB_COPILOT_TOKEN_DIR` (`REQ-PROVIDER-064`) — and that path is inside the **workspace**,
   not in per-user storage. See consequence 8.
4. **"Eight write sites" was a number nobody could reproduce.** The count depends on whether a target, a
   caller or a requirement is being counted, and the record never said. The table above counts **targets**;
   `agents.yaml` alone has four callers.

Missing: the export destination of `REQ-EVENTS-145`; `REQ-PROVIDER-152`'s lock file; and the artifact body's
`REQ-LIBRARY-043` obligation.

**The differences between the replaced stores are still deliberate and still cannot be unified away.** The
temporary file's location is fixed for the traceability store and the credential store and unstated
elsewhere; its **name** is fixed only for credentials; the **mode** is `0644`, `0600` and none in three
places; the **failure policy** is fatal for a credential, best-effort for `.gitignore` maintenance,
*reported* for `secrets.yaml` and *re-raised* for a traceability artifact; and exactly one of them carries a
**retry ladder**.

**Under ESC-15 the session's own files moved out of the workspace.** `summary.md`, the session log and the
artifact bodies are held with the store, machine-local (`REQ-SESSION-198`, `REQ-SESSION-002`). That narrows
the population of processes that can hold a foreign handle on them — a file-synchronisation client scanning
the project no longer reaches them — without removing it: the user's own text editor opens `summary.md`
through `REQ-SESSION-191`'s reveal action, and anti-malware reaches every path. It does **not** apply to the
workspace files, which is the whole point of consequence 8.

### Spike evidence

Three measurements govern this record. All were taken on Windows 11 build 26200, NTFS, Node v24.11.0.

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

**The remote-and-synchronised-storage spike (this primitive on a share).** 300 documents per cell, through
five path spellings of one file — local NTFS, three flavours of UNC over the SMB redirector, and a mapped
network drive letter. It measured what this record had reasoned about and never tested: what the replace
path does when the workspace it is writing into is on shared storage, which `REQ-SESSION-198` requires to be
fully usable.

1. **Rename-over-existing fails spuriously on a share with nothing else touching the file.** **37 of 600
   first attempts failed `EPERM`** across the two remote spellings — 17 of 300 over UNC, 20 of 300 over the
   mapped letter — in the arm that had **no concurrent reader at all**. On local NTFS it was **0 of 300**.
   The cause is consistent with the redirector's deferred-close and handle-lease behaviour holding the
   destination open briefly after the client closed it; the spike did not establish that and says so.
2. **The bounded ladder absorbed every one of them and never gave up.** In the arm with a reader opening
   and closing through a *different* spelling between writes, 30 renames needed a retry: **29 succeeded on
   the second attempt and one on the third. 0 of 600 gave up.** Two extra attempts was the worst case
   observed.
3. **Read-after-write is coherent across spellings.** 0 mismatches in 900 documents, through the same file
   reached five ways. Ordinary file content is coherent through the redirector, whatever else is not.
4. **Exclusive create is a flawless mutual-exclusion primitive over SMB.** 2,500 races across five
   pairings, including two that mix local and remote I/O stacks: **exactly one winner in every one**, 0
   with more than one, 0 with none, 7,500 losers all `EEXIST`. One fairness observation, not a correctness
   one: a racer with local access won **500 of 500** against a racer coming over the share, so *who* wins
   is decided by topology rather than by who asked first.
5. **`fsync` of the containing directory returns `EPERM` — on every spelling, local NTFS included.** This
   is a platform finding rather than a shared-storage one, and it bears directly on rule 2 below.
6. **Atomic writes cost about 6× more on a share** — p50 **12.061 ms** against 2.071 ms local, p95 **26.503
   ms** against 2.530 ms, worst 48.016 ms. Loopback SMB has no latency and no packet loss, so that is a
   floor.

## Alternatives considered

**A — One primitive with a uniform policy.** Simple, one place to audit. Still not available, and the
argument has changed sign twice, both times in the same direction: the set of differences **grew again**.
Three modes, two temp-name contracts, **four** failure policies (fatal, best-effort, reported, re-raised),
one retry ladder, and now **three** write shapes. A uniform primitive would over-constrain the credential
store or under-constrain the traceability store, and the over-constrained case fails conformance quietly.

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
than before. There are now nine replace targets in three processes across three write shapes, and the Windows
replace behaviour is a property of the chosen platform call rather than of any one store. Nine independent
rediscoveries of the empty-read guard, and nine independent decisions about whether to close a staged handle
before renaming, is the outcome that argues for one module. **The re-derivation that produced this revision
is itself evidence for it:** four of the inventory's entries had drifted from their requirements while the
record still read as authoritative, and a drifted entry in one shared module is one bug, where a drifted
assumption in nine hand-written write sites is nine.

**F — Let the inventory live in the code and keep only the rules here.** Genuinely tempting after this
revision, since the drift being corrected is exactly the drift a document accumulates and a compiler does
not. Rejected for one reason: **most of what the table carries is not derivable from the code** — that
`secrets.yaml` has no mode is a requirement's silence (OQ-14), that `.gitignore` failures are swallowed is
`REQ-CONFIG-013`'s choice, and that `summary.md` alone gets a ladder is `REQ-SESSION-033`'s declaration that
it is "the only replacement ladder this domain states". A reader of the code would see the values and not
which of them are load-bearing. The policy record the decision names is the reconciliation: it lives in the
code, is the single source of the values, and cites the requirement fixing each — so the table above is
checkable against it rather than a second copy of it.

**E — Route the replace through the platform's file-replacement call by way of a native binding.** Newly
plausible, because the spike shows it is the one mechanism that works past a held handle while leaving a
concurrent reader with complete previous contents — it would remove rule 1 and the ladder together. Not
chosen now: it is a second native module (ADR-0058 and ADR-0020 already carry one each), it is
Windows-only so the POSIX path stays anyway, and no requirement is failing for want of it now that
`REQ-SESSION-033` supplies the ladder the one hot replace path needs. It is the *Revisit if*, and it
replaces the trigger the previous version had, which was already satisfied and would have changed nothing.

## Decision

**Alternative B, with the read side inside the primitive and three write shapes on it.**

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

## Consequences accepted

1. A read can cost two attempts under contention; the added latency is bounded by the store's policy and is
   zero uncontended. One replace path can additionally cost a bounded ladder of up to five attempts within
   about 1.55 s (`REQ-SESSION-033`), and that ladder is on the save path of a running session. **And the
   uncontended write itself is not free where the target is on a share: p50 12.06 ms against 2.07 ms local,
   p95 26.50 ms against 2.53 ms, measured over loopback SMB with no network latency at all, so that is a
   floor.** Every configuration-document write for a user whose workspace is on a file server pays it, and
   nothing in the record carried that number before.
2. We own the filesystem edge cases for **nine replace targets, two exclusive-create targets and one lock
   file** — anti-malware handles, network shares, case-insensitive collisions — rather than for a dozen
   independently written stores. The count is of targets and is reproducible from the table; it is not the
   count of callers, which is larger. Some of those targets are now in per-user storage rather than the
   workspace, which changes which foreign processes can interfere but not that some can. **"Network shares"
   has stopped being a listed hazard and become a measured one**: the replace fails on 6.2 % of first
   attempts there with nothing else touching the file, and the exclusive-create shape is correct there —
   2,500 races, exactly one winner in every one. Owning these in one module is what makes a single ladder
   fix all nine rather than nine.
3. **The primitive does run in the run host, for exactly one file.** The previous version said it did not;
   that is wrong. `REQ-SESSION-028` rebuilds `summary.md` on every save and makes it "the one part written
   as a file", and the save is taken by the process holding the session lock, which is the run host
   (`REQ-EVENTS-098`, ADR-0002). So the run host owns one replace path, on the save path, with a retry
   ladder on it — and it is the one place in the product where this primitive can add latency to a running
   session. Everything else through the primitive belongs to main (credentials, the per-user documents and
   their locks) or the workspace service (configuration, the traceability artifacts, the integration lock,
   the identifier — both its exclusive-create mint and ESC-26's single confirmed replace of it, which
   ADR-0058 places in the same process for the same reason: it is the only process that reads `.rotaris/`
   and resolves an identifier) — **except the export write, whose process this record does not fix.** It reads the store,
   which needs no lock (`REQ-EVENTS-098`), and writes a file outside every path the product owns, so nothing
   requires it to be in the run host and `REQ-SESSION-199` requires it not to disturb a run. Where it runs is
   ADR-0002's and ADR-0058's; what it must not do is take the run host's thread while a session is recording.
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
   orphans a user's history, silently. The comparison behind ESC-19 to ESC-21 makes that concrete rather
   than hypothetical: path-keyed harnesses lose sessions when a directory is renamed, one user losing 63
   sessions across 10 projects, and *even a change of case* orphans everything. The identifier is what
   this product has instead, so the write that mints it is load-bearing out of proportion to its size.
   **The primitive itself is now measured and it is sound** — 2,500 of 2,500 races produced exactly one
   winner, including across mixed I/O stacks — so the risk is entirely in how it is *called*, which is the
   distinction this record has to keep visible. **And ESC-26 has since put exactly one replace of the
   identifier file into the product**, inside the restore and behind an explicit confirmation. That write
   is the one place where "overwrites rather than reads" is the intended behaviour, which makes it the one
   place a reviewer cannot rely on the shape to tell them the call is wrong. It is called out in shape 2
   above and owned by ADR-0058.
8. **Two secret-bearing files stay inside the workspace, and ESC-15 does not reach them.**
   `REQ-PROVIDER-063` puts the Copilot gateway's `access-token` and `api-key.json` under
   `<workspace>/.rotaris/copilot-gateway/`, and that path cannot be relocated to per-user storage the way
   the session store was, because consumers are pointed at the directory by `GITHUB_COPILOT_TOKEN_DIR`
   (`REQ-PROVIDER-064`) and the name is stated to be part of the observable contract. So a workspace in a
   synchronising folder has bearer tokens inside the synchronised tree. Three things bound it, and they are
   named together because no one of them is sufficient: `REQ-CONFIG-013` keeps `.rotaris/` out of version
   control; `REQ-PROVIDER-063` requires the same protection as the credential store, refusing to write
   either file when it cannot be applied; and the tokens are short-lived. **What is *not* bounded is a sync
   client replicating them to a vendor's servers**, and no requirement addresses that. Recorded here
   because this record owns the write and is where a reader would look, not because it is this record's to
   decide.
9. **The export destination is the one replace whose target the product does not choose.** Every other
   entry in the table is a path the product owns; `REQ-EVENTS-145`'s document lands wherever a save dialog
   points — removable media, a network share, a synchronised folder, a directory the user has open in
   another application. The primitive's stage-in-the-target's-own-parent rule is what makes that work at all
   (a temporary file beside the destination is on the same volume, so the rename is a rename and not a
   copy), and it is also the rule most likely to be broken by a well-meaning simplification that stages in
   a temporary directory. It is also the target on which a foreign handle is **most** likely, since the user
   picked the location for a reason and may well have the previous export open in another application.
   **Whether a ladder applies to it is genuinely unclear, and this record does not resolve it.**
   `REQ-EVENTS-145` states none. `REQ-SESSION-033`'s ladder is scoped to "where this domain replaces a whole
   file in place", naming `summary.md` only as "the one written repeatedly" rather than as the only one —
   and the sessions domain writes exports too (`REQ-SESSION-189`, `REQ-SESSION-199`), which over an existing
   destination is a whole-file replace in place. So the ladder either reaches the export or stops at
   `summary.md`, and the text supports both readings. The two differ in what a user observes — a failed
   export against a held file, or a successful one a second later — so this is a specification question and
   is raised as one rather than chosen here. The policy record carries either answer without changing shape.

   **The measurement this consequence was written waiting for has arrived, and it does not settle the
   reading — it raises the stakes on getting it right.** A network share is one of the destinations named
   here, and the replace fails there on **6.2 % of first attempts with no foreign handle involved at all**.
   So the ambiguity is no longer academic: under the narrow reading, roughly one export in sixteen to a
   share fails for a reason the user cannot act on and cannot reproduce; under the wide reading it
   succeeds on the second attempt, which is what happened in 29 of the 30 retries measured. **The
   specification question is unchanged and the argument for answering it is now numerical rather than
   hypothetical.** Removable media, a synchronised folder and a directory open in another application
   remain unmeasured; the share is the one of the four that was tested.

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

On the trim boundary specifically: **this record now takes no position of its own**, and reopening it is
ADR-0009's and ADR-0024's. It would reopen if `REQ-EVENTS-091`'s tolerated failed trim were amended away, at
which point the event history's trim could move inside the append's transaction and the two stores would
converge — or if `REQ-SESSION-133`'s "same durable operation" clause were withdrawn, at which point they
would converge the other way. Either amendment, and not an argument, is what changes it.

**The measurement this record did not have, reported.** *(The previous version read: "Nothing has measured
the replace path's cost against a destination the product does not own … A second measurement pass is in
flight as this is written and its results are not in hand; if it reports a replace failure rate at such a
destination that a bounded ladder would fix, the ladder field gets a value there too." It has reported, and
it does.)* On a network share the replace fails on **37 of 600 first attempts with no other opener present**,
against **0 of 300** locally, and a bounded ladder fixed every one of them within two extra attempts. **The
antecedent of that clause is satisfied**: the ladder field should get a value for every target that can
land on a share, which is the workspace documents, the traceability artifacts and the export destination —
and per the paragraph above, this record still will not invent the constants. **This is now a specification
question that has been asked and answered by measurement on one side and is unanswered on the other**, on
the same footing as OQ-44 and with more urgency than OQ-44 currently carries.

**What remains unmeasured, so the gap is not mistaken for closed.** Removable media, a directory the user
has open in another application, and a real file-synchronisation client's tree were all named in
consequence 9 and none was tested — the spike declined to write into the machine's live sync roots because
they hold the user's own material. Exclusive create against a *dehydrated* placeholder inside such a tree
is specifically flagged as a code path nobody has exercised, and that is the one that bears on shape 2's
two identity guarantees. And every remote figure came from one SMB client talking to a server on the same
machine: no latency, no packet loss, no reconnection. The 12 ms p50 is a floor and the 6.2 % is not
necessarily one.
