import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { mintWorkspaceId, parseWorkspaceId, type WorkspaceId } from '@rotaris/kernel';
import { exclusiveCreate, guardedRead, WORKSPACE_ID_FILE, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { ORIGIN_FILE, storeDir, storeFile } from './layout.js';
import { migrateStore, type MigrateOutcome } from './migrate.js';
import { openStore, type StoreHandle } from './open.js';

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
}

/** Open (creating on first use) and migrate the store for `id`. The workspace service's job and nobody else's. */
export function openWorkspaceStore(workspacesRoot: string, id: WorkspaceId, workspaceRoot: string): ResolvedStore {
  const dir = storeDir(workspacesRoot, id);
  mkdirSync(dir, { recursive: true });
  const file = storeFile(workspacesRoot, id);
  const db = openStore(file);
  const migration = migrateStore(db);
  // origin.txt: the reclamation surface's only way to say which project a store belongs to (OQ-48).
  const origin = join(dir, ORIGIN_FILE);
  if (!existsSync(origin)) writeFileSync(origin, `${workspaceRoot}\n`);
  return { id, dir, file, db, migration };
}
