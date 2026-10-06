import { describe, expect, it } from 'vitest';
import type { AgentRecord, CheckpointListPayload, SessionListItemPayload } from '@rotaris/contracts';
import { useShellState } from './shell-state.js';
import { applyTheme, assertDistinctRoleColours, deriveShade, filterSessions, motionReduced, setStoredMotionPreference, agentCounts, agentStatesLine, clampRight, formatTokens, sessionDot, sparklinePath, tokenTotal, branchStripItem, clampGitRight, defaultSessionBranch, filesCell, headerBranch, joinBindings, mergeEligible, stateColumnFit, statePhrase, branchLineFloor, branchColumnFit, tableFit, branchFitKey, stateFitKey, pickerLabel, syncLabel, worktreeDialogMessage, NOT_A_REPOSITORY, REFRESHING_LABEL, formatRemaining, waitHeaderText, waitModelOptions, keepWaitingAction, EXCLUDED_MODEL_HINT, composerPlaceholder, checkpointsEmptyText, effectivePicked, restoreDisabledReason, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY, RESTORE_NO_SESSION, RESTORE_NO_ROW } from './index.js';
import type { GitViewState, GitWorktreeRow } from '@rotaris/contracts';
import { resolveTheme, isBusy, presentationStatus, EXECUTION_STATUSES, PRESENTATION_STATUSES } from '@rotaris/contracts';

describe('ui — the wait header (REQ-NOTIFY-263, REQ-NOTIFY-049)', () => {
  const wait = { provider: 'openrouter', model: 'gpt-x', exhausted: false, resumeAt: '2026-09-05T10:00:42.000Z', attempt: 1, reason: 'Provider openrouter is rate limiting model gpt-x. Wait 42 s before retrying.', agent: 'orchestrator', rejection: null, excluded: [], modelKey: 'gpt-x' };
  it('names the provider and the model, states the exhausted mark, and counts down against the surface clock', () => {
    const at = Date.parse('2026-09-05T10:00:00.000Z');
    expect(waitHeaderText(wait, at)).toEqual({ headline: 'Waiting on a provider limit: openrouter / gpt-x (orchestrator) — provider not marked exhausted, attempt 1.', timing: 'Resumes automatically in 0:42.', remainingS: 42 });
    expect(waitHeaderText(wait, at + 41_000).timing).toBe('Resumes automatically in 0:01.');
    expect(waitHeaderText(wait, at + 90_000)).toMatchObject({ timing: 'Resumes automatically in 0:00.', remainingS: 0 });
    expect(waitHeaderText({ ...wait, exhausted: true, resumeAt: null, attempt: 3 }, at)).toEqual({ headline: 'Waiting on a provider limit: openrouter / gpt-x (orchestrator) — provider marked exhausted, attempt 3.', timing: 'Resumes only when you decide.', remainingS: null });
    expect(formatRemaining(3_725)).toBe('1:02:05');
    expect(formatRemaining(-3)).toBe('0:00');
  });
  it('REQ-MONITOR-194 / REQ-MONITOR-303: the change-model list annotates each pair held out of quota with the reason, and lists it all the same', () => {
    expect(EXCLUDED_MODEL_HINT).toBe('provider reported insufficient quota in this session');
    expect(waitModelOptions(['alpha', 'beta', 'gamma'], [])).toEqual([
      { value: '', label: 'Choose a model…' }, { value: 'alpha', label: 'alpha' }, { value: 'beta', label: 'beta' }, { value: 'gamma', label: 'gamma' },
    ]);
    // Listed in place, choosable (no unavailableReason: an explicit choice is what clears the exclusion), the reason as its hint.
    expect(waitModelOptions(['alpha', 'beta', 'gamma'], ['gamma', 'alpha'])).toEqual([
      { value: '', label: 'Choose a model…' },
      // `rechoosable`: chosen when it is already the selector's value, it is still the explicit choice (fin11).
      { value: 'alpha', label: 'alpha', hint: EXCLUDED_MODEL_HINT, rechoosable: true },
      { value: 'beta', label: 'beta' },
      { value: 'gamma', label: 'gamma', hint: EXCLUDED_MODEL_HINT, rechoosable: true },
    ]);
    // A key the list does not carry is not added: the list is the configured keys (OQ on which list the picker offers).
    expect(waitModelOptions(['beta'], ['alpha']).map((o) => o.value)).toEqual(['', 'beta']);
  });
  /*
   * OQ-188's ruling (R-071, PD-MONITOR-004): keep waiting retries the waiting pair now in the wait that never auto-resumes
   * (an out-of-quota pair), through `setModel` with its key, and stays an acknowledgement in the timed wait, whose timer
   * retries. Until 2026-10-06 it acknowledged in both (`keep-waiting-on-the-quota-wait-header-sends-nothing-…`).
   */
  it('OQ-188 / PD-MONITOR-004: keep waiting retries the out-of-quota pair now, and acknowledges a timed wait', () => {
    const exhausted = { ...wait, exhausted: true, resumeAt: null, excluded: ['gpt-x'] };
    expect(keepWaitingAction(exhausted, true)).toEqual({ kind: 'retry', key: 'gpt-x' });
    // The timed wait: its timer retries when the provider's interval ends; keep waiting sends nothing.
    expect(keepWaitingAction(wait, true)).toEqual({ kind: 'acknowledge' });
    // No key names the waiting pair, or the header cannot send one: an acknowledgement, as before.
    expect(keepWaitingAction({ ...exhausted, modelKey: null }, true)).toEqual({ kind: 'acknowledge' });
    expect(keepWaitingAction(exhausted, false)).toEqual({ kind: 'acknowledge' });
  });
  it('a waiting session is busy and presents as running, so the composer stays locked (REQ-NOTIFY-050/051)', () => {
    expect(presentationStatus('waiting')).toBe('running');
    expect(isBusy('waiting')).toBe(true);
    expect(composerPlaceholder(null, true)).toContain('Run active');
  });
});

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
    { sessionId: 'S-1', label: 'Refactor parser', status: 'completed', branch: '—', relativeTime: '2 minutes ago', detail: 'C:/work/one', awaitingInput: false, stale: false, tokens: 1200, durationLabel: '0:42', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null },
    { sessionId: 'S-2', label: 'Review hooks', status: 'running', branch: 'feat/hooks', relativeTime: '1 hour ago', detail: 'C:/work/two', awaitingInput: true, stale: true, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null },
  ];

  it('searches the complete presented row vocabulary', () => {
    expect(filterSessions(rows, 'PARSER').map((row) => row.sessionId)).toEqual(['S-1']);
    expect(filterSessions(rows, 'stale').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, 'awaiting input').map((row) => row.sessionId)).toEqual(['S-2']);
    expect(filterSessions(rows, '  ')).toEqual(rows);
  });
});

describe('ui — the Overview view (REQ-MONITOR-165..171)', () => {
  const row = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null, ...over });
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
    expect(agentCounts([a('running', 1), a('queued', 1), a('waiting_on_dependencies', 2), a('succeeded', 1), a('cancelled', 3), a('blocked', 1), a('failed', 1)])).toEqual({ running: 1, waiting: 2, paused: 0, done: 1, failed: 3, depth: 3 });
  });
  it('PD-ORCH-005 clause 13 (OQ-100): a paused agent is counted paused — never waiting or failed — and the line names the count only while one is paused', () => {
    const a = (state: string) => ({ id: state, name: 'n', givenName: 'n', persona: 'p', state, presentationState: 'running', parentId: '', dependencies: [], activity: '', model: 'm', depth: 1, background: true, category: '', spawnedAt: 't', completedAt: null, toolCalls: 0, delegationTask: '', live: false }) as unknown as AgentRecord;
    const counts = agentCounts([a('paused'), a('paused'), a('queued'), a('succeeded')]);
    expect(counts).toMatchObject({ running: 0, waiting: 1, paused: 2, done: 1, failed: 0 });
    expect(agentStatesLine(counts)).toBe('running 0 · waiting 1 · paused 2 · done 1 · failed 0');
    expect(agentStatesLine(agentCounts([a('succeeded')]))).toBe('running 0 · waiting 0 · done 1 · failed 0');
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
  const wt = (over: Partial<GitWorktreeRow>): GitWorktreeRow => ({ path: 'D:/ws', branch: 'main', head: 'h', isBase: true, isActive: true, ahead: 0, behind: 0, upstreamAhead: 0, additions: 0, deletions: 0, files: 0, ...over });
  const row = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null, ...over });
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
  it('REQ-GIT-109: the State cell\'s phrase, and the State column sized to the widest phrase drawn plus the cell padding', () => {
    const join = joinBindings([row({ sessionId: 'A', status: 'completed', worktree: binding('D:/ws/.rotaris/worktrees/A', { merge_status: 'merge_failed' }) })]);
    expect(statePhrase(join.get('d:/ws/.rotaris/worktrees/a'))).toEqual({ status: 'completed', merge: 'merge_failed' });
    expect(statePhrase(undefined)).toEqual({ status: 'idle', merge: 'ready' });
    // The figures the unrepaired build painted at 1440x900: `idle · ready` 59.6 px, `completed · ready` 101.6 px, 8 px of
    // padding each side. The column must hold the wider one whole — 76.3 px (10ch) did not
    // (docs/defects/fixed/the-git-views-worktree-state-cell-overruns-the-ahead-column.md).
    expect(stateColumnFit([59.6, 101.6, 59.6], 16)).toBe(118);
    // Nothing measured — a renderer that lays nothing out — leaves the column at its CSS floor rather than at zero.
    expect(stateColumnFit([0, 0], 16)).toBeNull();
    expect(stateColumnFit([], 16)).toBeNull();
    expect(stateColumnFit([Number.NaN, 40], 16)).toBe(56);
  });
  it('REQ-NOTIFY-048/049, REQ-GIT-109: the State cell draws the presented status, never the persisted word, for every persisted value', () => {
    // REQ-NOTIFY-049's fourteen arms, each persisted value beside the member it presents as. The session listing carries the
    // persisted `execution_status` as is; until 2026-10-04 the row drew it raw (`awaiting_plan_decision · ready`)
    // (docs/defects/fixed/the-git-views-state-cell-renders-the-raw-persisted-execution-status.md).
    const arms: ReadonlyArray<readonly [string, string]> = [
      ['idle', 'idle'], ['running', 'running'], ['paused', 'paused'], ['completed', 'completed'], ['failed', 'failed'],
      ['stopped', 'stopped'], ['starting', 'starting'], ['pausing', 'pausing'], ['cancelling', 'cancelling'],
      ['background', 'running'], ['waiting', 'running'], ['paused_message_limit', 'paused'], ['awaiting_plan_decision', 'paused'],
      ['interrupted', 'idle'],
    ];
    expect(arms.map(([persisted]) => persisted).sort()).toEqual([...EXECUTION_STATUSES].sort());
    for (const [persisted, presented] of arms) {
      const join = joinBindings([row({ sessionId: 'A', status: persisted, worktree: binding('D:/ws/.rotaris/worktrees/A') })]);
      const phrase = statePhrase(join.get('d:/ws/.rotaris/worktrees/a'));
      expect(phrase, persisted).toEqual({ status: presented, merge: 'ready' });
      expect(PRESENTATION_STATUSES, persisted).toContain(phrase.status);
    }
    // A value no arm names (a record written by another version) presents through the catch-all.
    expect(statePhrase(joinBindings([row({ status: 'future_state', worktree: binding('D:/x') })]).get('d:/x')).status).toBe('idle');
    // Eligibility still reads the persisted value: `completed` presents as itself, and nothing else becomes eligible by presenting as it.
    const rows = [wt({ path: 'D:/ws/.rotaris/worktrees/A', isBase: false, isActive: false })];
    expect(mergeEligible(rows, new Set(['D:/ws/.rotaris/worktrees/A']), joinBindings([row({ sessionId: 'A', status: 'completed', worktree: binding('D:/ws/.rotaris/worktrees/A') })]))).toHaveLength(1);
    expect(mergeEligible(rows, new Set(['D:/ws/.rotaris/worktrees/A']), joinBindings([row({ sessionId: 'A', status: 'interrupted', worktree: binding('D:/ws/.rotaris/worktrees/A') })]))).toEqual([]);
  });
  it('REQ-GIT-077, UIR-002: the Branch column keeps the widest line with its name at its floor and its tags whole', () => {
    // The base row at 1000x680 as measured 2026-10-04: `base` 40.6 px and `active` 52.9 px wide, an 8 px gap before each, the
    // name's `2ch` floor 14.4 px — 123.9 px of line, where the column's 9ch (68.7 px) gave `main` nothing
    // (docs/defects/fixed/the-git-views-base-row-hides-its-branch-name-behind-its-tags-at-the-minimum-window.md).
    expect(branchLineFloor(14.4, [40.6, 52.9], 8)).toBeCloseTo(123.9, 5);
    expect(branchLineFloor(14.4, [], 8)).toBeCloseTo(14.4, 5);
    expect(branchLineFloor(Number.NaN, [40, Number.NaN], Number.NaN)).toBe(40);
    // The widest line plus the cell's padding, rounded up; nothing measured leaves the column at its CSS floor.
    expect(branchColumnFit([14.4, 123.9, 14.4], 28)).toBe(152);
    expect(branchColumnFit([], 28)).toBeNull();
    expect(branchColumnFit([0, 0], 28)).toBeNull();
    // Both floors reach the table as the custom properties shell.css reads, and neither is set when unmeasured.
    expect(tableFit(null, null)).toBeUndefined();
    expect(tableFit(110, 152)).toEqual({ '--git-state-fit': '110px', '--git-branch-fit': '152px' });
    expect(tableFit(null, 152)).toEqual({ '--git-branch-fit': '152px' });
    expect(tableFit(110, null)).toEqual({ '--git-state-fit': '110px' });
  });
  it('REQ-GIT-077, REQ-GIT-109: a row whose path changes is measured again, though its branch, tags and phrase stay the same', () => {
    // Each worktree row's `tr` is keyed by its path, so a moved worktree remounts its row. Until 2026-10-04 the Branch and
    // State fits re-ran only on branch, tags and phrase, and went on measuring the detached cells (widths 0, the name's
    // floor NaN), the row dropping out of the fit
    // (docs/defects/fixed/the-git-views-column-fits-measure-detached-cells-when-a-rows-path-changes.md).
    const before = [wt({}), wt({ path: 'D:/wt/feature', branch: 'feature/proof', isBase: false, isActive: false })];
    const moved = [before[0]!, { ...before[1]!, path: 'D:/elsewhere/feature' }];
    const join = joinBindings([row({ sessionId: 'B', status: 'completed', worktree: binding('D:/wt/feature') }), row({ sessionId: 'B2', status: 'completed', worktree: binding('D:/elsewhere/feature') })]);
    expect(statePhrase(join.get('d:/wt/feature'))).toEqual(statePhrase(join.get('d:/elsewhere/feature')));
    expect(branchFitKey(moved)).not.toBe(branchFitKey(before));
    expect(stateFitKey(moved, join)).not.toBe(stateFitKey(before, join));
    // The base row's path changing (a main checkout renamed and repaired) as well.
    const baseMoved = [{ ...before[0]!, path: 'D:/ws2' }, before[1]!];
    expect(branchFitKey(baseMoved)).not.toBe(branchFitKey(before));
    expect(stateFitKey(baseMoved, join)).not.toBe(stateFitKey(before, join));
    // Nothing changed, nothing re-measured; a tag or a phrase changing still re-measures.
    expect(branchFitKey([...before])).toBe(branchFitKey(before));
    expect(stateFitKey([...before], join)).toBe(stateFitKey(before, join));
    expect(branchFitKey([{ ...before[0]!, isActive: false }, before[1]!])).not.toBe(branchFitKey(before));
    expect(stateFitKey(before, joinBindings([]))).not.toBe(stateFitKey(before, join));
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
    // REQ-WORKSPACE-149 rule 2 shortens the branch NAME (`text`); the ahead marker is drawn after it, whole (`suffix`).
    // REQ-WORKSPACE-020's three sentences, each with its full stop; the noun agrees with the count (REQ-SHELL-044).
    expect(branchStripItem(state({ ahead: 2 }), null)).toMatchObject({ text: 'main', suffix: ' ↑2', title: 'Branch this workspace is on: main, 2 commits ahead.', state: 'branch' });
    expect(branchStripItem(state({ ahead: 1 }), null)).toMatchObject({ text: 'main', suffix: ' ↑1', title: 'Branch this workspace is on: main, 1 commit ahead.' });
    expect(branchStripItem(state({ ahead: 0 }), null)).toMatchObject({ text: 'main', title: 'Branch this workspace is on: main.' });
    expect(branchStripItem(state({ ahead: 0 }), null)).not.toHaveProperty('suffix');
    expect(branchStripItem(state({ branch: null, detached: true }), null)).toMatchObject({ text: 'detached HEAD', state: 'detached' });
    expect(branchStripItem(state({ isRepository: false }), null)).toMatchObject({ text: 'no git repository', state: 'none' });
    expect(branchStripItem(state({ isRepository: false, gitAvailable: false }), null)).toMatchObject({ text: 'no git', state: 'none' });
    expect(branchStripItem(null, null)).toMatchObject({ state: 'unknown' });
  });
  it('REQ-WORKSPACE-020: an isolated worktree\'s branch takes ITS upstream\'s ahead count and the base checkout\'s sentences; only the description names the worktree', () => {
    // Until the acceptance repair (F8) the item drew the worktree branch with no ` ↑{n}` and one string for tooltip and
    // description, "Branch this session's worktree is on: {branch}".
    const sid = 'rotaris/session/S';
    const linked = (upstreamAhead: number) => wt({ path: 'D:/ws/.rotaris/worktrees/S', branch: sid, isBase: false, isActive: false, ahead: 4, upstreamAhead });
    const note = 'It belongs to the isolated worktree the active run is using, not to the folder this window is open on.';
    const two = branchStripItem(state({ ahead: 1, worktrees: [wt({ upstreamAhead: 1 }), linked(2)] }), sid);
    expect(two).toMatchObject({ text: sid, suffix: ' ↑2', title: `Branch this workspace is on: ${sid}, 2 commits ahead.`, state: 'branch' });
    expect(two.description).toBe(`Branch this workspace is on: ${sid}, 2 commits ahead. ${note}`);
    const one = branchStripItem(state({ ahead: 3, worktrees: [wt({}), linked(1)] }), sid);
    expect(one).toMatchObject({ suffix: ' ↑1', title: `Branch this workspace is on: ${sid}, 1 commit ahead.` });
    // No upstream (or a comparison that could not be made) is a count of zero: no marker, the base checkout's ahead not borrowed,
    // and the row's `ahead` (against the base branch, REQ-GIT-085) never stands in for it.
    const none = branchStripItem(state({ ahead: 3, worktrees: [wt({}), linked(0)] }), sid);
    expect(none).not.toHaveProperty('suffix');
    expect(none.title).toBe(`Branch this workspace is on: ${sid}.`);
    expect(none.description).toBe(`Branch this workspace is on: ${sid}. ${note}`);
    // Before the first read, or with the worktree not (yet) listed, the count is zero too.
    expect(branchStripItem(null, sid)).toMatchObject({ text: sid, title: `Branch this workspace is on: ${sid}.`, state: 'branch' });
    expect(branchStripItem(state({ ahead: 3, worktrees: [] }), sid)).not.toHaveProperty('suffix');
    // The base checkout's tooltip and description stay one and the same string.
    const base = branchStripItem(state({ ahead: 1 }), null);
    expect(base.description).toBe(base.title);
  });
});

describe('ui — the checkpoints card (ADR-0039, REQ-GIT-087/088/089)', () => {
  const rowOf = (over: Partial<SessionListItemPayload>): SessionListItemPayload => ({ sessionId: 'S', label: 'l', status: 'idle', branch: '—', relativeTime: 'now', detail: 'd', awaitingInput: false, stale: false, tokens: 0, durationLabel: '', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null, ...over });
  const listing = (rows: CheckpointListPayload['rows'], unavailable: string | null = null): CheckpointListPayload => ({ sessionId: 'S', rows, lastRestoredSequence: null, liveness: 'not-live', treeRoot: 'D:/ws', unavailable, repaired: null, includeUntracked: true });
  const ckpt = (sequence: number): CheckpointListPayload['rows'][number] => ({ sequence, ref: `refs/rotaris/checkpoints/S/${sequence}`, commit: 'c', createdAt: 't', createdLabel: '2026-09-05 10:00:00', iteration: sequence, childName: '', files: 1, kind: 'iteration' });
  it('REQ-GIT-088: the picker keeps the previous choice, else the focused session, else the first entry', () => {
    const entries = [rowOf({ sessionId: 'A' }), rowOf({ sessionId: 'B' }), rowOf({ sessionId: 'C' })];
    expect(effectivePicked(entries, 'B', 'C')).toBe('B');
    expect(effectivePicked(entries, 'Z', 'C')).toBe('C');
    expect(effectivePicked(entries, null, null)).toBe('A');
    expect(effectivePicked([], 'A', 'A')).toBeNull();
  });
  it('REQ-GIT-087: the empty text by cause — none, reading, unavailable, empty; rows show no text', () => {
    expect(checkpointsEmptyText({ state: 'none' }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toBe(CHECKPOINTS_NO_SESSION);
    expect(checkpointsEmptyText({ state: 'reading', sessionId: 'S' }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toBe("Reading this session's checkpoints…");
    expect(checkpointsEmptyText({ state: 'unavailable', sessionId: 'S', reason: 'Checkpoints are unavailable without a workspace.' }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toBe('Checkpoints are unavailable without a workspace.');
    expect(checkpointsEmptyText({ state: 'ready', sessionId: 'S', listing: listing([]) }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toBe(CHECKPOINTS_EMPTY);
    expect(checkpointsEmptyText({ state: 'ready', sessionId: 'S', listing: listing([ckpt(1)]) }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toBeNull();
    expect(checkpointsEmptyText({ state: 'ready', sessionId: 'S', listing: listing([ckpt(1)], 'This session has no Git working tree Rotaris can roll back, so its checkpoints cannot be restored.') }, CHECKPOINTS_NO_SESSION, CHECKPOINTS_EMPTY)).toMatch(/no Git working tree/);
  });
  it('REQ-GIT-089: the four disabled reasons in order, and enabled with a row selected', () => {
    expect(restoreDisabledReason({ state: 'none' }, null, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBe(RESTORE_NO_SESSION);
    expect(restoreDisabledReason({ state: 'reading', sessionId: 'S' }, 1, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBe("Rotaris is still reading this session's checkpoints.");
    expect(restoreDisabledReason({ state: 'unavailable', sessionId: 'S', reason: 'why' }, 1, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBe('why');
    expect(restoreDisabledReason({ state: 'unavailable', sessionId: 'S', reason: '' }, 1, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBe("This session's checkpoints cannot be restored.");
    expect(restoreDisabledReason({ state: 'ready', sessionId: 'S', listing: listing([ckpt(1)]) }, null, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBe(RESTORE_NO_ROW);
    expect(restoreDisabledReason({ state: 'ready', sessionId: 'S', listing: listing([ckpt(1)]) }, 1, RESTORE_NO_SESSION, RESTORE_NO_ROW)).toBeNull();
  });
});
