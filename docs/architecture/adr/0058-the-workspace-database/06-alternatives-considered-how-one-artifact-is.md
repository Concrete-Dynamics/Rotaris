# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — how one artifact is taken from a store while runs are live

Part 6 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Alternatives considered — how one artifact is taken from a store while runs are live

New with ESC-19. `REQ-SESSION-201` fixes the hard part before any candidate is weighed: the action must
not require a session to be stopped, must not pause, delay, throttle or disturb a run, must not be refused
because a session is live, and what it produces must be "a state of the store that a reader could have
observed at one moment: never a mixture of parts taken before and after a write".

**S — Copy the store's files while the application runs.** Refused, and ESC-19 refuses it in one line: *a
file copy of a live store is not a backup.* Under write-ahead logging the store is three files whose
consistency is a relationship between them at an instant; copying them one after another captures three
instants, and `-shm` is shared-memory bookkeeping that must not be copied at all. Even a copy that
happened to be consistent could not be shown to be, which fails the requirement's wording as much as its
intent. Recorded rather than assumed away because it is what an implementer reaches for first, and because
the Windows writer-handle spike is a standing warning against reasoning about a live file by intuition —
it found `renameSync` over a file with a held descriptor failing outright, 0 of 115 attempts succeeding,
where theory had predicted otherwise.

**Measured, and the refusal is vindicated rather than merely reasoned.** Against a 41 MB store under a
live writer, **625 of 627 naive file copies were unopenable** — `SQLITE_CORRUPT :: database disk image is
malformed` or `SQLITE_NOTADB :: file is not a database` — 150 of 152 under write-ahead logging and **475
of 475** under rollback journal, which is *worse* because the main database file is written on every
commit. Two warnings ride on that. Anyone reaching for `journal_mode=DELETE` as a fallback for awkward
storage should know it trades one hazard for a worse one here. And a gentler first pass at
`REQ-MONITOR-219`'s realistic 20-commits-per-second cadence against a small store produced **0 bad copies
in 40** — so the obvious experiment returns a false all-clear, and an implementer who runs it and believes
it will ship S.

**T — The engine's own online backup facility** (`sqlite3_backup_*`, exposed by the binding as a stepped
copy that yields between steps). **This is the shape the working precedent uses and ESC-19 names it
approvingly**: built for exactly this, correct while the application is running and safe under
write-ahead logging. Not chosen, on one documented property that this record's own topology turns from
rare into routine: the copy is **restarted** when the source is written through a connection other than
the one driving the backup. ADR-0002 puts two writer processes on this store, the backup runs in the
workspace service, and every commit the run host makes during the copy is therefore an external write —
at `REQ-MONITOR-219`'s coalescing tick, up to twenty a second per live session. A mechanism that restarts
on each of those has no obvious termination on the exact configuration `REQ-SESSION-201` requires it to
work in.

Two honesty notes. **That restart property is read from the engine's documented behaviour and has not
been measured here**, and it is the single fact that decides between T and U; it must be confirmed
against the binding's own documentation before implementation rather than taken from this record. And T
remains available in a shape that avoids the restart entirely — driving the backup from the *same*
connection the writes go through, which updates the copy instead of restarting it — at the cost of moving
an O(store) copy into the run host, which is the process that must not be given long work. That is the
fallback if U's cost proves the worse one.

**U — `VACUUM INTO`, run in a read transaction.** Chosen for the store half of the artifact. One
statement, synchronous, producing a new self-contained database that is a transactionally consistent
snapshot — which is `REQ-SESSION-201`'s "a state a reader could have observed at one moment" literally
rather than approximately. Under write-ahead logging the reader neither blocks the writer nor is blocked
by it, which `REQ-EVENTS-098` already states as a **conformance property of this store** rather than a
tuning choice, so "must not disturb a run" is satisfied structurally rather than by care. It is not a new
primitive here: the pre-migration copy already uses it, so the backup reuses a mechanism the record has
already committed to and already has to get right. Its cost is real and is stated in the Decision.

**The choice between S and U is now measured, and U passed the exact test `REQ-SESSION-201` sets.** In the
same run in which 625 of 627 naive copies were garbage, `VACUUM INTO` produced **8 valid snapshots out of
8** while **108,525 commits landed**, every one passing `integrity_check`, every row's checksum verifying,
and the snapshots' row counts rising monotonically from 22,070 to 118,878. That is "valid while runs are
live" and "never a mixture of parts taken before and after a write" demonstrated rather than argued. The
cost is a **median 1,077 ms per 41 MB snapshot** on a local NVMe volume (min 403 ms, max 2,107 ms), which
is the first real number this record has for consequence 6.

**V — Let the per-record exports be the backup.** Refused, and `REQ-SESSION-201` refuses it in terms: an
export "is a record rendered so that software knowing nothing about this product can read it", a backup
"is the store rendered so that this product can put it back", and neither substitutes for the other. Two
further failures make it not merely different but wrong. Exports cannot carry `REQ-SESSION-136`'s
tool-call evidence — ESC-20 fixes the export boundary at redaction safety and that record never gains an
export, under any later widening — so an export-shaped backup would silently omit a record class.
And `REQ-SESSION-199` forbids building a surface on repeating an export, which is exactly what a backup
story assembled from exports would be. SR-9(b) was right that per-record exports were never a backup.

**W — Quiesce first: stop or pause every run, then copy.** Refused by requirement, and recorded because
it is the cheap way to make S correct. `REQ-SESSION-201` closes it deliberately, and the reason is a
product one rather than a technical one: a backup a user can only take when nothing is happening is a
backup taken rarely, and the machine most worth backing up is the one that is busy.
