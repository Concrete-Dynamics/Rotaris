import { describe, expect, it, vi } from 'vitest';
import { asSessionId, FakeClock } from '@rotaris/kernel';
import { LoopSupervisor, SUPERVISOR_DEFAULTS, type LoopActivation, type LoopClassification, type LoopClassifier, type SupervisorConfig } from './supervisor.js';

const sessionId = asSessionId('01JROOTSUPERVISOR00000000000');
const config = (overrides: Partial<SupervisorConfig> = {}): SupervisorConfig => ({ ...SUPERVISOR_DEFAULTS, ...overrides });
const classification = (loop_detected = true): LoopClassification => ({ loop_detected, reason: loop_detected ? 'circling' : 'progressing', corrective_message: 'Try the indexed path and verify the result before repeating the edit.' });
const classifier = (run: (activation: LoopActivation, signal: AbortSignal) => Promise<LoopClassification> = async () => classification()): LoopClassifier => ({ classify: run });
const tool = (s: LoopSupervisor, name: string, args: string) => s.observe({ kind: 'tool', name, args });
const message = (s: LoopSupervisor, text: string) => s.observe({ kind: 'message', text });

describe('loop supervisor (REQ-ORCH-099..107)', () => {
  it('evaluates repetition before raw counts and compares whole arguments', async () => {
    const seen: LoopActivation[] = [];
    const clock = new FakeClock();
    const s = new LoopSupervisor(sessionId, config({ toolThreshold: 4 }), classifier(async (a) => { seen.push(a); return classification(); }), clock);
    const prefix = 'x'.repeat(9_000);
    tool(s, 'write_file', `${prefix}A`);
    tool(s, 'write_file', `${prefix}A`);
    tool(s, 'write_file', `${prefix}A`);
    tool(s, 'write_file', `${prefix}B`);
    expect((await s.check()).kind).toBe('inject');
    expect(seen[0]?.trigger).toBe('raw-count');

    for (let i = 0; i < 4; i += 1) tool(s, 'write_file', `${prefix}C`);
    expect((await s.check()).kind).toBe('inject');
    expect(seen[1]?.trigger).toBe('repetition');
  });

  it('judges repetition and cycles over actions only, whatever the assistant says between them', async () => {
    // First-execution defect: with assistant text in the fingerprint series, a pure repetition fired
    // "repeated cycle" (identical text) or nothing at all (varying text) instead of "repeated action".
    const seen: LoopActivation[] = [];
    const s = new LoopSupervisor(sessionId, config(), classifier(async (a) => { seen.push(a); return classification(); }), new FakeClock());
    for (let i = 0; i < 4; i += 1) {
      message(s, `Reading the file again, attempt ${i}.`);
      tool(s, 'read_file', '{"path":"src/a.ts"}');
    }
    expect((await s.check()).kind).toBe('inject');
    expect(seen[0]?.trigger).toBe('repetition');
    expect(seen[0]?.events.filter((event) => event.kind === 'message')).toHaveLength(4);
  });

  it('recognises two-to-four-action cycles before count thresholds', async () => {
    const seen: LoopActivation[] = [];
    const s = new LoopSupervisor(sessionId, config(), classifier(async (a) => { seen.push(a); return classification(); }), new FakeClock());
    for (let i = 0; i < 3; i += 1) {
      tool(s, 'read_file', '{"path":"a.ts"}');
      tool(s, 'write_file', '{"path":"a.ts"}');
    }
    expect((await s.check()).kind).toBe('inject');
    expect(seen[0]?.trigger).toBe('cycle');
  });

  it('uses the configured weighted arithmetic', async () => {
    const seen: LoopActivation[] = [];
    const s = new LoopSupervisor(sessionId, config({ activationMode: 'weighted', toolThreshold: 10, messageThreshold: 10, repetitionThreshold: 99, cycleThreshold: 99 }), classifier(async (a) => { seen.push(a); return classification(false); }), new FakeClock());
    for (let i = 0; i < 10; i += 1) tool(s, `tool-${i}`, String(i));
    expect((await s.check()).kind).toBe('continue');
    expect(seen).toHaveLength(0);
    for (let i = 0; i < 10; i += 1) message(s, `message ${i}`);
    expect((await s.check()).kind).toBe('continue');
    expect(seen[0]?.reason).toBe('weighted event threshold');
  });

  it('applies the three classifier-failure fallback rules', async () => {
    const reject = classifier(async () => { throw new Error('offline'); });
    const repetition = new LoopSupervisor(sessionId, config(), reject, new FakeClock());
    for (let i = 0; i < 4; i += 1) tool(repetition, 'read_file', '{"path":"src/a.ts"}');
    expect(await repetition.check()).toMatchObject({ kind: 'inject' });

    // A real turn records each step's text before its calls, `''` for a step that only called tools (live-run finding D3).
    const rawClear = new LoopSupervisor(sessionId, config({ toolThreshold: 3, repetitionThreshold: 99, cycleThreshold: 99 }), reject, new FakeClock());
    for (let i = 0; i < 3; i += 1) { message(rawClear, ''); tool(rawClear, `tool-${i}`, String(i)); }
    expect((await rawClear.check()).kind).toBe('continue');

    const rawEvidence = new LoopSupervisor(sessionId, config({ messageThreshold: 3, repetitionThreshold: 99, cycleThreshold: 99 }), reject, new FakeClock());
    for (let i = 0; i < 3; i += 1) message(rawEvidence, 'Same   assistant answer');
    expect((await rawEvidence.check()).kind).toBe('inject');

    const stuck = new LoopSupervisor(sessionId, config(), classifier(async () => classification(false)), new FakeClock());
    stuck.observeStuck();
    expect((await stuck.check()).kind).toBe('inject');
  });

  describe('REQ-ORCH-104: a raw-count fallback never reads tool-only steps as identical messages (live-run finding D3)', () => {
    const reject = classifier(async () => { throw new Error('offline'); });
    /** One model step as a real turn records it (`runTurn`): its text first — `''` when it only called tools — then its calls. */
    const step = (s: LoopSupervisor, text: string, ...calls: [string, string][]) => { message(s, text); for (const [name, args] of calls) tool(s, name, args); };
    const raw = () => new LoopSupervisor(sessionId, config({ toolThreshold: 6, repetitionThreshold: 99, cycleThreshold: 99 }), reject, new FakeClock());

    it('distinct edits and reads, each in a tool-only step, are counts alone: no loop is declared', async () => {
      const s = raw();
      for (let i = 0; i < 3; i += 1) step(s, '', ['edit_file', `{"path":"docs/${i}.md","old":"a${i}","new":"b${i}"}`], ['read_file', `{"path":"docs/${i}.md"}`]);
      expect(await s.check()).toEqual({ kind: 'continue' });
    });

    it('whitespace-only texts are no message either', async () => {
      const s = raw();
      for (let i = 0; i < 3; i += 1) step(s, i === 1 ? ' \n\t' : '', ['edit_file', `{"path":"src/${i}.ts"}`], ['read_file', `{"path":"src/${i}.ts"}`]);
      expect((await s.check()).kind).toBe('continue');
    });

    it('three identical assistant messages are still evidence when tool-only steps fall between them', async () => {
      const s = raw();
      step(s, 'Checking the file once more.', ['read_file', '{"path":"a.ts"}']);
      step(s, '', ['edit_file', '{"path":"a.ts","n":1}']);
      step(s, 'checking the file   once more.', ['grep', '{"q":"x"}']);
      step(s, '', ['edit_file', '{"path":"a.ts","n":2}']);
      step(s, 'Checking the file once more.', ['glob', '{"p":"*"}']);
      step(s, '', ['write_file', '{"path":"b.ts"}']);
      expect((await s.check()).kind).toBe('inject');
    });

    it('four consecutive same-tool calls are still evidence in tool-only steps', async () => {
      const s = raw();
      for (let i = 0; i < 3; i += 1) step(s, '', ['read_file', `{"path":"x${i}.ts"}`], ['edit_file', `{"path":"x${i}.ts"}`]);
      for (let i = 0; i < 4; i += 1) step(s, '', ['grep', `{"q":"${i}"}`]);
      expect((await s.check()).kind).toBe('inject');
    });
  });

  it('resets event state after every activation and escalates the third consecutive activation', async () => {
    const s = new LoopSupervisor(sessionId, config({ repetitionThreshold: 1 }), classifier(), new FakeClock());
    tool(s, 'read_file', '{}');
    expect((await s.check()).kind).toBe('inject');
    expect((await s.check()).kind).toBe('continue');
    tool(s, 'read_file', '{}');
    expect((await s.check()).kind).toBe('inject');
    tool(s, 'read_file', '{}');
    const third = await s.check();
    expect(third).toMatchObject({ kind: 'escalate', signal: { sessionId, activationCount: 3, reason: 'repeated-loop' } });

    s.noteUserInstruction();
    tool(s, 'read_file', '{}');
    expect((await s.check()).kind).toBe('inject');
  });

  it('times out classification and uses deterministic evidence', async () => {
    const clock = new FakeClock();
    const aborted = vi.fn();
    const s = new LoopSupervisor(sessionId, config({ classificationTimeoutMs: 2_000 }), classifier(async (_a, signal) => {
      signal.addEventListener('abort', aborted, { once: true });
      return await new Promise<LoopClassification>(() => undefined);
    }), clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    const pending = s.check();
    clock.advance(2_000);
    const decision = await pending;
    expect(decision).toMatchObject({ kind: 'inject' });
    expect(aborted).toHaveBeenCalledOnce();
    if (decision.kind === 'inject') expect(decision.message).toContain('read_file around src/stuck.ts');
  });

  it('keeps separate state for separate supervisor instances', async () => {
    const a = new LoopSupervisor(sessionId, config(), classifier(), new FakeClock());
    const b = new LoopSupervisor(asSessionId('01JOTHERSUPERVISOR0000000000'), config(), classifier(), new FakeClock());
    for (let i = 0; i < 4; i += 1) tool(a, 'read_file', '{}');
    expect((await a.check()).kind).toBe('inject');
    expect((await b.check()).kind).toBe('continue');
  });
});
