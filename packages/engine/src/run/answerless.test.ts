import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type Publisher, type ToolPort } from '../index.js';
import { ANSWER_REPROMPT } from './run.js';

const HOST = mintMachineId('0000000000000000000000000000000d') as MachineId;
const MODEL = { providerId: 'p', modelId: 'm', dialect: 'chat' as const };
const NONE: Publisher = { increment: () => undefined, snapshot: () => undefined };

/** A reply that reasons and ends its turn with neither text nor a tool call — OQ-199's run 2 of `slice-proof`. */
const silent = (reasoning = 'The user wants the list of installed skills…'): ScriptedCall => ({ parts: [{ part: { kind: 'reasoning', delta: reasoning } }, { part: { kind: 'usage', usage: { input: 10, output: 5 } } }, { part: { kind: 'finish', reason: 'stop' } }] });
const read = (id: string): ScriptedCall => toolCalls([{ callId: id, name: 'read_file', args: { path: 'README.md' } }]);
const lastUserText = (req: ModelRequest): string => {
  const user = [...req.messages].reverse().find((m) => m.role === 'user');
  return user ? user.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') : '';
};

/**
 * OQ-199 as ruled (R-071, `PD-ORCH-006`): an entry role that ends its turn with neither text nor a tool call is asked once
 * more to answer, as a delegated child is re-prompted (REQ-ORCH-095); one that still writes nothing completes, and the
 * person is told the run ended without an answer.
 */
describe('PD-ORCH-006: the entry role is asked once more for an answer it did not write (OQ-199)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-answerless-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  function sessionsWith(calls: ScriptedCall[]) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const port: ToolPort = { specs: () => [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }], dispatch: async () => ({ text: '# Rotaris', isError: false, status: 'ok', durationMs: 0, label: 'read_file', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 78, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `A${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: () => port, attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
    });
    return { sessions, client };
  }
  const QUESTION = 'Read README.md in this workspace and tell me its first heading, in one sentence.';
  const noAnswerRows = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'system' && r.body.startsWith('The run ended without an answer'));
  const answerlessIssues = (sid: SessionId) => dal.issuesOf(sid).filter((i) => i.kind === 'incomplete_execution');

  it('a root that read and then wrote nothing is asked once more, in its own conversation, and its answer is the run\'s', async () => {
    const { sessions, client } = sessionsWith([read('r1'), silent(), answer('The first heading is "Rotaris".')]);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(3);
    // The re-prompt is the next message of the conversation the silent step left, after the read's result.
    expect(lastUserText(client.requests[2]!)).toBe(ANSWER_REPROMPT);
    expect(client.requests[2]!.messages.some((m) => m.role === 'tool')).toBe(true);
    expect(dal.residentRows(sid).some((r) => r.body.includes('The first heading is "Rotaris".'))).toBe(true);
    expect(noAnswerRows(sid)).toEqual([]);
    expect(answerlessIssues(sid)).toEqual([]);
  });

  it('a root that still writes nothing completes, and the person is told the run ended without an answer — once, after one re-prompt', async () => {
    const { sessions, client } = sessionsWith([read('r1'), silent(), silent('Still thinking about a test suite under src/core/parser.ts…')]);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    // One re-prompt, never a second.
    expect(client.requests).toHaveLength(3);
    expect(client.requests.filter((r) => lastUserText(r) === ANSWER_REPROMPT)).toHaveLength(1);
    expect(noAnswerRows(sid).map((r) => r.body)).toEqual(['The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.']);
    expect(answerlessIssues(sid)).toMatchObject([{ severity: 'warning', actor: 'orchestrator', message: 'The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.' }]);
    // The row is a finished row, written before the run's own last row.
    const rows = dal.residentRows(sid).map((r) => r.body);
    expect(rows.indexOf(noAnswerRows(sid)[0]!.body)).toBeLessThan(rows.length - 1);
  });

  it('a root that answers is not asked again, and nothing is said', async () => {
    const { sessions, client } = sessionsWith([read('r1'), answer('The first heading is "Rotaris".')]);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(2);
    expect(client.requests.some((r) => lastUserText(r) === ANSWER_REPROMPT)).toBe(false);
    expect(noAnswerRows(sid)).toEqual([]);
  });
});
