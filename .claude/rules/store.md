---
paths:
  - "packages/store/**/*.ts"
  - "packages/workspace/src/{backup,restore}.ts"
---

# The session record

One writer, one migrator, one version.

- **Append a `Migration` to `MIGRATIONS`; never edit one that has shipped.** `to` is the next integer,
  and `CURRENT_SCHEMA_VERSION` is *derived* from the last entry — writing it by hand is a defect.
- `migrateStore` runs each migration **in one transaction and bumps `user_version` inside it**, so a
  crash leaves a whole version rather than half of one.
- **Only the workspace service migrates** (W-02). The run host opens and writes; it never migrates.
  A store **newer** than the build is neither touched nor refused there (ADR-0058) — opening is the
  caller's decision.
- **An index you declare is not an index the planner uses.** Assert the query plan in a test. A dead
  index was the fifth first-execution defect, and it cost a mechanism that read as working.
- A row that must survive a restore is also `backup.ts` and `restore.ts` work; the corrected restore is
  measured (IC-1), so change it against that measurement, not against intuition.

Ordered edit path: `docs/architecture/views/04-seams.md` §3, then the runtime view's §7 table, which
records which version added a column.
