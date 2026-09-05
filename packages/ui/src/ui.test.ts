import { describe, expect, it } from 'vitest';
import type { AgentRecord, SessionListItemPayload } from '@rotaris/contracts';
import { useShellState } from './shell-state.js';
import { applyTheme, assertDistinctRoleColours, deriveShade, filterSessions, motionReduced, setStoredMotionPreference, agentCounts, clampRight, formatTokens, sessionDot, sparklinePath, tokenTotal, branchStripItem, clampGitRight, defaultSessionBranch, filesCell, headerBranch, joinBindings, mergeEligible, pickerLabel, syncLabel, worktreeDialogMessage, NOT_A_REPOSITORY, REFRESHING_LABEL } from './index.js';
import type { GitViewState, GitWorktreeRow } from '@rotaris/contracts';
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
    { sessionId: 'S-1', label: 'Refactor parser', status: 'completed', branch: '—', relativeTime: '2 minutes ago', detail: 'C:/work/one', awaitingInput: false, stale: false, tokens: 1200, durationLabel: '0:42', busy: false, requirementId: null, worktree: null, checkpointCount: 0 },
    { sessionId: 'S-2', label: 'Review hooks', status: 'running', branch: 'feat/hooks', relativeTime: '1 hour ago', detail: 'C:/work/two', awaitingInput: true, stale: true, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0 },
  ];

  it('searches the complete presented row vocabulary', () => {
    expect(filterSessions(rows, 'PARSER').map((row) => row.sessionId)).toEqual(['S-1']);
    expect(filterSessions(rows, 'stale').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, 'awaiting input').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, '  ')).toEqual(rows);
  });
});

describe('ui — the Overview view (REQ-MONITOR-165..171)', () => {
  const row = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, ...over });
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

describe('ui — the Git view (REQ-GIT-075..090, 109, 116, 122, 161)', () => {
  const state = (over: Partial<GitViewState>): GitViewState => ({ workspaceRoot: 'D:/ws', gitAvailable: true, isRepository: true, branch: 'main', detached: false, upstream: 'origin/main', ahead: 1, behind: 0, uncommitted: 0, additions: 0, deletions: 0, files: 0, baseBranch: 'main', worktrees: [], history: [], failed: [], reads: 11, readMs: 400, ...over });
  const wt = (over: Partial<GitWorktreeRow>): GitWorktreeRow => ({ path: 'D:/ws', branch: 'main', head: 'h', isBase: true, isActive: true, ahead: 0, behind: 0, additions: 0, deletions: 0, files: 0, ...over });
  const row = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, ...over });
  const binding = (path: string, over: Partial<NonNullable<SessionListItemPayload['worktree']>> = {}) => ({ worktree_path: path, branch: 'rotaris/session/S', base_branch: 'main', base_revision: 'r', created_by_session: true, merge_status: 'ready' as const, integration_session_id: null, ...over });
  it('REQ-GIT-075/081: the header texts — the branch, the literal for a non-repository, the sync label and its refreshing form', () => {
    expect(headerBranch(null)).toBe('reading…');
    expect(headerBranch(state({ isRepository: false }))).toBe(NOT_A_REPOSITORY);
    expect(headerBranch(state({ branch: null, detached: true }))).toBe('detached HEAD');
    expect(headerBranch(state({}))).toBe('main');
    expect(syncLabel(state({}), false)).toBe('ahead 1  behind 0');
    expect(syncLabel(state({ isRepository: false, gitAvailable: false }), false)).toBe('ahead —  behind —');
    expect(syncLabel(state({}), true)).toBe(REFRESHING_LABEL);
  });
  it('REQ-GIT-077/112: the Files cell, and the empty value for a figure that could not be computed', () => {
    expect(filesCell(wt({ additions: 3, deletions: 1, files: 2 }))).toBe('+3 -1 / 2');
    expect(filesCell(wt({ additions: null, deletions: null, files: null }))).toBe('—');
  });
  it('REQ-GIT-109: bindings join by resolved path whatever the spelling; unassociated trees carry none', () => {
    const join = joinBindings([row({ sessionId: 'A', status: 'completed', worktree: binding('D:\\ws\\.rotaris\\worktrees\\A\\') }), row({ sessionId: 'B', status: 'running', worktree: binding('d:/other') })]);
    expect(join.get('d:/ws/.rotaris/worktrees/a')).toMatchObject({ sessionId: 'A', status: 'completed', mergeStatus: 'ready' });
    expect(join.get('d:/ws')).toBeUndefined();
  });
  it('REQ-GIT-083: eligibility is completed + ready|merge_failed among the selected rows, in table order', () => {
    const rows = [wt({ path: 'D:/ws' }), wt({ path: 'D:/ws/.rotaris/worktrees/A', isBase: false, isActive: false }), wt({ path: 'D:/ws/.rotaris/worktrees/B', isBase: false, isActive: false })];
    const join = joinBindings([row({ sessionId: 'B', status: 'completed', worktree: binding('D:/ws/.rotaris/worktrees/B', { merge_status: 'merge_failed' }) }), row({ sessionId: 'A', status: 'running', worktree: binding('D:/ws/.rotaris/worktrees/A') })]);
    expect(mergeEligible(rows, new Set(['D:/ws/.rotaris/worktrees/B', 'D:/ws/.rotaris/worktrees/A', 'D:/ws']), join).map((r) => r.path)).toEqual(['D:/ws/.rotaris/worktrees/B']);
    expect(mergeEligible(rows, new Set(['D:/ws/.rotaris/worktrees/A']), join)).toEqual([]);
  });
  it('REQ-GIT-076: neither column drops below 280 px', () => {
    expect(clampGitRight(100, 1400)).toBe(280);
    expect(clampGitRight(480, 1400)).toBe(480);
    expect(clampGitRight(600, 700)).toBe(700 - 280 - 8);
  });
  it('REQ-GIT-086/118: the picker entries and the default session branch', () => {
    expect(pickerLabel(row({ sessionId: 'S', worktree: binding('p') }))).toBe('S · rotaris/session/S');
    expect(pickerLabel(row({ sessionId: 'S' }))).toBe('S');
    expect(defaultSessionBranch('abc')).toBe('rotaris/session/abc');
  });
  it('REQ-GIT-116: the five dialog messages, distinguishable, in order', () => {
    expect(worktreeDialogMessage('', '', [], [], null)).toBe('Enter a branch name.');
    expect(worktreeDialogMessage('a..b', 'D:/x', [], [], null)).toMatch(/not a usable Git branch name: it contains '\.\.'/);
    expect(worktreeDialogMessage('main', 'D:/x', ['main'], [], null)).toBe('The branch main already has a worktree.');
    expect(worktreeDialogMessage('feature/x', '   ', [], [], null)).toBe('Choose a directory for the worktree.');
    expect(worktreeDialogMessage('feature/x', 'D:/x', [], ['d:\\x\\'], null)).toMatch(/already exists/);
    expect(worktreeDialogMessage('feature/x', 'D:/x', [], [], { exists: true, nonEmpty: true })).toMatch(/already exists/);
    expect(worktreeDialogMessage('feature/x', 'D:/x', [], [], { exists: true, nonEmpty: false })).toBeNull();
    expect(worktreeDialogMessage('feature/x', 'D:/x', [], [], null)).toBeNull();
  });
  it('REQ-GIT-122/161: the strip item — the focused worktree branch first, ↑n when ahead, detached and not-a-repository distinct', () => {
    expect(branchStripItem(state({}), 'rotaris/session/S')).toMatchObject({ text: 'rotaris/session/S', state: 'branch' });
    expect(branchStripItem(state({ ahead: 2 }), null)).toMatchObject({ text: 'main ↑2', title: 'Branch this workspace is on: main, 2 commits ahead', state: 'branch' });
    expect(branchStripItem(state({ ahead: 0 }), null)).toMatchObject({ text: 'main', title: 'Branch this workspace is on: main' });
    expect(branchStripItem(state({ branch: null, detached: true }), null)).toMatchObject({ text: 'detached HEAD', state: 'detached' });
    expect(branchStripItem(state({ isRepository: false }), null)).toMatchObject({ text: 'no git repository', state: 'none' });
    expect(branchStripItem(state({ isRepository: false, gitAvailable: false }), null)).toMatchObject({ text: 'no git', state: 'none' });
    expect(branchStripItem(null, null)).toMatchObject({ state: 'unknown' });
  });
});
