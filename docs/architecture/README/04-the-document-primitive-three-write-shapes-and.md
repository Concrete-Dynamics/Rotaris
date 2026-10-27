# Rotaris-crw — system architecture — The document primitive: three write shapes, and one ladder

Part 4 of 13 of [the architecture README](../README.md), which indexes every part.

### The document primitive: three write shapes, and one ladder

One primitive still performs every atomic replacement for the stores that remain files, and it still has
a guarded read side — a concurrent reader observes an **empty** file roughly once in a few thousand reads
under contention, and a silent empty read of configuration would present as *no configuration* under
`REQ-CONFIG-017`, which is the dangerous case. So it retries on decode failure after a successful stat,
and **no reader holds a descriptor between calls, on any thread**.

It has a **second write shape**: exclusive create — create-or-read, and delete — which carries two of
the product's identity guarantees, which workspace this is (`REQ-SESSION-197`) and who is integrating
(`REQ-GIT-128`). Neither of those files is ever replaced over itself.

**And a third, which this record had mis-filed under the first.** `REQ-PROVIDER-152`'s adjacent lock file
is a **lock-and-hold** shape spanning several primitive calls — acquire, read, modify, write, release,
with a 5-second acquisition budget, a dead holder's lock reclaimed and a live holder's never broken. It
is neither a replace nor an exclusive create, and calling it a replace hid that one of the product's file
disciplines has a lifetime rather than a moment. ADR-0004's file surface is re-derived from the
specification as a table of targets each citing the requirement that fixes it — **nine replace targets,
two exclusive-create targets, one lock file** — replacing a prose count of "eight write sites" that was
unreproducible because the record never said whether it was counting targets, callers or requirements.
Failure policies go from three to four: fatal, best-effort, reported, re-raised.

**One replace target is unlike the other eight and it is the newest.** `REQ-EVENTS-145`'s export
document, and the exports of `REQ-SESSION-189` and `REQ-SESSION-199`, are written to a destination **the
user chooses**. It is the only replace whose destination the product does not pick, which makes the
stage-in-the-target's-own-parent rule load-bearing (same volume, so the rename is a rename) and makes a
foreign handle likelier there than anywhere else in the product. Whether `REQ-SESSION-033`'s ladder
reaches it is genuinely ambiguous in the text — see **OQ-44**, now widened to carry it.

**The retry-schedule field is back, with exactly one value in it** — which is literally what the previous
version's own *Revisit if* predicted. `REQ-SESSION-033` was **narrowed, not withdrawn**: it still governs
`summary.md`, states its 0.05/0.1/0.2/0.4/0.8 s ladder, and declares itself "the only replacement ladder
this domain states". So **OQ-11 is closed, and the reason previously recorded for closing it was wrong**:
it is not that neither ladder has a file left to govern, but that `REQ-LIBRARY-043`'s ladder went with its
document layout — because no writer outside this application can reach a record in that store
(`REQ-LIBRARY-158`) — while `REQ-SESSION-033`'s survived precisely because its file *is* reachable by
one. One ladder remains and there is nothing to reconcile. **OQ-44 survives with a sharper and narrower
statement**: the corpus does state a ladder, and it is in the wrong domain to be borrowed for
`REQ-TRACE-061`, which still requires a failed replace re-raised with none.

### Two things the measurement corrected here, and they matter for the reason

`spikes/windows-writer-handle-compaction.md` measured the file design this record used to describe. Its
subject is gone; three of its findings are not.

- **"Node does not request share-delete, so an ordinary reader blocks a replace" is false.** An `unlink`
  *succeeds* against a Node-held handle, from another process too, while both fail against a holder
  requesting read/write sharing without delete — so Node's open does request share-delete. What actually
  fails is the replace-by-rename call, which cannot replace a destination with **any** open handle,
  whatever its share mode, and fails **even when the holder explicitly permits delete**. Rules 1 and 3 of
  ADR-0004 were right for a reason the record had mis-identified. The correct *Revisit if* is therefore a
  runtime API or native binding exposing the platform's own file-replacement call, which the spike
  measured replacing a target this process holds open while a held reader continued to see complete
  previous contents.
- **"A directory `fsync` is unavailable on Windows through the runtime" is false, and a second
  measurement has since qualified how false.** The writer-handle spike found it succeeding on a
  **write-opened** directory handle, 200 of 200 at ~0.1 ms, failing only on a read-only one.
  `spikes/remote-and-synchronised-storage.md` §8 then found it returning `EPERM` on **every** path
  spelling *including local NTFS*. The two are consistent and **the reconciliation is inferred rather
  than measured**: the second harness opened the directory the ordinary way, which is read-only, so the
  available call needs a handle deliberately opened for write. What the pair adds is an operational fact
  the record did not have — **the naive call an implementer would reach for fails everywhere**, so no
  durability step may assume the containing directory is flushed. The decision not to perform one is
  unchanged and its **ground is replaced**: not "the call is unavailable" but "a success return does not
  establish the guarantee, no power-loss test has been run, and no remaining requirement asks for one".
  **OQ-12** carries both halves.
- **The diagnosis behind the deleted rule 3 is confirmed and generalises.** In the naive shape, 0 of 115
  trims completed, the cap was exceeded and growing, **no reader observed any symptom**, and append
  throughput collapsed roughly seventy-fold. An append-and-compact file whose writer holds it open is a
  silent cap-enforcement failure. Nothing in the product may reintroduce that shape, whatever the medium.

### One store per workspace is one corruption domain, and it now has a backup

That is stated rather than assumed, because SR-4 required it stated. Bounded four ways — other workspaces
are separate files; the user's own material is never in it, so requirement documents, baselines,
configuration, credentials and every artifact body survive a destroyed store even though the index does
not; a copy is taken before every migration, with a copy that cannot be written **aborting** the
migration; and, since `REQ-SESSION-201`, the user can take one deliberately, whole, while runs are live.

**The recovery ladder still assumes no backup was taken, and that is deliberate rather than stale.** Its
order: report the store unopenable, carrying the engine's own reason unaltered (`REQ-EVENTS-084`);
**salvage into a fresh store first**; export what salvage recovered; and only then offer to move the
damaged store aside. What changes is one sentence of what the user is told — it can no longer assert that
this machine holds no other copy, because the product now offers a way to have made one. The application
never deletes a store and never repairs one in place, **and that rule now extends to a second operation**:
a restore moves the store it replaces aside under a UTC timestamp and keeps it, because a store a restore
deleted is history that existed nowhere else and the user was mid-recovery when it went (constraint
W-24). The cost is disk, and it lands on a reclamation surface that does not exist (**OQ-48**) — the two
operations a user in trouble reaches for first are the two that leave something behind.

**The swap is not claimed atomic and the record says so rather than implying otherwise.** Both store
connections are closed across two processes, the artifact is expanded into a sibling staging directory
and **opened read-write there** so that log recovery runs and the integrity check tests what will
actually be used, and then two renames land. Two renames are not one on any platform. What is observable
in the gap is an **absent** store directory, which `REQ-SESSION-043` already makes an ordinary state, so
the worst observable is an empty session list rather than a corrupt or half-restored store — which is
what `REQ-SESSION-201`'s "no reader may observe a partly restored store" needs. Three refusal gates run
before any mutation: the artifact opens and passes an integrity check; its schema version is not newer
than this build, refused **here** rather than at the next open, because that is the difference between a
refusal and a workspace that will not open *after* a restore; and no session in the target is live. An
**older** version is explicitly not a refusal.

**Two versioning layers, decided separately.** A record's own version field is a column, read
forward-tolerantly and never migrated in place — `REQ-CONFIG-192` as amended now withdraws
`store_subpath`, states that "no key of this domain names a directory, file or document format for it",
and closes with "a workspace holding an unsupported record still opens and still runs". **Table** schema
is a problem the specification names nowhere: forward-only numbered migrations, each inside one
transaction, run only in the workspace service. A store newer than the application is **refused** and
**nothing is written to it**, so an older build hands a newer store back untouched. What cannot be
preserved is forward tolerance per *structure*: under files one bad record sat there while its neighbours
read; under a schema an unsupported table layout stops every row at once. Additive-only migrations
mitigate that; nothing fixes it.

---
