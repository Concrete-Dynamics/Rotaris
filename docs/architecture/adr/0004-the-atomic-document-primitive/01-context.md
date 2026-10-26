# ADR-0004 — One document primitive, three write shapes, and a guarded read side — Context

Part 1 of 5 of [ADR-0004](../0004-the-atomic-document-primitive.md), which indexes every part.

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
| the generated requirement-symbol artifact, the three debt baselines, the retired-identifier log | the user's own repository | `REQ-TRACE-061`: temporary file in the target's **own parent directory**, UTF-8 with LF endings, parent created when missing, atomic replacement, temporary file removed best-effort on failure, and — since the OQ-41 amendment of 2026-09-06 — **the bounded ladder of five attempts at 0.05 / 0.1 / 0.2 / 0.4 s, exhaustion producing a recoverable error with the previous file retained** (it formerly said "the failure re-raised", which named a delivery mechanism rather than an outcome); adopted whole by `REQ-TRACE-126` and `REQ-TRACE-137`; `REQ-TRACE-513` now states as a boundary that these stay files |
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
