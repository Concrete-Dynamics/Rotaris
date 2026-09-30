import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock, mintMachineId, type MachineId, type SessionId } from '@rotaris/kernel';
import { migrateStore, openStore, StoreDal, forgetSpelling } from '@rotaris/store';
import { answer, DefaultAgentBackend, modelError, ScriptedModelClient, toolCalls, type ChatMessage, type ModelRef, type ScriptedCall } from '@rotaris/model';
import { BUILT_IN_PERSONAS, RUN_CONFIG_DEFAULTS, Sessions, type ModelLookup, type Publisher, type RoleName, type RunConfig, type ToolPort } from '../index.js';
import { Conversation, estimateTokens, preservedFrom, turnStarts } from './conversation.js';
import { clampSummary, compress, compressionReason, rebuild, SUMMARY_LINE_CAP, type ResolvedTrigger } from './compression.js';

/**
 * Part AH (ADR-0060) — context compression. The pure half proves the reconstruction REQ-MONITOR-084 fixes and
 * the turn alignment ADR-0060 decision 2 chose; the run half proves REQ-ORCH-093's condense-and-retry and
 * REQ-MONITOR-076's threshold against a real run through `Sessions`.
 */
const HOST = mintMachineId('0000000000000000000000000000000e') as MachineId;
const A1: ModelRef = { providerId: 'a', modelId: 'a1', dialect: 'chat' };
const text = (role: 'user' | 'assistant', body: string): ChatMessage => ({ role, content: [{ kind: 'text', text: body }] } as ChatMessage);
const call = (id: string): ChatMessage => ({ role: 'assistant', content: [{ kind: 'tool-call', callId: id, name: 'read_file', args: '{}' }] });
const result = (id: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId: id, name: 'read_file', result: 'contents', isError: false }] });
const TRIGGER: ResolvedTrigger = { tokens: 600, thresholdPercentage: 60, capacity: 1000, advertisedInputLimit: 1000, defaultThreshold: 265_000 };

describe('engine/run/compression — the reconstruction and the turn alignment (REQ-MONITOR-082/083/084)', () => {
  it('a cut never separates a tool result from the call that named it, at every preserved-turn count', () => {
    // The failure this rule exists to prevent: a slice between `call` and `result` leaves a tool message whose
    // callId no assistant message claims, which providers reject with a 400 — compression producing a rejection.
    const messages = [text('user', 'the original request'), call('c1'), result('c1'), text('user', 'second turn'), call('c2'), result('c2'), text('user', 'third turn'), call('c3'), result('c3')];
    // Boundaries are the non-`tool` indices: a `tool` message always follows the assistant that named its call.
    expect(turnStarts(messages)).toEqual([0, 1, 3, 4, 6, 7]);
    for (const keep of [1, 2, 3, 4]) {
      const from = preservedFrom(messages, keep);
      const tail = messages.slice(from);
      const claimed = new Set(tail.flatMap((m) => (m.role === 'assistant' ? m.content.filter((p) => p.kind === 'tool-call').map((p) => p.callId) : [])));
      const orphans = tail.flatMap((m) => (m.role === 'tool' ? m.content.map((p) => p.callId) : [])).filter((id) => !claimed.has(id));
      expect(orphans).toEqual([]);
    }
  });

  it('keeping more turns than exist never repeats the original request, and keeping none preserves nothing', () => {
    const messages = [text('user', 'first'), call('c1'), result('c1'), text('user', 'second')];
    // The original request is carried separately by REQ-MONITOR-084 (2); preserving it again would duplicate it.
    expect(preservedFrom(messages, 9)).toBe(1);
    expect(preservedFrom(messages, 0)).toBe(messages.length);
  });

  it('REQ-MONITOR-084: the rebuilt context is exactly the five parts, in order, and nothing else', () => {
    const messages = [text('user', 'the original request'), call('c1'), result('c1'), text('user', 'recent turn'), call('c2'), result('c2')];
    const rebuilt = rebuild(messages[0]!, 'what happened', ['[open] main — do the thing'], messages.slice(3));
    expect(rebuilt).toHaveLength(6);
    expect(rebuilt[0]).toBe(messages[0]);
    expect(JSON.stringify(rebuilt[1])).toContain('what happened');
    expect(JSON.stringify(rebuilt[2])).toContain('do the thing');
    // (5) the preserved turns come LAST, verbatim, immediately before the next model call.
    expect(rebuilt.slice(3)).toEqual(messages.slice(3));
    // Nothing of the compressed middle survives: the tool call and its result are gone.
    expect(JSON.stringify(rebuilt).includes('"callId":"c1"')).toBe(false);
  });

  it('REQ-MONITOR-083: the 300-line bound applies to the summary alone; the todo items and the turns are untouched', () => {
    const long = Array.from({ length: 420 }, (_, i) => `line ${i}`).join('\n');
    const clamped = clampSummary(long);
    expect(clamped.split('\n')).toHaveLength(SUMMARY_LINE_CAP + 1);
    expect(clamped).toContain('120 further lines omitted');
    const todos = Array.from({ length: 40 }, (_, i) => `[open] main — item ${i}`);
    const turns = Array.from({ length: 12 }, (_, i) => text('user', `turn ${i}`));
    const rebuilt = rebuild(text('user', 'original'), clamped, todos, turns);
    // One for one, and in their original relative order — never cut to fit the summary's bound.
    expect(JSON.stringify(rebuilt[2])).toContain('item 39');
    expect(rebuilt.slice(3)).toEqual(turns);
  });

  it('REQ-MONITOR-082: none of the three survivors is sent to the compressing model', async () => {
    const seen: string[] = [];
    const conv = new Conversation([text('user', 'THE-ORIGINAL-REQUEST'), call('c1'), result('c1'), text('user', 'recent'), call('c2'), result('c2')]);
    const backend = { runTurn: async (req: { messages: readonly ChatMessage[] }) => { seen.push(JSON.stringify(req.messages)); return { status: 'succeeded' as const, text: 'the summary', usage: { input: 1, output: 1 } }; } };
    const out = await compress({ conversation: conv, preserveRecentTurns: 1, charsPerToken: 4, todoLines: [] }, { backend: backend as never, model: A1, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' }, new AbortController().signal);
    expect(out.ok).toBe(true);
    expect(seen.join('')).not.toContain('THE-ORIGINAL-REQUEST');
    // The original request is nonetheless the first thing in the rebuilt conversation, character for character.
    expect(conv.snapshot()[0]).toEqual(text('user', 'THE-ORIGINAL-REQUEST'));
  });

  describe('REQ-MONITOR-082 (OQ-153, acceptance A12): the compressing model reads the whole history it replaces', () => {
    /** A read whose result is `size` characters, its fact at the END — past REQ-ORCH-110's 2,000 per event. */
    const read = (i: number, size: number): ChatMessage[] => [
      { role: 'assistant', content: [{ kind: 'tool-call', callId: `r${i}`, name: 'read_file', args: `{"path":"src/f${i}.js"}` }] },
      { role: 'tool', content: [{ kind: 'tool-result', callId: `r${i}`, name: 'read_file', result: `${'x'.repeat(size - 12)}FACT-${String(i).padStart(4, '0')}.`, isError: false }] },
    ];
    /** What the compressing model was asked, and a conversation of `reads` reads of `size` characters each. */
    function asked(reads: number, size: number, inputTokens?: number) {
      const seen: string[] = [];
      const history = Array.from({ length: reads }, (_, i) => read(i, size)).flat();
      const conv = new Conversation([text('user', 'THE-ORIGINAL-REQUEST'), ...history, text('user', 'RECENT-TURN')]);
      const backend = { runTurn: async (req: { messages: readonly ChatMessage[] }) => { seen.push(req.messages.map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('')); return { status: 'succeeded' as const, text: 'the summary', usage: { input: 1, output: 1 } }; } };
      const deps = { backend: backend as never, model: A1, thinking: 'unset' as const, timers: new FakeClock().timers, credentialFor: () => async () => 'k', ...(inputTokens !== undefined ? { inputTokens } : {}) };
      return { run: () => compress({ conversation: conv, preserveRecentTurns: 1, charsPerToken: 4, todoLines: [] }, deps, new AbortController().signal), seen, history };
    }

    it('at the default trigger (60 % of 265,000 tokens at 4 characters each), a history of 150 reads of 4,000 characters is given whole: every fact, the last before the preserved turns included, and no omission', async () => {
      const a = asked(150, 4_000, 159_000);
      expect((await a.run()).ok).toBe(true);
      const ask = a.seen[0]!;
      expect(ask.length).toBeGreaterThan(600_000);
      for (const i of [0, 1, 74, 148, 149]) expect(ask).toContain(`FACT-${String(i).padStart(4, '0')}.`);
      expect(ask).not.toContain('characters omitted');
      // The preserved turn and the original request are not sent (REQ-MONITOR-082).
      expect(ask).not.toContain('RECENT-TURN');
      expect(ask).not.toContain('THE-ORIGINAL-REQUEST');
    });

    it('a history longer than the compressing model\'s own threshold keeps its start and its most recent part within it, the omission marked between them with its count', async () => {
      // 2,000 tokens at 4 characters: 8,000 characters for a history of 40 reads of 1,000.
      const a = asked(40, 1_000, 2_000);
      expect((await a.run()).ok).toBe(true);
      const activity = a.seen[0]!.slice(a.seen[0]!.indexOf('Activity:\n') + 'Activity:\n'.length);
      expect(activity.length).toBeLessThanOrEqual(8_000);
      expect(activity.length).toBeGreaterThan(8_000 - 10);
      expect(activity.startsWith('tool-call read_file: {"path":"src/f0.js"}\n')).toBe(true);
      expect(activity.endsWith('FACT-0039.')).toBe(true);
      const marker = /\n… \[(\d+) characters omitted\] …\n/.exec(activity);
      expect(marker).not.toBeNull();
      // The count is exactly what was left out: the whole less what is shown on either side and the one line break the marker stands in for.
      const whole = a.history.flatMap((m) => m.content.map((p) => (p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : ''))).join('\n');
      expect(Number(marker![1])).toBe(whole.length - (activity.length - marker![0].length) - 1);
    });
  });

  it('a failed compressing pass changes nothing, so the caller can surface the original rejection', async () => {
    const before: ChatMessage[] = [text('user', 'original'), call('c1'), result('c1'), text('user', 'recent')];
    const conv = new Conversation(before);
    const backend = { runTurn: async () => ({ status: 'failed' as const, text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'http', status: 500, headline: 'the compressor is down' }) }) };
    const out = await compress({ conversation: conv, preserveRecentTurns: 1, charsPerToken: 4, todoLines: [] }, { backend: backend as never, model: A1, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' }, new AbortController().signal);
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('the compressor is down');
    expect(conv.snapshot()).toEqual(before);
  });

  it('PD-ORCH-005 clause 12: a pass that finishes after its turn ended replaces nothing and records nothing', async () => {
    // Part AO's manual pass runs under the control's own signal, so it can outlive the turn it was started on; the
    // agent's next turn by then works on a new conversation built from this one's history (found by phase 2's review).
    const before: ChatMessage[] = [text('user', 'original'), call('c1'), result('c1'), call('c2'), result('c2'), text('user', 'recent')];
    const replaced: unknown[] = [];
    const conv = new Conversation(before, { appended: () => undefined, replaced: (ms) => { replaced.push(ms); } });
    let release!: () => void;
    const hold = new Promise<void>((r) => { release = r; });
    const backend = { runTurn: async () => { await hold; return { status: 'succeeded' as const, text: 'Work performed: x. Findings reached: y. Questions left open: none.', usage: { input: 0, output: 0 } }; } };
    const pending = compress({ conversation: conv, preserveRecentTurns: 1, charsPerToken: 4, todoLines: [] }, { backend: backend as never, model: A1, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' }, new AbortController().signal);
    conv.close();
    release();
    const out = await pending;
    expect(out.ok).toBe(false);
    expect(out.reason).toContain('turn ended before the compressing pass completed');
    expect(replaced).toEqual([]);
    expect(conv.snapshot()).toEqual(before);
  });

  it('ADR-0060 decision 1: a replacement never mutates the array a call in flight was given', () => {
    const conv = new Conversation([text('user', 'original'), text('assistant', 'a')]);
    const inFlight = conv.snapshot();
    conv.replace([text('user', 'original'), text('assistant', 'rebuilt')]);
    expect(inFlight).toHaveLength(2);
    expect(JSON.stringify(inFlight[1])).toContain('"a"');
    expect(JSON.stringify(conv.snapshot()[1])).toContain('rebuilt');
  });

  it('REQ-CONFIG-135: the reason names all four inputs and the resulting token number, and says which count it read', () => {
    const provider = compressionReason(TRIGGER, 700, 'provider');
    expect(provider).toContain('60 %');
    expect(provider).toContain('1,000');
    expect(provider).toContain('600 tokens');
    expect(provider).toContain('265,000');
    expect(provider).toContain("provider's last prompt count");
    expect(compressionReason(TRIGGER, 700, 'estimate')).toContain('estimate from character length');
  });

  it('nothing to compress is a NO-OP, not a failure: it is flagged so no issue is recorded for it', async () => {
    // The first live run against a real provider crossed the threshold with `preserve_recent_turns: 2` on a
    // three-boundary conversation, so everything after the original request was already preserved. The
    // automatic trigger is evaluated before EVERY step, so recording that as a failure would put one warning
    // issue on every remaining step of the run.
    const conv = new Conversation([text('user', 'original'), text('assistant', 'only one turn')]);
    const backend = { runTurn: async () => { throw new Error('the compressing model must not be called'); } };
    const out = await compress({ conversation: conv, preserveRecentTurns: 2, charsPerToken: 4, todoLines: [] }, { backend: backend as never, model: A1, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' }, new AbortController().signal);
    expect(out.ok).toBe(false);
    expect(out.nothingToDo).toBe(true);
    expect(out.reason).toContain('nothing lies between');
  });

  it('a pass that FAILED is not a no-op, so it still records and still surfaces', async () => {
    const conv = new Conversation([text('user', 'original'), call('c1'), result('c1'), text('user', 'recent')]);
    const backend = { runTurn: async () => ({ status: 'failed' as const, text: '', usage: { input: 0, output: 0 }, error: modelError({ code: 'http', status: 500, headline: 'down' }) }) };
    const out = await compress({ conversation: conv, preserveRecentTurns: 1, charsPerToken: 4, todoLines: [] }, { backend: backend as never, model: A1, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' }, new AbortController().signal);
    expect(out.ok).toBe(false);
    expect(out.nothingToDo).toBe(false);
  });

  it('REQ-CONFIG-132: the estimate counts every textual part at the configured ratio', () => {
    expect(estimateTokens([text('user', 'x'.repeat(40))], 4)).toBe(10);
    expect(estimateTokens([result('c1')], 4)).toBe(Math.ceil(('contents'.length + 'read_file'.length) / 4));
  });
});

describe('engine/run/compression — in a run (REQ-ORCH-093, REQ-MONITOR-076/086)', () => {
  let dir: string;
  let dal: StoreDal;
  let clock: FakeClock;
  const warnings: string[] = [];
  let minted = 0;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rotaris-compression-'));
    const db = openStore(join(dir, 'workspace.db'));
    migrateStore(db);
    dal = new StoreDal(db);
    clock = new FakeClock();
    warnings.length = 0;
  });
  afterEach(() => { dal.db.close(); forgetSpelling(dir); rmSync(dir, { recursive: true, force: true }); });

  const contextRejection = (): ScriptedCall => ({ parts: [{ error: modelError({ code: 'http', status: 400, headline: 'prompt is too long', providerMessage: 'reduce the length of the messages' }) }] });
  const recorder = (): Publisher & { snapshots: unknown[] } => { const snapshots: unknown[] = []; return { snapshots, increment: () => undefined, snapshot: (p) => snapshots.push(p.session) }; };

  /** A one-tool port, so a turn takes several steps and the conversation actually grows. */
  const globPort = (resultText?: (n: number) => string): ToolPort => { let n = 0; return {
    specs: () => [{ name: 'glob', description: 'list files', parameters: { type: 'object' } }],
    dispatch: async () => ({ text: resultText ? resultText(++n) : ['README.md', 'NOTES.md'].join(String.fromCharCode(10)), isError: false, status: 'ok', durationMs: 1, label: 'glob', args: {} }),
    cancelPending: () => 0, setMode: () => ({ requested: 'ask', effective: 'ask', downgraded: false, reason: '', previous: 'ask' }), currentMode: () => 'ask', answerApproval: () => false,
  }; };

  function sessionsWith(script: (persona: string, turn: number) => ScriptedCall, compression: { triggerTokens?: number; preserveRecentTurns?: number; resultText?: (n: number) => string } = {}) {
    const counts = new Map<string, number>();
    /** What each compressing pass was asked: every message after its system prompt, as text. */
    const asked: string[] = [];
    const client = new ScriptedModelClient([]);
    const original = client.stream.bind(client);
    client.stream = (req) => {
      const system = req.messages[0]?.content.map((p) => (p.kind === 'text' ? p.text : '')).join('') ?? '';
      const persona = /^You condense an agent conversation/.test(system) ? 'compressor' : /^You are the orchestrator/.test(system) ? 'orchestrator' : 'child';
      const n = (counts.get(persona) ?? 0) + 1;
      counts.set(persona, n);
      if (persona === 'compressor') asked.push(req.messages.slice(1).map((m) => m.content.map((p) => (p.kind === 'text' ? p.text : '')).join('')).join('\n'));
      client.push(script(persona, n));
      return original(req);
    };
    const config: RunConfig = { ...RUN_CONFIG_DEFAULTS, model: A1, credentialFor: () => async () => 'k' };
    const backend = new DefaultAgentBackend(client);
    const models = (key: string): ModelLookup => ({ ok: false, reason: `'${key}' is not a configured model` });
    const personas = { resolve: (name: string) => { const base = BUILT_IN_PERSONAS[name as RoleName]; return base ? { persona: base, alias: null } : null; }, knownRoles: () => Object.keys(BUILT_IN_PERSONAS) };
    const pub = recorder();
    const sessions = new Sessions({
      clocks: clock, publisher: pub, pid: 78, host: HOST, retentionCap: 20_000, warn: (m) => warnings.push(m), mintSessionId: () => `S${++minted}`,
      model: null, sessionFilesDir: (_d, sid) => join(dir, 'sessions', sid), attended: () => true, onRunResult: () => undefined,
      tools: () => globPort(compression.resultText),
      configure: () => ({ ok: true, value: {
        model: {
          backend, config,
          compression: {
            model: null, timeoutMs: 120_000, charsPerToken: 4, preserveRecentTurns: compression.preserveRecentTurns ?? 1,
            triggerFor: () => ({ ...TRIGGER, tokens: compression.triggerTokens ?? 0 }),
          },
        },
        models, personas,
        runtime: { permissionMode: 'ask', allowUnsandboxedAutonomous: false, sandbox: { requested: false, available: false, backend: '' }, sessionLogLevel: 'WARNING', drainTimeoutMs: 0 },
        resilience: { catalogue: [], fallbackModel: null },
      } }),
    });
    return { sessions, client, pub, counts, asked };
  }
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const timeline = (sid: SessionId) => dal.timelineOf(sid);
  const issues = (sid: SessionId) => dal.issuesOf(sid).map((i) => i.kind);

  it('REQ-ORCH-093: a context rejection condenses and retries, and the run completes on the compressed context', async () => {
    // Turn 1 answers with a tool-free reply so the conversation holds something to compress; turn 2 is rejected
    // for context; the condensation runs and turn 3 succeeds over the rebuilt history.
    const { sessions, counts } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: read the repository. Findings reached: none. Questions left open: none.');
      if (turn <= 2) return toolCalls([{ callId: `c${turn}`, name: 'glob', args: { pattern: '**/*' } }], 'looking');
      if (turn === 3) return contextRejection();
      return answer('done on the compressed context');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(counts.get('compressor')).toBe(1);
    expect(issues(sid)).toContain('llm_bad_request');
    const entry = timeline(sid).find((t) => t.name === 'context_compressed');
    expect(entry).toBeDefined();
    // REQ-CONFIG-135: the four inputs and the token number as SEPARATE machine-readable fields.
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta['threshold_percentage']).toBe(60);
    expect(meta['capacity']).toBe(1000);
    expect(meta['advertised_input_limit']).toBe(1000);
    expect(meta['default_threshold']).toBe(265_000);
    expect(meta['trigger']).toBe('rejection');
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it('REQ-ORCH-093: when the condensation itself fails, the ORIGINAL rejection is what surfaces and the call fails', async () => {
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return { parts: [{ error: modelError({ code: 'http', status: 500, headline: 'the compressor is down' }) }] };
      return turn <= 2 ? toolCalls([{ callId: `c${turn}`, name: 'glob', args: {} }], 'looking') : contextRejection();
    });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 40 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(timeline(sid).some((t) => t.name === 'context_compressed')).toBe(false);
    expect(issues(sid)).toContain('compression_failed');
    expect(dal.getSession(sid)!.execution_status).toBe('failed');
    // The step failed with the provider's own rejection, not with the compressor's.
    expect(warnings.some((w) => w.includes('prompt is too long'))).toBe(true);
  });

  it('REQ-ORCH-093: at most twice for one call — a rejection that survives two condensations fails the step', async () => {
    let compressions = 0;
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') { compressions += 1; return answer(`Work performed: summary ${compressions}. Findings reached: none. Questions left open: none.`); }
      return turn <= 2 ? toolCalls([{ callId: `c${turn}`, name: 'glob', args: {} }], 'looking') : contextRejection();
    });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(compressions).toBe(2);
    expect(dal.getSession(sid)!.execution_status).toBe('failed');
  });

  it('REQ-MONITOR-076 + REQ-MONITOR-089: a threshold crossed with nothing to compress records NO issue, and the entry reading is published', async () => {
    // The shape the first live run hit: the count is over the threshold from the first step, and everything
    // after the original request is inside the preserved turns.
    const { sessions, pub, counts } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') throw new Error('the compressing model must not be called');
      return turn === 1 ? toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking', { input: 900, output: 10 }) : answer('done');
    }, { triggerTokens: 600, preserveRecentTurns: 4 });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(counts.get('compressor')).toBeUndefined();
    expect(issues(sid)).not.toContain('compression_failed');
    expect(timeline(sid).some((t) => t.name === 'context_compressed')).toBe(false);
    // REQ-MONITOR-089: the entry role holds no children row, so this is the only place its reading reaches a
    // surface — and it is the LATEST measurement, never a high-water mark, so the 900 gives way to the next step's.
    const snapshots = pub.snapshots as { entryContext: { used: number; limit: number } }[];
    expect(snapshots.some((s) => s.entryContext.used === 900)).toBe(true);
    expect(snapshots.at(-1)!.entryContext.used).toBe(10);
  });

  it('compression that cannot help is latched off after ONE wasted pass, not repeated every step', async () => {
    /**
     * The first live run's shape: the provider counts ~9,300 prompt tokens against a 600 trigger while the
     * conversation itself is tiny, because the system prompt and the tool definitions dominate and compression
     * may not touch them (REQ-MONITOR-082). Before the guard this compressed on every step — eight times in one
     * run, a model call and ~3 s each, shortening nothing.
     */
    let compressions = 0;
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') { compressions += 1; return answer('Work performed: some. Findings reached: none. Questions left open: none.'); }
      // Every step reports a prompt far over the trigger, whatever the conversation holds.
      // The counted prompt never falls, because the tool definitions — not the conversation — are what fills it.
      return turn <= 6 ? toolCalls([{ callId: `c${turn}`, name: 'glob', args: {} }], 'looking', { input: 9_000 + turn, output: 10 }) : answer('done');
    }, { triggerTokens: 600, preserveRecentTurns: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 80 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    // Two compressions at most: the first has nothing to judge, the second is measured and found not to help.
    expect(compressions).toBeLessThanOrEqual(2);
    expect(timeline(sid).filter((t) => t.name === 'context_compressed').length).toBeLessThanOrEqual(2);
    expect(warnings.some((w) => w.includes('automatic context compression is switched off'))).toBe(true);
    expect(warnings.some((w) => w.includes('REQ-MONITOR-082'))).toBe(true);
  });

  it('PD-ORCH-005 clause 2 (found by phase 3\'s second review): the manual compression is refused while the run comes to rest — it would be a model call', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions, counts } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: some. Findings reached: none. Questions left open: none.');
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking');
      if (turn === 2) return { parts: [{ hold: held }, ...answer('done').parts] };
      return answer('never');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && [...counts.values()].reduce((a, b) => a + b, 0) < 2; i++) await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    const refused = await sessions.controlAsync({ op: 'forceCompression', sessionId: sid, args: {} });
    expect(refused).toEqual({ ok: false, refusal: { code: 'run_coming_to_rest', message: 'The run is coming to rest; nothing is compressed until it is continued.' } });
    release();
    await sessions.running(sid)!;
    expect(counts.get('compressor')).toBeUndefined();
  });

  it('PD-ORCH-005 clause 2: a pause accepted while the threshold compresses allows no step after the compression', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions, counts } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return { parts: [{ hold: held }, ...answer('Work performed: a lot. Findings reached: some. Questions left open: none.').parts] };
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking', { input: 20, output: 10 });
      if (turn === 2) return toolCalls([{ callId: 'c2', name: 'glob', args: {} }], 'looking again', { input: 900, output: 10 });
      return answer('never');
    }, { triggerTokens: 600, preserveRecentTurns: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && counts.get('compressor') !== 1; i++) await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    const steps = [...counts.entries()].filter(([persona]) => persona !== 'compressor').reduce((n, [, c]) => n + c, 0);
    expect(steps).toBe(2);
    expect(timeline(sid).some((t) => t.name === 'context_compressed')).toBe(true);
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
  });

  it('PD-ORCH-005 clause 4 (found by phase 4\'s review): a context rejection of a resumed root\'s first call is an ordinary one — the resume carries on from its record, and is not REQ-ORCH-093\'s parent resume', async () => {
    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: looked. Findings reached: none. Questions left open: none.');
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking');
      if (turn === 2) return { parts: [{ hold: held }, ...toolCalls([{ callId: 'c2', name: 'glob', args: {} }], 'looking again').parts] };
      if (turn === 3) return contextRejection();
      return answer('done');
    });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.residentRows(sid).filter((r) => r.kind === 'tool').length < 1; i++) await tick();
    await tick();
    expect(sessions.control({ op: 'pause', sessionId: sid, args: {} })).toEqual({ ok: true });
    release();
    await sessions.running(sid)!;
    expect(dal.iterationsOf(sid)).toMatchObject([{ state: 'open', interruption: 'pause' }]);
    expect(sessions.continueSession(sid, 'continue').ok).toBe(true);
    await sessions.running(sid)!;
    expect(issues(sid)).toContain('llm_bad_request');
    expect(issues(sid)).not.toContain('parent_resume_bad_request');
  });

  it('REQ-MONITOR-076/081/086: the threshold compresses BEFORE the next call, the count rises once, and the reading falls', async () => {
    // The first step reports 900 prompt tokens against a trigger of 600, so the SECOND step compresses first.
    const { sessions, pub, counts } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: a lot. Findings reached: some. Questions left open: none.');
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking', { input: 20, output: 10 });
      if (turn === 2) return toolCalls([{ callId: 'c2', name: 'glob', args: {} }], 'looking again', { input: 900, output: 10 });
      return answer('done');
    }, { triggerTokens: 600, preserveRecentTurns: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(counts.get('compressor')).toBe(1);
    const entry = timeline(sid).find((t) => t.name === 'context_compressed');
    expect(entry).toBeDefined();
    const meta = JSON.parse(entry!.metadata) as Record<string, unknown>;
    expect(meta['trigger']).toBe('automatic');
    // REQ-MONITOR-081: the provider's own figure was available and was preferred over the estimate.
    expect(meta['count_source']).toBe('provider');
    expect(meta['counted_tokens']).toBe(900);
    // REQ-MONITOR-085: the record published the compression while it ran, and nothing after it.
    const snapshots = pub.snapshots as { compression: { agent: string } | null }[];
    expect(snapshots.some((s) => s.compression !== null)).toBe(true);
    expect(snapshots.at(-1)!.compression).toBeNull();
    // REQ-MONITOR-086: one completion, counted once — a second iteration must not re-count it.
    expect(timeline(sid).filter((t) => t.name === 'context_compressed')).toHaveLength(1);
  });

  it('REQ-MONITOR-082 (OQ-153, acceptance A12): the compressing pass reads the history up to its model\'s own threshold at chars_per_token, each event whole, and not 12,000 characters of its head', async () => {
    // Three results of 6,000 characters, each with its fact at the END; the fourth step reports 5,000 prompt tokens
    // against a trigger of 4,000, so the fifth compresses first. The compressing model is the agent's own, whose
    // threshold is those 4,000 tokens: 16,000 characters at 4 each, for a history of some 18,100.
    const { sessions, counts, asked } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: three globs. Findings reached: three facts. Questions left open: none.');
      if (turn <= 3) return toolCalls([{ callId: `c${turn}`, name: 'glob', args: {} }], `looking ${turn}`, { input: 20, output: 10 });
      if (turn === 4) return toolCalls([{ callId: 'c4', name: 'glob', args: {} }], 'looking 4', { input: 5_000, output: 10 });
      return answer('done');
    }, { triggerTokens: 4_000, preserveRecentTurns: 1, resultText: (n) => `${'y'.repeat(5_990)}FACT-${n}.` });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    expect(counts.get('compressor')).toBe(1);
    const activity = asked[0]!.slice(asked[0]!.indexOf('Activity:\n') + 'Activity:\n'.length);
    expect(activity.length).toBeLessThanOrEqual(16_000);
    expect(activity.length).toBeGreaterThan(12_100);
    // The most recent part before the preserved turn is whole, its fact past REQ-ORCH-110's 2,000 per event included.
    expect(activity.endsWith('FACT-3.')).toBe(true);
    expect(activity).toContain('FACT-2.');
    // The start is the agent's first act, and the omission between is marked.
    expect(activity.startsWith('assistant: looking 1\n')).toBe(true);
    expect(activity).toMatch(/\n… \[\d+ characters omitted\] …\n/);
    // The preserved turn is not sent.
    expect(activity).not.toContain('FACT-4.');
    expect(dal.getSession(sid)!.execution_status).toBe('completed');
  });

  it("REQ-SESSION-139 / ADR-0008: a completed compression INCREMENTS the session's compressions aggregate", async () => {
    /**
     * Measured after a real 22-minute run: three `context_compressed` timeline entries against
     * `sessions.compressions = 0`. The per-agent counter was kept (`activity.compressed`) and the session-wide
     * one was declared, rehydrated and copied into every save with nothing ever adding to it, so the two
     * records of the same fact disagreed. ADR-0008 rules the aggregate MAINTAINED, not recomputed: the figure
     * is raised where the completion happens, and never by counting the timeline back.
     */
    const { sessions } = sessionsWith((persona, turn) => {
      if (persona === 'compressor') return answer('Work performed: a lot. Findings reached: some. Questions left open: none.');
      if (turn === 1) return toolCalls([{ callId: 'c1', name: 'glob', args: {} }], 'looking', { input: 20, output: 10 });
      if (turn === 2) return toolCalls([{ callId: 'c2', name: 'glob', args: {} }], 'looking again', { input: 900, output: 10 });
      return answer('done');
    }, { triggerTokens: 600, preserveRecentTurns: 1 });
    const sid = (sessions.start(dal, 'C:/ws', 'do the thing') as { value: SessionId }).value;
    for (let i = 0; i < 60 && dal.getSession(sid)!.execution_status === 'running'; i++) await tick();
    const entries = timeline(sid).filter((t) => t.name === 'context_compressed');
    expect(entries).toHaveLength(1);
    // The two records of one fact must agree: the per-agent counter and the session-wide aggregate.
    expect(dal.getSession(sid)!.compressions).toBe(entries.length);
  });
});
