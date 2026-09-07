import { LIBRARY_CHANGES, type LibraryChange } from '@rotaris/contracts';

/**
 * Part X — the library-change counter (`REQ-LIBRARY-105`), held in main because main is the one process every
 * window's broadcast leaves from.
 *
 * The requirement closes the definition to exactly four things and then says the case it is worried about out
 * loud: "A settings change that touches none of them — enabling a tool server, switching a skills mode, changing
 * a model slot — MUST NOT count as a library change, MUST NOT write the stored prompts, and MUST NOT rebuild the
 * Library's tables." That is enforced HERE by the argument's type rather than by discipline at each call site:
 * `bump` takes a `LibraryChange`, the union has four members, and none of them names a setting, so the settings
 * paths cannot bump the counter even by accident. `library.test.ts` asserts the vocabulary and the arithmetic;
 * that a settings write does not reach `bump` is a fact about the type, checked by `pnpm typecheck`.
 *
 * The counter only ever rises, and it starts at 0 so that the first change a window sees is a move. It is per
 * application run and not persisted: a surface reads the store when it mounts, so a restart is a fresh read and
 * a revision that survived would tell a new window nothing it did not already have.
 */
export interface LibraryRevision {
  /** The current revision. Every window that has seen this number is up to date. */
  readonly value: number;
  /** Record a library change; returns the new revision. */
  bump(change: LibraryChange): number;
}

export function createLibraryRevision(onChange?: (revision: number, change: LibraryChange) => void): LibraryRevision {
  let revision = 0;
  return {
    get value() {
      return revision;
    },
    bump(change: LibraryChange): number {
      // The runtime guard exists for a value that crossed a boundary as a string; in-process callers are typed.
      if (!LIBRARY_CHANGES.includes(change)) return revision;
      revision += 1;
      onChange?.(revision, change);
      return revision;
    },
  };
}
