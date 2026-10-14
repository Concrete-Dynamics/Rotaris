## A first store open killed between making its place and its file leaves an empty place

`openWorkspaceStore` (`packages/store/src/resolve.ts`), for a workspace this machine has never run, makes the place
(`mkdirSync(<workspaces>/<id>)`) and only then has the engine create `workspace.db` in it, migrate it and write
`origin.txt`. A process killed, or a create that fails, between the two leaves the place present and holding no store:
exactly REQ-SESSION-202's condition, which the next open refuses as `workspace.store-missing` although nothing was ever
recorded there. The window is microseconds on a healthy disk and was never measured; OQ-281 named it ("the open itself makes
the place before the engine creates the file in it") and its ruling closes it. Recorded 2026-10-14 by fin44.

## Specs

`REQ-SESSION-202`: "A place that is itself absent is an absence and not this condition"; the product must not itself produce
the condition it then refuses. `REQ-SESSION-043`: where nothing is kept, the open creates the store. OQ-281, ruled 2026-10-14
under R-072: "a first store is created in a sibling directory and renamed into place".

## Relevant files

- `packages/store/src/resolve.ts` — `openWorkspaceStore`'s absent-place branch: `mkdirSync`, then the creating open.
- `packages/store/src/store.test.ts` — the open block.

## Outcome — repaired 2026-10-14 (fin44, `fin44-store-resolution`; OQ-281 ruled under R-072)

`openWorkspaceStore`'s absent-place branch (`installFirstStore`, `packages/store/src/resolve.ts`) now makes the store whole in a
dot-prefixed sibling, `.<identifier>.new` (`firstStoreSibling`, `packages/store/src/layout.ts`, five characters longer than the
identifier's name): created, migrated, closed and its spelling forgotten, `origin.txt` written; then renamed to `<identifier>`,
retried up to five times 50 ms apart on `EPERM`/`EBUSY`, and opened with `mustExist`. Where the place appeared meanwhile the
sibling is discarded and the open proceeds over what is there (a store opened, an empty place refused); a failed create removes
the sibling; a stray sibling left by a cut open is removed at the identifier's next open, however the place is found
(corrected at review: it was swept only by the next first-store attempt, so a place that came back by another way kept it for
good; `store.test.ts`'s "swept at the identifier's next open" case, red before). The place therefore never
exists without a store in it on account of the open: a cut leaves it absent, which the next open creates (REQ-SESSION-043).
Every scan of the workspaces root skips dot-prefixed entries (`displacedUnder`, `packages/store/src/recover.ts`; the proofs'
`findDatabases`, `apps/desktop/scripts/lib/harness.mjs`). Pinned by `packages/store/src/store.test.ts`'s OQ-281 first-store
block, all five cases red on the old open; `pnpm store-resolution-proof` checks no sibling is left by its launches, and
`pnpm restore-kill-proof` (10 of 10) still puts a cut restore's store back at the next open.
