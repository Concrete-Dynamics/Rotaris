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

    // PD-ORCH-016 (OQ-232, ruled 2026-10-07 under R-072): four consecutive calls are evidence only when they are the same
    // action by REQ-ORCH-101's comparison — the tool name and the whole arguments. This case read `inject` before the ruling.
    it('PD-ORCH-016: four consecutive calls of one tool with different arguments are counts alone, in tool-only steps too', async () => {
      const s = raw();
      for (let i = 0; i < 3; i += 1) step(s, '', ['read_file', `{"path":"x${i}.ts"}`], ['edit_file', `{"path":"x${i}.ts"}`]);
      for (let i = 0; i < 4; i += 1) step(s, '', ['grep', `{"q":"${i}"}`]);
      expect(await s.check()).toEqual({ kind: 'continue' });
    });

    /**
     * The a68f121 duress run's D6 (session e6747bd0): at wave2e-decisions's 60th call the classification was cut, and the
     * fallback read #229 to #232 — four read_file calls in two steps over test/extra.test.js and docs/decisions.md — as a
     * loop; timeline 43 read "Pause and reassess read_file around docs/decisions.md …" and the child spent a 24.5 s step on it.
     */
    it('PD-ORCH-016: a child reading two files of its own in two steps, assistant text between them, is not told to pause (D6)', async () => {
      const s = new LoopSupervisor(sessionId, config({ toolThreshold: 2, repetitionThreshold: 99, cycleThreshold: 99 }), reject, new FakeClock());
      step(s, 'Re-reading the tests the decisions cite.', ['read_file', '{"path":"test/extra.test.js","start_line":1,"end_line":120}'], ['read_file', '{"path":"docs/decisions.md","start_line":1,"end_line":80}']);
      step(s, 'Now the rest of both.', ['read_file', '{"path":"test/extra.test.js","start_line":121,"end_line":304}'], ['read_file', '{"path":"docs/decisions.md","start_line":81,"end_line":160}']);
      expect(await s.check()).toEqual({ kind: 'continue' });
    });

    it('PD-ORCH-016: an edit series on one document, four edits with different arguments, is counts alone', async () => {
      const s = raw();
      for (let i = 0; i < 2; i += 1) step(s, '', ['read_file', `{"path":"docs/v${i}.md"}`]);
      for (let i = 0; i < 4; i += 1) step(s, `Correcting finding ${i}.`, ['haet_edit', `{"path":"docs/verification.md","old_string":"n${i}","new_string":"m${i}"}`]);
      expect(await s.check()).toEqual({ kind: 'continue' });
    });

    it('PD-ORCH-016: four identical calls after a pending raw-count trigger are still evidence, and the message names the path', async () => {
      const s = raw();
      for (let i = 0; i < 3; i += 1) step(s, '', ['grep', `{"q":"${i}"}`], ['glob', `{"p":"${i}"}`]);
      for (let i = 0; i < 4; i += 1) step(s, i % 2 === 0 ? 'Reading it again.' : '', ['read_file', '{"path":"docs/decisions.md"}']);
      const decision = await s.check();
      expect(decision.kind).toBe('inject');
      expect(decision.kind === 'inject' ? decision.message : '').toContain('read_file around docs/decisions.md');
    });
  });

  /*
   * OQ-364 (ruled 2026-10-20 under R-072, no directive; a dated note beneath REQ-ORCH-101): two calls are the same action
   * when their tool names are equal and their arguments, read as JSON, are one value — every member at every depth, arrays
   * in order, nothing trimmed, cased or cut; the order an object's members were written in is no part of it. Text that does
   * not parse is compared whole as text and never equals a parsed value. Evidence: the default live run at cb6d1d5, scenario
   * crlf, session 4dad81df — 18 failing haet_edit calls whose keys alternated between two orders drew no activation.
   */
  describe("OQ-364: REQ-ORCH-101's same action compares the arguments as one JSON value", () => {
    const reject = classifier(async () => { throw new Error('offline'); });
    const A = '{"path":"crlf-live/greet.js","content_hash":"h1","old_string":"const greeting = \'Hello\';\\n\\tif (name) {","new_string":"const greeting = \'Hi\';\\n\\tif (name) {"}';
    const B = '{"content_hash":"h1","new_string":"const greeting = \'Hi\';\\n\\tif (name) {","old_string":"const greeting = \'Hello\';\\n\\tif (name) {","path":"crlf-live/greet.js"}';
    const watch = (s: LoopSupervisor, calls: readonly (readonly [string, string])[]) => {
      for (const [name, args] of calls) tool(s, name, args);
    };
    /** The call (1-based) after which a trigger first arms, and which: each prefix is observed by a fresh supervisor. */
    const firstTrigger = async (calls: readonly (readonly [string, string])[], overrides: Partial<SupervisorConfig> = {}) => {
      for (let upto = 1; upto <= calls.length; upto += 1) {
        const seen: LoopActivation[] = [];
        const s = new LoopSupervisor(sessionId, config(overrides), classifier(async (a) => { seen.push(a); return classification(); }), new FakeClock());
        watch(s, calls.slice(0, upto));
        if ((await s.check()).kind !== 'continue') return { at: upto, trigger: seen[0]?.trigger };
      }
      return { at: null, trigger: undefined };
    };
    const noTriggerXYYX = async (x: string, y: string, name = 'haet_edit') =>
      expect(await firstTrigger([[name, x], [name, y], [name, y], [name, x]])).toEqual({ at: null, trigger: undefined });

    it('the fixtures are one value written in two key orders', () => {
      expect(A).not.toBe(B);
      expect(JSON.parse(A)).toEqual(JSON.parse(B));
    });

    // Red before OQ-364's build: each of the next five compared the emitted text.
    it('four calls of one value in the key orders A, B, B, A fire "repeated action" at the fourth, and the fallback names haet_edit', async () => {
      expect(await firstTrigger([['haet_edit', A], ['haet_edit', B], ['haet_edit', B], ['haet_edit', A]])).toEqual({ at: 4, trigger: 'repetition' });
      const s = new LoopSupervisor(sessionId, config(), reject, new FakeClock());
      watch(s, [['haet_edit', A], ['haet_edit', B], ['haet_edit', B], ['haet_edit', A]]);
      const decision = await s.check();
      expect(decision).toMatchObject({ kind: 'inject', activation: { trigger: 'repetition' } });
      expect(decision.kind === 'inject' ? decision.message : '').toContain('haet_edit');
    });

    it('a width-2 cycle of two values, each written in two key orders across traversals, fires "repeated cycle" at the sixth call', async () => {
      const X1 = '{"path":"a.ts","line":1}';
      const X2 = '{"line":1,"path":"a.ts"}';
      const Y1 = '{"path":"b.ts","query":"q"}';
      const Y2 = '{"query":"q","path":"b.ts"}';
      expect(await firstTrigger([['read_file', X1], ['read_file', Y1], ['read_file', X2], ['read_file', Y2], ['read_file', X1], ['read_file', Y2]])).toEqual({ at: 6, trigger: 'cycle' });
    });

    it('PD-ORCH-016: four calls of one value in the key orders A, B, A, B after an armed raw-count trigger are evidence', async () => {
      const s = new LoopSupervisor(sessionId, config({ toolThreshold: 6, repetitionThreshold: 99, cycleThreshold: 99 }), reject, new FakeClock());
      for (let i = 0; i < 3; i += 1) watch(s, [['grep', `{"q":"${i}"}`], ['glob', `{"p":"${i}"}`]]);
      watch(s, [['haet_edit', A], ['haet_edit', B], ['haet_edit', A], ['haet_edit', B]]);
      const decision = await s.check();
      expect(decision).toMatchObject({ kind: 'inject', activation: { trigger: 'raw-count' } });
      expect(decision.kind === 'inject' ? decision.message : '').toContain('Pause and reassess haet_edit');
    });

    it('objects reordered at depth are one value', async () => {
      const P = '{"a":{"x":1,"y":[{"p":1,"q":2}]}}';
      const Q = '{"a":{"y":[{"q":2,"p":1}],"x":1}}';
      expect(await firstTrigger([['t', P], ['t', Q], ['t', Q], ['t', P]])).toEqual({ at: 4, trigger: 'repetition' });
    });

    it('whitespace between tokens is no part of the value', async () => {
      const S = '{"a": 1}';
      const C = '{"a":1}';
      expect(await firstTrigger([['t', S], ['t', C], ['t', C], ['t', S]])).toEqual({ at: 4, trigger: 'repetition' });
    });

    // Guards, green before and after: each turns red under an encoder that sorts arrays, trims or cases strings, cuts long
    // values, writes strings bare, drops `__proto__`, or leaves off the parsed/text tag.
    it('arrays are compared in their order', async () => {
      await noTriggerXYYX('{"paths":["a","b"]}', '{"paths":["b","a"]}');
    });

    it('two 9,000-character values differing only in their last character stay two actions, whatever their key order', async () => {
      const long = 'x'.repeat(8_999);
      const V1 = `{"path":"a.ts","new_string":"${long}A"}`;
      const V1r = `{"new_string":"${long}A","path":"a.ts"}`;
      const V2r = `{"new_string":"${long}B","path":"a.ts"}`;
      expect(await firstTrigger([['haet_edit', V1], ['haet_edit', V1r], ['haet_edit', V1], ['haet_edit', V2r]])).toEqual({ at: null, trigger: undefined });
    });

    it('strings differing only in surrounding whitespace, or only in letter case, are two actions', async () => {
      await noTriggerXYYX('{"q":"abc"}', '{"q":" abc "}');
      await noTriggerXYYX('{"q":"abc"}', '{"q":"ABC"}');
    });

    it('the string "1" and the number 1 are two actions', async () => {
      await noTriggerXYYX('{"n":"1"}', '{"n":1}');
    });

    it('a __proto__ member is kept', async () => {
      await noTriggerXYYX('{"__proto__":"x","a":1}', '{"a":1}');
    });

    it('unparseable text is compared whole as text and never equals a parsed value', async () => {
      expect(await firstTrigger([['t', '{"n":'], ['t', '{"n":'], ['t', '{"n":'], ['t', '{"n":']])).toEqual({ at: 4, trigger: 'repetition' });
      await noTriggerXYYX('{"n":Infinity}', '{"n":1e400}', 't');
      await noTriggerXYYX('{"n":1e400}', '{"n":null}', 't');
    });

    it('a nesting deep enough to exhaust the stack is observed without throwing and compared as text', async () => {
      const deep = '['.repeat(100_000) + ']'.repeat(100_000);
      const s = new LoopSupervisor(sessionId, config(), classifier(), new FakeClock());
      expect(() => { for (let i = 0; i < 4; i += 1) tool(s, 't', deep); }).not.toThrow();
      expect(await s.check()).toMatchObject({ kind: 'inject', activation: { trigger: 'repetition' } });
      // Whitespace after the value would not change a parsed value; compared as text, it is another action.
      await noTriggerXYYX(deep, `${deep} `, 't');
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

  // REQ-CONFIG-467 / REQ-NOTIFY-106 / REQ-NOTIFY-100: the configured bound is an upper bound only — a call is allowed no more
  // than what remains of the 2-second activation budget when it is dispatched, so a key set to 30 s still cuts it at 2 s.
  it('caps the classification at what remains of the activation budget, whatever the configured bound', async () => {
    const clock = new FakeClock();
    const aborted = vi.fn();
    const s = new LoopSupervisor(sessionId, config({ classificationTimeoutMs: 30_000 }), classifier(async (_a, signal) => {
      signal.addEventListener('abort', aborted, { once: true });
      return await new Promise<LoopClassification>(() => undefined);
    }), clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    let decision: unknown = 'still waiting';
    void s.check().then((d) => { decision = d; });
    clock.advance(2_000);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    expect(aborted).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({ kind: 'inject' });
  });

  it('keeps a configured bound below the budget as the bound', async () => {
    const clock = new FakeClock();
    const aborted = vi.fn();
    const s = new LoopSupervisor(sessionId, config({ classificationTimeoutMs: 500 }), classifier(async (_a, signal) => {
      signal.addEventListener('abort', aborted, { once: true });
      return await new Promise<LoopClassification>(() => undefined);
    }), clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    const pending = s.check();
    clock.advance(499);
    expect(aborted).not.toHaveBeenCalled();
    clock.advance(1);
    expect(await pending).toMatchObject({ kind: 'inject' });
    expect(aborted).toHaveBeenCalledOnce();
  });

  // REQ-NOTIFY-106 counts the budget from the activity satisfying the criteria — the observed call, which the turn reports
  // before it dispatches it — not from `check()` at the next step boundary, so the time that call (and the rest of its step)
  // took is spent from the budget before the classification is dispatched (fin35's review).
  it('allows the classification only what remains of the budget after the triggering step ran', async () => {
    const clock = new FakeClock();
    const aborted = vi.fn();
    const s = new LoopSupervisor(sessionId, config({ classificationTimeoutMs: 2_000 }), classifier(async (_a, signal) => {
      signal.addEventListener('abort', aborted, { once: true });
      return await new Promise<LoopClassification>(() => undefined);
    }), clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    clock.advance(1_500); // the fourth call runs for 1.5 s before the step boundary
    const pending = s.check();
    clock.advance(499);
    expect(aborted).not.toHaveBeenCalled();
    clock.advance(1);
    expect(await pending).toMatchObject({ kind: 'inject' });
    expect(aborted).toHaveBeenCalledOnce();
  });

  it('dispatches no classification once the budget is spent before the step boundary: a failed classification (REQ-NOTIFY-109)', async () => {
    const clock = new FakeClock();
    const classify = vi.fn(async () => classification());
    const s = new LoopSupervisor(sessionId, config({ classificationTimeoutMs: 30_000 }), { classify }, clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    clock.advance(2_000);
    const decision = await s.check();
    expect(classify).not.toHaveBeenCalled();
    expect(decision).toMatchObject({ kind: 'inject', activation: { trigger: 'repetition' } });
    if (decision.kind === 'inject') expect(decision.message).toContain('read_file around src/stuck.ts');
  });

  it('counts a later activation from its own trigger, not the first one', async () => {
    const clock = new FakeClock();
    const classify = vi.fn(async () => classification());
    const s = new LoopSupervisor(sessionId, config(), { classify }, clock);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    clock.advance(5_000);
    await s.check();
    clock.advance(5_000);
    for (let i = 0; i < 4; i += 1) tool(s, 'read_file', '{"path":"src/stuck.ts"}');
    await s.check();
    expect(classify).toHaveBeenCalledOnce();
  });

  /*
   * PD-ORCH-009 revision 3 (OQ-282, ruled 2026-10-13 under R-072 as E1), narrowing REQ-ORCH-104's stuck-mode clause for
   * the one turn the entry role's answer re-prompt answers: that empty turn is no stuck report. The run withdraws the
   * trigger the turn armed before it sends ANSWER_REPROMPT, so no classification is asked and no corrective message joins
   * the re-prompt. Live run at ce5f952 (F1): the steering followed the re-prompt in the same request.
   */
  describe('PD-ORCH-009 revision 3: withdrawStuck', () => {
    it('withdraws a pending stuck trigger, and the next check continues with no classification', async () => {
      const classify = vi.fn(async () => classification());
      const s = new LoopSupervisor(sessionId, config(), { classify }, new FakeClock());
      message(s, '');
      s.observeStuck();
      s.withdrawStuck();
      expect(await s.check()).toEqual({ kind: 'continue' });
      expect(classify).not.toHaveBeenCalled();
    });

    it('keeps a pending raw-count trigger: only a stuck one is withdrawn', async () => {
      const seen: LoopActivation[] = [];
      const s = new LoopSupervisor(sessionId, config({ messageThreshold: 1, repetitionThreshold: 99, cycleThreshold: 99 }), classifier(async (a) => { seen.push(a); return classification(); }), new FakeClock());
      message(s, '');
      // The raw-count trigger armed first; the stuck report finds it pending and arms nothing.
      s.observeStuck();
      s.withdrawStuck();
      expect((await s.check()).kind).toBe('inject');
      expect(seen.map((a) => a.trigger)).toEqual(['raw-count']);
    });

    it('leaves the consecutive-activation count unchanged', async () => {
      const seen: LoopActivation[] = [];
      const s = new LoopSupervisor(sessionId, config({ repetitionThreshold: 1 }), classifier(async (a) => { seen.push(a); return classification(); }), new FakeClock());
      tool(s, 'read_file', '{}');
      expect((await s.check()).kind).toBe('inject');
      s.observeStuck();
      s.withdrawStuck();
      expect((await s.check()).kind).toBe('continue');
      tool(s, 'read_file', '{}');
      expect((await s.check()).kind).toBe('inject');
      // Neither reset to zero nor counted: the activation after the withdrawn one is the second of the series.
      expect(seen.map((a) => a.activationCount)).toEqual([1, 2]);
    });
  });

  it('keeps separate state for separate supervisor instances', async () => {
    const a = new LoopSupervisor(sessionId, config(), classifier(), new FakeClock());
    const b = new LoopSupervisor(asSessionId('01JOTHERSUPERVISOR0000000000'), config(), classifier(), new FakeClock());
    for (let i = 0; i < 4; i += 1) tool(a, 'read_file', '{}');
    expect((await a.check()).kind).toBe('inject');
    expect((await b.check()).kind).toBe('continue');
  });
});
