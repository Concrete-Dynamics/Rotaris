import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { asSessionId, millis, mintMachineId, mintWorkspaceId, type MachineId, type WorkspaceId } from '@rotaris/kernel';
import { nodeClocks } from '@rotaris/platform';
import { takeBackup } from './backup.js';
import { StoreDal } from './dal.js';
import { STORE_FILE } from './layout.js';
import { forgetSpelling, openStore } from './open.js';
import { openWorkspaceStore } from './resolve.js';
import { restoreStore, type RunHostControl } from './restore.js';

/**
 * The child of the kill-in-the-gap harness (ADR-0058's restore, README B2): a separate process the harness
 * (`apps/desktop/scripts/restore-kill-proof.mjs`) bundles from this file and kills with SIGKILL while `restoreStore` waits
 * between its two renames — the displacement of the target (step 8) and the install of the staging copy (step 9). A
 * process killed there has nothing left to reverse anything, which is the case no spike measured. Not part of the product:
 * nothing imports it, and `index.ts` does not export it.
 *
 * One command per launch, its argument one JSON object, its answer one JSON line on stdout:
 *   seed     {root, id, sessions}            — a store under `root` for `id`, each session with a few rows
 *   artifact {file, id, sessions}            — a backup artifact of a store holding `sessions`
 *   restore  {root, id, artifact, marker}    — the restore; at the gap it writes `marker` and waits to be killed
 *   survey   {root, id}                      — what `root` holds: each entry, and each store's sessions and quick_check
 *   reopen   {root, id, workspace}           — the workspace service's open (`openWorkspaceStore`), what it found, and what
 *                                             it did about a cut restore (`cutRestore`, OQ-266); `sha256` is the store's
 *                                             bytes before that open read it
 */
const MACHINE = mintMachineId('0000000000000000000000000000000a') as MachineId;
const clocks = nodeClocks();

function seed(root: string, id: WorkspaceId, sessions: readonly string[]): void {
  const r = openWorkspaceStore(root, id, 'C:/restore-kill');
  const dal = new StoreDal(r.db);
  for (const sid of sessions) {
    dal.upsertSession({ session_id: sid, execution_status: 'completed', workspace_root: 'C:/restore-kill', created_at: 't', updated_at: 't' });
    for (let i = 0; i < 3; i++) dal.appendRow(asSessionId(sid), i, 'user', true, `row ${i} of ${sid}`);
  }
  r.db.close();
  forgetSpelling(r.dir);
}

function storeFacts(dir: string): { sessions: string[]; quickCheck: string; sha256: string } | null {
  const file = join(dir, STORE_FILE);
  if (!existsSync(file)) return null;
  // The bytes before the read: the reinstated store must be the displaced one, byte for byte (OQ-266).
  const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
  const db = openStore(file, { readonly: true, mustExist: true });
  try {
    return { sessions: new StoreDal(db).listSessions().map((s) => s.session_id).sort(), quickCheck: String(db.pragma('quick_check', { simple: true })), sha256 };
  } finally {
    db.close();
    forgetSpelling(dir);
  }
}

const runHost: RunHostControl = { async refuseRuns() { /* none */ }, async closeStore() { /* none */ }, async release() { /* none */ }, async reopen() { /* none */ } };

async function main(): Promise<unknown> {
  const [command, json] = process.argv.slice(2);
  const a = JSON.parse(json ?? '{}') as Record<string, unknown>;
  const id = mintWorkspaceId(String(a['id']));
  switch (command) {
    case 'seed':
      seed(String(a['root']), id, a['sessions'] as string[]);
      return { seeded: true };
    case 'artifact': {
      const src = mkdtempSync(join(tmpdir(), 'rotaris-restore-kill-src-'));
      try {
        seed(src, id, a['sessions'] as string[]);
        takeBackup(src, id, String(a['file']), '2026-10-13T00:00:00.000Z', 'C:/restore-kill');
      } finally {
        rmSync(src, { recursive: true, force: true });
      }
      return { artifact: a['file'] };
    }
    case 'restore': {
      const marker = String(a['marker']);
      const r = await restoreStore(
        { workspacesRoot: String(a['root']), id, artifact: String(a['artifact']), thisMachine: MACHINE, originLabel: 'C:/restore-kill', runHost, timers: clocks.timers, wall: clocks.wall },
        {
          betweenRenames: () => new Promise<void>((resolve) => {
            writeFileSync(marker, `${process.pid}\n`);
            // Waits to be killed; the bound only keeps a harness that never kills from leaving a process behind.
            clocks.timers.after(millis(120_000), () => resolve());
          }),
        },
      );
      return { completed: true, ok: r.ok, steps: r.steps };
    }
    case 'survey': {
      const root = String(a['root']);
      const entries = readdirSync(root).sort();
      return { id, entries, stores: Object.fromEntries(entries.filter((n) => n === id || n.startsWith(`${id}.`)).map((n) => [n, storeFacts(join(root, n))])) };
    }
    case 'reopen': {
      const r = openWorkspaceStore(String(a['root']), id, String(a['workspace']));
      try {
        return { migration: r.migration, sessions: new StoreDal(r.db).listSessions().map((s) => s.session_id).sort(), cutRestore: r.cutRestore ?? null };
      } finally {
        r.db.close();
        forgetSpelling(r.dir);
      }
    }
    default:
      throw new Error(`unknown command ${String(command)}`);
  }
}

main().then(
  (answer) => { process.stdout.write(`${JSON.stringify(answer)}\n`); },
  (cause: unknown) => { process.stderr.write(`${String(cause instanceof Error ? cause.stack : cause)}\n`); process.exitCode = 1; },
);
