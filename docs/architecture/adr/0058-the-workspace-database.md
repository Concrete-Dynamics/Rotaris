# ADR-0058 — The workspace store: machine-local, found by a workspace identifier

- **Status:** proposed
- **Date:** 2026-09-01
- **Supersedes:** its own earlier scope-and-location decision, *"one database per workspace, at
  `<workspace>/.rotaris/workspace.db`"*, recorded under this number on 2026-08-31 and reversed by ESC-15.
  The superseded argument is preserved below as alternative **J**.
- **Authority:** `owner-decisions.md` SR-4 (the store), **ESC-15** (machine-local, keyed by a workspace
  identifier), ESC-16 (a store that will not open means no run), ESC-18, SR-9(b). All decided, not proposed.
- **Depends on:** ADR-0001, ADR-0002, ADR-0003
- **Constrains:** ADR-0004, ADR-0005, ADR-0008, ADR-0009, ADR-0024, ADR-0039, ADR-0041, ADR-0042, ADR-0046

## Context

ADR-0003 draws the line between a file and a row. This ADR decides the store on the row side of it: what
engine, **where**, located **how**, opened by which of ADR-0002's processes, with what durability, and —
the question the file design never had to answer — what happens to schema when it changes.

**What changed since the previous version of this record, and why.** The previous version put the store at
`<workspace>/.rotaris/workspace.db` and recorded, as consequence 3, that "a workspace on a network share or
in a cloud-sync folder is degraded, not merely slow". That consequence was correct and it was fatal.
Write-ahead logging requires shared memory and is unsupported on network filesystems, so the store there
opens read-only; **acquiring a session lock is now a write** (`REQ-SESSION-046`, and ADR-0005); therefore no
session in that workspace can start at all. `REQ-SESSION-089` and `REQ-EVENTS-084` as amended make that
outcome explicit and unrecoverable-in-place: the run is refused, nothing is degraded. Under the file design
the same workspace *worked*, merely slowly. ESC-15 ruled that this is the single most likely way a real user
meets an SR-4 regression, that a corporate user may be in that position without knowing it, and that the
store is therefore **machine-local and always**, located by a stable identifier that travels with the
workspace. This is not a preference; it is the removal of a total failure.

**The specification has since been amended for this and it now constrains the decision rather than
following it.** `REQ-SESSION-197` mints the workspace identifier: written into the workspace's `.rotaris/`,
human-readable, version-control-trackable, minted once, never changing "for any reason — not when the
workspace is moved, renamed, copied, or carried through a synchronising folder". `REQ-SESSION-198` makes the
store machine-local, unconditionally, and forbids making it conditional on detecting shared storage; it
requires that a workspace on a share or in a synchronising folder be **fully usable**, that the user's own
material stay exactly where they put it, that a session recorded on one machine not appear on another, and
that the per-session files of `REQ-SESSION-002` be held **with the store** rather than inside the workspace.
`REQ-SESSION-001` no longer anchors the record to a path: it requires one workspace plus one session id to
resolve to one record, and says the record lives in the workspace's machine-local store, "found through the
workspace identifier rather than through a path".

Five further edges are fixed before any alternative is weighed. Four survive from the previous version
unchanged; the fifth is new.

**A synchronous, durable flush with no asynchronous runtime.** `REQ-SESSION-068` requires the flush entry
point to be usable "from any caller's context, including one where no asynchronous runtime is active", and
`REQ-SESSION-070` requires a save carrying a terminal status not to return before that status "can be read
back by any other reader of the store". `REQ-SESSION-072` repeats it. **A binding whose only interface is a
promise cannot satisfy them.** The caller is a teardown path and there is no loop left to turn.

**Persist before publish, with no delay floor.** `REQ-MONITOR-221` requires every change to be persisted
before it is published to any view, and states in terms that this is satisfiable alongside
`REQ-MONITOR-218`'s ban on "any minimum wait, debounce, or delay floor of any size" only because
`REQ-SESSION-067` withdrew the ten-second debounce. Rows are written individually, so the collision is gone
— but persist-before-publish now rests on **a transaction commit**, and a commit's cost is therefore on the
publish path.

**One writer per session, and the ordering that follows.** `REQ-EVENTS-098` requires a session's history to
have at most one writer and makes the right to write it exactly the right to hold that session's lock; it
also requires that "a reader MUST NOT be able to delay or block the writer, and the writer MUST NOT be able
to make a reader fail; a store in which one blocks the other does not satisfy this requirement" — which
selects write-ahead logging as a conformance property and not as a tuning choice. `REQ-EVENTS-029` requires
each event to be made durable individually "at the moment it is raised and never in accumulated batches".

**The blast radius must be stated.** SR-4's own words: "a database file is a single corruption domain where
per-session directories lost one session at a time; scoping the database per workspace bounds the blast
radius, and that must be **stated in the decision record rather than assumed**."

**New: the store is not in the user's backup of their workspace.** SR-9(b). Under the file design, backing
up or synchronising a workspace backed up its session history. It no longer does: the workspace travels and
the sessions stay. Everything in the recovery section below has to be written for a store the user may never
have copied anywhere.

## Alternatives considered — the engine

**Unchanged by ESC-15, and preserved because the ruling changed the store's location, not its kind.** Each
candidate was checked against published documentation rather than recalled, at the date of the previous
version; nothing in this pass re-opened them.

**A — `better-sqlite3`.** Chosen. A synchronous SQLite binding for Node, published on the 12.x line and
maintained under `wiselibs/better-sqlite3`. Its entire API is synchronous by design, which is what
`REQ-SESSION-068`, `REQ-SESSION-070` and `REQ-SESSION-072` need. It exposes `db.pragma(...)` for
`journal_mode` and `synchronous`, and a `transaction()` wrapper with explicit `deferred`, `immediate` and
`exclusive` modes, which the writer-ordering rule below depends on. Its Electron cost is real and specific:
a native module must be rebuilt against the Electron ABI and, inside an `app.asar` bundle, unpacked, or it
fails at run time. Two facts decide it against the alternative with no such cost. ADR-0020 already takes
`node-pty` as a native module and calls ADR-0002's rebuild-and-unpack obligation load-bearing, so this adds
an entry to a matrix the build already maintains. And it pins the SQLite version the product ships, which a
system of record wants.

One compiled default must be overridden deliberately: the package is built with
`SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, so `synchronous` defaults to `NORMAL` in WAL mode. The durability
section below depends on setting the pragma rather than inheriting it.

**B — `node:sqlite` (`DatabaseSync`).** Genuinely close to being chosen: synchronous by construction, no
native build, no ABI rebuild, no asar unpacking. Rejected on two published facts. It is documented at
**Stability 1.2 — release candidate**, and this store is the product's system of record. More decisively,
its presence in Electron is not contractual — a shipped Electron release omitted the binding and
`require('node:sqlite')` failed, fixed only in a later release. A patch release of the shell removing the
module all of the product's state lives in is a supply risk with no fallback. Kept as the named fallback:
the data-access layer is thin and statement-shaped precisely so that swapping the binding is one module.

**C — `sqlite3` (`node-sqlite3`).** Rejected: an asynchronous callback interface fails `REQ-SESSION-068` and
`REQ-SESSION-070` directly, and the package is marked deprecated by its stewards.

**D — An embedded server-shaped engine.** Rejected. It contradicts `REQ-STARTUP-002`'s single-executable
rule and ADR-0002's "four process kinds, and no others", adds a second signing, update and lifecycle
surface, and buys concurrency the product does not need: at most two processes write one store.

## Alternatives considered — scope

**E — One store per session.** Preserves the file design's blast radius exactly. Rejected: it reinstates the
O(sessions) open-and-read that `REQ-SESSION-042` exists to avoid — that requirement now requires listing to
read "nothing but those listing records ... so the cost of listing grows with the number of sessions and
with nothing else" — a workspace-wide question (the improvement library of `REQ-LIBRARY-042`, delivery
records, the checkpoint index) has no store to live in, and it multiplies migration by the number of
sessions a user has ever run.

**F — One store for the whole installation.** Rejected, and the grounds have **shifted** under ESC-15 rather
than survived intact, which is worth showing. The previous version rejected it partly because "a workspace
copied, moved or deleted must take its sessions with it" — that clause is now **false and must not be
cited**: under `REQ-SESSION-198` a deleted workspace leaves its sessions on the machine, and a copied one
shares them. What survives is stronger than what was lost. First, blast radius: one store for every
workspace is one corruption domain for a user's entire history, and there is now no copy of it in the user's
own backup (SR-9(b)) to fall back on. Second, and new: **reclamation**. Machine-local storage accumulates
records for workspaces that no longer exist, and per-workspace scope makes reclaiming one workspace's whole
record a directory deletion the user can be shown and can confirm, where an installation-wide store would
make it row surgery.

**G — Two stores per workspace**, one written only by the run host and one only by the workspace service.
Better on two axes — no cross-process write contention, half the blast radius each. Not chosen, because SR-4
rules "database, one per workspace" and this record follows rulings. Recorded rather than discarded; it is
the first thing to reach for under *Revisit if*, and the split is invisible to every requirement, since
nothing joins a session row to a delivery record.

**H — One store per workspace.** Chosen, per SR-4.

## Alternatives considered — where "machine-local" is

**J — Inside the workspace, at `<workspace>/.rotaris/workspace.db`.** *This record's own superseded
decision, preserved in full because it was not a weak argument.* It put the store beside the configuration
the workspace already owns; it made a workspace self-contained, so copying, moving, backing up or deleting a
folder did the obvious thing to its sessions with no indirection and nothing to reclaim; it needed no
identifier, no resolution step and no second location to explain to a user; and it kept one session's record
whole in one place. It also had a stated, honest consequence: on a network share or inside a cloud-sync
folder the store is degraded.

**What killed it was not slowness — it was that "degraded" turns out to mean "no session can start".**
Write-ahead logging is unsupported on network filesystems, so the store opens read-only; `REQ-SESSION-046`
makes lock acquisition a write; `REQ-SESSION-089` and `REQ-EVENTS-084` as amended refuse the run rather than
degrading it, deliberately, because "running while quietly unable to persist anything produces work whose
record cannot be recovered". So the alternative's own consequence 3 was a **total outage of the product's
core function** on a configuration that is ordinary in corporate environments, and it was written down as a
limitation. ESC-15 read it correctly.

Two secondary properties of J are also worth recording as lost. It is a store a synchronisation client
writes to while the application has it open, which is a documented corruption vector for SQLite. And under
`REQ-CONFIG-013` the whole of `.rotaris/` is gitignored by default, so the store J placed there was never
in the user's version control anyway — J's apparent "it travels with your project" benefit was already
partial.

**K — Detect shared or synchronised storage and relocate only then.** Rejected, and `REQ-SESSION-198`
now forbids it in terms: "MUST NOT be made conditional on detecting that a particular workspace is on shared
storage: such detection is unreliable, and a second storage layout would be a second thing to get right on a
path where being wrong costs a user their history". OneDrive and Dropbox trees look like ordinary
directories; detection would have to be maintained against every client, and a conditional path is two
layouts to build, test and support. Note that the product *does* detect the condition — `REQ-STARTUP-166`
requires it, directly and not from a failure — but that detection drives **a warning about the user's own
files**, never a storage decision.

**L — The per-user roaming application-data directory.** Rejected, and this is the trap in "platform
conventional". `REQ-STARTUP-145` fixes per-user directories as the platform-conventional configuration and
data directories under the name `rotaris`, and on Windows the Electron default for user data is the
**roaming** `AppData` tree. A roaming profile is replicated between machines by the platform. Putting the
store there would re-create, through the operating system, exactly the multi-machine store ESC-15 removed —
and it would resurrect the condition `REQ-SESSION-054` now calls "evidence that the store itself is
reachable from more than one machine — a state that should not arise". The default must therefore be
overridden deliberately rather than inherited.

**M — Beside the artifact, or in the running image's directory.** Rejected outright, and now on measured
grounds rather than by taste. The packaged-first-paint spike established that the Windows onefile portable's
stub **deletes its extraction directory when the application exits**, so state cached there is destroyed on
every run; and a portable artifact must be able to run from read-only or removable media, which is its
purpose. SR-7 reached the same conclusion for the launch-preparation cache and put it in per-user local
storage "never beside the executable". The store follows the same rule for the same reason.

**N — A user-configurable store location.** Not chosen for the first release, and explicitly **not
foreclosed**: SR-9(b) names "a configurable store location, or an explicit backup action covering the whole
store" as the larger, structural answer to the backup problem and records that its minimum fix does not
close it off. Rejected here only because it is a second layout with a second set of failure modes, on the
path where being wrong costs a user their history — the same argument that rejects K — and because the
disclosure SR-9(b) actually mints is the cheaper honest step. It is a *Revisit if*.

**O — The per-user local (non-roaming) data directory.** Chosen.

## Alternatives considered — how a store is located

**P — By the workspace's resolved path, or a hash of it.** Rejected. It fails the first thing
`REQ-SESSION-197` requires: moving or renaming a workspace folder must preserve its sessions. It also
encodes a user's directory layout into a value that may end up in a bug report or a commit.

**Q — By something derived from the repository** (the initial commit id, a remote URL). Rejected on two
counts. It would make a **fresh clone resolve to the same identity**, which the reconciliation of
`REQ-SESSION-197` with `REQ-CONFIG-013` deliberately rules out — a clone mints its own identifier and starts
with an empty local history, "which is what `REQ-SESSION-198` requires of a machine that has not run the
workspace before" (`REQ-CONFIG-010`). And `REQ-GIT-044` allows a workspace Git cannot manage at all, which
would then have no identity.

**R — A stored identifier, minted once, read thereafter.** Chosen, per `REQ-SESSION-197`.

## Decision

### Engine, location and layout

**`better-sqlite3`, one store per workspace, held machine-locally in the per-user *local* (non-roaming) data
directory for `rotaris` (`REQ-STARTUP-145`), and located by the workspace identifier of `REQ-SESSION-197`
and never by path.** All access goes through one thin, statement-shaped data-access module so that
alternative B remains a one-module swap.

```
<per-user local data dir>/rotaris/workspaces/<identifier>/
    workspace.db                 the store; -wal and -shm beside it
    workspace.db.pre-<n>.bak     a pre-migration copy, transient (see schema evolution)
    sessions/<session-id>/       the per-session files of REQ-SESSION-002, held with the store
        debug.log                REQ-SESSION-142
        summary.md               REQ-SESSION-140, replaced under REQ-SESSION-033
        artifacts/…              artifact, attachment and image bodies (REQ-LIBRARY-087)
    origin.txt                   diagnostic only — see below
```

Three notes bind that layout.

1. **The per-session files sit under the store's directory because `REQ-SESSION-198` requires it**, "so that
   one session's record is never split across storage a synchronising client may reach and storage it may
   not". `REQ-SESSION-191`'s reveal action therefore opens a machine-local directory, and `REQ-SESSION-166`
   removes the session's record and this directory together.
2. **`origin.txt` records the workspace paths this store has been opened from, and the time of the last
   open. It is diagnostic and MUST NOT be consulted to resolve a store.** It exists so a user looking at
   this directory, or a reclamation surface listing it, can say which project it belongs to. Making it
   authoritative would reintroduce path-as-identity through the back door and would give two answers where
   `REQ-SESSION-197` fixes one.
3. **One directory is one workspace's whole record**, which is what makes reclamation a deletion the user
   can be shown rather than row surgery. This is alternative F's replacement argument and it is load-bearing.

The store directory is created on first open of an identifier. **An empty store is an ordinary state, not an
error** (`REQ-SESSION-043`: a workspace for which this machine holds no store at all produces an empty
list), and `REQ-SESSION-197` says the same from the other side.

### The workspace identifier

**Form.** A single plain-text token, `v1-` followed by 32 lowercase hexadecimal characters carrying 128 bits
from a cryptographic random source, matching `^v1-[0-9a-f]{32}$`. It is held in one small file in
`<workspace>/.rotaris/`, alongside `#`-prefixed comment lines stating what it is and that removing it
detaches the workspace from its recorded sessions; reading takes the first line that is neither blank nor a
comment, trimmed. Anything that does not match the pattern is **unreadable**, which is a defined condition
and not a licence to re-mint.

The form is chosen against `REQ-SESSION-197`'s own adjectives and against `REQ-CONFIG-477` ground 3, which
values these files being "diffable, mergeable, reviewable, copyable between machines, and quotable in a bug
report": it is short, it is legible, it is case-insensitively unique on the case-insensitive filesystems the
product supports, it is safe as a directory name on all three platforms, and it carries no information about
the user's machine or directory layout. The `v1-` tag exists so that a later change of form is a readable
distinction rather than an ambiguity. A hyphenated random value was preferred to a folder-name-derived one
because a name minted from a folder becomes a lie the first time the folder is renamed, and `REQ-SESSION-197`
guarantees renames.

**Minting.** Exactly once, when the product first prepares the workspace, by **exclusive create**. A create
that finds the file already present is not an error: the existing value is read and used. This is the same
primitive ADR-0004 gives the integration lock, and it is the mechanism form of `REQ-SESSION-197`'s "MUST NOT
mint a replacement over an identifier it can read".

**Never rewritten.** The product writes this file once and never again — not to normalise it, not to add a
field, not when opened by a different version. `REQ-SESSION-197` forbids the change and forward tolerance
follows: unknown extra lines are ignored and left in place.

**What it must survive, and what it must not.**

| Event | Identifier | Store | Why |
|---|---|---|---|
| Folder moved or renamed | travels | same store | the file moves with the folder; resolution is by identifier, not path (`REQ-SESSION-197`) |
| Folder copied | travels | **same store** | a copy is byte-identical; the identifier cannot distinguish itself from a move, and `REQ-SESSION-197` forbids re-minting over it. See the next section |
| Carried through a synchronising folder | travels | per-machine | a small text file syncs safely; each machine resolves its own store (`REQ-SESSION-198`) |
| Same workspace opened on a second machine | travels | **a second, separate store** | intended: "each machine keeps its own session history" (`REQ-SESSION-197`) |
| **Fresh clone** | **does not travel** | new, empty | `.rotaris/` is gitignored by default (`REQ-CONFIG-013`, `REQ-CONFIG-010`), so a clone mints its own and starts empty — deliberately |
| Opened by a different product version | unchanged | same store | `REQ-SESSION-197` forbids change for any reason |
| User commits the identifier themselves | travels through clones | shared identity | their choice; `REQ-CONFIG-010` states the ignore rule is "a default about what is staged by accident, not a prohibition" |

**An identifier that cannot be read.** The workspace opens; configuration, personas, model slots, the
requirement documents, Git and every file-backed capability work normally (`REQ-CONFIG-477`,
`REQ-TRACE-513`). No store is resolved, so no session lists and no run starts, refused on
`REQ-SESSION-089`'s terms with the reason naming the file, what it must contain, and **why the product will
not replace it** — replacing it would silently orphan every session recorded under the old value, which is
the harm `REQ-SESSION-197` names. The remedies offered are the user's: restore the file, or remove it and
accept a fresh history. Neither is taken automatically. This is the same instinct as `REQ-SESSION-183`'s
explicit, user-confirmed release.

### Two workspaces presenting the same identifier

A user copies a folder. Both copies carry the identifier, deliberately, and both resolve to one store. The
specification requires that outcome; what it does not settle is what happens when **both are open at once**,
and that is decided here.

**Sequentially — open one, close it, open the other — nothing happens and nothing may.** That case is
indistinguishable from a move, and `REQ-SESSION-197` requires a move to preserve the sessions. Any detection
that fired here would break the requirement it was written to serve.

**Concurrently, the identifier is claimed once per instance and the second workspace opens without a
store.** The instance keeps one claim per identifier — in main, beside the instance claim and the window
registry it already holds (ADR-0002) — and the workspace service that resolves an identifier takes that
claim before opening. A second workspace at a different path presenting a claimed identifier is admitted as
a workspace and refused a store, reporting the condition on `REQ-SESSION-089`'s terms: that this folder and
the already-open folder are, by the identifier both carry, one workspace; naming both paths and the
identifier; and stating that only the user may give one of them an identity of its own.

Three things decide this against simply sharing the store between the two windows.

1. **The hazard is not corruption, it is a run against the wrong tree.** Sessions record `workspace_root`
   (`REQ-SESSION-014`) and resume against it. Sharing the store would list, in the copy's window, sessions
   whose resume starts an agent writing files into the *other* folder. Silently doing work in a directory
   the user does not have open is a materially worse outcome than a window that lists no sessions and says
   why.
2. **It is the only shape that keeps the ownership rule structural.** Rule 1 below says no table has two
   writer processes. Two workspace services on one store are two writers of the workspace-scoped tables;
   the store's own transactions would keep them from corrupting each other, but "no two writers" would
   become a claim about SQLite rather than a property of the topology, and `REQ-EVENTS-098`'s single-writer
   discipline is exactly the thing SR-4 promised to keep structural.
3. **It is detectable at all only because of SR-1.** One instance per machine (`REQ-STARTUP-161`) is what
   makes a per-instance claim total. Across machines there is nothing to detect and nothing to do: the
   stores are separate by construction.

### Concurrency across ADR-0002's topology

| Process | Opens the store | Mode | Writes |
|---|---|---|---|
| **Run host** (one, all sessions) | yes | read-write | **session-scoped tables only**, and only for a session whose lock row it holds |
| **Workspace service** (one per open workspace) | yes | read-write | **workspace-scoped tables only** — delivery records, the improvement library, saved prompts |
| **Main** | no | — | — |
| **Renderers** | no | — | — |

**The workspace service is the only process that resolves an identifier.** It reads `.rotaris/`, takes the
instance claim, opens the store read-write once at workspace open — which performs any write-ahead-log
recovery a crash left, and which ADR-0005 depends on happening before any `query_only` read — runs
migrations, and then hands the **resolved store path** to the run host. The run host never reads the
identifier file. One resolver means the two processes cannot disagree about which store a workspace is.

**`REQ-GIT-128`'s workspace integration lock is not in this table and is not in the store.** It stays the
file `<workspace>/.rotaris/integration.lock`, by the requirement's own ruling, because what it protects is
the base repository — the user's material, which does travel with the workspace — so a second machine
reaching the same checkout must meet the same lock. It is the one lock in the product that is not
machine-local. ADR-0005 owns it.

Four rules make the table binding.

1. **No table has two writer processes.** Ownership is by table and it is structural rather than
   disciplinary: this is how `REQ-EVENTS-098`'s single-writer discipline survives the move. Holding the
   session's lock row is exactly the right to write that session's rows, and the run host is the only
   process that holds one. **Main never writes a session's record**, which is what ADR-0002 relies on.
2. **Ordering within a session is unchanged.** The run host serialises its own writes per session on the
   ordered queue ADR-0008 describes. A transaction makes several previously hand-enforced orderings free —
   `REQ-EVENTS-072`'s durable-record-before-wire-event and `REQ-TRACE-133`'s tombstone-before-artifact become
   "same transaction", `REQ-SESSION-028`'s all-or-nothing save becomes one commit, and `REQ-SESSION-133`'s
   "trim MUST take effect in the same durable operation that records the entry" becomes a `DELETE` in the
   inserting transaction — but **the obligations are still stated and still owned**. `REQ-EVENTS-072` says as
   much itself: where the store can make the record and the event one indivisible step it must, and where it
   cannot the ordering still binds.
3. **`journal_mode = WAL`, set at open and read back.** Readers never block the writer and the writer never
   blocks readers, which `REQ-EVENTS-098` states as a conformance property of the store and not as a
   preference. The pragma is read back, because SQLite silently keeps the previous journal mode when WAL
   cannot be enabled. **Under this decision a failure to enable WAL is no longer an expected condition**: the
   store is on local per-user storage. It is therefore treated as a fault — the store is reported unopenable
   with the engine's own reason, on `REQ-SESSION-089`'s terms — rather than as the degraded read-only mode the
   superseded version specified. The read-only path is gone with the case that produced it.
4. **Every write transaction is short, and begins `IMMEDIATE`.** `BEGIN IMMEDIATE` takes the write lock up
   front, so two writer processes contend at the start and fail fast rather than deadlocking on an upgrade;
   `busy_timeout` is a small bounded value. The workspace service is forbidden from holding a write
   transaction across an unbounded pass — `REQ-TRACE-073`'s project-supplied regular expressions and
   `REQ-TRACE-225`'s deliberately unbounded engine read run **outside** any transaction and land their
   results in one short commit. The reason is `REQ-MONITOR-218`: a transcript row must be published with no
   delay of any size, it must be committed first (`REQ-MONITOR-221`), and a long write transaction in the
   other process would make that commit wait.

### Durability, and what it costs

Two classes, because one setting cannot serve both a twenty-per-second publish path and a terminal-status
guarantee.

**Ordinary commits run at `synchronous = NORMAL`.** In WAL mode a commit at `NORMAL` writes the transaction
to the write-ahead log without an `fsync`; it survives a process crash, because the frame is in the log and
in the operating system's page cache, and it is immediately visible to any other process that opens the
store. It does not survive a power loss or an operating-system crash. That is exactly enough for
`REQ-MONITOR-221`, whose stated reason is that a view must not display what a resume would not restore — and
a resume reads this same store, in this or a later process — and for `REQ-SESSION-060`'s repair correction,
which must survive "the process dying again at once".

**`synchronous = FULL` is forced for two writes**, both named by the specification: a save carrying a
**terminal status** (`REQ-SESSION-070`, which requires the status to be readable by any other reader of the
store before the call returns), and an **explicit flush** (`REQ-SESSION-068`, `REQ-SESSION-072`, including
`REQ-SESSION-060`'s repair flush). The pragma is raised for the transaction and lowered after it. Both are
rare per session, so the `fsync` cost lands where a user is already waiting for a run to finish and never on
the row-publish path.

**`REQ-EVENTS-029` is honoured, not weakened.** One event, one commit, before the event is observable on any
channel; `NORMAL` in WAL keeps that true against the failure the requirement names — a run killed, a crash,
a force-quit — because a committed WAL frame is recovered on the next open. The requirement's own reason is a
readability property ("the durable record REQ-EVENTS-072 binds the event to is already written and readable
the moment the event can be observed"), and a committed WAL frame is readable by any other opener at once.

**One carve-out is carried across intact and must not be re-broadened.** Persist-before-publish binds
*changes*, and `REQ-MONITOR-219`'s 50 ms intra-row growth ticks are not changes with an event of their own:
`REQ-EVENTS-052` gives a row exactly two events and "none for any state in between". A growth tick therefore
publishes a row whose final form has not yet been recorded, deliberately. Cheap commits are not a reason to
start committing per tick, and per-token or per-tick commits are forbidden for the same reason
`REQ-MONITOR-219` forbids per-token publication.

**The cost, stated, and what is still unmeasured.** The publish path pays one WAL append and no `fsync` per
commit; at `REQ-MONITOR-219`'s coalescing tick that is at most twenty commits per second per live session,
plus one immediate commit per newly appearing row under `REQ-MONITOR-218`. The teardown path pays one
`fsync` per terminal status and per explicit flush, which must sit inside `REQ-MONITOR-255`'s quit
choreography rather than after it. WAL checkpointing is left on SQLite's automatic schedule; a checkpoint
`fsync`s, so it is the one background cost on the publish path, bounded by WAL size rather than by session
volume. **The commit is not yet measured on this path and the record should not pretend otherwise.** The
IPC-hop spike measured the run-host-to-main-to-renderer transport at single-digit-millisecond 95th
percentiles against `REQ-MONITOR-222`'s 250 ms and `REQ-ORCH-155`'s 100 ms, and states explicitly that it
excludes "the database commit `REQ-MONITOR-221` requires before publication", so every figure it reports is
a lower bound on the requirement's own interval. The margin is wide enough that a short local commit is very
unlikely to consume it; that is an expectation, not a measurement, and it is the first thing the
implementation instruments.

### Corruption domain, and recovery for a store nobody backed up

**Stated plainly: one file per workspace is one blast radius.** Under the file design a torn write cost one
session, or one document inside one session; under this decision it can cost every session in a workspace,
together with that workspace's delivery records and improvement library. That is a real reduction in fault
isolation, accepted for the ruling's benefits, and it is bounded four ways.

1. **Scope bounds it to one workspace.** Other workspaces are separate files in separate directories.
2. **The user's own material is never in it.** Requirement documents, baselines, the generated artifact and
   the retired-identifier log are files in the user's repository (`REQ-TRACE-513`); configuration, personas
   and model slots are files (`REQ-CONFIG-477`); credentials are individually protected files
   (`REQ-PROVIDER-016`); artifact, attachment and image bodies are files referenced by row
   (`REQ-LIBRARY-087`, `REQ-SESSION-002`). A destroyed store costs the record of what the product did. It
   never costs work the user authored, and the artifact bodies outlive the index that named them.
3. **A pre-migration copy exists** for the one operation most likely to cause the damage. See schema
   evolution.
4. **The exports are the user's own copy** — and under SR-9(b) they are now the *only* one. See below.

**What SR-9(b) changes about all of this.** A machine-local store is not in the user's backup of their
workspace. Backing up the project folder, pushing it to a remote, or letting a sync client replicate it
captures the repository, the configuration and the workspace identifier — and none of the session history.
On macOS a whole-machine backup does reach the per-user data directory; on Windows and Linux a
workspace-scoped backup does not, and the ordinary user has only the former by accident. Two consequences
follow and are stated rather than assumed.

- **The exports have changed role.** `REQ-EVENTS-166`, `REQ-SESSION-189`, `REQ-EVENTS-172` and
  `REQ-SESSION-199` were minted so a user could read their own records without this application. They are
  now also the only user-controlled durable copy of those records. SR-6 did not anticipate that and it does
  not make them a backup mechanism — `REQ-SESSION-199` forbids building a surface on repeating an export —
  but any decision that weakens or defers an export is now a decision about data loss.
- **The recovery ladder may not assume a copy exists.** Every step below is written on the assumption that
  what is in front of the user is the only copy there has ever been.

**Detection.** After an unclean shutdown the workspace service runs `PRAGMA quick_check` at open, which is
bounded. A full `PRAGMA integrity_check` is available only from an explicit user action, because it is
O(store) and must never sit on an open path — and the packaged-first-paint spike puts the whole pre-paint
budget on the passing artifact flavour at a few seconds against `REQ-STARTUP-155`, which is not a budget an
O(store) check belongs in. Store opening runs in the workspace service after the window is shown, on
`REQ-STARTUP-043`'s post-show activation, so it delays neither first paint nor the moment the interface
accepts input.

**Recovery, in order, and it never destroys anything.** On a store that will not open or fails
`quick_check`:

1. **Report the workspace store as unopenable**, naming the store path and the engine's own error unaltered
   — `REQ-EVENTS-084` requires exactly that of the run refusal, "so a user can act on the actual cause" —
   and never a generic failure.
2. **Offer salvage first**, attempting SQLite's own recovery over the damaged file **into a fresh store**,
   and reporting what it could not read. This is offered before anything else because it is the only step
   that can return history, and there is no backup behind it.
3. **Offer the exports of what salvage recovered**, before the user is asked to accept the loss of the rest.
4. **Offer to move the damaged store aside**, renamed with a UTC timestamp, and start an empty one, stating
   in terms that the sessions in it will no longer be listed and that this machine holds no other copy.

**The application never deletes a store and never repairs one in place.** That is the same instinct as
`REQ-CONFIG-192`'s "neither is rewritten, migrated in place, or deleted", applied one level up, and under
SR-9(b) it is no longer merely tidy: a store the application deletes is history that existed nowhere else.

### Reclaiming a superseded store

Machine-local storage accumulates. Three kinds of leftover exist and are handled differently.

**A pre-migration copy** is reclaimed by the product itself, at the next clean open at the migrated version.
It is the one leftover with a definite end of life.

**A store nobody references any more** — the user deleted the workspace folder, or replaced its identifier —
is reclaimed **only by an explicit, user-confirmed action**, from a surface listing the stores this machine
holds with each store's last-seen workspace paths (`origin.txt`), its size, its session count and when it
was last opened. Deletion offers the exports first.

**Automatic reclamation is refused**, and the reason is the whole point of ESC-15. The only signal available
is that a store's last-seen path no longer resolves — and a path fails to resolve when an external drive is
unmounted, when a share is down, and, above all, **when the folder has been moved**, which is precisely the
case the identifier exists to survive. Reclaiming on that signal would delete a user's history to punish
them for the operation the design was built to support. Age is no better: `REQ-SESSION-043` makes a workspace
that has not been run here an ordinary state, and ESC-9 already ruled retention unbounded.

This needs a specification surface it does not currently have; it is listed in this record's open items.

### Schema evolution

**1. Record payloads keep their own version field, unchanged.** Where a requirement fixes a `schema_version`
inside a record it stays a column on that record's row and is read exactly as specified.
`REQ-CONFIG-192` is carried verbatim: a delivery record whose `schema_version` exceeds the supported version
is reported as unsupported and not interpreted, is not rewritten, migrated in place or deleted, its
neighbours read normally, and the condition is reported in the three places the requirement names — the board
showing that requirement's delivery history as unavailable *for that reason*, the session log, and any
surface that reads delivery records — and "a workspace holding an unsupported record still opens and still
runs". A row is a better home for that rule than a file was, because skipping one row is cheaper than
skipping one file. `REQ-SESSION-013`'s persisted-state version is likewise a column, and `REQ-SESSION-038`'s
refusal of a higher version is a row-level refusal.

**2. The table schema is versioned by `PRAGMA user_version`, and migrations are forward-only.** Numbered
from 1, each migration is a single statement sequence inside **one transaction**, so a migration either
completes or leaves the previous schema in force; a half-migrated store cannot exist. Migrations run **only
in the workspace service**, at workspace open, **before the run host is told the workspace is open** — so no
second process is ever inside a schema change. The run host refuses to open a store whose `user_version` is
not the one it was built for; it does not migrate and it does not wait.

**Before any migration runs, the store is copied** with `VACUUM INTO` to `workspace.db.pre-<n>.bak` beside
it, kept until the next clean open at version `n`. This is the answer to the blast-radius question for the
one operation most likely to cause the damage, and under SR-9(b) it is the only copy that will exist. **A
copy that cannot be written aborts the migration**: the workspace opens at the old version with the reason
stated, rather than migrating without a way back.

**Downgrade, and a store newer than the application, are the same case with the same answer.** When
`user_version` exceeds the version this build supports, **the application refuses the store**: it does not
migrate downward, does not guess which columns it still understands, and **writes nothing to it** —
including no `user_version` — so a store opened by a newer build and then by an older one is returned
untouched. The refusal names the store path, the version it carries, the version this build supports, and
the one remedy: update the application. Downward migrations are not written, ever; the cost of maintaining a
reverse for every schema change is paid on every change and redeemed almost never, and a wrong one silently
destroys history.

**The workspace still opens.** Refusing the store refuses the *rows*. Configuration, personas, model slots,
the requirement documents, the generated artifact, the baselines, the retired-identifier log and the
credentials are all files (`REQ-CONFIG-477`, `REQ-TRACE-513`, `REQ-PROVIDER-016`) and are all still readable
and editable; version control is unaffected. A user who opens their project with an older build sees their
material and cannot see their session history — not a workspace that will not open.

**The honest cost, stated because it is a genuine regression.** Under files, one unsupported record sat
uninterpreted while its neighbours read normally — that is `REQ-CONFIG-192`'s whole point, and it is
preserved for records. Under a store, an unsupported **table schema** stops every row in the workspace at
once. Forward tolerance that was per-record for payloads is per-store for structure. Nothing recovers that;
it is inherent to having a schema, and it is why migrations are additive by policy: **a migration adds
tables and adds nullable columns, and does not drop or retype a column an older supported build reads**, so
`user_version` rises less often than the schema changes.

### What is not in the store

Repeated here because this is the file a reader will open to ask. The configuration a user edits, which
`REQ-CONFIG-477` now states as a boundary with four independently sufficient grounds; personas and model
slots; the requirement documents, the generated symbol artifact, the three baselines and the
retired-identifier log, which `REQ-TRACE-513` states as a boundary of its own; global configuration, the
discovery snapshot and desktop preferences, which are per-user and outlive any workspace; artifact,
attachment and image **bodies**, which are files beside the store, referenced by row, and **never blobs**
(`REQ-LIBRARY-087`); provider credentials, which stay individually protected files because
`REQ-PROVIDER-016` requires `0600` plus an explicit Windows access-control list, read back, and no row makes
that guarantee; `summary.md` and `evidence/debug.log`, which exist to be read by a human
(`REQ-SESSION-006`, `REQ-SESSION-140`, `REQ-SESSION-142`, `REQ-SESSION-191`); the workspace identifier
itself (`REQ-SESSION-197`) — a store cannot hold the thing that names it; and `REQ-GIT-128`'s integration
lock, which is a file in the workspace on purpose.

## Consequences accepted

1. **A native module returns**, with an Electron-ABI rebuild per version and architecture and asar
   unpacking. ADR-0054 and ADR-0056 already carry that obligation for `node-pty`; this widens it rather than
   creating it.
2. **Two writer processes share one write lock.** Contention is real, bounded by rule 4's short `IMMEDIATE`
   transactions, and it is the price of SR-4's one-per-workspace scope. It is measurable before
   implementation and it is what alternative G exists to fix.
3. **The superseded record's consequence 3 is withdrawn.** "A workspace on a network share or in a
   cloud-sync folder is degraded, not merely slow" is **no longer true and must not be cited**:
   `REQ-SESSION-198` requires such a workspace to be fully usable, and it is, because the store is not there.
   What replaces it is smaller and different: the user is *warned* about shared or synchronised storage by
   `REQ-STARTUP-166`, and the warning is about their own files and about a second machine working in the
   same folder — not about this store.
4. **A machine-local store is not in the user's backup of their workspace** (SR-9(b)). This is the largest
   new user-visible property in this record. The exports become the only user-controlled durable copy, the
   recovery ladder assumes no copy exists, and the product owes the user a disclosure. **The requirement
   SR-9(b) minted for that disclosure is not in the specification**; this record depends on it and it is
   listed as an open item rather than assumed.
5. **Storage the product owns accumulates outside the workspace, and only the user may reclaim it.** A
   deleted project leaves a store nothing points at. Automatic reclamation is refused for the reason above,
   so an inspect-and-delete surface is owed, and it does not exist in the specification yet.
6. **A second workspace presenting an already-open identifier opens without a store.** New behaviour,
   expressible in `REQ-SESSION-089`'s existing vocabulary but not itself stated by any requirement.
7. **`REQ-SESSION-089`'s graceful degradation is gone by ruling, and the amended requirement says so.** The
   event store, the session state and the lock are one object; there is no partial failure left. The
   previous version listed this as an amendment owed; it has landed, in `REQ-SESSION-089` and
   `REQ-EVENTS-084`, and they agree.
8. **A transaction removed a defect ESC-3 accepted, and the specification has absorbed it.**
   `REQ-LIBRARY-042` now requires the read-modify-write to "take effect as one indivisible step" and records
   its old concession as withdrawn "as unreachable, not as unimportant". ESC-18 ruled it; nothing here is
   outstanding.
9. **Indexes and query planning are ours to own.** `REQ-SESSION-042`'s listing — which now requires the cost
   to grow with the number of sessions "and with nothing else" — and `REQ-TRACE-239`'s 100 ms board budget
   are the two that must be measured against real indexes rather than assumed.
10. **Store paths are longer than workspace-relative ones.** A per-user data directory plus an identifier
    plus a session id plus an artifact name is a deep path on Windows; long-path handling is an obligation
    rather than an optimisation, and artifact body names are the part that varies without bound.

## Revisit if

`node:sqlite` reaches stable and Electron commits to shipping the binding — take alternative B and give back
the rebuild obligation. Or cross-process write contention, measured against `REQ-MONITOR-218`'s
no-delay-floor rule, proves real — take alternative G's two-store split, which no requirement can observe,
and note that ADR-0005 then has to say which of the two holds the lock table. Or the product owner takes
SR-9(b)'s larger option — a configurable store location, or an explicit whole-store backup action — in which
case alternative N returns and the disclosure requirement is no longer the whole answer. Or a requirement
appears that joins a session row to a workspace-scoped row, which would close alternative G off. Or the
commit cost on the publish path, once instrumented, turns out to consume a material share of
`REQ-MONITOR-222`'s budget, which would make the coalescing tick's commit shape a decision rather than a
consequence.
