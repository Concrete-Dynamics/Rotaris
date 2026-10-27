# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Decision

Part 8 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Decision

### Engine, location and layout

**`better-sqlite3`, one store per workspace, held machine-locally in the per-user *local* (non-roaming) data
directory for `rotaris` (`REQ-STARTUP-145`), and located by the workspace identifier of `REQ-SESSION-197`
and never by path.** All access goes through one thin, statement-shaped data-access module so that
alternative B remains a one-module swap.

```
<per-user local data dir>/rotaris/workspaces/
    <identifier>/                            the live store for one workspace
        workspace.db                         the store; -wal and -shm beside it
        workspace.db.pre-<n>.bak             a pre-migration copy, transient (see schema evolution)
        sessions/<session-id>/               the per-session files of REQ-SESSION-002, held with the store
            debug.log                        REQ-SESSION-142
            summary.md                       REQ-SESSION-140, replaced under REQ-SESSION-033
            artifacts/…                      artifact, attachment and image bodies (REQ-LIBRARY-087)
        origin.txt                           diagnostic only — see below
    <identifier>.restoring-<n>/              a restore staging directory: consumed by the install; deleted by the
                                             restore on every failure that leaves the store as it was (OQ-265,
                                             2026-10-14); kept and reported after a failed reversal; left by a
                                             killed process (OQ-266); cleared by the next restore's step 6
    <identifier>.displaced-<UTC timestamp>/  a store set aside by a restore or by the recovery ladder;
                                             never deleted by the product (see the restore, and recovery)
```

*(The staging line read "a restore staging directory, transient" until 2026-10-14, while no step deleted it — D5,
consequence 18; it now states when the copy is deleted.)*

The three siblings are all one directory level up from the store deliberately: a displaced store is a
whole store, it must be reclaimable by the same surface that reclaims any other, and it must not sit
inside the store that replaced it where a later reclamation would take both.

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
machine-local. ADR-0005 owns it, and under ESC-21 it now also owns what happens where the workspace sits
inside a file-synchronisation agent's tree and exclusive create stops being exclusive — a hazard that
reaches that lock and, because of `REQ-SESSION-198`, reaches nothing in this store.

Six rules make the table binding. Rules 5 and 6 were added on 2026-09-02 against measurement — 5 was
carried inside rule 4 and is promoted because it turned out to be the load-bearing one, and 6 is new.

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
3. **`journal_mode = WAL`, set at open, read back, and then *proved with a write*.** Readers never block
   the writer and the writer never blocks readers, which `REQ-EVENTS-098` states as a conformance property
   of the store and not as a preference. **Under this decision a failure to enable WAL is no longer an
   expected condition**: the store is on local per-user storage. It is therefore treated as a fault — the
   store is reported unopenable with the engine's own reason, on `REQ-SESSION-089`'s terms — rather than as
   the degraded read-only mode the superseded version specified. The read-only path is gone with the case
   that produced it.

   **The read-back stays, and this record's claim that it is sufficient is withdrawn as measured false.**
   The stated reason for it is real and confirmed: SQLite does silently keep the previous journal mode when
   WAL cannot be enabled, and the read-back catches that. It is **necessary and not sufficient**.
   Counter-examples were measured in which `PRAGMA journal_mode = WAL` **returns `wal`**, the read-back
   **returns `wal`**, the shared-memory file **exists at the expected 32,768 B**, the connection reports
   itself writable — and the next statement throws (`SQLITE_IOERR_IN_PAGE` on a mapped network drive;
   `SQLITE_CANTOPEN_ISDIR` where the shared-memory name is unavailable). **No pragma read can catch that.
   Only a write can.**

   So the open sequence is: set the pragma, read it back, then execute a **write probe** — one trivial
   statement that dirties a page, inside a `BEGIN IMMEDIATE` transaction that is rolled back. It leaves no
   row. Its cost is one short transaction on a path that already runs after first paint
   (`REQ-STARTUP-043`), bounded by the ordinary commit figures measured below (p50 179–220 µs). A store
   that fails the probe is unopenable and is reported as such.

   **The first thrown statement after a successful open is fatal and is never retried, and that is the
   whole point of the rule.** Measured: a WAL store opened over a mapped drive threw on the first
   `PRAGMA` in **30 of 30 opens**, and if the throw was swallowed, **6,000 of 6,000 subsequent commits
   succeeded with zero rows lost**. That is a 100 %-reproducible loud failure sitting in front of a store
   that appears to work, and the natural implementation — probe, catch, retry — runs fine and never reports
   it. That is the silent degradation `REQ-EVENTS-084` exists to forbid, reached by a route the load-error
   obligation above does not cover.

   **Where that failure belongs, decided here because nothing else draws the line.** `REQ-EVENTS-084`
   governs "opening the store only"; `REQ-EVENTS-088` governs a write that fails *during* a run. A
   first-statement failure after a clean open falls between them as written. **This record draws it at the
   probe:** the open, the pragma, the read-back and the write probe are one indivisible *opening* for
   `REQ-EVENTS-084`'s purposes, and its result is what `REQ-SESSION-089` reports. `REQ-EVENTS-088` begins
   only after the workspace service has declared the store open and handed the resolved path to the run
   host. The boundary is architecture-invented on a specification silence and is flagged as such in
   consequence 14.

   **`locking_mode = EXCLUSIVE` is refused, explicitly, so it is not re-derived as a fix.** It is the
   obvious remedy for an awkward filesystem, it is documented, and it was measured to make WAL work with no
   shared memory at all — reads and writes both, on local and UNC paths. It is nevertheless incompatible
   with this record: the process table above puts **two** writer processes on one store, exclusive locking
   mode requires the connection to be the only one accessing the database, and other connections then get
   `SQLITE_BUSY`. Recording the refusal is cheaper than re-deriving it under pressure.
4. **Every write transaction is short, and begins `IMMEDIATE`.** `BEGIN IMMEDIATE` takes the write lock up
   front, so two writer processes contend at the start and fail fast rather than deadlocking on an upgrade.
   `busy_timeout` is a small bounded value **and is never zero**: measured at zero against a
   rule-5-violating reader, **2,967 of 3,000 commits raised `SQLITE_BUSY`** — the run host could not
   persist and therefore, under `REQ-MONITOR-221`, could not publish at all — while the reader was starved
   in its turn, taking 97 `SQLITE_BUSY` in 98 attempts. Two processes thrash. The timeout's only job is to
   absorb contention from a *compliant* reader, which costs sub-millisecond (rule 5); at 5,000 ms every
   compliant condition measured produced **zero** `SQLITE_BUSY` and zero writer errors.
5. **The workspace service never holds a write transaction across a long read. Promoted to a rule of its
   own, because it is what keeps `REQ-MONITOR-218` true and it now has a number.** *(Stated inside rule 4
   until 2026-09-02; citations of "rule 4" for this prohibition resolve here.)* `REQ-TRACE-073`'s
   project-supplied regular expressions and `REQ-TRACE-225`'s deliberately unbounded engine read run
   **outside** any transaction and land their results in one short commit. The reason is `REQ-MONITOR-218`:
   a transcript row must be published with no delay of any size, it must be committed first
   (`REQ-MONITOR-221`), and a long write transaction in the other process makes that commit wait.

   **Measured, breaking this rule costs exactly what the rule says it costs.** A reader holding a 200 ms
   write transaction turned one of the run host's commits into **205.4 ms — 82 % of `REQ-MONITOR-222`'s
   entire 250 ms budget, in one commit, before the transport had done anything.** A 50 ms hold produced a
   61.8 ms commit. And a reader holding 200 ms write transactions back to back with no gap starved the
   writer indefinitely: 3,000 commits did not complete in 300 seconds and the run was killed. By contrast a
   **compliant** reader — reading all ~13,000 transcript rows back to back, 147–1,603 ms per pass, 47,695
   to 82,405 rows over the run — roughly doubled the writer's median commit and tripled its p95 (163.6 →
   345.9 µs p50, 271.7 → 898.9 µs p95) with **zero errors and zero `SQLITE_BUSY`**, and never blocked it.
   The difference between those two readers is this rule. It is load-bearing, not hygiene.

   **This is also the one way the product can manufacture the delay floor `REQ-MONITOR-218` forbids.** The
   requirement bans a floor "of any size"; nothing on the publish path applies one, and the commit is work
   rather than waiting. A second process holding a write transaction converts the commit into a wait of
   exactly that transaction's length — a floor the product did not choose but a user would experience.
6. **One store, one canonical path spelling, resolved once. New, and it exists to prevent a measured
   silent-loss mode.** Where one database file is reached through two different spellings — a UNC path and
   a mapped drive letter, a substituted or symlinked path and its target, two casings on a
   case-insensitive filesystem — the two openers do not share one write-ahead-log index, and the result is
   **silent partial loss with a clean `integrity_check`**: 20 of 20 trials wrong, 11 losing rows while both
   writers reported full success, and in the reader's view **18,776 polls in which a reader never once
   observed the other writer's commits**, with 55 of 800 rows surviving. That is `REQ-EVENTS-098` failing —
   "the writer MUST NOT be able to make a reader fail" is not what breaks; what breaks is that the reader
   and the writer are not looking at the same history at all, and nothing reports an error. It needs no
   second machine.

   The topology above already prevents it, and until this revision it prevented it **by accident**. Stated
   as intent: the workspace service is the only process that resolves an identifier, and the path it hands
   the run host is a **fully canonicalised** one — mapped network drive letters unmasked to their universal
   name, drive substitutions and symbolic links and junctions resolved, case normalised where the
   filesystem is case-insensitive. **No other process derives a store path**, from the identifier or from
   anything else, and no store path is accepted from configuration or the environment — which ESC-19's
   refusal of a configurable location already forbids for a different reason. The store's `-wal` and `-shm`
   are opened by the engine relative to the database path, so one canonical database path is sufficient for
   all three files.

   **And a resolved store path that is not machine-local is refused rather than opened.** `REQ-SESSION-198`
   requires the store to be "held in this machine's own per-user storage, never anywhere the workspace's
   own location may be synchronised or shared from"; a per-user local data directory that resolves to a
   share or sits inside a synchronising client's tree is that requirement's premise failing, and the
   product must not proceed on a premise it can cheaply check. The check is the same pair of platform calls
   `REQ-STARTUP-166` already requires for the workspace, run once at store resolution against the
   **store's** path, and measured at p50 0.10–1.83 ms and p95 ≤ 2.87 ms. The refusal is on
   `REQ-SESSION-089`'s terms, naming the resolved path and what was detected, and it states that the store
   location is not configurable so the remedy is the user's environment.

   Three things about that refusal are stated rather than left to be discovered. It is a **different
   determination** from `REQ-STARTUP-166`'s, which is about the workspace directory and drives a warning
   about the user's own files; this one is about the store's own directory and drives a refusal, and
   confusing the two would put a refusal on the wrong path. The classification has a **blind spot** — it
   sees synchronisation clients that register with the platform's sync-root API and is blind to a folder
   replicated by a scheduled copy job, which is indistinguishable from an ordinary directory — so the
   refusal is a floor and not a guarantee, and rule 6's canonicalisation is what defends the case the
   classification misses. And it is **reversible**: if the refusal turns out to fire on a configuration
   users legitimately have, the alternative is the same detection driving a warning, and the argument for
   refusal is that the failure it prevents is silent, passes every integrity check, and destroys the store
   outright in the write-back direction (4 of 4, zero errors reported).
