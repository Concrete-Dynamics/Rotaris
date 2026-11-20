import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type TranscriptRow } from '@rotaris/contracts';
import { threadLatest, threadedRows } from './TranscriptSurface.js';
import { placements } from './transcript/Row.js';
import { drawnFacts, projectDisplay, segmentSummary } from './transcript/project.js';
import type { DisplayRow } from './transcript/types.js';

/**
 * PD-CHAT-015 — the run and its threads. What is asserted here is what a reader can observe: which rows the run's own
 * conversation holds, where a delegated agent's thread line stands and what it says, and that the line an agent's work
 * draws states what was done while the string it copies as is REQ-CHAT-065's, unchanged.
 */
const AT = '2026-11-20T18:00:00.000Z';
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_1', name: 'impl', givenName: 'Implement the function', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'root:1', dependencies: [], activity: '', model: 'm',
  depth: 1, background: true, category: '', spawnedAt: AT, completedAt: null, toolCalls: 0, delegationTask: '', reasoning: 'medium', contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: [], grantRecorded: true, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, timedOut: null, ...over,
});
const run = agent({ id: RUN_AGENT_ID, name: 'orchestrator', givenName: 'orchestrator', persona: 'orchestrator', parentId: '', depth: 0 });
let n = 0;
const row = (over: Partial<TranscriptRow>): TranscriptRow => ({ index: n++, kind: 'agent', settled: true, body: 'x', at: AT, ts: '18:00:00', ...over });
const mine = (name: string, persona: string, over: Partial<TranscriptRow> = {}): TranscriptRow => row({ name, persona, ...over });

describe('PD-CHAT-015 — the run\'s own conversation folds each delegated agent into one thread line', () => {
  const child = agent({});
  const grandchild = agent({ id: 'bg_2', name: 'probe', givenName: 'Probe the toolchain', persona: 'verifier', parentId: 'bg_1', depth: 2 });
  const rows = (): TranscriptRow[] => {
    n = 0;
    return [
      row({ kind: 'user', body: 'do it' }),
      row({ persona: 'orchestrator', body: 'Splitting this in two.' }),
      mine('impl', 'coding-agent', { body: 'I will start by reading the files I need to touch.' }),
      mine('impl', 'coding-agent', { kind: 'tool', toolName: 'read_file', input: '{"path":"src/time.js"}', toolStatus: 'ok', callKey: 'c1', body: 'read_file' }),
      mine('probe', 'verifier', { body: 'Probing the toolchain now, as asked.' }),
      row({ persona: 'orchestrator', body: 'Waiting on the child.' }),
      row({ kind: 'verifier', body: 'verified' }),
      mine('impl', 'coding-agent', { body: '## What I did\n\nDone.\n\nThe function is in place and eleven tests pass.' }),
    ];
  };

  it('keeps the run-owned kinds and the run-level agent\'s rows, and draws the child once, where its first row stood', () => {
    const all = rows();
    const shown = threadedRows(all, run, [child, grandchild]);
    expect(shown.map((r) => r.kind)).toEqual(['user', 'agent', 'delegation', 'agent', 'verifier']);
    const line = shown[2]!;
    // The line carries its first row's index, so the array stays in the record's order.
    expect(line.index).toBe(all[2]!.index);
    expect([line.name, line.persona, line.input]).toEqual(['impl', 'coding-agent', 'Implement the function']);
    // A deeper agent's rows are its parent's transcript's, not the run's.
    expect(shown.some((r) => r.name === 'probe')).toBe(false);
  });

  it('a row of a persona the record names no agent for belongs to the run, not to a thread', () => {
    const all = [...rows(), row({ persona: 'coding-agent', body: 'a turn the reader gave to another entry persona' })];
    expect(threadedRows(all, run, [child]).at(-1)!.body).toBe('a turn the reader gave to another entry persona');
  });

  it('an agent\'s own transcript draws the agents IT delegated to as thread lines', () => {
    const shown = threadedRows(rows(), child, [child, grandchild]);
    expect(shown.map((r) => `${r.kind}:${r.name ?? ''}`)).toEqual(['user:', 'agent:impl', 'tool:impl', 'delegation:probe', 'verifier:', 'agent:impl']);
  });

  it('the line says the latest thing a working agent did, and what an ended one reported', () => {
    const all = rows();
    const own = all.filter((r) => r.name === 'impl');
    // Working: the last thing it said — a sentence, never the heading or the one-word acknowledgement above it.
    expect(threadLatest(own, false)).toBe('The function is in place and eleven tests pass.');
    expect(threadLatest(own.slice(0, 2), false)).toBe('Reads src/time.js');
    expect(threadLatest([mine('impl', 'coding-agent', { kind: 'thinking', body: 'hm' })], false)).toBe('reasoning');
    // Ended: its report, and a call it made last is not one.
    expect(threadLatest(own, true)).toBe('Reported: The function is in place and eleven tests pass.');
    expect(threadLatest(own.slice(0, 2), true)).toBe('Reported: I will start by reading the files I need to touch.');
    expect(threadLatest([], true)).toBe('');
  });

  it('an ended agent\'s line is settled and carries its state and elapsed time; an unchanged line is the same object (REQ-CHAT-055)', () => {
    const ended = agent({ presentationState: 'done', state: 'succeeded', completedAt: '2026-11-20T18:00:20.000Z', live: false });
    const held = new Map<string, TranscriptRow>();
    const first = threadedRows(rows(), run, [ended], [], held)[2]!;
    expect([first.settled, first.toolStatus, first.output]).toEqual([true, 'done', 'done · 20s']);
    expect(threadedRows(rows(), run, [ended], [], held)[2]).toBe(first);
    // A line whose text changed is a new object, so the pane redraws it.
    const more = [...rows(), mine('impl', 'coding-agent', { body: 'One more sentence was written afterwards.' })];
    expect(threadedRows(more, run, [ended], [], held)[2]).not.toBe(first);
  });

  it('consecutive thread lines are one block, and an edit diff does not begin one', () => {
    const display = (r: TranscriptRow): DisplayRow => ({ shape: 'row', key: `${r.index}:${r.kind}`, row: r });
    n = 0;
    const lines = [
      row({ persona: 'orchestrator' }),
      row({ kind: 'delegation', name: 'a', persona: 'coding-agent' }),
      row({ kind: 'delegation', name: 'b', persona: 'docs-writer' }),
      row({ persona: 'coding-agent', name: 'a' }),
      row({ kind: 'diff', body: 'src/x.ts +1 -0' }),
      row({ persona: 'coding-agent', name: 'a' }),
    ].map(display);
    expect(placements(lines).map((p) => p.blockStart)).toEqual([true, true, false, true, false, false]);
  });
});

describe('PD-CHAT-004 revision 4 — the line draws what was done; what it copies as is unchanged', () => {
  const tool = (index: number, toolName: string, toolStatus = 'ok'): TranscriptRow => ({ index, kind: 'tool', settled: true, body: toolName, at: AT, ts: '18:00:00', persona: 'coding-agent', name: 'impl', toolName, toolStatus, callKey: `k${index}` });
  const segmentsOf = (rows: TranscriptRow[]) => {
    const d = projectDisplay({ rows, running: true, groupTools: true, showReasoning: false, caps: { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 }, expanded: new Set<string>(), pendingQuestions: [], pendingApprovals: [] })[0]!;
    if (d.shape !== 'group') throw new Error('not a group');
    return d.segments;
  };

  it('states the four activity words as sentences, with only the counts a reader acts on', () => {
    const [reading] = segmentsOf([tool(0, 'read_file'), tool(1, 'read_file'), tool(2, 'glob', 'failed'), tool(3, 'read_file')]);
    expect(drawnFacts(reading!).map((f) => f.text)).toEqual(['Read 4 files', '1 failed']);
    expect(segmentSummary(reading!)).toBe('reading ×4 · 3 ok · 1 failed');
    const drawn = (names: string[]) => segmentsOf(names.map((name, i) => tool(i, name))).map((s) => drawnFacts(s).map((f) => f.text).join(' · '));
    expect(drawn(['read_file', 'read_file'])).toEqual(['Read 2 files']);
    expect(drawn(['write_file', 'terminal', 'terminal', 'grep'])).toEqual(['Edited 1 file', 'Ran 2 commands', 'Searched 1 time']);
    // A tool the family table does not name keeps its own name and its count.
    expect(drawn(['todo', 'todo'])).toEqual(['todo ×2']);
  });
});
