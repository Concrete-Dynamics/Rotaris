import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintWorkspaceId, parseWorkspaceId, type WorkspaceId } from '@rotaris/kernel';
import { exclusiveCreate, guardedRead, WORKSPACE_ID_FILE, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { ORIGIN_FILE, restoreJournal, storeDir, storeFile } from './layout.js';
import { migrateStore, type MigrateOutcome } from './migrate.js';
import { openStore, type StoreHandle } from './open.js';
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
}

/**
 * Open and migrate the store for `id`, creating it only where nothing is kept for the workspace (REQ-SESSION-043). The
 * workspace service's job and nobody else's. In order, before anything is created:
 *  1. OQ-266 — a restore cut between its two renames is reversed (`recoverCutRestore`, recover.ts);
 *  2. REQ-SESSION-202 / W-31 — a place that exists and holds no `workspace.db` is refused (`StorePlaceEmptyError`), never
 *     opened by a call that creates: an empty store there would answer every later check perfectly;
 *  3. the place is created where it is absent, and only then may the open create the store in it.
 */
export function openWorkspaceStore(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string, opts: OpenWorkspaceStoreOptions = {}): ResolvedStore {
  const dir = storeDir(workspacesRoot, id);
  const file = storeFile(workspacesRoot, id);
  const recover = opts.recover !== false;
  const cutRestore = recover ? recoverCutRestore(workspacesRoot, id) : null;
  const placeExists = existsSync(dir);
  if (!recover && !placeExists && existsSync(restoreJournal(workspacesRoot, id))) throw new RestorePendingError(dir);
  if (placeExists && !existsSync(file)) throw new StorePlaceEmptyError(dir, file);
  if (!placeExists) mkdirSync(dir, { recursive: true });
  const db = openStore(file, placeExists ? { mustExist: true } : {});
  const migration = migrateStore(db);
  // origin.txt: the reclamation surface's only way to say which project a store belongs to (OQ-48).
  const origin = join(dir, ORIGIN_FILE);
  if (!existsSync(origin)) writeFileSync(origin, `${workspaceRoot}\n`);
  return { id, dir, file, db, migration, ...(cutRestore ? { cutRestore } : {}) };
}
