# Seams — what to touch, in what order, to add one of the things this product adds most often — 3. A store table or column

Part 3 of 8 of [the seams](../04-seams.md), which indexes every part.

## 3. A store table or column

One writer, one migrator, one version.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/store/src/schema.ts` | a new `Migration` **appended** to `MIGRATIONS`, `to` = the next integer. Never edit a migration that has shipped |
| 2 | `packages/store/src/dal.ts` | the read and write |
| 3 | `packages/engine/src/session-writer.ts` | only if a run writes it — the writer is the run's one way in |
| 4 | `packages/store/src/backup.ts`, `restore.ts` | only if the row must survive a restore |
| 5 | `docs/architecture/views/03-runtime-view.md` §7 | the row in the table, saying which version added it |

Invariants:

- `migrateStore` runs each migration **in one transaction and bumps `user_version` inside it**, so a crash
  leaves a whole version. `CURRENT_SCHEMA_VERSION` is derived from the last entry — never written by hand.
- A store **newer** than the build is not touched and not refused there (`ADR-0058`); what that means for
  opening is the caller's decision.
- **Only the workspace service migrates** (W-02). The run host opens and writes; it never migrates.
- **An index you declare is not an index the planner uses.** Assert the query plan in a test — a dead index was
  the fifth first-execution defect and it cost a mechanism that read as working.

---
