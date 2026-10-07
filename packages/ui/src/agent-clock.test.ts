import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import { AgentTable } from './AgentTable.js';
import { AgentTree, clockAdvances, elapsedLabel, elapsedShown } from './AgentTree.js';
import { runLevelAgent } from './agents.js';
import { runTimingLabel, runTimingSeconds } from './composer.js';
import { Inspector } from './Inspector.js';
import { PersonaWindow } from './PersonaWindow.js';

/**
 * REQ-MONITOR-107/110/111 (resolution item 25), defect note "a waiting agent's elapsed time is not shown" (R-067): an agent
 * holding a spawn timestamp shows its elapsed time on every surface with a slot for it — the tree meta, the Mission
 * table, the inspector meta and the pop-out's context card — and a `waiting` or `queued` one's figure advances with the
 * surface's clock. The clock is gated by its own predicate, never by `AgentRecord.live` (REQ-MONITOR-045, running only),
 * which still drives the motion and the inspector's writability. A `paused` agent keeps OQ-100's reading, confirmed 2026-10-06 by R-071: no time.
 */
const agent = (over: Partial<AgentRecord>): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'waiting_on_dependencies', presentationState: 'waiting', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: '', spawnedAt: '2026-09-05T10:00:00.000Z', completedAt: null, toolCalls: 2, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file'], grantRecorded: true, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, timedOut: null, ...over,
});
const session = (agents: AgentRecord[]): SessionRecord => ({
  id: 's1', executionStatus: 'running', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-05T10:00:10.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents, pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-05T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, sandboxBackend: '', backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, modelOverrides: [], excludedModels: [], compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryModelKey: null, entryStalledSeconds: null, entryToolCalls: null, compressions: 0,
});
const NOW = '2026-09-05T10:01:03.000Z';
const LATER = '2026-09-05T10:01:04.000Z';
const waiting = agent({});
const queued = agent({ id: 'bg_00000002', name: 'queued-one', state: 'queued', presentationState: 'queued' });
const paused = agent({ id: 'bg_00000003', name: 'paused-one', state: 'paused', presentationState: 'paused', interruption: 'pause' });
const unstamped = agent({ id: 'bg_00000004', name: 'unstamped', spawnedAt: '' });

const tree = (a: AgentRecord, nowIso: string) => renderToStaticMarkup(createElement(AgentTree, { agents: [a], selected: null, onSelect: () => undefined, nowIso }));
const table = (a: AgentRecord, nowIso: string) => renderToStaticMarkup(createElement(AgentTable, { agents: [a], selected: null, nowIso, onSelect: () => undefined, onOpen: () => undefined, onPopOut: () => undefined }));
const inspector = (a: AgentRecord, nowIso: string) => renderToStaticMarkup(createElement(Inspector, {
  session: session([a]), rows: [], personas: [], runLevel: null, selectedAgentId: a.id, onSelect: () => undefined, models: [], compressionThresholdPercent: 60, runActive: true, resting: false, nowIso,
  onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined,
}));
const persona = (a: AgentRecord, nowIso: string) => renderToStaticMarkup(createElement(PersonaWindow, {
  persona: a.persona, session: session([a]), rows: [], runLevel: null, declaredTools: [], selectedAgentId: a.id, onSelectTab: () => undefined, nowIso, compressionThresholdPercent: 60,
  onSteer: async () => ({ ok: true as const }), onCancel: async () => ({ ok: true as const }),
}));
const text = (html: string) => html.replace(/<!-- -->/g, '');
const meta = (html: string, cls: string) => text(html).match(new RegExp(`class="${cls}"[^>]*>([^<]*)<`))?.[1] ?? '';
const elapsedCell = (html: string) => text(html).match(/data-testid="agent-elapsed">([^<]*)</)?.[1] ?? '';
const inspectorMeta = (html: string) => text(html).match(/data-testid="inspector-meta">([^<]*)</)?.[1] ?? '';
const contextLine = (html: string) => text(html).match(/data-testid="persona-context-line">([^<]*)</)?.[1] ?? '';

describe('REQ-MONITOR-107/111: the clock predicate is its own, not REQ-MONITOR-045\'s `live`', () => {
  it('advances for a running, waiting or queued agent with a spawn timestamp; never for a paused, ended or unstamped one', () => {
    expect(clockAdvances(agent({ state: 'running', presentationState: 'running', live: true }))).toBe(true);
    expect(clockAdvances(waiting)).toBe(true);
    expect(clockAdvances(queued)).toBe(true);
    expect(clockAdvances(paused)).toBe(false);
    expect(clockAdvances(unstamped)).toBe(false);
    expect(clockAdvances(agent({ state: 'succeeded', presentationState: 'done', completedAt: '2026-09-05T10:00:30.000Z' }))).toBe(false);
  });

  it('an ended agent shows its fixed figure; a paused or unstamped one shows the fallback', () => {
    expect(elapsedShown(agent({ state: 'failed', presentationState: 'failed', completedAt: '2026-09-05T10:00:30.000Z' }))).toBe(true);
    expect(elapsedShown(waiting)).toBe(true);
    expect(elapsedShown(paused)).toBe(false);
    expect(elapsedShown(unstamped)).toBe(false);
  });
});

describe('REQ-MONITOR-111 (resolution item 25): a waiting or queued agent holding a spawn timestamp shows its time on every surface', () => {
  it('the agent tree meta reads `waiting · 1m 3s` and advances with the tick; a paused agent reads its state alone (OQ-100)', () => {
    expect(meta(tree(waiting, NOW), 'agent-row__meta mono')).toBe('waiting · 1m 3s');
    expect(meta(tree(waiting, LATER), 'agent-row__meta mono')).toBe('waiting · 1m 4s');
    expect(meta(tree(queued, NOW), 'agent-row__meta mono')).toBe('queued · 1m 3s');
    expect(meta(tree(paused, NOW), 'agent-row__meta mono')).toBe('paused');
  });

  it('the Mission table\'s Elapsed cell advances for a waiting or queued agent, never an em-dash while it has a spawn timestamp', () => {
    expect(elapsedCell(table(waiting, NOW))).toBe('1m 3s');
    expect(elapsedCell(table(waiting, LATER))).toBe('1m 4s');
    expect(elapsedCell(table(queued, NOW))).toBe('1m 3s');
    expect(elapsedCell(table(paused, NOW))).toBe('—');
  });

  it('the inspector meta and the pop-out\'s context card carry the figure; the motion stays with `live` (no pulse while waiting)', () => {
    expect(inspectorMeta(inspector(waiting, NOW))).toBe('waiting · 1m 3s · 2 tool calls');
    expect(inspectorMeta(inspector(queued, LATER))).toBe('queued · 1m 4s · 2 tool calls');
    expect(inspectorMeta(inspector(paused, NOW))).toBe('paused · — · 2 tool calls');
    expect(contextLine(persona(waiting, NOW))).toBe('2 tool calls · 1m 3s');
    expect(contextLine(persona(paused, NOW))).toBe('2 tool calls · -');
    // `live` is untouched: the waiting row is not drawn live, so it does not pulse (REQ-MONITOR-045/046).
    expect(tree(waiting, NOW)).not.toContain('is-live');
  });
});

describe('REQ-ORCH-089 / REQ-MONITOR-119/120, the repair of a-stalled-child-is-never-shown-stalled: a stalled agent is drawn stalled on every agent surface, with the watch\'s figure', () => {
  const running = agent({ state: 'running', presentationState: 'running', live: true });
  const stalled = (s: number) => agent({ state: 'running', presentationState: 'running', live: true, stalledSeconds: s });
  const badge = (html: string) => text(html).match(/data-testid="agent-stalled">([^<]*)</)?.[1] ?? null;

  it('the tree, the Mission table and the persona window draw the badge with the figure the record carries, and it advances with the record, not the clock', () => {
    expect(badge(tree(stalled(95), NOW))).toBe('stalled\u00a095s');
    expect(text(tree(stalled(95), NOW))).toMatch(/class="agent-row__meta mono">running · 1m 3s <span class="[^"]*\btag-wait\b[^"]*"[^>]*data-testid="agent-stalled">stalled\u00a095s<\/span><\/span>/);
    expect(badge(tree(stalled(95), LATER))).toBe('stalled\u00a095s');
    expect(badge(tree(stalled(100), LATER))).toBe('stalled\u00a0100s');
    expect(badge(table(stalled(90), NOW))).toBe('stalled\u00a090s');
    expect(badge(persona(stalled(90), NOW))).toBe('stalled\u00a090s');
  });

  it('the inspector\'s meta line ends with it, for a child and for the run-level agent alike', () => {
    expect(inspectorMeta(inspector(stalled(90), NOW))).toBe('running · 1m 3s · 2 tool calls · stalled\u00a090s');
  });

  it('a recovered agent (null) draws nothing on any surface', () => {
    for (const html of [tree(running, NOW), table(running, NOW), persona(running, NOW), inspector(running, NOW)]) expect(badge(html)).toBeNull();
    expect(inspectorMeta(inspector(running, NOW))).toBe('running · 1m 3s · 2 tool calls');
  });
});

/**
 * REQ-CHAT-158, REQ-MONITOR-107 (acceptance K1, defect note "the run header and the inspector's run-level row read one run
 * duration a second apart"): the run header and the inspector's run-level row read one interval, `runStartedAt` to
 * `updatedAt`, and turn it into whole seconds by one rule, so a run never shows two durations. The intervals are the live
 * run's at `c2fdd6a`: 133.67 s read "2:13" against "2m 14s", 213.79 s "3:33" against "3m 34s", 20.74 s "0:20" against "21s".
 */
describe('REQ-CHAT-158, REQ-MONITOR-107 (K1): the run header and the run-level row read one run duration alike', () => {
  const entry = { persona: 'orchestrator', model: 'scripted/alpha', reasoning: 'high', tools: [] };
  const ended = (start: string, end: string): SessionRecord => ({ ...session([]), executionStatus: 'completed', runStartedAt: start, updatedAt: end });
  const cases: [string, string, string, string][] = [
    ['2026-10-05T15:47:52.310Z', '2026-10-05T15:50:05.981Z', '2:13', '2m 13s'],
    ['2026-10-05T16:00:00.000Z', '2026-10-05T16:03:33.790Z', '3:33', '3m 33s'],
    ['2026-10-05T16:10:00.000Z', '2026-10-05T16:10:20.740Z', '0:20', '20s'],
    ['2026-10-05T16:20:00.000Z', '2026-10-05T16:21:08.220Z', '1:08', '1m 8s'],
    ['2026-10-05T16:30:00.000Z', '2026-10-05T16:30:00.500Z', '0:00', '0s'],
  ];
  for (const [start, end, header, row] of cases) {
    it(`${start} to ${end}: the header reads ${header} and the run-level row ${row}`, () => {
      const s = ended(start, end);
      expect(runTimingLabel(runTimingSeconds({ runStartedAt: s.runStartedAt, updatedAt: s.updatedAt, busy: false, stepStartedAt: null }, Date.parse(end) + 60_000))).toBe(header);
      const run = runLevelAgent(s, entry, false)!;
      expect(run.completedAt).toBe(end);
      expect(elapsedLabel(run, end)).toBe(row);
      expect(meta(tree(run, end), 'agent-row__meta mono')).toBe(`done · ${row}`);
    });
  }

  it('a live agent\'s clock floors too: 62.6 s since its spawn reads 1m 2s, as the header reads 1:02', () => {
    expect(elapsedLabel(agent({ state: 'running', presentationState: 'running', live: true }), '2026-09-05T10:01:02.600Z')).toBe('1m 2s');
    expect(runTimingLabel(62.6)).toBe('1:02');
  });
});
