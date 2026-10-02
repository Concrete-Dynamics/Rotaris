import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, toSessionRecord, type RunConfig } from './index.js';

/*
 * REQ-SANDBOX-121 (the repair of `docs/defects/fixed/no-workspace-indicator-names-the-confinement-backend.md`): the session
 * record the renderer receives names the backend its latest run was confined by, beside `sandboxed`, so the workspace
 * indicator can name it. Before the repair the backend reached only the `session.start` event (`sandbox.backend`) and
 * the record carried the flag alone.
 */
const HOST = mintMachineId('0000000000000000000000000000000f') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };

describe('REQ-SANDBOX-121: the session record carries the confinement backend of its latest run', () => {
  let dir: string;
  let dal: StoreDal;
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-sandbox-record-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(sandbox: { requested: boolean; available: boolean; backend: string }) {
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => { client.push(answer('done')); return original(req); };
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    return new Sessions({
      clocks: new FakeClock(), publisher: { increment: () => undefined, snapshot: () => undefined }, pid: 92, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `X${++minted}`, model: { backend: new DefaultAgentBackend(client), config }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
      attended: () => true,
    });
  }
  async function ran(sessions: Sessions): Promise<SessionId> {
    const sid = (sessions.start(dal, 'C:/ws', 'do it') as { value: SessionId }).value;
    await sessions.running(sid)!;
    return sid;
  }

  it('a confined run records its backend on the record; an unconfined one records none', async () => {
    const confined = await ran(sessionsWith({ requested: true, available: true, backend: 'bubblewrap' }));
    expect(toSessionRecord(dal.getSession(confined)!)).toMatchObject({ sandboxed: true, sandboxBackend: 'bubblewrap' });
    const open = await ran(sessionsWith({ requested: false, available: true, backend: 'bubblewrap' }));
    expect(toSessionRecord(dal.getSession(open)!)).toMatchObject({ sandboxed: false, sandboxBackend: '' });
  });

  it('the record names a backend only beside `sandboxed`: a stored backend under a cleared flag is not the record\'s', async () => {
    const sid = await ran(sessionsWith({ requested: true, available: true, backend: 'bubblewrap' }));
    dal.updateSessionRun(sid, { sandboxed: 0 });
    expect(toSessionRecord(dal.getSession(sid)!)).toMatchObject({ sandboxed: false, sandboxBackend: '' });
  });
});
