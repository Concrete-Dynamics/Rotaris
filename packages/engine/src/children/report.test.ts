import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import { commandsFrom, deterministicTesterReport, editedFilesFrom, fallbackReport, produceReport, reportFacts, reportTranscript, TRANSCRIPT_CAP, type ReportInput, type SummariserDeps } from './report.js';
import { commandsForArtifact } from './ledger.js';
import { childPayload } from './notify.js';
import { interruptedResult, ranBeforeItWasCut } from '../run/interruption.js';

/**
 * REQ-ORCH-108..112 and the specification's "Child report artifact (behavioral schema)": the report names
 * the child's edited files and the commands it ran. Both used to come from the summarising MODEL alone —
 * `commands` was hardcoded empty at all three construction sites and `edited_files` was whatever JSON the
 * model wrote. Measured after a real 22-minute run: a child that wrote five files and ran eight terminal
 * commands reported neither, and another reported a prose sentence where a path belongs. The transcript the
 * report is built from already holds the ground truth, so both fields are DERIVED from it here.
 */
const call = (callId: string, name: string, args: unknown): ChatMessage => ({ role: 'assistant', content: [{ kind: 'tool-call', callId, name, args: typeof args === 'string' ? args : JSON.stringify(args) }] });
const result = (callId: string, name: string, text: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId, name, result: text, isError: false }] });
const say = (role: 'user' | 'assistant', text: string): ChatMessage => ({ role, content: [{ kind: 'text', text }] }) as ChatMessage;

/** REQ-TOOLS-098/100: the observation is the detail, the output section, then the diagnostic block — last, and sorted. */
const observation = (detail: string, output: string, fields: Record<string, unknown>): string =>
  `${detail}\n[terminal_output]\n${output === '' ? '(no output)' : output}\n[terminal_diagnostic] ${JSON.stringify(fields)}`;

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  agentName: 'Create-Architecture-Documentation-Files', role: 'coding-agent', status: 'succeeded', messages: [], toolCallCount: 0, toolsUsed: [],
  lastText: 'wrote the documents', finalTextIsFinal: true, ...over,
});

describe('engine/children/report — commands derived from the transcript (REQ-ORCH-108/110)', () => {
  it('takes the command from the call and the exit code from the paired diagnostic block', () => {
    const messages = [
      say('user', 'do the thing'),
      call('t1', 'terminal', { command: 'pnpm test' }),
      result('t1', 'terminal', observation('The command exited with code 0.', 'all green', { backend: 'pwsh', command: 'pnpm test', exit_code: 0, outcome_kind: 'success' })),
      call('t2', 'terminal', { command: 'git status' }),
      result('t2', 'terminal', observation('The command exited with code 1.', 'nope', { backend: 'pwsh', command: 'git status', exit_code: 1, outcome_kind: 'shell_failure' })),
    ];
    expect(commandsFrom(messages)).toEqual([{ command: 'pnpm test', exit_code: 0 }, { command: 'git status', exit_code: 1 }]);
  });

  /**
   * PD-LIBRARY-001. The two halves of the wiring meet at one shape, and the report's is snake-cased where the
   * artifact record's is not. This is that join, asserted against `commandsFrom`'s REAL output rather than a
   * hand-written literal, because a test that restates the shape cannot fail when the shape moves.
   */
  it('PD-LIBRARY-001: what the report carries is what the artifact record takes, field for field', () => {
    const messages = [
      call('t1', 'terminal', { command: 'pnpm test' }),
      result('t1', 'terminal', observation('The command exited with code 0.', 'all green', { backend: 'pwsh', command: 'pnpm test', exit_code: 0, outcome_kind: 'success' })),
      call('t2', 'terminal', { command: 'wc -l x' }),
      result('t2', 'terminal', observation('The command exited with code 1.', 'nope', { backend: 'pwsh', command: 'wc -l x', exit_code: 1, outcome_kind: 'shell_failure' })),
      call('t3', 'terminal', { command: 'tail -f log', background: true }),
      result('t3', 'terminal', 'Started in the background.'),
    ];
    expect(commandsForArtifact(commandsFrom(messages))).toEqual([
      { command: 'pnpm test', exitCode: 0 },
      { command: 'wc -l x', exitCode: 1 },
      { command: 'tail -f log', exitCode: null },
    ]);
    // The hop crosses `Record<string, unknown>`, which a model's own output reaches, so neither half may
    // assume the other was well formed.
    expect(commandsForArtifact(undefined)).toEqual([]);
    expect(commandsForArtifact([{ command: '' }, { command: 'ok', exit_code: 'two' }, null, 'bare'])).toEqual([{ command: 'ok', exitCode: null }]);
  });

  it('reports a null exit code when the block carries none, and when no result was paired at all', () => {
    // REQ-TOOLS-100 DROPS a null-valued key from the block, so an absent `exit_code` is how null reaches here —
    // which is why the field is nullable. A call cut short before its result leaves nothing to pair.
    const messages = [
      call('t1', 'terminal', { command: 'npm start', background: true }),
      result('t1', 'terminal', observation('Background session started: ts_0000000a', '', { backend: 'pwsh', command: 'npm start', outcome_kind: 'background_running' })),
      call('t2', 'terminal', { command: 'sleep 600' }),
    ];
    expect(commandsFrom(messages)).toEqual([{ command: 'npm start', exit_code: null }, { command: 'sleep 600', exit_code: null }]);
  });

  it('a terminal action that names no command is not a command, and unparseable arguments are skipped rather than thrown on', () => {
    const messages = [
      call('t1', 'terminal', { session_action: 'list' }),
      call('t2', 'terminal', '{"command": "pnpm buil'),
      call('t3', 'terminal', { command: '   ' }),
      call('t4', 'grep', { pattern: 'x' }),
      call('t5', 'terminal', { command: 'echo ok' }),
      result('t5', 'terminal', observation('The command exited with code 0.', 'ok', { command: 'echo ok', exit_code: 0 })),
    ];
    expect(commandsFrom(messages)).toEqual([{ command: 'echo ok', exit_code: 0 }]);
  });

  it('a diagnostic marker inside the command OUTPUT does not shadow the real block, which is always last', () => {
    const messages = [
      call('t1', 'terminal', { command: 'cat log.txt' }),
      result('t1', 'terminal', observation('The command exited with code 0.', '[terminal_diagnostic] {"exit_code":99}', { command: 'cat log.txt', exit_code: 0 })),
    ];
    expect(commandsFrom(messages)).toEqual([{ command: 'cat log.txt', exit_code: 0 }]);
  });
});

describe('engine/children/report — edited files derived from the transcript (REQ-ORCH-108/109)', () => {
  it('takes the path from every write tool under either argument name, in call order, without repeating one', () => {
    const messages = [
      call('w1', 'write_file', { operation: 'create', path: 'docs/a.md', content: 'x' }),
      call('w2', 'haet_edit', { file_path: 'docs/b.md', content_hash: 'a'.repeat(64), old_string: 'x', new_string: 'y' }),
      call('w3', 'haet', { path: 'docs/b.md', content_hash: 'b'.repeat(64), old_string: 'y', new_string: 'z' }),
      call('r1', 'read_file', { path: 'docs/c.md' }),
    ];
    expect(editedFilesFrom(messages)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it("unions the summariser's own list AFTER the derived paths, so a genuine mention is not lost and an invented one cannot displace a real path", () => {
    // The run that found this reported `["Memory: domain-design/core-domain (comprehensive domain model
    // specification)"]` — prose the model wrote, and the only thing the field held.
    const messages = [call('w1', 'write_file', { operation: 'create', path: 'docs/a.md', content: 'x' })];
    expect(editedFilesFrom(messages, ['docs/a.md', 'Memory: domain-design/core-domain'])).toEqual(['docs/a.md', 'Memory: domain-design/core-domain']);
    expect(editedFilesFrom([], ['docs/only-the-model-said-so.md'])).toEqual(['docs/only-the-model-said-so.md']);
  });
});

/**
 * `a-reports-edited-files-counts-refused-writes`: the path of a write CALL was listed whatever answered it, so a write a
 * sibling's claim refused (PD-TOOLS-006), the permission gate refused, or a `haet_edit` whose find text matched nothing
 * reached `edited_files`, the fallback's "Files touched" and — since OQ-111 — the facts the pass "must never deny".
 */
describe('engine/children/report — a write the record answers with an error is not an edit (REQ-ORCH-108, REQ-ORCH-109, PD-TOOLS-006, OQ-111)', () => {
  const refused = (callId: string, name: string, text: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId, name, result: text, isError: true }] });
  const CLAIMED = 'docs/api.md is inside the write scope another child holds; write only inside your own scope.';
  const messages = [
    call('w1', 'write_file', { operation: 'create', path: 'docs/a.md', content: 'x' }), result('w1', 'write_file', 'Created docs/a.md'),
    call('w2', 'write_file', { operation: 'overwrite', path: 'docs/api.md', content: 'y' }), refused('w2', 'write_file', CLAIMED),
    call('w3', 'haet_edit', { path: 'docs/b.md', content_hash: 'a'.repeat(64), old_string: 'x', new_string: 'y' }), refused('w3', 'haet_edit', 'old_string was not found in docs/b.md. Read it again with haet_read.'),
    call('w4', 'haet', { file_path: 'docs/c.md', content_hash: 'b'.repeat(64), old_string: 'x', new_string: 'y' }), refused('w4', 'haet', 'The permission gate refused this call.'),
    say('assistant', 'wrote the documents'),
  ];

  it('lists only the writes that were answered without an error', () => {
    expect(editedFilesFrom(messages)).toEqual(['docs/a.md']);
  });

  it('a path refused once and written later is listed once, at the write that landed', () => {
    const retried = [...messages, call('w5', 'haet_edit', { path: 'docs/b.md', content_hash: 'c'.repeat(64), old_string: 'x', new_string: 'y' }), result('w5', 'haet_edit', 'applied')];
    expect(editedFilesFrom(retried)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it("the summariser's own list cannot bring back a path whose every write was refused", () => {
    expect(editedFilesFrom(messages, ['docs/api.md', 'docs/b.md', 'docs/notes.md'])).toEqual(['docs/a.md', 'docs/notes.md']);
  });

  it("the summariser's own list spelled another way — a leading `./`, backslashes, a doubled slash — neither brings back a refused path nor repeats a listed one", () => {
    expect(editedFilesFrom(messages, ['./docs/api.md', 'docs\\b.md', 'docs//c.md', '.\\docs\\a.md', 'docs/notes.md'])).toEqual(['docs/a.md', 'docs/notes.md']);
  });

  it("the summariser's own list with a `./` segment inside the path — `docs/./api.md` — neither brings back a refused path nor repeats a listed one", () => {
    expect(editedFilesFrom(messages, ['docs/./api.md', 'docs/././b.md', 'docs\\.\\a.md', 'docs/notes.md'])).toEqual(['docs/a.md', 'docs/notes.md']);
  });

  it('the facts, the fallback\'s "Files touched" and every construction site agree', async () => {
    expect(reportFacts(messages)).toBe('Edited files: docs/a.md\nCommands run: (none)');
    const fallback = fallbackReport(input({ messages, toolCallCount: 4, lastText: '' }), 'no summariser is configured');
    expect(fallback.edited_files).toEqual(['docs/a.md']);
    expect(fallback.summary).toContain('Files touched: docs/a.md.');
    expect(fallback.summary).not.toContain('docs/api.md');
    // REQ-ORCH-111's tester path takes at most eight events: the four calls and their answers.
    const tester = deterministicTesterReport(input({ role: 'tester', messages: messages.slice(0, 8), toolCallCount: 4, lastText: 'all green' }));
    expect(tester!.edited_files).toEqual(['docs/a.md']);
    const asked: string[] = [];
    const backend = {
      runTurn: async (req: { messages: { content: { text: string }[] }[] }) => {
        asked.push(req.messages[0]!.content[0]!.text);
        return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: JSON.stringify({ summary: 'wrote docs/a.md; the other writes were refused', key_findings: [], next_actions: [], tags: ['implementation'], edited_files: ['docs/a.md', 'docs/api.md'] }) };
      },
    };
    const s: SummariserDeps = { backend: backend as never, model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' };
    const r = await produceReport(input({ messages, toolCallCount: 4 }), s, new AbortController().signal);
    expect(asked[0]).toContain('Facts:\nEdited files: docs/a.md\n');
    expect(r!.edited_files).toEqual(['docs/a.md']);
  });
});

describe('engine/children/report — a write that was under way when a rest, a stop or a crash cut it off is still an edit (REQ-ORCH-109, OQ-111, PD-ORCH-005 clause 3)', () => {
  // Found by the verification of the repair above: the turn answers a call cut off after its executor started with an
  // error even when the write had landed (the pause's tool deadline, the stop's abort), and a crash's continue answers a
  // row still `running` the same way. The record keeps what it produced; the report may not deny it.
  const cutOff = (callId: string, name: string, text: string): ChatMessage => ({ role: 'tool', content: [{ kind: 'tool-result', callId, name, result: text, isError: true }] });
  const messages = [
    call('w1', 'write_file', { operation: 'overwrite', path: 'src/app.ts', content: 'x' }), cutOff('w1', 'write_file', interruptedResult('pause', true, 'Overwrote src/app.ts')),
    call('w2', 'haet_edit', { path: 'src/b.ts', content_hash: 'a'.repeat(64), old_string: 'x', new_string: 'y' }), cutOff('w2', 'haet_edit', interruptedResult(null, true, '')),
    call('w3', 'haet', { file_path: 'src/c.ts', content_hash: 'b'.repeat(64), old_string: 'x', new_string: 'y' }), cutOff('w3', 'haet', interruptedResult('crash', true, 'applied')),
    call('w4', 'write_file', { operation: 'create', path: 'src/never.ts', content: 'x' }), cutOff('w4', 'write_file', interruptedResult('pause', false, '')),
    call('w5', 'haet_edit', { path: 'src/withdrawn.ts', content_hash: 'c'.repeat(64), old_string: 'x', new_string: 'y' }), cutOff('w5', 'haet_edit', interruptedResult('stop', false, 'The approval was withdrawn.')),
    say('assistant', 'done'),
  ];

  it('a call cut off after it started is listed, whatever cut it and whatever it had produced; one that never started is not', () => {
    expect(editedFilesFrom(messages)).toEqual(['src/app.ts', 'src/b.ts', 'src/c.ts']);
    expect(reportFacts(messages)).toBe('Edited files: src/app.ts, src/b.ts, src/c.ts\nCommands run: (none)');
    expect(fallbackReport(input({ messages, toolCallCount: 5, lastText: '' }), 'no summariser is configured').summary).toContain('Files touched: src/app.ts, src/b.ts, src/c.ts.');
  });

  it("the summariser's own list may name a path a cut-off call wrote, and still not one only a call that never started named", () => {
    expect(editedFilesFrom(messages, ['src/app.ts', 'src/never.ts'])).toEqual(['src/app.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('only the statement heads the turn writes count: a refusal that merely quotes one is still a refusal', () => {
    const quoted = [call('w6', 'write_file', { operation: 'create', path: 'src/q.ts', content: 'x' }), cutOff('w6', 'write_file', `Refused.\n${interruptedResult('pause', true, '')}`)];
    expect(editedFilesFrom(quoted)).toEqual([]);
    expect(ranBeforeItWasCut(interruptedResult('quit', true, 'line one\nline two'))).toBe(true);
    expect(ranBeforeItWasCut(interruptedResult('quit', false, ''))).toBe(false);
  });
});

describe('engine/children/report — every construction site carries them', () => {
  const messages = [
    call('w1', 'write_file', { operation: 'create', path: 'docs/a.md', content: 'x' }),
    call('t1', 'terminal', { command: 'pnpm test' }),
    result('t1', 'terminal', observation('The command exited with code 0.', 'green', { command: 'pnpm test', exit_code: 0 })),
    say('assistant', 'wrote the documents'),
  ];

  it('the fallback report: a summariser that FAILED still knows what ran (REQ-ORCH-110)', () => {
    const r = fallbackReport(input({ messages, toolCallCount: 2 }), 'no summariser is configured');
    expect(r.commands).toEqual([{ command: 'pnpm test', exit_code: 0 }]);
    expect(r.edited_files).toEqual(['docs/a.md']);
    expect(r.errors.some((e) => e.type === 'summary_failure')).toBe(true);
  });

  it('the fallback report of a SILENT child states what it did, rather than the two words it used to (REQ-ORCH-088/108)', () => {
    // The shape the autopsy found: a child with a long transcript, cut off by its ceiling before it spoke.
    // `lastText` is empty, so the old fallback's whole summary was `Tools used: write_file, terminal` and
    // its key findings were `[]` — from which a parent could only conclude the work had not happened.
    const r = fallbackReport(
      input({ messages, toolCallCount: 96, toolsUsed: ['write_file', 'terminal'], lastText: '', finalTextIsFinal: false, status: 'failed', errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }] }),
      'two attempts produced no usable report',
    );
    expect(r.summary).toContain('Child timed out after 1200s');
    expect(r.summary).toContain('96 tool calls;');
    expect(r.summary).toContain('docs/a.md');
    expect(r.summary).toContain('two attempts produced no usable report');
    expect(r.key_findings).toHaveLength(1);
    // REQ-ORCH-110 is untouched: a child that never concluded has no final response.
    expect(r.final_response).toBe('');
  });

  it("a fallback for a child that DID speak still leads with the child's own words", () => {
    const r = fallbackReport(input({ messages, toolCallCount: 2 }), 'no summariser is configured');
    expect(r.summary).toBe('wrote the documents');
    expect(r.key_findings).toEqual([]);
  });

  it('the deterministic tester path (REQ-ORCH-111) carries them with no model call', () => {
    const r = deterministicTesterReport(input({ role: 'tester', messages, toolCallCount: 2, lastText: 'all green' }));
    expect(r).not.toBeNull();
    expect(r!.commands).toEqual([{ command: 'pnpm test', exit_code: 0 }]);
    expect(r!.edited_files).toEqual(['docs/a.md']);
  });

  it("the shaped report: the transcript's paths lead, the model's own list follows, and the commands are the transcript's alone", async () => {
    const backend = {
      runTurn: async () => ({ status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: JSON.stringify({ summary: 'wrote a document and ran the tests', key_findings: [], next_actions: [], tags: ['implementation'], edited_files: ['Memory: domain-design/core-domain'], commands: [{ command: 'rm -rf /', exit_code: 0 }] }) }),
    };
    const s: SummariserDeps = { backend: backend as never, model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' };
    const r = await produceReport(input({ messages, toolCallCount: 2 }), s, new AbortController().signal);
    expect(r!.summary).toBe('wrote a document and ran the tests');
    expect(r!.edited_files).toEqual(['docs/a.md', 'Memory: domain-design/core-domain']);
    // The model may not author this field: what ran is a fact of the transcript, not of the summary.
    expect(r!.commands).toEqual([{ command: 'pnpm test', exit_code: 0 }]);
  });

  describe('PD-ORCH-005 clauses 2 and 3 / REQ-ORCH-133 (found by phase 3\'s second review): a pass cut short makes no further call', () => {
    const summariser = (answers: (signal: AbortSignal) => Promise<unknown>) => {
      const calls: AbortSignal[] = [];
      const s: SummariserDeps = {
        backend: { runTurn: async (_req: unknown, _sink: unknown, signal: AbortSignal) => { calls.push(signal); return answers(signal); } } as never,
        model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k',
      };
      return { s, calls };
    };
    const unusable = async () => ({ status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: 'not json' });

    it('an attempt the child\'s abort cut off is the last: no retry, and no report', async () => {
      const abort = new AbortController();
      const { s, calls } = summariser(async (signal) => { abort.abort(); return { status: 'failed' as const, usage: { input: 0, output: 0 }, error: { headline: signal.aborted ? 'aborted' : 'x' } }; });
      expect(await produceReport(input({ messages, toolCallCount: 2 }), s, abort.signal)).toBeNull();
      expect(calls).toHaveLength(1);
    });

    it('a pass already aborted makes no call at all', async () => {
      const abort = new AbortController();
      abort.abort();
      const { s, calls } = summariser(unusable);
      expect(await produceReport(input({ messages, toolCallCount: 2 }), s, abort.signal)).toBeNull();
      expect(calls).toHaveLength(0);
    });

    it('a rest accepted during the first attempt allows no second: the unusable answer is not retried', async () => {
      let resting = false;
      const { s, calls } = summariser(async () => { resting = true; return unusable(); });
      expect(await produceReport(input({ messages, toolCallCount: 2 }), s, new AbortController().signal, undefined, () => resting)).toBeNull();
      expect(calls).toHaveLength(1);
    });

    it('with neither, the second attempt is made as before', async () => {
      const { s, calls } = summariser(unusable);
      const r = await produceReport(input({ messages, toolCallCount: 2 }), s, new AbortController().signal, undefined, () => false);
      expect(calls).toHaveLength(2);
      expect(r!.errors.at(-1)).toMatchObject({ type: 'summary_failure' });
    });
  });

  /*
   * OQ-189's ruling (R-071, PD-MONITOR-007): where the summarising model and the model the child ran on are both held out of
   * quota, the session's resolver answers `withheld` and the pass makes no call: the report is the fallback one, with the
   * resolver's reason. Until 2026-10-06 the resolver could only answer a model, and the excluded pair was called.
   */
  describe('OQ-189 / PD-MONITOR-007: a summariser the session withholds makes no call', () => {
    const own = { model: { providerId: 'b', modelId: 'b1', dialect: 'chat' as const }, thinking: 'unset' as const };
    it('a resolver answering withheld: no summarising call, and the fallback report names the reason', async () => {
      const calls: unknown[] = [];
      const asked: unknown[] = [];
      const s: SummariserDeps = {
        backend: { runTurn: async (req: unknown) => { calls.push(req); return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: '{"summary":"called"}' }; } } as never,
        model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k',
        resolve: (choice, agent) => { asked.push({ choice, agent }); return { withheld: 'the summarising model a/a1 is held out of quota, and so is the model the agent ran on; no summarising call was made' }; },
      };
      const r = await produceReport({ ...input({ messages, toolCallCount: 2 }), agentModel: own }, s, new AbortController().signal);
      expect(calls).toHaveLength(0);
      // The resolver is asked with the configured summariser and the child's own model, so it can fall back to the latter.
      expect(asked).toEqual([{ choice: { model: s.model, thinking: 'unset' }, agent: own }]);
      expect(r!.summary).toBe('wrote the documents');
      expect(r!.errors.at(-1)).toEqual({ type: 'summary_failure', message: 'the summarising model a/a1 is held out of quota, and so is the model the agent ran on; no summarising call was made' });
    });
    it('a resolver answering the child\'s own model: the one call goes to it', async () => {
      const models: string[] = [];
      const s: SummariserDeps = {
        backend: { runTurn: async (req: { model: { modelId: string } }) => { models.push(req.model.modelId); return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: '{"summary":"on b1"}' }; } } as never,
        model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k',
        resolve: (_choice, agent) => agent ?? { withheld: 'none' },
      };
      const r = await produceReport({ ...input({ messages, toolCallCount: 2 }), agentModel: own }, s, new AbortController().signal);
      expect(models).toEqual(['b1']);
      expect(r!.summary).toBe('on b1');
    });
  });
});

/**
 * OQ-111 (the live-run finding D1): the duress run's child `d` read for thirty-odd calls before its first edit, and its
 * summariser was handed the transcript cut to 12,000 characters from the head — the task and the first reads, ending
 * `… [63288 characters omitted]` before any write. Five of seven stored reports then denied the edits their own
 * `edited_files` listed. The shape below is that transcript's: the child's REQ-TOOLS-154 payload — the workspace root,
 * the write scopes, the sibling index and an inherited report AHEAD of the task, which comes last — then many large
 * reads, the edits, the check, and the final answer.
 */
describe('engine/children/report — OQ-111: the pass reads the start and the most recent part, beside the facts (REQ-ORCH-110, REQ-ORCH-108, REQ-ORCH-109)', () => {
  const TASK = [
    'TASK: Reconcile docs/api.md and docs/overview.md: find EVERY disagreement between the two and fix it in both files.',
    'EXPECTED OUTCOME: both documents agree on every signature, count and name; a list of what changed.',
    'MUST DO: read src/ before deciding which side is right; edit only the two documents; run node --test afterwards.',
    'MUST NOT DO: change any source file; delete a section either document has.',
  ].join('\n');
  const SCOPES = "Write scopes:\n- Yours: 'docs/api.md', 'docs/overview.md'.";
  const INDEX = 'PRIOR SIBLING ARTIFACT INDEX\n' + Array.from({ length: 5 }, (_, i) => `- sibling-${i}-documented-part-${i} (art_k58dGC4${i}) persona=docs-writer status=succeeded`).join('\n');
  const INHERITED = 'INHERITED CONTEXT\n### a (docs-writer) — succeeded\n' + 'The api document lists five exported functions with their parameters and return values. '.repeat(16);
  const PAYLOAD = childPayload('/ws', TASK, '', [INDEX], SCOPES, INHERITED);
  const AHEAD = PAYLOAD.length - TASK.length;
  const file = (i: number) => Array.from({ length: 60 }, (_, l) => `${l + 1}: line ${l + 1} of source file ${i} with some content to read`).join('\n');
  const FINAL = 'assistant: Reconciled the two documents: the addTodo signature and the function count now agree in both.';
  const duress = (opening: ChatMessage = say('user', PAYLOAD)): ChatMessage[] => {
    const out: ChatMessage[] = [opening];
    for (let i = 0; i < 34; i += 1) {
      out.push(call(`r${i}`, 'read_file', { path: `src/f${i}.js` }), result(`r${i}`, 'read_file', file(i)));
    }
    out.push(
      call('e1', 'haet_edit', { path: 'docs/api.md', edits: [{ find: 'addTodo(title)', replace: 'addTodo(todos, title)' }] }), result('e1', 'haet_edit', 'applied 1 edit to docs/api.md'),
      call('e2', 'haet_edit', { path: 'docs/overview.md', edits: [{ find: 'five functions', replace: 'six functions' }] }), result('e2', 'haet_edit', 'applied 1 edit to docs/overview.md'),
      call('t1', 'terminal', { command: 'node --test' }), result('t1', 'terminal', observation('ran node --test', '# pass 7\n# fail 0', { exit_code: 0, status: 'exited' })),
      say('assistant', FINAL.slice('assistant: '.length)),
    );
    return out;
  };
  /** REQ-ORCH-110's per-event cut, as the test states it independently of the unit. */
  const event = (x: string) => (x.length > 2_000 ? `${x.slice(0, 2_000)}… [${x.length - 2_000} characters omitted]` : x);
  const events = (messages: readonly ChatMessage[]) => messages.flatMap((m) => m.content.map((p) => event(p.kind === 'text' ? `${m.role}: ${p.text}` : p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : '')));
  const TRANSCRIPT_MARKER = /\n… \[(\d+) characters omitted\] …\n/;

  it('the shape is the finding\'s: the payload passes 2,000 characters and carries the task last', () => {
    expect(PAYLOAD.length).toBeGreaterThan(2_000);
    expect(PAYLOAD.endsWith(`\n\n${TASK}`)).toBe(true);
    expect(PAYLOAD.startsWith('Workspace root: /ws.')).toBe(true);
  });

  it('the head-only cut it replaces loses every edit of the duress shape (the finding, reproduced)', () => {
    // The cut as it was: each event to 2,000, the whole to 12,000 from its head.
    expect(events(duress()).join('\n').slice(0, TRANSCRIPT_CAP)).not.toContain('tool-call haet_edit');
  });

  it("the first repair's start — the first event, cut to 2,000 — is the payload's blocks and loses the task behind them (the verification's finding, reproduced)", () => {
    const t = reportTranscript(duress());
    expect(t.startsWith('user: Workspace root: /ws.')).toBe(true);
    expect(t).not.toContain('TASK: Reconcile');
  });

  it("keeps the task as given — the whole of it, the payload's blocks ahead of it marked omitted — and the most recent part — the edits, the check and the final answer — within the 12,000 cap, the omission marked between them with its count", () => {
    const messages = duress();
    const t = reportTranscript(messages, TASK);
    expect(t.length).toBeLessThanOrEqual(TRANSCRIPT_CAP);
    expect(t.length).toBeGreaterThan(TRANSCRIPT_CAP - 10);
    const start = `user: … [${AHEAD} characters omitted] … ${TASK}`;
    expect(t.startsWith(`${start}\n`)).toBe(true);
    for (const section of ['TASK: Reconcile', 'EXPECTED OUTCOME:', 'MUST DO:', 'MUST NOT DO:']) expect(t).toContain(section);
    expect(t).toContain('tool-call haet_edit: {"path":"docs/api.md"');
    expect(t).toContain('tool-call haet_edit: {"path":"docs/overview.md"');
    expect(t).toContain('tool-call terminal: {"command":"node --test"}');
    expect(t.endsWith(FINAL)).toBe(true);
    const marker = TRANSCRIPT_MARKER.exec(t);
    expect(marker).not.toBeNull();
    expect(marker!.index).toBe(start.length);
    // The count is exactly what was left out: the transcript with the task as its start (each event already cut to
    // 2,000), less what is shown on either side of the marker and the one line break the marker stands in for.
    const full = [start, ...events(messages).slice(1)].join('\n');
    expect(Number(marker![1])).toBe(full.length - (t.length - marker![0].length) - 1);
  });

  it("a task longer than REQ-ORCH-110's 2,000 per event is kept whole, its closing sections included, within the 12,000 total (OQ-119 as ruled, PD-ORCH-007)", () => {
    const long = `${TASK}\nCONTEXT: ${'the documents were written by two different agents at different times. '.repeat(40)}\nCLOSING: report each document you changed.`;
    const opening = childPayload('/ws', long, '', [INDEX], SCOPES, INHERITED);
    const t = reportTranscript(duress(say('user', opening)), long);
    const whole = `user: … [${opening.length - long.length} characters omitted] … ${long}`;
    expect(whole.length).toBeGreaterThan(2_000);
    // Before the ruling the start was `event(whole)`: its head, the closing section lost to the per-event cut.
    expect(event(whole)).not.toContain('CLOSING: report each document you changed.');
    expect(t.startsWith(`${whole}\n… [`)).toBe(true);
    expect(t).toContain('MUST NOT DO:');
    expect(t).toContain('CLOSING: report each document you changed.');
    expect(t.length).toBeLessThanOrEqual(TRANSCRIPT_CAP);
    expect(t.endsWith(FINAL)).toBe(true);
    // Every other event keeps REQ-ORCH-110's 2,000: the most recent part is the events as each is cut.
    expect(t.slice(t.lastIndexOf('\n… [')).split('\n').slice(2).every((line) => line.length <= 2_000 + ' … [99999 characters omitted]'.length)).toBe(true);
  });

  it('a task that alone passes the 12,000 total keeps its head within the total, and every later event is marked omitted (OQ-119 as ruled)', () => {
    const huge = `${TASK}\nCONTEXT: ${'x'.repeat(13_000)}`;
    const messages = duress(say('user', huge));
    const t = reportTranscript(messages, huge);
    expect(t.length).toBeLessThanOrEqual(TRANSCRIPT_CAP);
    expect(t.startsWith(`user: ${TASK}`)).toBe(true);
    const rest = events(messages).slice(1).join('\n');
    expect(t.endsWith(`characters omitted]\n… [${rest.length} characters omitted] …`)).toBe(true);
    expect(t).not.toContain('tool-call haet_edit');
  });

  it('where the first event is not the payload — a compression replaced the conversation — the task is put ahead of the events as given', () => {
    const summary = say('user', 'Context summary: the child read src/ and found two disagreements.');
    const t = reportTranscript(duress(summary), TASK);
    expect(t.startsWith(`user: ${TASK}\n… [`)).toBe(true);
    expect(t.endsWith(FINAL)).toBe(true);
    expect(t.length).toBeLessThanOrEqual(TRANSCRIPT_CAP);
  });

  it('a transcript within the cap is given whole, unmarked — and with the task given, its start is the task, the blocks ahead of it marked', () => {
    const short = [say('user', 'write docs/a.md'), call('w', 'write_file', { path: 'docs/a.md', content: 'x' }), result('w', 'write_file', 'ok'), say('assistant', 'done')];
    const t = reportTranscript(short);
    expect(t).toBe(events(short).join('\n'));
    expect(t).not.toContain('omitted');
    const payload = childPayload('/ws', 'TASK: write docs/a.md', '');
    const given = [say('user', payload), ...short.slice(1)];
    expect(reportTranscript(given, 'TASK: write docs/a.md')).toBe(
      [`user: … [${payload.length - 'TASK: write docs/a.md'.length} characters omitted] … TASK: write docs/a.md`, ...events(given).slice(1)].join('\n'),
    );
    // A payload that IS the task has nothing ahead of it, and nothing is marked.
    expect(reportTranscript(short, 'write docs/a.md')).toBe(t);
  });

  it("the facts are the report's own deterministic fields, from the WHOLE transcript: edited files, commands and their outcomes", () => {
    expect(reportFacts(duress())).toBe('Edited files: docs/api.md, docs/overview.md\nCommands run:\n- node --test → exit code 0');
    expect(reportFacts([say('user', 'look around'), say('assistant', 'nothing to change')])).toBe('Edited files: (none)\nCommands run: (none)');
    expect(reportFacts([call('t', 'terminal', { command: 'npm run dev', background: true })])).toContain('- npm run dev → no exit code');
  });

  it('the summarising request carries the whole task, the late edits and the facts, so its summary cannot deny them (the duress shape through produceReport)', async () => {
    const asked: string[] = [];
    const backend = {
      runTurn: async (req: { messages: { content: { text: string }[] }[] }) => {
        asked.push(req.messages[0]!.content[0]!.text);
        return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: JSON.stringify({ summary: 'reconciled both documents', key_findings: [], next_actions: [], tags: ['implementation'], edited_files: [] }) };
      },
    };
    const s: SummariserDeps = { backend: backend as never, model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' };
    const messages = duress();
    const r = await produceReport(input({ messages, toolCallCount: 37, lastText: 'Reconciled the two documents.', task: TASK }), s, new AbortController().signal);
    expect(asked).toHaveLength(1);
    const ask = asked[0]!;
    expect(ask).toContain('Facts:\nEdited files: docs/api.md, docs/overview.md\nCommands run:\n- node --test → exit code 0');
    expect(ask).toContain('never deny them');
    const transcript = ask.slice(ask.indexOf('Transcript:\n') + 'Transcript:\n'.length);
    expect(transcript).toBe(reportTranscript(messages, TASK));
    expect(transcript).toContain(TASK);
    expect(transcript).toContain('tool-call haet_edit: {"path":"docs/overview.md"');
    expect(r!.edited_files).toEqual(['docs/api.md', 'docs/overview.md']);
  });
});

/*
 * OQ-217, ruled 2026-10-07 under the owner's delegation (R-072): the summarising pass is told how a failed child ended, and no
 * pass can raise a failed child's status. Until the ruling the pass was given no outcome, and 2 of the 5 timed-out children of
 * the duress runs at c2fdd6a and c2a9444 got summaries that read as success
 * (docs/defects/fixed/a-timed-out-childs-report-summary-reads-as-success.md,
 * docs/defects/fixed/the-summarising-pass-can-raise-a-failed-childs-report-status.md).
 */
describe('engine/children/report — OQ-217: the pass is told how a failed child ended (REQ-ORCH-088, REQ-ORCH-108, REQ-ORCH-110, REQ-ORCH-112)', () => {
  const STATEMENT = 'Cut off while making progress: this child completed a tool call within the final 90s before its 1200s limit expired.';
  const work: ChatMessage[] = [
    say('user', 'TASK: write docs/api.md'),
    call('w1', 'write_file', { operation: 'create', path: 'docs/api.md', content: '# API' }), result('w1', 'write_file', 'created docs/api.md'),
    call('t1', 'terminal', { command: 'node --test' }), result('t1', 'terminal', observation('ran node --test', '# pass 3', { exit_code: 0, status: 'exited' })),
  ];
  function summariser(answer: Record<string, unknown> = { summary: 'The agent completed the requested documentation task.', key_findings: [], next_actions: [], tags: [], edited_files: [] }) {
    const asked: string[] = [];
    const backend = {
      runTurn: async (req: { messages: { content: { text: string }[] }[] }) => {
        asked.push(req.messages[0]!.content[0]!.text);
        return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: JSON.stringify(answer) };
      },
    };
    const s: SummariserDeps = { backend: backend as never, model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' };
    return { asked, s };
  }
  const factsOf = (ask: string): string => ask.slice(ask.indexOf('Facts:\n') + 'Facts:\n'.length, ask.indexOf('\n\nTranscript:\n'));
  const timedOut = (over: Partial<ReportInput> = {}): ReportInput => input({ status: 'failed', messages: work, toolCallCount: 2, lastText: 'Now updating the index.', finalTextIsFinal: false, errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }], cutOffStatement: STATEMENT, ...over });

  it('a timed-out child cut off while making progress: the facts open with the Outcome line and the statement, ahead of the edited files, and the ask carries the instruction', async () => {
    const { asked, s } = summariser();
    await produceReport(timedOut(), s, new AbortController().signal);
    const facts = factsOf(asked[0]!);
    expect(facts.startsWith(`Outcome: failed — Child timed out after 1200s. ${STATEMENT}\nEdited files: docs/api.md`)).toBe(true);
    expect(asked[0]).toContain("The facts open with an Outcome line: the run's own record of how the agent ended.");
    expect(asked[0]).toContain('The first sentence of your summary states that outcome and its reason plainly');
    expect(asked[0]).toContain('Never describe the task as completed or finished, and never claim work was left undone beyond what the transcript shows.');
  });

  it('the outcome as the run recorded it: a model failure\'s headline, and `no_activity` in the issue\'s own words; several reasons joined', () => {
    expect(reportFacts(work, { status: 'failed', errors: [{ type: 'model', message: 'The provider returned 500' }] }).split('\n')[0]).toBe('Outcome: failed — The provider returned 500');
    expect(reportFacts([], { status: 'failed', errors: [{ type: 'incomplete_execution', message: 'no_activity' }] }).split('\n')[0]).toBe('Outcome: failed — ended with no activity after one re-prompt');
    expect(reportFacts([], { status: 'failed', errors: [{ type: 'timeout', message: 'Child timed out after 60s' }, { type: 'model', message: 'stream closed' }] }).split('\n')[0]).toBe('Outcome: failed — Child timed out after 60s; stream closed');
    expect(reportFacts([], { status: 'failed', errors: [] }).split('\n')[0]).toBe('Outcome: failed');
  });

  it('a succeeded child: no Outcome line and no outcome instruction — the request is as it was', async () => {
    const { asked, s } = summariser({ summary: 'wrote the api document', key_findings: [], next_actions: [], tags: [], edited_files: [] });
    await produceReport(input({ messages: work, toolCallCount: 2 }), s, new AbortController().signal);
    expect(factsOf(asked[0]!)).toBe(reportFacts(work));
    expect(factsOf(asked[0]!).startsWith('Edited files: docs/api.md')).toBe(true);
    expect(asked[0]).not.toContain('Outcome');
    expect(reportFacts(work, { status: 'succeeded', errors: [] })).toBe(reportFacts(work));
  });

  it('a facts block past the 12,000-character bound keeps the Outcome line: it stands at the head, which OQ-120\'s cut keeps', () => {
    const many: ChatMessage[] = Array.from({ length: 400 }, (_, i) => call(`t${i}`, 'terminal', { command: `node scripts/check-${i}.js --with a long argument list to fill the block` }));
    const facts = reportFacts(many, { status: 'failed', errors: [{ type: 'timeout', message: 'Child timed out after 1200s' }], cutOffStatement: STATEMENT });
    expect(facts.length).toBeLessThanOrEqual(TRANSCRIPT_CAP + 40);
    expect(facts).toMatch(/characters omitted\]$/);
    expect(facts.startsWith(`Outcome: failed — Child timed out after 1200s. ${STATEMENT}\n`)).toBe(true);
  });

  it('a pass answering status succeeded or partial for a failed child stores failed; partial for a succeeded child still stores partial (REQ-ORCH-112)', async () => {
    for (const answered of ['succeeded', 'partial']) {
      const { s } = summariser({ summary: 'Timed out after 1200 s; the document was written.', status: answered, key_findings: [], next_actions: [], tags: [], edited_files: [] });
      const r = await produceReport(timedOut(), s, new AbortController().signal);
      expect({ answered, status: r!.status }).toEqual({ answered, status: 'failed' });
    }
    const { s } = summariser({ summary: 'wrote half of it', status: 'partial', key_findings: [], next_actions: [], tags: [], edited_files: [] });
    expect((await produceReport(input({ messages: work, toolCallCount: 2 }), s, new AbortController().signal))!.status).toBe('partial');
  });

  it('the no-model fallback is unchanged: its summary is still the child\'s own words, the outcome in its errors', () => {
    const r = fallbackReport(timedOut(), 'no summariser is configured');
    expect(r.summary).toBe('Now updating the index.');
    expect(r.errors.map((e) => e.type)).toEqual(['timeout', 'summary_failure']);
  });
});
