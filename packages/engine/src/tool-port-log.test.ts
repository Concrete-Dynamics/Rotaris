import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { forgetSpelling, migrateStore, openStore, StoreDal } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type LogLevel, type Publisher, type ToolPort, type ToolPortContext } from './index.js';

const HOST = mintMachineId('0000000000000000000000000000000c') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

/**
 * Live-run finding L14 (R-067): the tool port had one log line, `warn`, so REQ-TOOLS-006's removal by a narrowing control
 * — the configuration working as designed — was a warning in both logs on every coordinated run. The port's context now
 * carries `info` too: the application log at `info` (PD-MONITOR-002's default threshold keeps it) and the session log at
 * `INFO` (REQ-SESSION-142's default `WARNING` leaves it out), on a start and on a continuation alike.
 */
describe('the tool port\'s info line (REQ-TOOLS-006, PD-MONITOR-002, REQ-SESSION-142)', () => {
  let dir: string;
  let dal: StoreDal;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-port-log-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const port: ToolPort = {
    specs: () => [],
    dispatch: async () => { throw new Error('no call is made'); },
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  };

  function sessionsAt(level: LogLevel, replies: number) {
    const warnings: string[] = [];
    const appLog: string[] = [];
    const sessionLog: string[] = [];
    let n = 0;
    const sessions = new Sessions({
      clocks: new FakeClock(), publisher: NONE, pid: 78, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), log: (m) => appLog.push(m), mintSessionId: () => `P${++n}`,
      model: { backend: new DefaultAgentBackend(new ScriptedModelClient(Array.from({ length: replies }, () => answer('done')))), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } },
      sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: level },
      sessionLogAppender: () => (line) => { sessionLog.push(line); },
      tools: (ctx: ToolPortContext) => { ctx.info?.(`tool 'terminal' removed from ${ctx.persona} by coordinator_only (REQ-TOOLS-004/006)`); return port; },
    });
    return { sessions, warnings, appLog, sessionLog };
  }
  const removal = (lines: readonly string[]) => lines.filter((l) => l.includes("tool 'terminal' removed from"));

  it('L14: a port\'s info line reaches the application log and not the warning path; the session log\'s default WARNING drops it', async () => {
    const { sessions, warnings, appLog, sessionLog } = sessionsAt('WARNING', 1);
    const sid = (sessions.start(dal, dir, 'do the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(removal(appLog)).toHaveLength(1);
    expect(removal(warnings)).toEqual([]);
    expect(removal(sessionLog)).toEqual([]);
  });

  it('L14: at a session log level of INFO the line is kept there, at INFO — on the start and on a continuation', async () => {
    const { sessions, warnings, appLog, sessionLog } = sessionsAt('INFO', 2);
    const sid = (sessions.start(dal, dir, 'do the thing') as { value: SessionId }).value;
    await sessions.running(sid)!;
    expect(removal(sessionLog)).toHaveLength(1);
    expect(removal(sessionLog)[0]).toMatch(/ INFO {4}tool 'terminal' removed from /);
    const continued = sessions.prompt(sid, 'and then');
    expect(continued.ok).toBe(true);
    await sessions.running(sid)!;
    expect(removal(sessionLog)).toHaveLength(2);
    expect(removal(appLog)).toHaveLength(2);
    expect(removal(warnings)).toEqual([]);
  });
});
