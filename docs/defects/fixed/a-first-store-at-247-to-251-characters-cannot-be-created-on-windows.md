## A first store at 247 to 251 characters cannot be created on Windows

**Repaired 2026-10-15** (the owner's ruling that day: repair it). `firstStoreSibling` names the sibling for the identifier's
random part, `.<32 hex>`, two characters shorter than the place, so its `workspace.db` never crosses the engine's limit before
the live store's would; `legacyFirstStoreSibling` keeps the earlier `.<identifier>.new`, which the next open removes as well;
and `installFirstStore`'s cleanup can no longer replace the error it follows. Red before on this host (the D11 case at 251, in
its seed); green after, `store.test.ts` whole (108 passed), with the sibling's pin amended (length −2, not +5) and a case for
the legacy name; `store-resolution-proof`'s sibling check reads both names. Not run: the store-resolution proof itself (the
built app; the session's G1 sweep runs it).

Found 2026-10-15 by the full suite on Windows 11 ARM64 (build 26200.9457), Node 24.18.0 arm64, Electron 44.1.1 arm64, dev
tree, pwsh 7.6.7, `LongPathsEnabled` 0, at `b9e30052` (A1 of the Windows ARM64 session). `store.test.ts`'s D11 case "a live
store at 251 characters is refused before step 1 …" goes red in its seed, before the restore it tests is reached: the seed's
`openWorkspaceStore` throws `EPERM, Permission denied: \\?\…\.v1-<id>.new`.

OQ-281 (ruled 2026-10-14) makes a first store whole in a dot-prefixed sibling, `.<id>.new` (`firstStoreSibling`), and renames
it into its place. The sibling's name is five characters longer than the place's, so its `workspace.db` is five characters
longer than the live store's will be. D11 measured the engine's limit on Windows at 251 characters of database path
(`storePathLimit('win32')`). A scratch probe of `openWorkspaceStore` at live lengths of 240 to 251 on this host:

| live `workspace.db` path | sibling's `workspace.db` path | outcome |
| --- | --- | --- |
| 240, 245, 246 | 245, 250, 251 | created; only `v1-<id>` left in the root |
| 247, 248, 250, 251 | 252, 253, 255, 256 | throws `EPERM` naming the sibling; `.v1-<id>.new` left in the root, not removable until the process exits |

So a workspace whose store path is 247 to 251 characters long, within the limit D11 sets for a live store, can never be
opened on Windows. And the error the caller sees is not the engine's refusal: `installFirstStore`'s `catch` runs
`rmSync(sibling, …)` before rethrowing, the failed open still holds a handle on the sibling's file, the removal throws
`EPERM`, and that exception replaces the one the `catch` was about to rethrow. The sibling stays behind (OQ-281 says the
next open removes it; that open fails the same way).

Not repaired (record-only). E1 of the session measures the engine boundary itself.

## Specs

OQ-281's ruling (the first store made beside its place, the place never present without a store), ADR-0058 consequence
18 (D11: the engine's path limit, the store refused before step 1 only where a store it would create crosses it), and
REQ-SESSION-043 (a workspace's store is created at its first open). A live path the limit admits cannot be created.

## Relevant files

- `packages/store/src/resolve.ts` — `installFirstStore`: the sibling's `openStore`, and the `catch` whose cleanup throws over
  the cause.
- `packages/store/src/layout.ts` — `firstStoreSibling` (`.${id}.new`) and `storePathLimit`.
- `packages/store/src/store.test.ts` — the D11 case at 251 whose seed throws.
