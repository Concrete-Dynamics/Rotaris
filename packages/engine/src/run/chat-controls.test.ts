import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ModelRef, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, RUN_CONFIG_DEFAULTS, Sessions, type ModelLookup, type Publisher, type RoleName, type RunConfig, type ToolPort } from '../index.js';
import { ConversationRegistry, type LiveConversation, type ManualCompressionResult } from './conversations.js';
import type { ResolvedTrigger } from './compression.js';

/**
 * Part AO — the two control arms (REQ-CHAT-078..084, REQ-MONITOR-090..096): the registry of live conversations
 * (ADR-0060 decision 1's second reader), the concurrent manual pass through `Sessions.controlAsync`, and the
 * transcript clear by both of REQ-CHAT-084's routes, each against a real run through `Sessions` and a real store.
 */
const HOST = mintMachineId('0000000000000000000000000000000f') as MachineId;
const A1: ModelRef = { providerId: 'a', modelId: 'a1', dialect: 'chat' };
const TRIGGER: ResolvedTrigger = { tokens: 0, thresholdPercentage: 60, capacity: 1000, advertisedInputLimit: 1000, defaultThreshold: 265_000 };

function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('engine/run/conversations — the registry of live conversations (ADR-0060 decision 1, REQ-MONITOR-092)', () => {
  const handle = (agent: string, result: () => Promise<ManualCompressionResult>): LiveConversation => ({ agent, compress: result });

  it('a turn registers on entry and the returned function removes it; the size follows', () => {
    const registry = new ConversationRegistry();
    const off = registry.register(handle('a', async () => ({ kind: 'unchanged', reason: 'x' })));
    expect(registry.size).toBe(1);
    off();
    expect(registry.size).toBe(0);
    expect(registry.list()).toEqual([]);
  });

  it('REQ-MONITOR-092: every live conversation compresses CONCURRENTLY and the report settles once ALL have', async () => {
    const registry = new ConversationRegistry();
    const started: string[] = [];
    const gateA = deferred<void>();
    const gateB = deferred<void>();
    registry.register(handle('a', async () => { started.push('a'); await gateA.promise; return { kind: 'compressed', beforeMessages: 6, afterMessages: 3 }; }));
    registry.register(handle('b', async () => { started.push('b'); await gateB.promise; return { kind: 'unchanged', reason: 'nothing between' }; }));
    let settled = false;
    const pass = registry.compressAll(new AbortController().signal).then((r) => { settled = true; return r; });
    await tick();
    // Both began before either finished — concurrent, not one after the other.
    expect(started).toEqual(['a', 'b']);
    expect(settled).toBe(false);
    gateA.resolve();
    await tick();
    expect(settled).toBe(false); // one settled is not all settled
    gateB.resolve();
    const report = await pass;
    expect(report).toEqual({ compressed: 1, unchanged: 1, failed: [] });
  });

  it('REQ-MONITOR-094: a handle that throws is a failure of THAT agent with its reason; the others still settle', async () => {
    const registry = new ConversationRegistry();
    registry.register(handle('root', async () => ({ kind: 'compressed', beforeMessages: 4, afterMessages: 2 })));
    registry.register(handle('child-a', async () => { throw new Error('the compressor is down'); }));
    registry.register(handle('child-b', async () => ({ kind: 'failed', reason: 'scripted failure' })));
    const report = await registry.compressAll(new AbortController().signal);
    expect(report.compressed).toBe(1);
    expect(report.failed).toEqual([{ agent: 'child-a', reason: 'the compressor is down' }, { agent: 'child-b', reason: 'scripted failure' }]);
  });
});

describe('engine/sessions — forceCompression and clearTranscript in a run (REQ-CHAT-078..084, REQ-MONITOR-090..096)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-chat-controls-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  type Recorded = { increments: { fromIndex: number; rows: unknown[] }[]; snapshots: unknown[] };
  const recorder = (): Publisher & Recorded => {
    const increments: { fromIndex: number; rows: unknown[] }[] = [];
    const snapshots: unknown[] = [];
    return { increments, snapshots, increment: (p) => increments.push({ fromIndex: p.earliestChanged, rows: [...p.rows] }), snapshot: (p) => snapshots.push(p.session) };
  };

  /**
   * A one-tool port whose Nth dispatch HOLDS until released, so a conversation is live — inside `runTurn`, its
   * registry handle standing — at a moment the test controls.
   */
  function holdingPort(holdAt: number) {
    let dispatches = 0;
    const gate = deferred<void>();
    let held = false;
    const port: ToolPort = {
      specs: () => [{ name: 'glob', description: 'list files', parameters: { type: 'object' } }],
      dispatch: async () => {
        dispatches += 1;
        if (dispatches === holdAt) { held = true; await gate.promise; }
        return { text: ['README.md', 'NOTES.md'].join(String.fromCharCode(10)), isError: false, status: 'ok', durationMs: 1, label: 'glob', args: {} };
      },
      cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
    };
    return { port, release: () => gate.resolve(), isHeld: () => held };
  }

  function sessionsWith(script: (persona: string, turn: number) => ScriptedCall, port: ToolPort) {
    const counts = new Map<string, number>();
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const persona = /^You condense an agent conversation/.test(system) ? 'compressor' : /^You are the orchestrator/.test(system) ? 'orchestrator' : 'child';
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      client.push(script(persona, n));
      return original(req);
    };
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: A1, credentialFor: () => async () => 'k' };
    const backend = new DefaultAgentBackend(client);
    const models = (key: string): ModelLookup => ({ ok: false, reason: `'${key}' is not a configured model` });
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: base, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const pub = recorder();
    const toasts: { kind: string; title: string; body?: string }[] = [];
    const reports: { severity: string; title: string; message: string; detail: string; sessionId: string }[] = [];
    const sessions = new Sessions({
      clocks: clock, publisher: pub, pid: 79, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: () => undefined,
      tools: () => port,
      acknowledge: (kind, title, body) => toasts.push({ kind, title, ...(body === undefined ? {} : { body }) }),
      report: (n) => reports.push(n),
      configure: () => ({ ok: true, value: {
        model: {
          backend, config,
          // The trigger is 0 tokens: the automatic pass never fires, so every compression below is the manual arm's.
          compression: { model: null, timeoutMs: 120_000, charsPerToken: 4, preserveRecentTurns: 1, triggerFor: () => TRIGGER },
        },
        models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
        resilience: { catalogue: [], fallbackModel: null },
      } }),
    });
    return { sessions, pub, counts, toasts, reports };
  }
  const timeline = (sid: SessionId) => dal.timelineOf(sid);
  const rows = (sid: SessionId) => dal.residentRows(sid);
  const untilEnded = async (sid: SessionId, limit = 80) => { for (let i = 0; i < limit && dal.getSession(sid)!.execution_status === 'running'; i++) await tick(); };
  const untilHeld = async (isHeld: () => boolean) => { for (let i = 0; i < 200 && !isHeld(); i++) await tick(); expect(isHeld()).toBe(true); };
  /** Three tool steps, then an answer; the compressor answers a summary. */
  const script = (persona: string, turn: number): ScriptedCall => {
    if (persona === 'compressor') return answer('Work performed: read the repository. Findings reached: none. Questions left open: none.');
    return turn <= 3 ? toolCalls([{ callId: `c${turn}`, name: 'glob', args: { pattern: '**/*' } }], 'looking') : answer('done');
  };

  it('REQ-CHAT-080/081, REQ-MONITOR-092/096: the manual pass compresses the live conversation, records the entry WITHOUT a threshold figure, and toasts the count', async () => {
    const hold = holdingPort(3);
    const { sessions, counts, toasts, reports } = sessionsWith(script, hold.port);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    await untilHeld(hold.isHeld);
    const r = await sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} });
    expect(r).toEqual({ ok: true, compression: { compressed: 1, unchanged: 0, failed: [] } });
    expect(counts.get('compressor')).toBe(1);
    expect(toasts).toEqual([{ kind: 'ok', title: 'Compressed context for 1 active agent(s).' }]);
    expect(reports).toEqual([]);
    const entry = timeline(sid).find((t) => t.name === 'context_compressed');
    expect(entry).toBeDefined();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta['trigger']).toBe('manual');
    // REQ-CHAT-081 / REQ-MONITOR-096: the threshold was never consulted, so the entry names no figure of it.
    for (const field of ['threshold_percentage', 'capacity', 'advertised_input_limit', 'default_threshold', 'trigger_tokens']) expect(meta[field]).toBeUndefined();
    expect(meta['after_messages']).toBeLessThan(meta['before_messages'] as number);
    expect(entry!.message).toContain('the automatic-compression threshold was not consulted');
    hold.release();
    await untilEnded(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    expect(rows(sid).some((row) => row.kind === 'system' && /Context compressed for/.test(row.body))).toBe(true);
  });

  it('REQ-MONITOR-094: a failing pass is listed per agent with its reason in a PERSISTENT notice with a copyable detail block; the answer carries it too', async () => {
    const hold = holdingPort(3);
    const { sessions, toasts, reports } = sessionsWith((persona, turn) => (persona === 'compressor' ? { parts: [{ error: modelError({ code: 'http', status: 500, headline: 'the compressor is down' }) }] } : script(persona, turn)), hold.port);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    await untilHeld(hold.isHeld);
    const r = await sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} });
    expect(r.ok).toBe(true);
    const report = (r as { compression: { compressed: number; failed: { agent: string; reason: string }[] } }).compression;
    expect(report.compressed).toBe(0);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]!.reason).toContain('the compressor is down');
    expect(toasts).toEqual([]);
    expect(reports).toHaveLength(1);
    expect(reports[0]!.title).toBe('Context compression incomplete');
    expect(reports[0]!.severity).toBe('error');
    expect(reports[0]!.message).toBe('0 of 1 active agent context(s) compressed; 1 failed.');
    expect(reports[0]!.detail).toBe(`${report.failed[0]!.agent}: ${report.failed[0]!.reason}`);
    expect(reports[0]!.sessionId).toBe(sid);
    expect(timeline(sid).some((t) => t.name === 'context_compressed')).toBe(false);
    hold.release();
    await untilEnded(sid);
  });

  it('REQ-MONITOR-090/096: with no run the request is REFUSED with the reason, never failed — a session that never was, and one that has ended', async () => {
    const hold = holdingPort(99);
    const { sessions } = sessionsWith(script, hold.port);
    expect(await sessions.controlAsync({ op: 'forceCompression', sessionId: 'S404' as SessionId, args: {} })).toEqual({ ok: false, refusal: { code: 'no_run', message: 'No run is active.' } });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    await untilEnded(sid);
    expect(await sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} })).toEqual({ ok: false, refusal: { code: 'no_run', message: 'No run is active.' } });
    // The synchronous entry cannot await the pass; it answers the same refusal rather than a silent `false`.
    expect(sessions.control({ op: 'forceCompression', sessionId: sid, args: {} })).toEqual({ ok: false, refusal: { code: 'no_run', message: 'No run is active.' } });
  });

  it('REQ-CHAT-084 (live run): the rows go in one transaction with the entry, the owner republishes empty, and the run\'s next writes cannot resurrect them', async () => {
    const hold = holdingPort(2);
    const { sessions, pub, toasts } = sessionsWith(script, hold.port);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    await untilHeld(hold.isHeld);
    const before = rows(sid);
    expect(before.length).toBeGreaterThan(0);
    const maxBefore = Math.max(...before.map((r) => r.row_index));
    const incrementsBefore = pub.increments.length;
    expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(rows(sid)).toEqual([]);
    const entry = timeline(sid).find((t) => t.name === 'transcript_cleared');
    expect(entry).toBeDefined();
    expect((JSON.parse(entry!.metadata) as { removed: number }).removed).toBe(before.length);
    expect(toasts).toEqual([{ kind: 'ok', title: 'Transcript cleared. Session artifacts and agent state were kept.' }]);
    // The owner dropped what it held and re-projected: an increment from 0 carrying no rows, then the record.
    expect(pub.increments.slice(incrementsBefore).some((i) => i.fromIndex === 0 && i.rows.length === 0)).toBe(true);
    hold.release();
    await untilEnded(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    const after = rows(sid);
    // What the run wrote afterwards is there; nothing from before the clear came back, and no index was re-used.
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((r) => r.row_index > maxBefore)).toBe(true);
    expect(after.some((r) => r.kind === 'user')).toBe(false);
    // The wire record is NOT the transcript: the events that recorded the old rows stay (REQ-SESSION-147).
    const events = dal.db.prepare("SELECT count(*) AS n FROM events WHERE session_id = ? AND kind = 'transcript.row'").get(sid) as { n: number };
    expect(events.n).toBeGreaterThan(after.length);
  });

  it('REQ-CHAT-084 (named session): with no run the loaded session\'s snapshot is cleared atomically and re-projected', async () => {
    const hold = holdingPort(99);
    const { sessions, pub, toasts } = sessionsWith(script, hold.port);
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    await untilEnded(sid);
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
    const before = rows(sid).length;
    expect(before).toBeGreaterThan(0);
    const snapshotsBefore = pub.snapshots.length;
    expect(sessions.control({ op: 'clearTranscript', sessionId: sid, args: {} })).toEqual({ ok: true });
    expect(rows(sid)).toEqual([]);
    expect(dal.db.prepare('SELECT count(*) AS n FROM transcript_rows WHERE session_id = ?').get(sid)).toEqual({ n: 0 });
    expect(timeline(sid).filter((t) => t.name === 'transcript_cleared')).toHaveLength(1);
    expect(pub.snapshots.length).toBeGreaterThan(snapshotsBefore);
    expect(toasts.at(-1)).toEqual({ kind: 'ok', title: 'Transcript cleared. Session artifacts and agent state were kept.' });
    // A session this process never loaded cannot be addressed by a control (REQ-MONITOR-007's `false`).
    expect(sessions.control({ op: 'clearTranscript', sessionId: 'S404' as SessionId, args: {} })).toEqual({ ok: false });
  });
});
