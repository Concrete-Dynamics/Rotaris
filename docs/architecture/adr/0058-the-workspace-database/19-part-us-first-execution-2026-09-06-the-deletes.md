# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Part U's first execution — 2026-09-06, the delete's cascade, table by table

Part 19 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Part U's first execution — 2026-09-06, the delete's cascade, table by table

*Recorded under GD-10.*

**Verified:** `REQ-SESSION-166`'s delete is ONE statement in ONE durable transaction — `DELETE FROM sessions WHERE
session_id = ?` — and every table that carries a `session_id` declares `ON DELETE CASCADE` on it: `session_locks`,
`transcript_rows`, `events`, `launch_audits`, `timeline`, `permission_audit`, `tool_calls`, `issues`, `ring_state`,
`children`, `model_slot_queue`, `queued_prompts`, `checkpoints` — thirteen, plus `sessions` itself. `store.test.ts`
plants a row in each through the DAL, deletes the session on the **run host's kind of connection** (`openStore` on the
resolved file, never `migrateStore`) and asserts every table at zero for it and untouched for its neighbour; the proof
did the same against a real store through the browser, then read the fourteen tables from outside. No explicit
per-table delete was needed and no migration was taken. The per-session files (`sessions/<sid>/`) are removed after the
commit, errors ignored, so a failure there leaves files without a session rather than a session without a record.

**A reading, not a defect, stated so it is not rediscovered.** `foreign_keys` is a per-connection setting SQLite
leaves OFF, and the product set it only in `migrateStore` — the workspace service's connection, not the run host's. The
cascade nonetheless worked on the run host's connection because the bundled binding compiles SQLite with the default ON
(measured: a raw open reads 1) — a reliance nothing in this record stated. `openStore` now enables it on every writable
open and reads it back like WAL, refusing the open otherwise, so a rebuilt binding with the engine's own default cannot
silently orphan thirteen tables on the first delete. The first reading of this — that the cascade had been inert on the
run host — was falsified by the measurement and is kept in `open.ts` beside the corrected text.

**The layout table above says `debug.log`; the code writes `session.log`.** The appender in `run-host/tools.ts` and the
process view both name `session.log`; this record's tree is read as naming the same file. The `artifacts/…` line
describes a directory nothing writes yet (ADR-0003's note of the same date).

**Figures (`.sessions-proof/results.json`):** a session with two checkpoint refs deleted in 862 ms end to end (the
namespace deletion is two Git invocations through main and the workspace service; the transaction itself is
sub-millisecond); a session whose tree had vanished deleted in 2 ms with the warning logged; an isolated session's ref
deleted from the shared repository's namespace. A records export of a capped audit (5 000 entries) wrote 2.19 MB in 54
ms; a two-document trajectory batch wrote 6.3 kB in 2 ms.
