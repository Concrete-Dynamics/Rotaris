import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import { commandsFrom, deterministicTesterReport, editedFilesFrom, fallbackReport, produceReport, reportFacts, reportTranscript, TRANSCRIPT_CAP, transcriptText, type ReportInput, type SummariserDeps } from './report.js';
import { commandsForArtifact } from './ledger.js';

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
    expect(r.summary).toContain('96 tool call(s)');
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
});

/**
 * OQ-111 (the live-run finding D1): the duress run's child `d` read for thirty-odd calls before its first edit, and its
 * summariser was handed the transcript cut to 12,000 characters from the head — the task and the first reads, ending
 * `… [63288 characters omitted]` before any write. Five of seven stored reports then denied the edits their own
 * `edited_files` listed. The shape below is that transcript's: the task as given (the write scopes, the sibling index,
 * the instruction), many large reads, then the edits, the check, and the final answer.
 */
describe('engine/children/report — OQ-111: the pass reads the start and the most recent part, beside the facts (REQ-ORCH-110, REQ-ORCH-108, REQ-ORCH-109)', () => {
  const TASK = "Write scopes:\n- Yours: 'docs/api.md', 'docs/overview.md'.\n\nPRIOR SIBLING ARTIFACT INDEX\n- a-document-exported-functions (art_k58dGC4C) persona=docs-writer status=succeeded\n\nReconcile docs/api.md and docs/overview.md: find EVERY disagreement between the two and fix it in both files.";
  const file = (i: number) => Array.from({ length: 60 }, (_, l) => `${l + 1}: line ${l + 1} of source file ${i} with some content to read`).join('\n');
  const duress = (): ChatMessage[] => {
    const out: ChatMessage[] = [say('user', TASK)];
    for (let i = 0; i < 34; i += 1) {
      out.push(call(`r${i}`, 'read_file', { path: `src/f${i}.js` }), result(`r${i}`, 'read_file', file(i)));
    }
    out.push(
      call('e1', 'haet_edit', { path: 'docs/api.md', edits: [{ find: 'addTodo(title)', replace: 'addTodo(todos, title)' }] }), result('e1', 'haet_edit', 'applied 1 edit to docs/api.md'),
      call('e2', 'haet_edit', { path: 'docs/overview.md', edits: [{ find: 'five functions', replace: 'six functions' }] }), result('e2', 'haet_edit', 'applied 1 edit to docs/overview.md'),
      call('t1', 'terminal', { command: 'node --test' }), result('t1', 'terminal', observation('ran node --test', '# pass 7\n# fail 0', { exit_code: 0, status: 'exited' })),
      say('assistant', 'Reconciled the two documents: the addTodo signature and the function count now agree in both.'),
    );
    return out;
  };

  it('the head-only cut it replaces loses every edit of the duress shape (the finding, reproduced)', () => {
    const old = transcriptText(duress());
    expect(old).toContain('Reconcile docs/api.md');
    expect(old).not.toContain('tool-call haet_edit');
  });

  it("keeps the task as given and the most recent part — the edits, the check and the final answer — within the 12,000 cap, the omission marked between them with its count", () => {
    const messages = duress();
    const t = reportTranscript(messages);
    expect(t.length).toBeLessThanOrEqual(TRANSCRIPT_CAP);
    expect(t.length).toBeGreaterThan(TRANSCRIPT_CAP - 10);
    expect(t.startsWith(`user: ${TASK}`)).toBe(true);
    expect(t).toContain('tool-call haet_edit: {"path":"docs/api.md"');
    expect(t).toContain('tool-call haet_edit: {"path":"docs/overview.md"');
    expect(t).toContain('tool-call terminal: {"command":"node --test"}');
    expect(t.endsWith('assistant: Reconciled the two documents: the addTodo signature and the function count now agree in both.')).toBe(true);
    const marker = /\n… \[(\d+) characters omitted\] …\n/.exec(t);
    expect(marker).not.toBeNull();
    // The count is exactly what was left out: the joined transcript (each event already cut to 2,000), less what is
    // shown on either side of the marker and the one line break the marker stands in for.
    const event = (x: string) => (x.length > 2_000 ? `${x.slice(0, 2_000)}… [${x.length - 2_000} characters omitted]` : x);
    const full = messages.flatMap((m) => m.content.map((p) => event(p.kind === 'text' ? `${m.role}: ${p.text}` : p.kind === 'tool-call' ? `tool-call ${p.name}: ${p.args}` : p.kind === 'tool-result' ? `tool-result ${p.name}: ${p.result}` : ''))).join('\n');
    expect(Number(marker![1])).toBe(full.length - (t.length - marker![0].length) - 1);
  });

  it('a transcript within the cap is given whole, unmarked', () => {
    const short = [say('user', 'write docs/a.md'), call('w', 'write_file', { path: 'docs/a.md', content: 'x' }), result('w', 'write_file', 'ok'), say('assistant', 'done')];
    const t = reportTranscript(short);
    expect(t).toBe(transcriptText(short));
    expect(t).not.toContain('omitted');
  });

  it("the facts are the report's own deterministic fields, from the WHOLE transcript: edited files, commands and their outcomes", () => {
    expect(reportFacts(duress())).toBe('Edited files: docs/api.md, docs/overview.md\nCommands run:\n- node --test → exit code 0');
    expect(reportFacts([say('user', 'look around'), say('assistant', 'nothing to change')])).toBe('Edited files: (none)\nCommands run: (none)');
    expect(reportFacts([call('t', 'terminal', { command: 'npm run dev', background: true })])).toContain('- npm run dev → no exit code');
  });

  it('the summarising request carries the task, the late edits and the facts, so its summary cannot deny them (the duress shape through produceReport)', async () => {
    const asked: string[] = [];
    const backend = {
      runTurn: async (req: { messages: { content: { text: string }[] }[] }) => {
        asked.push(req.messages[0]!.content[0]!.text);
        return { status: 'succeeded' as const, usage: { input: 1, output: 1 }, text: JSON.stringify({ summary: 'reconciled both documents', key_findings: [], next_actions: [], tags: ['implementation'], edited_files: [] }) };
      },
    };
    const s: SummariserDeps = { backend: backend as never, model: { providerId: 'a', modelId: 'a1', dialect: 'chat' }, thinking: 'unset', timers: new FakeClock().timers, credentialFor: () => async () => 'k' };
    const messages = duress();
    const r = await produceReport(input({ messages, toolCallCount: 37, lastText: 'Reconciled the two documents.' }), s, new AbortController().signal);
    expect(asked).toHaveLength(1);
    const ask = asked[0]!;
    expect(ask).toContain('Facts:\nEdited files: docs/api.md, docs/overview.md\nCommands run:\n- node --test → exit code 0');
    expect(ask).toContain('never deny them');
    const transcript = ask.slice(ask.indexOf('Transcript:\n') + 'Transcript:\n'.length);
    expect(transcript).toBe(reportTranscript(messages));
    expect(transcript).toContain('Reconcile docs/api.md and docs/overview.md');
    expect(transcript).toContain('tool-call haet_edit: {"path":"docs/overview.md"');
    expect(r!.edited_files).toEqual(['docs/api.md', 'docs/overview.md']);
  });
});
