# Product-owner decisions on the architecture record — Structural rulings under the standing direction

Part 4 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

## Structural rulings under the standing direction

The first three findings of that direction, ruled on 2026-08-31. Together they remove filesystem-mediated
communication from the product entirely. Files remain the system of record; they are no longer a transport.

### SR-1 — one running instance

**Decided: a second launch of the application surfaces the running instance rather than starting a rival
process.** Multiple workspaces and multiple windows remain fully supported; they are windows of the one
instance.

This is the root change. `REQ-SESSION-159` named three cases in which a session runs in a process other
than the one displaying it — a second window of this application, another instance opened on the same
workspace, and a run detached into the background. Under the architecture's process topology the first and
third are already inside one process tree and reach the session over the internal channels. Only the second
required the filesystem, and it no longer occurs.

### SR-2 — a run this application does not own cannot be viewed

**Decided: a session is either live and owned by this application's run host, or it is not running and
exists as a persisted record.** There is no third condition. A session that is not live is opened from its
record and may be continued.

A session left behind by a crash or a force-quit is *stale*, not foreign: the existing lock-reap path
(`REQ-SESSION-047`, `REQ-SESSION-058`, `REQ-SESSION-183`) settles it, after which it opens as an ordinary
persisted session. Nothing becomes permanently unreachable — a session is unreachable only while another
process is running it, and no other process can now be running it.

This withdraws the live tail-following protocol: the resumable byte-offset read, the restart flag, the
truncation-marker dropped-count comparison, the placeholder-row gap filling and the re-seed-without-
observable-empty rule. `REQ-SESSION-159`'s closing guarantee — that following a session and reopening it
afterwards produce identical transcripts — becomes trivially true, because only one derivation remains.

**The event journal is unaffected.** `evidence/events.jsonl` stays byte-identical to the wire
(`REQ-EVENTS-079`, `REQ-EVENTS-080`), stays comparable as a file by conformance requirements
(`REQ-EVENTS-166`, `REQ-MONITOR-299`), and is now the durable anchor for the persist-before-publish rule.
What is withdrawn is the protocol for *following* it live from another process, not the file.

### SR-3 — no polling

**Decided: the polling cadences are withdrawn.** `REQ-MONITOR-287`'s 750 ms foreign poll goes with the
feature it served. `REQ-MONITOR-288`'s 2000 ms local reconcile poll is replaced by **monotonic per-session
sequence numbers on view updates, with gap detection**: a surface that observes a gap knows immediately it
missed an update and reconciles from a whole-state read.

That is strictly stronger than the poll it replaces — detection is immediate rather than up to two seconds
late, and it costs nothing while nothing is lost. It also composes with the existing rule that an apply
stage which cannot correctly apply an increment declines it and re-renders from a whole read.

`REQ-SESSION-071` already forbids re-reading persisted state on a timer as a way to follow a run. That rule
now has no exception.

**On the diagnosis:** polling here is not an artifact of an implementation language. It is an artifact of a
*process model*. Independent processes sharing only a filesystem have no channel to push over, so they
poll. This is the signature to look for in the remaining audit: wherever the record assumes two processes
that cannot talk to each other, there is a fossil.

### SR-4 — a database is the store for what only the application reads

**Decided: the product uses a database for application-owned session data, and files for everything a
human, another tool, or version control is meant to read.** ADR-0003's "files are the system of record;
there is no database anywhere in the product" is reversed in part and rewritten.

**The principle, which is what makes this decidable later rather than a list to memorise:**

> A **file** when a human or another tool is meant to read or edit it, or when version control must
> track it. A **database row** when only the application reads it and it is high-volume, queried, or
> transactional.

| What | Where |
|---|---|
| Sessions: metadata, session state, transcript rows, the event history, the timeline, evidence, the permission audit, the delegated-child ledger, the checkpoint index, delivery records, the improvement library | **database, one per workspace** |
| Configuration, personas, model slots — the things a user edits, and whose comments matter (ESC-2) | **YAML under `.rotaris/`, visible to version control** |
| Requirement documents, the generated symbol artifact, baselines, the tombstone log | **plain files in the user's own repository** — their versioned material, unchanged |
| Global configuration, the discovery snapshot, desktop preferences | **per-user configuration and data directories** |
| Artifacts, attachments, images | **on disk, referenced by row — never stored as blobs** |
| Provider credentials | **individual protected files.** `REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read back. That is a filesystem guarantee a row cannot make |

**The event history stays exportable.** `REQ-EVENTS-166` requires a stored history to yield every field to
a stock parser on a machine with none of this product's code present. That obligation is honoured by an
**export**, not by the write path: the user can always get their history out in a plain line-delimited
format. What is withdrawn is line-delimited JSON as the *runtime write path*, not the guarantee.

**Why, in one paragraph.** Three of the four arguments that produced the no-database verdict do not survive
inspection. `REQ-CONFIG-192`'s unmigrated-record rule is an argument about *configuration*, which stays in
files. `REQ-MONITOR-299`'s entry-by-entry directory comparison is a conformance-test methodology encoded as
a product requirement, and a fossil under the standing direction. "A database is a second copy that can
disagree with the contract copy" assumes its own conclusion — it is only true if the files are kept as
well. And `REQ-TRACE-502` is not satisfied by the file design either: OQ-41 records that on Windows an
ordinary *reader* blocks an atomic replace, and under `REQ-GIT-145`'s unbounded concurrency those read
windows overlap continuously, so a regeneration fails "because another invocation was running" in the
requirement's own words.

> **Correction, 2026-08-31.** An earlier version of this ruling concluded that the defect "is unreachable
> in a store whose readers do not block its writers", and listed OQ-41 among what the database dissolves.
> **That reasoning is wrong and must not be cited.** The artifacts `REQ-TRACE-502` governs — the
> requirement documents, the baselines, the generated symbol artifact and the tombstone log — are the
> user's version-controlled material and stay **files** under this ruling's own table. They never reach
> the database, so the database's concurrency properties do not touch them.
>
> The conclusion is nearly right by a different route: **SR-1** removes the premise the defect rested on.
> Unbounded concurrent *processes* on one workspace can no longer exist, so the overlapping read windows
> that made retry exhaustion continuous are gone. That is a sharp **narrowing, not a dissolution**, and a
> residue remains — a user-visible failure in a user-initiated action on Windows, recorded as ESC-14 and
> OQ-44. What survives as an argument here is only that objection 1 was never a good reason to keep
> files. It is not a claim that the database fixes it.

**What this dissolves rather than fixes:** the writer's-handle discipline of ADR-0004 rule 3 and constraint
D-28; the compaction paths that rename over a held append handle; the truncation marker and the byte-offset
restart detection; the two incompatible retry ladders of OQ-11; and the ten-second debounce that made
persist-before-publish collide with `REQ-MONITOR-218`, since rows are written individually rather than by
rewriting a whole file. **Not OQ-41** — see the correction above.

**What it costs, recorded so it is not discovered later:** ADR-0003 and ADR-0004 are foundational and
everything numbered above them inherits the change. On the specification side it withdraws or amends the
fixed session-directory layout and the line-delimited byte-format requirements — a second amendment pass.
And a database file is a single corruption domain where per-session directories lost one session at a
time; scoping the database per workspace bounds the blast radius, and that must be **stated in the
decision record rather than assumed**.

### SR-5 — a workspace held by another machine is refused, and that refusal is a safety feature

**Decided: refusal is intended.** SR-1's "one running instance" is one instance *per machine*. A workspace
on shared or synchronised storage, opened from a second machine, presents a session lock naming a host
this instance cannot probe. It cannot prove the lock unheld, so it does not reap it: the session is
refused as a pre-run failure that does not steal the holder's lock, reporting the session identifier with
the process identifier and host the lock records (`REQ-SESSION-083`), with explicit release as the only
remedy (`REQ-SESSION-183`).

The host field of `REQ-SESSION-046`, the cross-host vocabulary of `REQ-SESSION-054` and
`REQ-SESSION-056`, the explicit-release path of `REQ-SESSION-183`, and `REQ-GIT-093` **all stay**.

**Why this is not merely tolerated.** The question was raised before SR-4 was applied, and SR-4 changes
the answer. A database on network or file-synchronised storage is a well-known corruption vector, because
the locking primitives such a store depends on are not reliable there. Detecting that a workspace is held
by another machine therefore stops being an awkward edge case and becomes a **safety check**. Declaring
the configuration unsupported and shrinking the host vocabulary would mean the product no longer detects
the situation at all — and a silently corrupted workspace database is a far worse outcome for a user than
a loud refusal.

**On SR-2's "nothing is ever unreachable".** That statement is qualified rather than contradicted: a
session is unreachable only while another owner holds it, which is the same rule that has always applied.
What is new is that the other owner may be on a machine whose liveness this instance cannot establish, so
the refusal cannot be resolved by reaping and requires a person.

**Two refinements adopted with this ruling.** The first follows from it directly; the second is an
addition, recorded separately so it can be reversed on its own:

1. The refusal must convey **what is actually wrong** — that the workspace is open on another machine —
   rather than reporting a lock conflict and leaving the user to infer it from a host name.
2. **New:** the product should detect shared or synchronised storage *directly* rather than only
   noticing it when a lock collides, and warn about it. Under SR-4 the risk is to the workspace database
   itself and is not limited to sessions another machine happens to be running. This needs a new
   requirement and is not merely an amendment.

### SR-6 — the export obligation covers every record a user could previously read for themselves

**Decided (ESC-17): extend the export.** SR-4 gave the event history an export in a stock, line-delimited
format so `REQ-EVENTS-166`'s guarantee survived the move off files. That same obligation now covers **the
timeline, the issues file, the metrics document and the permission audit**, each in a format a stock tool
can read, and each reachable whether or not the session is live.

**Why this and not the reduction.** `REQ-SESSION-191` currently keeps these reachable by revealing the
session directory in the platform's file manager — an affordance that means nothing once the records are
rows. Without an export, moving them into the database is a straight reduction in what a user owns about
their own runs. That matters most for the **permission audit**, which is exactly the record a user
consults *when they do not trust this application's rendering of events*. An audit log only this
application can read is a materially weaker audit log, and no amount of good faith in the renderer
substitutes for being able to check.

Widening the export is cheap: the mechanism already exists for the event history, and it is the same
obligation applied to four more record kinds rather than a new one.

**Consequences.**

- `REQ-SESSION-191` needs amendment. Its "reveals the session directory in the platform's file manager"
  action no longer reaches the timeline, issues, metrics or audit records, and the requirement must state
  the export in its place. `evidence/debug.log` stays a file (ADR-0003's worked examples place it there,
  citing `REQ-SESSION-142`), so the log half of the requirement survives unchanged.
- The export must not itself become a way to observe a live run, which `REQ-SESSION-071` forbids on a
  timer and SR-2 forbids through a second derivation. It is a user-initiated action producing a file, not
  a channel.
- The permission audit's export inherits the audit's own integrity obligations: whatever ordering and
  append-only character the record has in the store must be evident in what is exported, or the export
  is decorative.

---
