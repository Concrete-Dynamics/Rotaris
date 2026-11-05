## A restore perform sent without `targetUnreadable` over a store that failed its check opens it and checkpoints its log

Noticed 2026-11-05 by R-091's hardening plan `hrdb` while building [PD-SESSION-005](../product/directives/pd-session-005.md#pd-session-005)'s
test over `packages/workspace/src/workspace.test.ts`'s corrupt fixture (the store's `sessions` root page overwritten, a live
`-wal` and no `-shm`, a lock row naming another machine).

The workspace service does not know that main holds its store as `workspace.store-corrupt`: the assessment learns it from the
request's `heldCorrupt`, and the perform only from its decision `targetUnreadable`. `performRestore` re-assesses with
`heldCorrupt: unreadableConfirmed`, so a `workspace.restore.perform` that arrives **without** `targetUnreadable` over a damaged
store is assessed as a readable one: `openStoreForInspection` opens it, and `restoreStore`'s own gate opens it read-write. On the
fixture, a perform with `{ identifier: 'workspace', proceedWithForeignLocks: false }` read the foreign lock row, was refused
`foreign-locks` (steps `1-refuse`, `2-liveness`, `4a-abandon`), and left the store's directory holding `workspace.db` alone,
no longer the bytes found: the open's close had checkpointed the log into the damaged file and deleted it — the very damage
OQ-477's ruling removed from this path.

Main's `restoreFlow` never sends that request: over an unreadable target it always sends `targetUnreadable`, and only after the
first question was answered Restore. So nothing in the product reaches it today; the guard is main's alone, and the service,
which owns the store, does not hold the invariant itself. A future caller of the perform, or a change to `restoreFlow` that
drops the flag, would open and alter a damaged store without a test going red.

## Specs

[OQ-477](../archive/architecture/open-questions/69-spikes-and-later-questions-36-continued-4.md#oq-477)'s ruling (nothing opens
the damaged target except C1's read-only check), [ADR-0058 part 11](../architecture/adr/0058-the-workspace-database/11-corruption-domain-and-recovery-for-a-store.md)
("never deletes a store and never repairs one in place"; the kept directory is salvage's input), and PD-SESSION-005, whose
reason rests on that invariant. The perform as main drives it meets all three; the service alone does not.

## Relevant files

- `packages/workspace/src/restore.ts` — `performRestore`: `assessRestore({ ...d, heldCorrupt: unreadableConfirmed })`, the
  held state taken from the decision alone.
- `apps/desktop/src/workspace-service/index.ts` — the `workspace.restore.perform` handler passes no held state; the service
  could hold one (main sends `heldCorrupt` with the assessment) or check integrity before any inspection.
- `apps/desktop/src/main/store-resolution.ts` — `restoreFlow`, the one caller, which sends `targetUnreadable` whenever the
  assessment reported `target.unreadable`.
- `packages/workspace/src/workspace.test.ts` — the corrupt fixture (`corruptInPlace`) on which the open was measured.
