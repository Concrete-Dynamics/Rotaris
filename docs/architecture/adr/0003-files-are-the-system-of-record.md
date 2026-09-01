# ADR-0003 — Where state lives: the line between a file and a row

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier decision, *"Files are the system of record; no relational database"*,
  recorded under this number on 2026-08-31 and reversed in part by SR-4. Preserved below as alternative A.
- **Authority:** `owner-decisions.md` SR-4, read with SR-1, SR-2, SR-3 and **ESC-15**; and the amended
  specification, which now states the line this ADR draws in two requirements of its own
- **Origin:** DATA (ADR-DATA-01), RUNTIME (ADR-RUNTIME-03), EXEC (ADR-EXEC-11 alternative 1),
  UI (ADR-UI-02 alternative C) — for the superseded decision, preserved below as alternative A
- **Depends on:** ADR-0001, ADR-0002
- **Constrains:** ADR-0004, ADR-0005, ADR-0058, and everything numbered above them

## Context

This ADR previously decided that files were the system of record throughout and that there was no database
anywhere in the product. SR-4 reversed that in part. The sentence that matters is not the table the ruling
came with but the principle underneath it, because the principle is what makes a case nobody listed
decidable:

> A **file** when a human or another tool is meant to read or edit it, or when version control must track
> it. A **database row** when only the application reads it and it is high-volume, queried, or
> transactional.

**What has changed since the previous version of this record is that the specification has caught up, and
it did not simply absorb the ruling — it hardened the line into two requirements of its own.**
`REQ-CONFIG-477` requires configuration to be held as files and forbids moving it into a store only the
application can read, on four independently sufficient grounds; `REQ-TRACE-513` does the same for the
requirement documents, the three debt baselines, the generated symbol artifact and the retired-identifier
log. Both say, in nearly the same words, that this is "a stated boundary, recorded so that relocating them
is a change someone has to argue for rather than an optimisation that can be made while every other
requirement still appears satisfied".

That is a better outcome than this ADR asked for. **The line is no longer an architecture position that a
later performance argument could quietly erode; it is a conformance surface.** What remains this record's
job is placing the things those two requirements do not name — and there are more of them than the table
suggests.

Three further things about the amended specification frame the decision.

**The fixed paths and byte formats are gone, and they went by withdrawal rather than by contradiction.**
`REQ-SESSION-003`, `REQ-SESSION-004` and `REQ-SESSION-010` are withdrawn, each recording which requirement
now carries the guarantee it used to carry incidentally. `REQ-EVENTS-079` is withdrawn and says so
explicitly: "this document no longer fixes a path, a file name, or an enclosing directory … The
line-delimited form the path named is **not** withdrawn — it moves whole to the export." `REQ-TOOLS-078`
now says where the permission audit is held "is the sessions domain's and not fixed here", and
`REQ-TOOLS-190` fixes the verification-gate record's content and ordering "and no path, file name or
directory for it". `REQ-LIBRARY-042`, `REQ-LIBRARY-043` and `REQ-LIBRARY-138` fix observable atomicity and
persistence and state that no path or document format is contractual. The amendment surface the previous
version of this record listed as owed has been worked.

**What the specification fixes about *behaviour* is untouched by the store, and it said so.** The ordering
rules (`REQ-SESSION-028`, `REQ-MONITOR-221`, `REQ-EVENTS-072`, `REQ-TRACE-133`, `REQ-GIT-048`), the
single-writer discipline (`REQ-EVENTS-098`), the durable-before-observable rule (`REQ-EVENTS-029`,
`REQ-EVENTS-072`), the exportability guarantee (`REQ-EVENTS-166`) and the freshness rule
(`REQ-TRACE-089`) are contract. **This is a change of store, not a change of contract.**

**And the store moved off the workspace entirely.** ESC-15 and `REQ-SESSION-198` make the store
machine-local and locate it by the workspace identifier of `REQ-SESSION-197`. That does not move the
file/row line, but it moves *where the files on the row side's own directory live*: the per-session files —
the session log, the summary and the artifact bodies — are now held **with the store** and not inside the
workspace (`REQ-SESSION-002`). A reader of the table below must not assume "file" means "in your project".

## Alternatives considered

**A — Files are the system of record throughout; no database anywhere.** This ADR's previous decision. It is
preserved in full because it was not a weak argument and four slices reached it independently. It rested on
five objections to a database:

1. *Concurrency.* `REQ-TRACE-502` requires concurrent invocations to be safe **without any lock, lease or
   coordination file**, that **no invocation wait for another**, and that none ever fail because another was
   running. SQLite coordinates writers with locks; a busy timeout satisfies "never fails" by violating
   "never waits".
2. *Freshness.* `REQ-TRACE-089` requires every operation to report the repository as it stands, with no
   stored summary consulted in place of reading the files. A database answering from rows is precisely that,
   and a database re-reading every file and then writing rows would violate `REQ-TRACE-090`,
   `REQ-TRACE-408` and `REQ-LIBRARY-051`, which forbid a read path from writing.
3. *Ownership.* The requirement documents are the project's Markdown under the project's version control
   (`REQ-TRACE-434`); any database copy is a second definition of the requirement set, which
   `REQ-TRACE-197` forbids in terms.
4. *Versioning.* `REQ-CONFIG-192` requires an unsupported record to sit uninterpreted and unmigrated while
   its neighbours read normally.
5. *Conformance by comparison.* `REQ-EVENTS-015` and `REQ-EVENTS-081` compare what two runs leave behind;
   `REQ-MONITOR-299` compared two session directories **entry by entry**; `REQ-EVENTS-166` requires a stored
   history to yield every field to a stock JSON parser on a machine with none of this product's code;
   `REQ-SESSION-191` lets the user open the session directory in the platform file manager.

**Three of the five do not survive inspection, a fourth was never true, and the specification has since
settled two of them on its own.**

- Objection 4 is an argument about **configuration**, which stays in files. `REQ-CONFIG-192`'s unmigrated
  -record rule governs the *record's own version field*, and that field survives verbatim as a column
  (ADR-0058), read forward-tolerantly, an unsupported row skipped and reported in the three places the
  requirement names — the amended requirement now closes with "a workspace holding an unsupported record
  still opens and still runs". The rule was never a claim about the container.
- Objection 5's strongest clause was `REQ-MONITOR-299`'s entry-by-entry directory comparison, and **this is
  no longer an argument at all: the requirement has been amended and now says so itself.** It "compares
  record *kinds*, not directory entries", against the durable store `REQ-SESSION-001` and
  `REQ-SESSION-198` fix together with the closed set of files `REQ-SESSION-002` still keeps.
  `REQ-EVENTS-015` and `REQ-EVENTS-081` likewise compare "the same kinds of durable record" and the stored
  histories field by field, neither of which needs a directory. `REQ-EVENTS-166` survives by a different
  mechanism — see the export obligation below — and `REQ-SESSION-191` survives narrowed, see consequence 3.
- The unstated sixth objection, that *a database is a second copy that can disagree with the contract copy*,
  assumes its own conclusion. It is true only if the files are kept as well. They are not: for everything
  that moves, the row is the only copy.
- Objection 1 was never satisfied by files either. ADR-0004's spike shows that on Windows a concurrent
  atomic replace fails while **any** handle is held on the target — including an ordinary reader's — so
  under unbounded concurrency a regeneration fails "because another invocation was running" in
  `REQ-TRACE-502`'s own words. **The file design did not deliver the property it was cited to protect**,
  which is the whole of what this disqualifies.
  **It does not follow that the store delivers the property, and SR-4's own paragraph was wrong to say so;
  ESC-14 withdrew that claim.** The four artifacts `REQ-TRACE-502` governs are the user's version-controlled
  material and stay **files** — `REQ-TRACE-513` now requires it — so they never enter a store whose readers
  do not block its writers. What narrows the defect is **SR-1**: no command line, no programmatic entry
  point (`REQ-EVENTS-178`), no second instance (`REQ-STARTUP-161`), one workspace service per workspace, so
  unbounded cross-process concurrency becomes bounded in-process contention that ADR-0040's single I/O owner
  serialises. A residue remains and OQ-41 stays open.

**Objections 2 and 3 do survive**, and they are why this is a line rather than a migration. Nothing about
the traceability engine's read path or the ownership of the user's requirement documents changes, and
`REQ-TRACE-513` now states both as a boundary.

**B — A database for everything; no files.** Rejected on requirements a row cannot meet, and the
specification has since made two of them boundaries in their own right. `REQ-PROVIDER-016`'s mode-and-ACL
guarantee is a property of a filesystem object. `REQ-CONFIG-477` puts configuration in files on four
grounds, of which the sharpest is that a file carries what this release does not understand and a record
with a fixed field set cannot. `REQ-TRACE-434`, `REQ-TRACE-197` and `REQ-TRACE-513` put the requirement
documents in the user's own repository under the user's own version control. Version control is the decisive
one: a store the user's `git log` cannot see is not a place their material may live.

**C — A database as a rebuildable derived index beside the files.** The form ESC-9 permitted as a named
escape hatch for session-browser latency, generalised. Rejected as the *primary* answer: maintaining it is a
write, so `REQ-TRACE-090`'s read paths would begin writing, and detecting staleness cheaply requires exactly
the stored summary `REQ-TRACE-089` forbids consulting. The stronger reason is that this is the only shape in
which the second-copy objection is real — keeping both copies is what creates the disagreement, and moving
the data removes it. **The amended `REQ-TRACE-089` is worth reading before anyone revisits this**: it now
permits an index explicitly and draws the line where this ADR draws it, between an index that is *consulted*
(forbidden) and one that is *validated against the files before any answer is given* (allowed), with a
stated behavioural test. ESC-9's escape hatch is withdrawn as unnecessary rather than as wrong — a session
listing served by an indexed query over rows has no staleness question, and `REQ-SESSION-042` now requires
listing cost to grow with the number of sessions "and with nothing else".

**D — The line SR-4 draws.** Chosen.

## Decision

**The principle above is the decision.** The table applies it to everything the record currently names. When
something is not in the table, apply the principle; do not extend the table by analogy to its nearest row.

| What | Where | Why, under the principle |
|---|---|---|
| Session metadata and state, transcript rows and released pages, the event history, the timeline, evidence, the permission audit, the verification-gate record, the delegated-child ledger, the checkpoint index, delivery records, the improvement library, saved prompts, the session lock | **rows, in one machine-local store per workspace** (ADR-0058), located by the workspace identifier and never by path (`REQ-SESSION-198`) | only the application reads them; high-volume, queried and transactional |
| **The workspace identifier** | **one small plain-text file in `<workspace>/.rotaris/`** (`REQ-SESSION-197`) | a person must be able to read, diff and copy it, and version control must be *able* to track it; it is also the one file whose loss orphans a user's whole session history, so it cannot live in the thing it names |
| Configuration, personas, model slots | **YAML under `.rotaris/` and the per-user configuration directory**, visible to version control | `REQ-CONFIG-477` states this as a boundary on four independently sufficient grounds |
| Requirement documents, the generated symbol artifact, the three baselines, the retired-identifier log | **plain files in the user's own repository**, unchanged | `REQ-TRACE-513` states this as a boundary; `REQ-TRACE-434`, `REQ-TRACE-197`, `REQ-TRACE-004` |
| Global configuration, the discovery snapshot, desktop preferences | **per-user configuration and data directories**, as files | a user edits the first; the others are per-user rather than per-workspace and outlive any one workspace store |
| The session log, the session summary, and artifact, attachment and image **bodies** | **files, held with the store** and not inside the workspace (`REQ-SESSION-002`, `REQ-SESSION-198`, `REQ-LIBRARY-087`) | a human opens the first two; the third is bulk bytes a viewer opens. Keeping bodies out of the store bounds its size and lets them survive its loss |
| The workspace integration lock | **a file in `<workspace>/.rotaris/`** (`REQ-GIT-128`) | it protects the base repository, which is the user's material and travels with the workspace, so a second machine must meet the same lock. ADR-0005 |
| Provider credentials | **individual protected files** in the per-user data directory | `REQ-PROVIDER-016`'s `0600` plus an explicit Windows ACL, read back, is a guarantee a row cannot make |

**Six worked examples**, chosen because each shows the principle deciding rather than the table recalling.
They are the pattern to follow for anything unlisted.

1. **`summary.md` stays a file — and it moved.** `REQ-SESSION-006` makes it derived and forbids a loader
   from taking any fact from it, so nothing in the application reads it; it exists so a person can read it,
   which makes it a file even though `REQ-SESSION-028` rebuilds it on every save. Under `REQ-SESSION-198` it
   now lives **with the store**, machine-local, reached through `REQ-SESSION-191`'s reveal action rather
   than by browsing the project. It is on no publish path, so its write cadence costs nothing — but it is
   the one file a run rewrites repeatedly, which is why `REQ-SESSION-033` governs its replacement and gives
   it the product's only Windows retry ladder (ADR-0004).
2. **The listing record becomes a row.** Also derived by `REQ-SESSION-006`, but the application is exactly
   what reads it: listing is a query over these records (`REQ-SESSION-042`) and stale detection reads one
   plus the lock record and nothing else (`REQ-SESSION-058`). Application-read, high-volume, queried.
3. **The session log stays a file — and it moved too.** `REQ-SESSION-142` writes it at a configured level
   and calls it "a file so that a person can open it in an ordinary text reader"; `REQ-SESSION-191` offers
   the action that opens it. A log the product hands to a human in a text reader is a file. It sits beside
   the store with the summary and the artifact bodies, because `REQ-SESSION-198` forbids splitting one
   session's record across storage a synchronising client may reach and storage it may not.
4. **Saved prompts become rows.** Not in SR-4's table. Nobody edits them, version control has no interest in
   them, and `REQ-LIBRARY-105` requires the Library's search to agree with what is stored without a reload.
   `REQ-LIBRARY-138` as amended is worth reading for what the move bought rather than what it cost: it no
   longer names a file, and it now requires that "persisting one entry MUST NOT require rewriting the
   others" — a guarantee the whole-file rewrite it replaced could not make.
5. **The retired-identifier log stays a file.** `REQ-TRACE-004` places it in the store root and
   `REQ-TRACE-130` makes it append-only, permanent evidence; its default path is under the user's own
   repository, tracked by the user's own version control, and `REQ-TRACE-513` now states that as a boundary.
   It is the user's material, so it is a file — notwithstanding that it is only ever written by this
   product. It is also the clearest case where "only the application writes it" is *not* the test.
6. **The workspace identifier is a file, and it is the sharpest case in the table.** Only this application
   ever reads it, it is tiny, and it is never queried — so two thirds of the row test would put it in a row.
   It is a file because of the other half of the principle: `REQ-SESSION-197` requires a form "a person can
   read and version control can track", it must survive a folder being moved, renamed or copied, and it is
   the name of the store, so it cannot be inside it. `REQ-CONFIG-010` adds the consequence that decides its
   behaviour: `.rotaris/` is gitignored by default (`REQ-CONFIG-013`), so the identifier travels with a
   copied or moved folder and **does not travel through a fresh clone** — deliberately, because a clone is a
   machine that has not run this workspace before.

**`REQ-EVENTS-166` is honoured by an export, and the amendment this record said was owed has landed.** The
requirement is now written as the obligation that makes a store-only history acceptable — "the stored
history is a record only this application reads; this requirement is the obligation that makes that
acceptable, and it is discharged by **export**" — and it is "the single definition of what an export of a
session record must guarantee, for this document and for every other". Two exports of the history satisfy
it: `REQ-EVENTS-172`'s line-delimited form, emitted from what the record holds as a concatenation and never
a re-serialization, and `REQ-EVENTS-132`'s trajectory document; `REQ-SESSION-189` carries the same for the
sessions domain. `REQ-SESSION-199` extends the pattern to the timeline, the issues record, the metrics
document and the permission audit, under the same three obligations: reachable whether or not the session is
live, **not a channel**, and carrying the record's own integrity properties. `REQ-EVENTS-178` already framed
the whole thing correctly: "what may leave the application is a file, never a connection".

**Ordering guarantees do not move to the store's conscience.** A transaction makes several of them cheap,
and that is not a licence to stop stating them. `REQ-EVENTS-098`'s single-writer discipline,
`REQ-SESSION-028`'s all-or-nothing save, `REQ-MONITOR-221`'s persist-before-publish, `REQ-EVENTS-072`'s
durable-record-before-wire-event, `REQ-TRACE-133`'s tombstone-before-artifact and `REQ-GIT-048`'s
checkpoint ordering remain stated obligations with named owners. `REQ-EVENTS-072` puts it best itself: where
the store can make the record and the event one indivisible step it must, "because that is what puts the
ordering beyond the reach of a defect; where it cannot, the ordering above is still required". ADR-0058 says
which a transaction discharges and which still rest on a single writer and a stated sequence.

**Where a relational shape helps but the files stay files, the answer is unchanged.** The requirements
board's relation kinds (`REQ-TRACE-274`), its revision-history join (`REQ-TRACE-279`), its transitive
closure (`REQ-TRACE-459`) and its six-axis filtering are served by an **in-memory projection built per
pass**, handed across already translated. `REQ-TRACE-089` permits it and now also permits a *validated*
persistent index under a stated test; `REQ-TRACE-348` describes the projection. See ADR-0040. **The store
does not answer questions about the user's repository; only the files do.**

## Consequences accepted

1. **The blast radius changes shape.** Per-session directories lost one session at a time; one store per
   workspace is one corruption domain for a workspace's whole history. SR-4 requires this stated rather than
   assumed. It is stated here and the recovery story is ADR-0058's.
2. **The line is now a conformance surface rather than an architecture position.** `REQ-CONFIG-477` and
   `REQ-TRACE-513` are the two requirements a later optimisation would have to argue against. That is
   strictly better than what this record asked for, and it means an ADR is no longer the only thing holding
   the line — but it also means an architecture change here is a specification amendment, not a decision.
3. **`REQ-SESSION-191` is narrowed, not thinned, and the amended text is the one to read.** It now offers
   three actions: open the log; reveal the session's files — the log, the summary and the artifact bodies;
   and export the timeline, issues, metrics and permission-audit records (`REQ-SESSION-199`). The requirement
   states the trade in its own words: those four "are records rather than files, so the file manager no
   longer reaches them, and without the export moving them into the store would be a straight reduction in
   what a user owns about their own runs". So the loss is real and bounded — a text editor at a path, for
   four record kinds — and what replaces it is checkable in a way the files were not, because
   `REQ-SESSION-199` requires the audit's export to make the record's ordering and completeness evident. The
   reveal action now opens a machine-local directory rather than one inside the project.
4. **A native module returns to the stack.** The previous decision counted dropping a native SQLite binding
   as an incidental benefit for ADR-0054. That benefit is given back. It is smaller than it was: ADR-0020
   already makes `node-pty` a native module and ADR-0002's rebuild-and-unpack obligation load-bearing.
5. **Migrations exist now, and the file design had none.** ADR-0058 owns them. The per-record forward
   tolerance of `REQ-CONFIG-192` is preserved for record payloads; the table schema is a new thing with a new
   failure mode, and it is not hidden.
6. **Objections 2 and 3 still bind.** The traceability read path still reads the repository and still writes
   nothing (`REQ-TRACE-089`, `REQ-TRACE-090`, `REQ-TRACE-408`), and no requirement text is ever written
   anywhere but the project's own file (`REQ-TRACE-434`, `REQ-TRACE-513`).
7. **"File" no longer implies "in the user's project", and the record must not let that slip.** Three of the
   file rows in the table are machine-local (the session log, the summary, artifact bodies) and one is
   per-user (credentials). Under `REQ-SESSION-198` that is deliberate. The practical consequence is
   SR-9(b)'s: **backing up the workspace no longer backs up the session history, and it no longer backs up
   the artifact bodies either.** The exports are what a user carries anywhere durable. ADR-0058 owns the
   recovery story; the disclosure SR-9(b) ruled is not yet in the specification.
8. **ESC-2 is ruled but not yet made, and this record must not read as though it were.** `REQ-CONFIG-252`
   still states that comments and formatting are lost through the startup-preference write. The ruling to
   preserve them stands and the specification gate records it as unmade. Where the argument for
   configuration-as-a-file needs a citation today, `REQ-CONFIG-477` ground 1 supplies a stronger one that is
   in force: a file carries the keys this release does not understand, and `REQ-CONFIG-040`,
   `REQ-CONFIG-233`, `REQ-CONFIG-442` and `REQ-CONFIG-458` require every writer not to discard them.

## Revisit if

A requirement appears that puts something a human must read, or version control must track, into the store —
which would now be a change to `REQ-CONFIG-477` or `REQ-TRACE-513` rather than to this ADR. Or a requirement
requires a session's stored history to be a file at a fixed path in its own right rather than an exportable
one. Or the corruption domain of consequence 1 is measured to be a real user cost — in which case the split
ADR-0058 records under *Revisit if* is the first thing to reach for, not a return to files. Or the product
owner takes SR-9(b)'s larger option and makes the store's location the user's choice, which would put a
fourth kind of "where" in the table.
