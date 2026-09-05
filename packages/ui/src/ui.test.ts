import { describe, expect, it } from 'vitest';
import type { AgentRecord, SessionListItemPayload } from '@rotaris/contracts';
import { useShellState } from './shell-state.js';
import { applyTheme, assertDistinctRoleColours, deriveShade, filterSessions, motionReduced, setStoredMotionPreference, agentCounts, clampRight, formatTokens, sessionDot, sparklinePath, tokenTotal } from './index.js';
import { resolveTheme } from '@rotaris/contracts';

describe('ui — shell state (REQ-SHELL-025, REQ-SHELL-026)', () => {
  it('starts on Overview, switches to a known view, and treats an unknown identifier as a silent no-op', () => {
    expect(useShellState.getState().activeView).toBe('overview');
    useShellState.getState().switchView('git');
    expect(useShellState.getState().activeView).toBe('git');
    useShellState.getState().switchView('nonsense');
    expect(useShellState.getState().activeView).toBe('git');
  });
});

describe('ui — theme projection and motion', () => {
  it('projects every token and declares the theme metadata on the root', () => {
    const values = new Map<string, string>();
    const root = { style: { setProperty: (name: string, value: string) => values.set(name, value), colorScheme: '' }, dataset: {} } as unknown as HTMLElement;
    applyTheme(resolveTheme('nocturne'), root);
    expect(values.get('--rt-bg')).toBe('oklch(14% 0 0)');
    expect(root.dataset['theme']).toBe('nocturne');
    expect(root.dataset['dark']).toBe('true');
  });

  it('corrects shades through the shared lightness function and refuses duplicate slash roles', () => {
    expect(deriveShade('oklch(30% 0.1 165)', 'oklch(10% 0 0)')).toMatch(/^oklch\(/);
    expect(() => assertDistinctRoleColours(['a', 'b', 'c', 'd'])).not.toThrow();
    expect(() => assertDistinctRoleColours(['a', 'b', 'c', 'a'])).toThrow(/pairwise/);
  });

  it('gives the stored reduced-motion setting precedence', () => {
    setStoredMotionPreference(true);
    expect(motionReduced()).toBe(true);
    setStoredMotionPreference(false);
    expect(motionReduced()).toBe(false);
    setStoredMotionPreference(undefined);
  });
});

describe('ui — session browser (REQ-SHELL-126)', () => {
  const rows = [
    { sessionId: 'S-1', label: 'Refactor parser', status: 'completed', branch: '—', relativeTime: '2 minutes ago', detail: 'C:/work/one', awaitingInput: false, stale: false, tokens: 1200, durationLabel: '0:42', busy: false, requirementId: null },
    { sessionId: 'S-2', label: 'Review hooks', status: 'running', branch: 'feat/hooks', relativeTime: '1 hour ago', detail: 'C:/work/two', awaitingInput: true, stale: true, tokens: 0, durationLabel: '', busy: false, requirementId: null },
  ];

  it('searches the complete presented row vocabulary', () => {
    expect(filterSessions(rows, 'PARSER').map((row) => row.sessionId)).toEqual(['S-1']);
    expect(filterSessions(rows, 'stale').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, 'awaiting input').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, '  ')).toEqual(rows);
  });
});

describe('ui — the Overview view (REQ-MONITOR-165..171)', () => {
  const row = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, ...over });
  it('REQ-MONITOR-166: fewer than two samples is an empty sparkline, never a flat line; the path spans the samples', () => {
    expect(sparklinePath([], 160, 36)).toBeNull();
    expect(sparklinePath([['t', 5]], 160, 36)).toBeNull();
    const path = sparklinePath([['a', 0], ['b', 50], ['c', 100]], 160, 36)!;
    expect(path.startsWith('M0.0,35.0')).toBe(true);
    expect(path).toContain('L160.0,1.0');
    expect(sparklinePath([['a', 7], ['b', 7]], 160, 36)).toContain('L160.0,35.0');
  });
  it('REQ-MONITOR-170: the aggregate total when a sample carries it, else input + output; thousands separated with tok', () => {
    expect(tokenTotal({ tokenUsage: { input: 1200, output: 34 }, usageHistory: [] })).toBe(1234);
    expect(tokenTotal({ tokenUsage: { input: 10, output: 5 }, usageHistory: [['t', 5911]] })).toBe(5911);
    expect(formatTokens(5911)).toBe('5,911 tok');
  });
  it('REQ-MONITOR-169: waiting counts queued, failed counts cancelled and blocked; the depth is the deepest agent', () => {
    const a = (state: string, depth: number) => ({ id: state + depth, name: 'n', givenName: 'n', persona: 'p', state, presentationState: 'running', parentId: '', dependencies: [], activity: '', model: 'm', depth, background: true, category: '', spawnedAt: 't', completedAt: null, toolCalls: 0, delegationTask: '', live: false }) as unknown as AgentRecord;
    expect(agentCounts([a('running', 1), a('queued', 1), a('waiting_on_dependencies', 2), a('succeeded', 1), a('cancelled', 3), a('blocked', 1), a('failed', 1)])).toEqual({ running: 1, waiting: 2, done: 1, failed: 3, depth: 3 });
  });
  it('REQ-MONITOR-171: the dot — attached run, background informational, other busy pulsing, failed, idle', () => {
    expect(sessionDot(row({ status: 'running' }), true)).toMatchObject({ tone: 'run', pulse: false });
    expect(sessionDot(row({ status: 'running' }), false)).toMatchObject({ tone: 'info', pulse: false });
    expect(sessionDot(row({ status: 'starting' }), false)).toMatchObject({ tone: 'run', pulse: true });
    expect(sessionDot(row({ status: 'failed' }), false)).toMatchObject({ tone: 'fail' });
    expect(sessionDot(row({ status: 'completed' }), false)).toMatchObject({ tone: 'idle', text: 'completed' });
  });
  it('REQ-MONITOR-165: the right column clamps to 260..560 and leaves the left column its 320 px', () => {
    expect(clampRight(100, 1400)).toBe(260);
    expect(clampRight(900, 1400)).toBe(560);
    expect(clampRight(340, 1400)).toBe(340);
    expect(clampRight(560, 900)).toBe(572 - 8 >= 560 ? 560 : 900 - 320 - 8);
    expect(clampRight(400, 600)).toBe(272);
  });
});
