import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { ChatMessage } from '@rotaris/model';
import { commandsFrom, deterministicTesterReport, editedFilesFrom, fallbackReport, produceReport, type ReportInput, type SummariserDeps } from './report.js';

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
    expect(r.summary).toBe('wrote a document and ran the tests');
    expect(r.edited_files).toEqual(['docs/a.md', 'Memory: domain-design/core-domain']);
    // The model may not author this field: what ran is a fact of the transcript, not of the summary.
    expect(r.commands).toEqual([{ command: 'pnpm test', exit_code: 0 }]);
  });
});
