import { describe, expect, it } from 'vitest';
import type { AgentRecord, QuestionPrompt, TranscriptRow } from '@rotaris/contracts';
import { trailerRows } from './transcript/project.js';
import {
  compactTask, defaultExpanded, delegationSummary, groupDurationMs, groupSeverity, groupSummary, isLiveTerminalRow,
  personaColourToken, placements, reasoningSummary, rowMenuEntries, rowRole, rowTask, rowTime, stalledLabel, stripOutcomeGlyph,
  THINKING_LIVE_CUTOFF_MS, toolOutcome, trailerText, type DisplayRow,
} from './transcript/Row.js';
import { RUN_OWNED_KINDS, SCOPE_NO_AGENT, scopedRows } from './TranscriptSurface.js';

/**
 * Part AA — the row renderers, measured where a browser is not needed. What one row DRAWS is the `rows-proof`
 * launch's to assert; what one row SAYS is here, because a sentence is checkable without a DOM and because
 * REQ-CHAT-168 requires every count-carrying message to be asserted at zero, at one and at many.
 */
const AT = '2026-09-07T09:00:00.000Z';
const row = (over: Partial<TranscriptRow>): TranscriptRow => ({ index: 0, kind: 'agent', settled: true, body: 'x', at: AT, ts: '09:00:00', ...over });
const display = (r: TranscriptRow): DisplayRow => ({ shape: 'row', key: `${r.index}`, row: r });
/** Part AC: one pending question prompt, its steps named by title. */
const prompt = (titles: readonly string[]): QuestionPrompt => ({
  request_id: 'q1', session_id: 's', conversation_id: 'root', agent_id: 'orchestrator', persona: 'orchestrator',
  steps: titles.map((title, i) => ({ id: `s${i}`, title, description: '', options: [], allow_freeform: true })),
});

describe('rows — REQ-CHAT-047/057, the role and the attribution', () => {
  it('projects the five named roles and leaves the vocabulary open', () => {
    expect(rowRole(row({ kind: 'user' }))).toBe('you');
    expect(rowRole(row({ kind: 'system' }))).toBe('rotaris');
    expect(rowRole(row({ kind: 'diff' }))).toBe('edit');
    expect(rowRole(row({ kind: 'tool', persona: 'coding-agent' }))).toBe('coding-agent');
    // An unheard-of role is legitimate and becomes the display name, never a refusal.
    expect(rowRole(row({ kind: 'librarian' }))).toBe('librarian');
    expect(rowTime('not an instant')).toBe('');
  });

  it('REQ-CHAT-057: a block begins where the role changes, and only a first row draws attribution', () => {
    const rows = [
      row({ index: 0, kind: 'user' }),
      row({ index: 1, kind: 'agent', persona: 'orchestrator' }),
      row({ index: 2, kind: 'tool', persona: 'orchestrator' }),
      row({ index: 3, kind: 'agent', persona: 'coding-agent' }),
    ].map(display);
    expect(placements(rows).map((p) => p.blockStart)).toEqual([true, true, false, true]);
    // A named task shows beside the role; a row whose name IS its persona has no task line rather than a placeholder.
    expect(rowTask(row({ kind: 'tool', persona: 'coding-agent', name: 'helper' }))).toBe('helper');
    expect(rowTask(row({ kind: 'agent', persona: 'orchestrator', name: 'orchestrator' }))).toBeNull();
    expect(rowTask(row({ kind: 'user' }))).toBeNull();
  });

  it('PD-CHAT-005: a persona colour is the design language\'s categorical ramp, never a status token', () => {
    // The ramp `docs/design/system/tokens/colors.css` declares for categorical data, which is what telling
    // one agent from another is. Six entries, six DISTINCT hues.
    const personas = ['orchestrator', 'coding-agent', 'helper', 'reviewer', 'librarian', 'scribe', 'verifier'];
    const tokens = personas.map(personaColourToken);
    for (const token of tokens) expect(token).toMatch(/^--rt-viz-[1-6]$/);
    // The falsified list this replaces: `--rt-ok` and `--rt-run` are both `var(--rt-axis-y-500)`, so six slots
    // yielded five hues; and a status token beside a row whose outcome it was not reads as that outcome.
    for (const status of ['--rt-ok', '--rt-warn', '--rt-run', '--rt-fail', '--rt-danger-300']) {
      expect(tokens).not.toContain(status);
    }
    // REQ-SHELL-075 (a): stable for a name, so an agent keeps its colour across a reload and across windows.
    expect(personaColourToken('coding-agent')).toBe(personaColourToken('coding-agent'));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(personaColourToken)).size).toBeGreaterThan(1);
  });

  it('REQ-CHAT-067: only the last two tool rows are spared by auto-collapse, and fewer than two spares them all', () => {
    const many = [0, 1, 2, 3].map((i) => display(row({ index: i, kind: 'tool' })));
    expect(placements(many).map((p) => p.recentTool)).toEqual([false, false, true, true]);
    const one = [display(row({ index: 0, kind: 'tool' }))];
    expect(placements(one).map((p) => p.recentTool)).toEqual([true]);
    expect(placements([]).length).toBe(0);
  });
});

describe('rows — REQ-CHAT-060, the tool outcome', () => {
  it('draws the four values, treats anything else as failed, and draws nothing without a status', () => {
    expect(toolOutcome(row({ toolStatus: 'ok', durationMs: 3_200 }))).toEqual({ text: 'ok · 3.2s', state: 'ok' });
    expect(toolOutcome(row({ toolStatus: 'failed', durationMs: 120 }))).toEqual({ text: 'failed', state: 'failed' });
    expect(toolOutcome(row({ toolStatus: 'blocked', durationMs: 0 }))).toEqual({ text: 'blocked · 0.0s', state: 'blocked' });
    expect(toolOutcome(row({ toolStatus: 'running', settled: false }))).toEqual({ text: '◉ running…', state: 'running' });
    // No fifth value and no fallback that draws an unrecognised marker as its own literal text.
    expect(toolOutcome(row({ toolStatus: 'weird', durationMs: 1_000 }))).toEqual({ text: 'failed', state: 'failed' });
    expect(toolOutcome(row({}))).toEqual({ text: '', state: 'none' });
    expect(toolOutcome(row({ toolStatus: '' }))).toEqual({ text: '', state: 'none' });
  });

  it('REQ-CHAT-049: a row still marked running shows no status once the SESSION is not running, not only once the row settled', () => {
    const live = row({ toolStatus: 'running', settled: false });
    expect(toolOutcome(live, true).state).toBe('running');
    // The half the previous helper did not have: the requirement's condition is the session, and it is now asserted.
    expect(toolOutcome(live, false)).toEqual({ text: '', state: 'none' });
    expect(toolOutcome(row({ toolStatus: 'running', settled: true }), true)).toEqual({ text: '', state: 'none' });
  });

  it('REQ-CHAT-060: a glyph already persisted into the text is not drawn a second time', () => {
    expect(stripOutcomeGlyph('✓ read_file README.md')).toBe('read_file README.md');
    expect(stripOutcomeGlyph('✗ terminal git push')).toBe('terminal git push');
    expect(stripOutcomeGlyph('! terminal rm -rf build')).toBe('terminal rm -rf build');
    // Only a LEADING marker: a glyph inside the command is the command's.
    expect(stripOutcomeGlyph('terminal echo "✓ done"')).toBe('terminal echo "✓ done"');
  });
});

describe('rows — REQ-CHAT-062/164/065, the sentences that carry counts (REQ-CHAT-168)', () => {
  it('summarizes reasoning with both numbers, the token figure being the character count divided by 4', () => {
    const at2 = Date.parse(AT);
    const streaming = row({ kind: 'thinking', settled: false, startedAt: AT, body: 'abcdefgh' });
    // REQ-CHAT-062 writes the two forms differently: the settled one carries a `·` after `reasoning`, the streaming
    // one does not, and the leading marker is the row's CHEVRON rather than part of the label.
    expect(reasoningSummary(streaming, at2 + 5_000).text).toBe('◉ reasoning… 5s · ~2 tok');
    expect(reasoningSummary(streaming, at2 + 5_000).marker).toBe('◉');
    expect(reasoningSummary(streaming, at2 + 5_000).label).toBe('reasoning… 5s · ~2 tok');
    const settled = row({ kind: 'thinking', settled: true, startedAt: AT, durationMs: 12_000, body: 'a'.repeat(400) });
    expect(reasoningSummary(settled, at2 + 90_000).text).toBe('▸ reasoning · 12s · ~100 tok');
    expect(reasoningSummary(settled, at2 + 90_000).label).toBe('reasoning · 12s · ~100 tok');
    // REQ-CHAT-062: a live thinking row stops presenting as live after 3600 seconds without completion.
    expect(reasoningSummary(streaming, at2 + THINKING_LIVE_CUTOFF_MS + 1).live).toBe(false);
    // REQ-CHAT-049: an unstamped row in a session with no run does not present as live either.
    expect(reasoningSummary(streaming, at2 + 5_000, false).live).toBe(false);
  });

  it('a settled reasoning row never reads the tick, stamped or not (REQ-CHAT-062 final figures)', () => {
    const at2 = Date.parse(AT);
    // Stamped: the engine's durationMs stands whatever the tick says.
    const stamped = row({ kind: 'thinking', settled: true, startedAt: AT, durationMs: 12_000, body: 'x' });
    expect(reasoningSummary(stamped, at2 + 600_000).seconds).toBe(12);
    // Unstamped (older records): frozen at the span the row's own record closes, at − startedAt.
    const unstamped = row({ kind: 'thinking', settled: true, startedAt: AT, at: '2026-09-07T09:00:07.000Z', body: 'x' });
    expect(reasoningSummary(unstamped, at2 + 600_000).seconds).toBe(7);
    expect(reasoningSummary(unstamped, at2 + 600_000).text).toBe('▸ reasoning · 7s · ~0 tok');
    // Unstamped with no readable startedAt: zero rather than a rising figure.
    const bare = row({ kind: 'thinking', settled: true, body: 'x' });
    expect(reasoningSummary(bare, at2 + 600_000).seconds).toBe(0);
  });

  it('REQ-CHAT-164: the stalled indicator is grammatical at zero, one and many seconds', () => {
    expect(stalledLabel(0)).toBe('⏱ no output for 0 seconds');
    expect(stalledLabel(1)).toBe('⏱ no output for 1 second');
    expect(stalledLabel(42)).toBe('⏱ no output for 42 seconds');
  });

  it('REQ-CHAT-065: the group summary starts with "<family> ×N", omits an outcome with no members, and never carries tool output', () => {
    expect(groupSummary('reading', { ok: 3, failed: 1, blocked: 0, running: 0 }, 4)).toBe('reading ×4 · 3 ok · 1 failed');
    expect(groupSummary('reading', { ok: 1, failed: 0, blocked: 0, running: 0 }, 1)).toBe('reading ×1 · 1 ok');
    expect(groupSummary('editing', { ok: 0, failed: 0, blocked: 0, running: 0 }, 0)).toBe('editing ×0');
    expect(groupSummary('running', { ok: 2, failed: 1, blocked: 1, running: 1 }, 5)).toBe('running ×5 · 2 ok · 1 failed · 1 blocked · 1 running');
  });

  it('REQ-CHAT-065: the header takes the most severe outcome, failed before blocked before running before ok', () => {
    expect(groupSeverity({ ok: 9, failed: 1, blocked: 1, running: 1 })).toBe('failed');
    expect(groupSeverity({ ok: 9, failed: 0, blocked: 1, running: 1 })).toBe('blocked');
    expect(groupSeverity({ ok: 9, failed: 0, blocked: 0, running: 1 })).toBe('running');
    expect(groupSeverity({ ok: 9, failed: 0, blocked: 0, running: 0 })).toBe('ok');
    expect(groupSeverity({ ok: 0, failed: 0, blocked: 0, running: 0 })).toBe('ok');
  });

  it('REQ-CHAT-065: while a member runs the duration counts upward from the summed settled figure', () => {
    const members = [
      row({ index: 0, kind: 'tool', toolStatus: 'ok', durationMs: 2_000 }),
      row({ index: 1, kind: 'tool', toolStatus: 'running', settled: false, startedAt: AT }),
    ];
    expect(groupDurationMs(members, 2_000, Date.parse(AT) + 3_000)).toBe(5_000);
    expect(groupDurationMs(members, 2_000, Date.parse(AT) + 9_000)).toBe(11_000);
    // A settled group does not move, however late the clock is read.
    expect(groupDurationMs([members[0]!], 2_000, Date.parse(AT) + 99_000)).toBe(2_000);
  });

  it('REQ-CHAT-051 / REQ-CHAT-168: the question trailer agrees with its count at zero, one and many', () => {
    // The wording is computed in `project.ts`'s `trailerRows`, which is the ONE place it is written; this asserts
    // it there and that `trailerText` reads it back unchanged, rather than asserting a second implementation.
    // Part AC: the trailer reads the WIDENED `pendingQuestions` — one entry per conversation, each carrying its
    // own ordered steps — so N is the prompt's step count and the title is its first step's title.
    const text = (titles: readonly string[]): string => {
      const [t] = trailerRows({ pendingQuestions: [prompt(titles)], pendingApprovals: [], questionAgent: 'a' });
      return t !== undefined && t.shape === 'trailer' ? trailerText(t.trailer) : '';
    };
    expect(text(['Pick a branch'])).toBe('1 step — Pick a branch');
    expect(text(['Pick a branch', 'b', 'c'])).toBe('3 steps — Pick a branch');
    // A first step with no title yields the count alone rather than a dangling separator.
    expect(text([''])).toBe('1 step');
    expect(text(['', 'b'])).toBe('2 steps');
    // At zero — a prompt that carries no step at all still reads grammatically (REQ-CHAT-168).
    expect(text([])).toBe('0 steps');
    expect(trailerRows({ pendingQuestions: [], pendingApprovals: [], questionAgent: 'a' })).toEqual([]);
  });
});

describe('rows — REQ-CHAT-075, what each context-menu entry copies', () => {
  it('offers the two tool entries on tool rows only, greys an empty one out, and copies the untruncated value', () => {
    const tool = display(row({ kind: 'tool', body: '✓ read_file README.md', input: '{"path":"README.md"}', output: 'a'.repeat(5_000) }));
    const entries = rowMenuEntries(tool);
    expect(entries.map((e) => e.key)).toEqual(['message', 'input', 'output']);
    expect(entries[0]!.text).toBe('read_file README.md');
    expect(entries[2]!.text.length).toBe(5_000);
    const noOutput = rowMenuEntries(display(row({ kind: 'tool', body: 'terminal x', input: 'i' })));
    expect(noOutput.map((e) => e.disabled)).toEqual([false, false, true]);
    // Neither tool entry appears at all on a row that is not a tool row.
    expect(rowMenuEntries(display(row({ kind: 'agent', body: 'hello' }))).map((e) => e.key)).toEqual(['message']);
  });

  it('REQ-CHAT-065: copying a group yields the summary and never raw tool input or output', () => {
    const group: DisplayRow = {
      shape: 'group', key: 'g', family: 'reading', members: [row({ kind: 'tool', input: 'SECRET-INPUT', output: 'SECRET-OUTPUT' })],
      segments: [{ label: 'reading', reasoning: false, members: 1, counts: { ok: 1, failed: 0, blocked: 0, running: 0 }, durationMs: 10, tokens: 0 }],
      role: 'orchestrator', persona: 'orchestrator',
      counts: { ok: 1, failed: 0, blocked: 0, running: 0 }, durationMs: 10, startedAt: AT, endedAt: AT,
      inFlight: null, inFlightLabel: null, blob: 'SECRET-OUTPUT',
    };
    const entries = rowMenuEntries(group);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.text).toBe('reading ×1 · 1 ok');
    expect(entries[0]!.text).not.toContain('SECRET');
  });
});

describe('rows — REQ-CHAT-067/167, the two display preferences', () => {
  it('both default off, and only a reasoning row follows showReasoning', () => {
    const thinking = display(row({ kind: 'thinking' }));
    expect(defaultExpanded(thinking, { showReasoning: false })).toBe(false);
    expect(defaultExpanded(thinking, { showReasoning: true })).toBe(true);
    expect(defaultExpanded(display(row({ kind: 'tool' })), { showReasoning: true })).toBe(false);
  });

  it('REQ-CHAT-066: a live terminal row is recognised by its stream id and its unsettled state', () => {
    expect(isLiveTerminalRow({ ...row({ kind: 'tool', settled: false }), streamId: 's-1' } as TranscriptRow)).toBe(true);
    expect(isLiveTerminalRow({ ...row({ kind: 'tool', settled: true }), streamId: 's-1' } as TranscriptRow)).toBe(false);
    expect(isLiveTerminalRow(row({ kind: 'tool', settled: false }))).toBe(false);
  });
});

describe('rows — REQ-CHAT-068/069, delegation and scope', () => {
  const agent: AgentRecord = {
    id: 'c1', name: 'helper', givenName: 'helper', persona: 'coding-agent', state: 'running', presentationState: 'running', parentId: 'run',
    dependencies: [], activity: '', model: 'm', depth: 1, background: true, category: 'implementation', spawnedAt: AT, completedAt: null,
    toolCalls: 0, delegationTask: 'a'.repeat(400), reasoning: 'high', contextUsed: 0, contextLimit: 1, grantedTools: [], calledTools: [],
    activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0,
  };

  it('REQ-CHAT-068: three facts, the task compacted to 110 characters with an ellipsis where it is cut', () => {
    const line = delegationSummary(agent);
    expect(line.startsWith('helper · coding-agent · ')).toBe(true);
    expect(compactTask(agent.delegationTask)).toHaveLength(110);
    expect(compactTask(agent.delegationTask).endsWith('…')).toBe(true);
    expect(compactTask('short enough')).toBe('short enough');
    // Whitespace is flattened so a multi-line task cannot break the one-line summary.
    expect(compactTask('one\n\ntwo   three')).toBe('one two three');
  });

  it('REQ-CHAT-068: an unreadable payload names the fields it can rather than showing a placeholder', () => {
    expect(delegationSummary({ name: 'helper', persona: '', delegationTask: '' })).toBe('helper');
    expect(delegationSummary({})).toBe('');
    // `activity` stands in where the full task text was not recorded.
    expect(delegationSummary({ name: 'helper', activity: 'reading the repository' })).toBe('helper · reading the repository');
  });

  it('REQ-CHAT-069: "This task" keeps the run-owned kinds plus the agent\'s own, and a verifier row is never filtered out', () => {
    const rows = [
      row({ index: 0, kind: 'user' }),
      row({ index: 1, kind: 'system' }),
      row({ index: 2, kind: 'verifier', name: 'someone-else' }),
      row({ index: 3, kind: 'agent', name: 'helper' }),
      row({ index: 4, kind: 'agent', name: 'other' }),
    ];
    expect(scopedRows(rows, agent).map((r) => r.index)).toEqual([0, 1, 2, 3]);
    // With no agent selected nothing is filtered: the toggle is unavailable with a stated reason instead.
    expect(scopedRows(rows, null)).toEqual(rows);
    expect(RUN_OWNED_KINDS.has('verifier')).toBe(true);
    expect(SCOPE_NO_AGENT).toMatch(/Select an agent/);
  });
});
