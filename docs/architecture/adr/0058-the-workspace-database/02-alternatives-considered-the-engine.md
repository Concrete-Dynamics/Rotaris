# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Alternatives considered — the engine

Part 2 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

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

**That compile option is present, and its consequence as stated here is only half true.** Measured: the
compiled WAL default applies to a connection that opens a database **already in WAL mode**. The connection
that *creates* the store and switches it to WAL keeps `synchronous = FULL`. So the first session in a new
workspace would run every publish-path commit at `FULL` — measured 4.4× the `NORMAL` p50 — unless the
pragma is set explicitly. The decision was already right for the reason stated; what the measurement adds
is that setting the pragma is not belt-and-braces, and that the named fallback **B** carries the *opposite*
inherited default (`SQLITE_DEFAULT_WAL_SYNCHRONOUS=2` in the Electron build measured), so a swap that
relies on inheritance changes every publish-path commit from ~160 µs to ~667 µs.

**Two defects in the chosen binding were measured and belong on this record rather than in a spike alone.**
Neither reverses the choice; both are things an implementation must be built to avoid rather than
discover. First, `PRAGMA synchronous` set through a *prepared statement* is applied at prepare time and
the first step of that statement is a no-op — which silently ran an entire measurement pass at `NORMAL`
while it reported `FULL`. The pragma raise-and-lower this record specifies for terminal saves must
therefore go through the binding's direct-execution entry point, not through a prepared statement.
Second, and more serious: under Electron the binding **aborts its own process** when a `Statement` object
is garbage-collected, at a measured 3 of 30 launches (10 %) when statements are left to the collector,
and 0 of 30 when every statement is retained. It reproduces both under `ELECTRON_RUN_AS_NODE` and inside
a real `utilityProcess`, which is where ADR-0002 puts the run host — the one process that writes a
session's rows. The data-access module must retain every prepared statement for the life of the
connection and must route result-less pragmas through direct execution rather than the convenience
accessor that creates a transient statement per call. Recorded here because the module this record makes
"thin and statement-shaped" is exactly the module that has to hold them.

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
