import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, ScriptedModelClient, toolCalls, type ModelRequest, type ScriptedCall } from '@rotaris/model';
import { RUN_CONFIG_DEFAULTS, Sessions, type Publisher, type ToolPort } from '../index.js';
import { ANSWER_REPROMPT } from './run.js';
import { SUPERVISOR_DEFAULTS, type LoopActivation, type LoopClassifier } from './supervisor.js';

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
 * OQ-199 as ruled (R-071, `PD-ORCH-009`): an entry role that ends its turn with neither text nor a tool call is asked once
 * more to answer, as a delegated child is re-prompted (REQ-ORCH-095); one that still writes nothing completes, and the
 * person is told the run ended without an answer.
 */
describe('PD-ORCH-009: the entry role is asked once more for an answer it did not write (OQ-199)', () => {
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

  function sessionsWith(calls: ScriptedCall[], classifier?: LoopClassifier) {
    const client = new ScriptedModelClient(calls);
    let n = 0;
    const port: ToolPort = { specs: () => [{ name: 'read_file', description: 'read', parameters: { type: 'object' } }], dispatch: async () => ({ text: '# Rotaris', isError: false, status: 'ok', durationMs: 0, label: 'read_file', args: {} }), cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false };
    const sessions = new Sessions({
      clocks: clock, publisher: NONE, pid: 78, host: HOST, retentionCap: 20_000, warn: () => undefined, mintSessionId: () => `A${++n}`,
      model: { backend: new DefaultAgentBackend(client), config: { ...RUN_CONFIG_DEFAULTS, model: MODEL, credentialFor: () => async () => 'k' } }, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid),
      tools: () => port, attended: () => true,
      runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING' },
      ...(classifier ? { supervisor: () => ({ config: SUPERVISOR_DEFAULTS, classifier }) } : {}),
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

  /*
   * The verifier's finding on PD-ORCH-009's first form: the row said the run ended after any silent iteration, also one the
   * run went on from. A queued prompt, created while the first root's read is held, gives the run a second iteration.
   */
  function heldFirst(rest: ScriptedCall[]) {
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const first: ScriptedCall = { parts: [{ hold }, ...read('r1').parts] };
    return { ...sessionsWith([first, ...rest]), release };
  }
  const queue = (sid: SessionId, content: string) => dal.insertQueuedPrompt(sid, '9f1c2d3e-0000-4000-8000-000000000001', content, '2026-10-06T12:00:00.000Z');
  const told = (sid: SessionId) => dal.residentRows(sid).filter((r) => r.kind === 'system' && r.body.includes('ended without an answer')).map((r) => r.body);

  it('an iteration the run goes on from is said to have ended without an answer — the run is not', async () => {
    const { sessions, client, release } = heldFirst([silent(), silent(), answer('The workspace holds README.md.')]);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    await Promise.resolve();
    queue(sid, 'Now list the files in this workspace.');
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(dal.iterationsOf(sid)).toHaveLength(2);
    expect(client.requests).toHaveLength(4);
    expect(told(sid)).toEqual(['Iteration 1 ended without an answer: orchestrator ended its turn without writing one, even when asked once more.']);
    expect(answerlessIssues(sid)).toMatchObject([{ severity: 'warning', message: 'Iteration 1 ended without an answer: orchestrator ended its turn without writing one, even when asked once more.' }]);
    expect(answerlessIssues(sid).map((i) => JSON.parse(i.metadata) as unknown)).toMatchObject([{ iteration: 1, run_ended: false }]);
    expect(dal.residentRows(sid).some((r) => r.body.includes('The workspace holds README.md.'))).toBe(true);
  });

  it('a run whose last iteration is silent too ended without an answer, said once for each iteration', async () => {
    const { sessions, client, release } = heldFirst([silent(), silent(), silent(), silent()]);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    await Promise.resolve();
    queue(sid, 'Now list the files in this workspace.');
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(5);
    expect(told(sid)).toEqual([
      'Iteration 1 ended without an answer: orchestrator ended its turn without writing one, even when asked once more.',
      'The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.',
    ]);
    expect(answerlessIssues(sid).map((i) => JSON.parse(i.metadata) as unknown)).toMatchObject([{ iteration: 1, run_ended: false }, { iteration: 2, run_ended: true }]);
  });

  /*
   * PD-ORCH-009 revision 3 (OQ-282, ruled 2026-10-13 under R-072 as E1), narrowing REQ-ORCH-104's stuck-mode clause: the
   * empty turn that earns the re-prompt is no stuck report to loop supervision. The live run at ce5f952 (F1) sent
   * [prompt, empty turn, re-prompt, "Pause and reassess the current task. …"]: the stuck steering followed the re-prompt in
   * the same request, after a classification over an empty excerpt.
   */
  describe('PD-ORCH-009 revision 3: the re-prompt is the root\'s only message for that turn — no stuck steering', () => {
    const supervised = () => {
      const asked: LoopActivation[] = [];
      const classifier: LoopClassifier = { classify: async (a) => { asked.push(a); return { loop_detected: true, reason: 'stuck', corrective_message: 'Pause and reassess the current task.' }; } };
      return { asked, classifier };
    };
    const lastMessageText = (req: ModelRequest): string => { const m = req.messages.at(-1)!; return m.role === 'user' ? m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') : `<${m.role}>`; };
    const activations = (sid: SessionId) => dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation');

    it('silent, then an answer: the re-prompt request ends with ANSWER_REPROMPT, no classification is asked, no activation is written', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith([read('r1'), silent(), answer('The first heading is "Rotaris".')], classifier);
      const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests).toHaveLength(3);
      expect(lastMessageText(client.requests[2]!)).toBe(ANSWER_REPROMPT);
      expect(client.requests[2]!.messages.filter((m) => m.role === 'user' && m.content.some((p) => p.kind === 'text' && p.text.startsWith('Pause and reassess')))).toEqual([]);
      expect(asked).toEqual([]);
      expect(activations(sid)).toEqual([]);
      expect(dal.residentRows(sid).some((r) => r.body.includes('The first heading is "Rotaris".'))).toBe(true);
      expect(noAnswerRows(sid)).toEqual([]);
    });

    it('silent, then silent: the re-prompt request ends with ANSWER_REPROMPT, no classification, no activation, and the person is told once', async () => {
      const { asked, classifier } = supervised();
      const { sessions, client } = sessionsWith([read('r1'), silent(), silent('Still thinking…')], classifier);
      const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
      expect((await sessions.running(sid)!).status).toBe('completed');
      expect(client.requests).toHaveLength(3);
      expect(lastMessageText(client.requests[2]!)).toBe(ANSWER_REPROMPT);
      expect(client.requests.filter((r) => lastUserText(r) === ANSWER_REPROMPT)).toHaveLength(1);
      expect(asked.filter((a) => a.trigger === 'stuck')).toEqual([]);
      expect(activations(sid).filter((t) => (JSON.parse(t.metadata) as { trigger?: string }).trigger === 'stuck')).toEqual([]);
      expect(noAnswerRows(sid).map((r) => r.body)).toEqual(['The run ended without an answer: orchestrator ended its turn without writing one, even when asked once more.']);
    });
  });

  /*
   * OQ-284's other route, checked and not found: the stuck trigger the root's second silence arms stays pending in its
   * supervisor, but the next iteration's root is a fresh task id (`Run.turn` mints one) and so a fresh conversation in the
   * run's SupervisorRegistry — its first request carries the queued prompt alone.
   */
  it('PD-ORCH-009 revision 3 with OQ-284: a silence left pending by one iteration\'s root does not reach the next iteration\'s root', async () => {
    const asked: LoopActivation[] = [];
    const classifier: LoopClassifier = { classify: async (a) => { asked.push(a); return { loop_detected: true, reason: 'stuck', corrective_message: 'Pause and reassess the current task.' }; } };
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const first: ScriptedCall = { parts: [{ hold }, ...read('r1').parts] };
    const { sessions, client } = sessionsWith([first, silent(), silent(), answer('The workspace holds README.md.')], classifier);
    const sid = (sessions.start(dal, 'C:/ws', QUESTION) as { value: SessionId }).value;
    await Promise.resolve();
    queue(sid, 'Now list the files in this workspace.');
    release();
    expect((await sessions.running(sid)!).status).toBe('completed');
    expect(client.requests).toHaveLength(4);
    expect(client.requests[3]!.messages.map((m) => m.role)).toEqual(['system', 'user']);
    expect(asked).toEqual([]);
    expect(dal.timelineOf(sid).filter((t) => t.name === 'loop_supervisor_activation')).toEqual([]);
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
