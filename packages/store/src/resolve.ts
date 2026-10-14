import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintWorkspaceId, parseWorkspaceId, type WorkspaceId } from '@rotaris/kernel';
import { exclusiveCreate, guardedRead, WORKSPACE_ID_FILE, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { firstStoreSibling, ORIGIN_FILE, restoreJournal, STORE_FILE, storeDir, storeFile } from './layout.js';
import { migrateStore, type MigrateOutcome } from './migrate.js';
import { forgetSpelling, openStore, type StoreHandle } from './open.js';
import { recoverCutRestore, type CutRestore } from './recover.js';

/**
 * Only the workspace service resolves a workspace identifier (W-18). It
 * reads `<workspace>/.rotaris/workspace-id` — minting one by exclusive
 * create where nothing is there, and NEVER minting over one it can read
 * (REQ-SESSION-197, D-29) — then opens the store the identifier names,
 * read-write, once, migrates it, and hands the RESOLVED PATH to the run host.
 *
 * A present-but-unreadable identifier is reported, not repaired: it is the
 * one file whose loss orphans a user's whole session history (ADR-0003 #6).
 */
export type IdentifierOutcome =
  | { readonly state: 'readable'; readonly id: WorkspaceId; readonly minted: boolean }
  | { readonly state: 'unreadable'; readonly raw: string };

const HEADER = '# This file names this workspace to its machine-local session store.\n# Removing it detaches this workspace from its recorded sessions.\n';

export type IdentifierRead =
  | { readonly state: 'readable'; readonly id: WorkspaceId }
  | { readonly state: 'absent' }
  | { readonly state: 'unreadable'; readonly raw: string };

export const WORKSPACE_ID_HEADER = HEADER;

export function workspaceIdFile(workspaceRoot: string): string {
  return join(workspaceRoot, WORKSPACE_SCOPE_DIR, WORKSPACE_ID_FILE);
}

/** Read without minting — what a restore's assessment needs (ADR-0058's identifier cases). */
export function readWorkspaceId(workspaceRoot: string): IdentifierRead {
  const decode = (raw: string) => {
    const line = raw.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0 && !s.startsWith('#'));
    const id = line ? parseWorkspaceId(line) : undefined;
    if (!id) throw new Error('not an identifier');
    return id;
  };
  const r = guardedRead(workspaceIdFile(workspaceRoot), decode);
  if (r.state === 'readable') return { state: 'readable', id: r.value };
  if (r.state === 'unreadable') return { state: 'unreadable', raw: r.raw };
  return { state: 'absent' };
}

export function establishWorkspaceId(workspaceRoot: string): IdentifierOutcome {
  const file = join(workspaceRoot, WORKSPACE_SCOPE_DIR, WORKSPACE_ID_FILE);
  const decode = (raw: string) => {
    const line = raw.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0 && !s.startsWith('#'));
    const id = line ? parseWorkspaceId(line) : undefined;
    if (!id) throw new Error('not an identifier');
    return id;
  };
  const existing = guardedRead(file, decode);
  if (existing.state === 'readable') return { state: 'readable', id: existing.value, minted: false };
  if (existing.state === 'unreadable') return { state: 'unreadable', raw: existing.raw };
  const fresh = mintWorkspaceId(randomBytes(16).toString('hex'));
  const r = exclusiveCreate(file, `${HEADER}${fresh}\n`);
  if (!r.ok) throw new Error(`workspace identifier: ${r.error.headline}`);
  if (r.value.minted) return { state: 'readable', id: fresh, minted: true };
  // Lost the race to another process: use what is there.
  try {
    return { state: 'readable', id: decode(r.value.existing), minted: false };
  } catch {
    return { state: 'unreadable', raw: r.value.existing.slice(0, 200) };
  }
}

export interface ResolvedStore {
  readonly id: WorkspaceId;
  readonly dir: string;
  readonly file: string;
  readonly db: StoreHandle;
  readonly migration: MigrateOutcome;
  /** OQ-266: a restore cut between its renames, reversed by this open before anything was created; main says so once. */
  readonly cutRestore?: CutRestore;
}

/**
 * REQ-SESSION-202 / W-31 (1): the place for this workspace's store exists and the store is not in it. It counts as a store
 * that could not be opened: nothing is created there, and what is reported is what was found — no engine reason exists
 * for it, and none is invented.
 */
export class StorePlaceEmptyError extends Error {
  constructor(readonly dir: string, readonly file: string) {
    super(`the place for this workspace's session store exists (${dir}) and the store is not in it`);
    this.name = 'StorePlaceEmptyError';
  }
}

/** OQ-266: the open was asked to skip the cut-restore check (a restore is under way) and that restore's journal is beside an absent store. */
export class RestorePendingError extends Error {
  constructor(readonly dir: string) {
    super(`a restore of this workspace is under way and its store (${dir}) is not in place; nothing was created`);
    this.name = 'RestorePendingError';
  }
}

export interface OpenWorkspaceStoreOptions {
  /** OQ-266: run the cut-restore check first (the default). The workspace service skips it while its own restore is in flight. */
  readonly recover?: boolean;
  /**
   * OQ-281 — verification only: called after a first store is whole in its sibling and before the rename puts it in place, so
   * a test can cut the open there (a throw stands for the process killed) or make the target appear meanwhile.
   */
  readonly betweenCreateAndRename?: (sibling: string) => void;
  /** OQ-281 — verification only: the rename that installs a first store (a test makes it refuse). */
  readonly rename?: typeof renameSync;
}

/** OQ-281: how often, and how far apart, the install of a first store retries a rename the platform refused transiently. */
const INSTALL_TRIES = 5;
const INSTALL_RETRY_MS = 50;
const pause = (ms: number): void => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/**
 * OQ-281 (ruled 2026-10-14 under R-072): a first store is made whole beside its place and renamed into it, so the place is
 * never present without a store in it — the open's own window between making the place and creating the file is gone, and a
 * process cut anywhere leaves the place absent (REQ-SESSION-043's ordinary state, created at the next open), never empty
 * (REQ-SESSION-202). The sibling is dot-prefixed and named for the identifier (`firstStoreSibling`), holds only a store that
 * was never installed, and is removed at the identifier's next open (`openWorkspaceStore`); every scan of the workspaces root skips
 * dot-prefixed entries. Answers the creation's migration, or `null` where the place appeared meanwhile (the caller re-runs the
 * open over what is there).
 */
function installFirstStore(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, opts: OpenWorkspaceStoreOptions): MigrateOutcome | null {
  const sibling = firstStoreSibling(workspacesRoot, id);
  const place = storeDir(workspacesRoot, id);
  rmSync(sibling, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  let migration: MigrateOutcome;
  try {
    // The workspaces root itself may not exist yet (a first workspace on this machine): it is made, as the place once was.
    mkdirSync(workspacesRoot, { recursive: true });
    mkdirSync(sibling);
    const db = openStore(join(sibling, STORE_FILE));
    try {
      migration = migrateStore(db);
    } finally {
      db.close();
      forgetSpelling(sibling);
    }
    // origin.txt: the reclamation surface's only way to say which project a store belongs to (OQ-48) — in place before the rename.
    writeFileSync(join(sibling, ORIGIN_FILE), `${workspaceRoot}\n`);
  } catch (e) {
    // A failed create leaves nothing: the place stays absent.
    rmSync(sibling, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    throw e;
  }
  opts.betweenCreateAndRename?.(sibling);
  const rename = opts.rename ?? renameSync;
  for (let attempt = 1; ; attempt++) {
    if (existsSync(place)) {
      // The place appeared meanwhile (another open, a restore, a person): what is there is the store's, never this sibling's.
      rmSync(sibling, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return null;
    }
    try {
      rename(sibling, place);
      return migration;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === 'EPERM' || code === 'EBUSY') && attempt < INSTALL_TRIES) { pause(INSTALL_RETRY_MS); continue; }
      rmSync(sibling, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      if (existsSync(place)) return null;
      throw e;
    }
  }
}

/**
 * Open and migrate the store for `id`, creating it only where nothing is kept for the workspace (REQ-SESSION-043). The
 * workspace service's job and nobody else's. In order, before anything is created:
 *  1. OQ-266 — a restore cut between its two renames is reversed (`recoverCutRestore`, recover.ts);
 *  2. REQ-SESSION-202 / W-31 — a place that exists and holds no `workspace.db` is refused (`StorePlaceEmptyError`), never
 *     opened by a call that creates: an empty store there would answer every later check perfectly;
 *  3. where the place is absent, the store is made whole in a sibling and renamed into place (OQ-281, `installFirstStore`),
 *     and the open that follows is the ordinary one, `mustExist`, over what is then there.
 */
export function openWorkspaceStore(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, opts: OpenWorkspaceStoreOptions = {}): ResolvedStore {
  const dir = storeDir(workspacesRoot, id);
  const file = storeFile(workspacesRoot, id);
  const recover = opts.recover !== false;
  const cutRestore = recover ? recoverCutRestore(workspacesRoot, id) : null;
  if (!recover && !existsSync(dir) && existsSync(restoreJournal(workspacesRoot, id))) throw new RestorePendingError(dir);
  // OQ-281: a stray sibling — a first store a cut open never installed — is removed at the identifier's next open, however the
  // place is found: absent (the install below sweeps it too), or back by another way meanwhile (a restore, a person).
  const sibling = firstStoreSibling(workspacesRoot, id);
  if (existsSync(sibling)) rmSync(sibling, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  const created = existsSync(dir) ? null : installFirstStore(workspacesRoot, id, workspaceRoot, opts);
  // Present now in every case — installed by this open, or found (before it, or appearing meanwhile): opened, never created.
  if (!existsSync(file)) throw new StorePlaceEmptyError(dir, file);
  const db = openStore(file, { mustExist: true });
  const opened = migrateStore(db);
  const migration = created !== null && opened.kind === 'unchanged' ? created : opened;
  // origin.txt: the reclamation surface's only way to say which project a store belongs to (OQ-48).
  const origin = join(dir, ORIGIN_FILE);
  if (!existsSync(origin)) writeFileSync(origin, `${workspaceRoot}\n`);
  return { id, dir, file, db, migration, ...(cutRestore ? { cutRestore } : {}) };
}
