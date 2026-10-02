import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type Result, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, toSessionRecord, type RunConfig, type RunSetup } from './index.js';
import type { SessionRecord } from '@rotaris/contracts';

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

  /*
   * REQ-NOTIFY-061's last sentence ("The sandbox indicator stops describing the run as sandboxed") for a session that
   * exists: its last run was confined, and the next run asked of it is refused at the confinement gate. Found by fin8's
   * verifier: nothing was written or published on that refusal, so the record kept `sandboxed: true` and the strip kept
   * reading `sandbox: bubblewrap` beside the refusal notice. The published record stops describing it as sandboxed until a
   * run of it starts again; the stored row keeps the started run's own fact (REQ-SANDBOX-094).
   */
  it('REQ-NOTIFY-061: a run of a confined session refused at the confinement gate publishes a record no longer sandboxed, until a run starts again', async () => {
    const published: SessionRecord[] = [];
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => { client.push(answer('done')); return original(req); };
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' };
    let refuse: { readonly reason: string; readonly code?: 'confinement' } | null = null;
    const sessions = new Sessions({
      clocks: new FakeClock(), publisher: { increment: () => undefined, snapshot: (m) => { published.push(m.session); } }, pid: 92, host: HOST, retentionCap: 20_000, warn: () => undefined,
      mintSessionId: () => `X${++minted}`, model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true,
      configure: (): Result<RunSetup, { readonly reason: string; readonly code?: 'confinement' }> => refuse !== null
        ? { ok: false, error: refuse }
        : { ok: true, value: { model: { backend: new DefaultAgentBackend(client), config }, runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: true, available: true, backend: 'bubblewrap' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 } } },
    });
    const sid = await ran(sessions);
    expect(published.at(-1)).toMatchObject({ sandboxed: true, sandboxBackend: 'bubblewrap' });

    // Another refusal says nothing about confinement: the record is left as it was.
    refuse = { reason: 'The configuration could not be loaded: runtime is not a mapping.' };
    const before = published.length;
    expect(sessions.prompt(sid, 'again')).toMatchObject({ ok: false, error: { code: 'configuration' } });
    expect(published.length).toBe(before);

    // The prompt, the retry (through the prompt) and the continue are refused at the gate; each publishes the record unconfined.
    refuse = { reason: 'Confinement is unavailable: bwrap is not on PATH. Install bubblewrap.', code: 'confinement' };
    expect(sessions.prompt(sid, 'again')).toMatchObject({ ok: false, error: { code: 'confinement', reason: refuse.reason } });
    expect(published.length).toBe(before + 1);
    expect(published.at(-1)).toMatchObject({ sandboxed: false, sandboxBackend: '' });
    expect(sessions.retry(sid)).toMatchObject({ ok: false, error: { code: 'confinement' } });
    // A session resting paused (planted) is continued, and the continue meets the same gate.
    dal.touchSession(sid, 'paused', '2026-10-02T00:00:00.000Z');
    const continued = published.length;
    expect(sessions.continueSession(sid, 'continue')).toMatchObject({ ok: false, error: { code: 'confinement' } });
    expect(published.length).toBe(continued + 1);
    expect(published.at(-1)).toMatchObject({ sandboxed: false, sandboxBackend: '' });
    dal.touchSession(sid, 'completed', '2026-10-02T00:00:01.000Z');
    expect(published.at(-1)).toMatchObject({ sandboxed: false, sandboxBackend: '' });
    // The row keeps the fact of the run that started (REQ-SANDBOX-094); only what the session shows changed.
    expect(toSessionRecord(dal.getSession(sid)!)).toMatchObject({ sandboxed: true, sandboxBackend: 'bubblewrap' });

    // A run of it starts again, confined: the record describes that run.
    refuse = null;
    const again = sessions.prompt(sid, 'again');
    if (!again.ok) throw new Error(again.error.reason);
    await sessions.running(sid);
    expect(published.at(-1)).toMatchObject({ sandboxed: true, sandboxBackend: 'bubblewrap' });
  });
});
