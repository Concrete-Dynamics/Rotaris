## A refused restore leaves write-ahead files in the target store directory

The restore's assessment (`assessRestore`, `packages/workspace/src/restore.ts`) reads the target store through a
**read-only** open (`openStore(targetFile, { readonly: true, mustExist: true })`). The store is write-ahead logged, so the
engine creates `workspace.db-wal` and `workspace.db-shm` beside it when that connection first reads, and a read-only
connection cannot checkpoint and remove them when it closes. A target store that was closed cleanly holds only
`workspace.db` (the last read-write connection's close removes both files); after an assessment, and so after every
restore the user is asked about and then refuses or the product refuses, it holds both files it did not have before.
No row is written and no data changes. ADR-0058 measured it on 2026-09-02 (D8: `-shm` 32,768 B, `-wal` 0 B, before and
after) and stated it in consequence 18 rather than repairing it; it met the IC-1 harness a second time, uninvited.

Measured again on this host on 2026-10-13 (`better-sqlite3` 13.0.3 under Node 24): a read-only open of a cleanly closed
write-ahead store leaves `[workspace.db, workspace.db-shm, workspace.db-wal]` after its close; a read-write open leaves
`[workspace.db]`, its close being the last. The restore's own gate (`restoreStore`'s step 2 and 4 connection,
`packages/store/src/restore.ts`) is a read-write open and therefore leaves nothing of its own: its close is the last one
in every path once step 3 has closed the run host's, and on an abandon before that the run host's connection holds the
two files already. The item's wording ("the gate's read-only open") names the assessment's open; the restore's own is
not read-only.

## Specs

None contradicted. `REQ-SESSION-201` ("a restore that fails for any reason MUST leave the store exactly as it was") is
met for the store's contents; what is not met is ADR-0058's own sentence that the gates before the swap touch nothing
in the target, which consequence 18 states as D8.

## Relevant files

- `packages/workspace/src/restore.ts` — `assessRestore`, the read-only open of the target store.
- `packages/store/src/open.ts` — `openStore`, the read-only branch that sets nothing and so cannot clean up.
- `packages/store/src/restore.ts` — `restoreStore`'s gate connection (read-write) and the header comment naming D8 open.
- `packages/store/src/layout.ts` — `SIDECAR_PATTERN`, the two file names.
- `docs/architecture/adr/0058-the-workspace-database.md` — consequence 18 (D8), and consequence 17's harness note.
