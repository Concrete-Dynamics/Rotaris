import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord, type RepositoryState, type SessionListItemPayload, type SessionRecord } from '@rotaris/contracts';
import { clampRight, OVERVIEW_DIVIDER_WIDTH, OVERVIEW_LOADING_LABEL, OVERVIEW_NO_SESSION_CAPTION, OVERVIEW_PROPOSALS_HINT, OVERVIEW_SESSIONS_FAILED, OverviewView, type OverviewProps } from './OverviewView.js';

/**
 * The Overview audit of 2026-11-02 (`docs/design/briefs/overview.md`), executed 2026-11-03: each case pins one item's or one
 * predicted row's repair in the rendered markup or in `shell.css`, so the number the brief says must move cannot move back.
 * Structure stays the specification's (REQ-MONITOR-164..174); only the drawing changed.
 */
const session = (over: Partial<SessionRecord> = {}): SessionRecord => ({
  id: 's1', executionStatus: 'completed', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-11-03T10:00:57.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 200, output: 136 }, cost: '0.0028', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-11-03T10:00:00.000Z', iterationsCompleted: 1, summary: null, permissionMode: 'autonomous', sandboxed: false, sandboxBackend: '', backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [['2026-11-03T10:00:07.000Z', 100], ['2026-11-03T10:00:14.000Z', 336]], costLabel: { text: '0.0028 at configured rates', qualifier: 'configured' }, toolCalls: { total: 2, agents: 1, byTool: [{ tool: 'read_file', count: 2 }] }, worktreeBranch: null, wait: null, modelOverrides: [], excludedModels: [], compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryModelKey: null, entryStalledSeconds: null, entryToolCalls: null, compressions: 0,
  ...over,
});
const agent = (over: Partial<AgentRecord> = {}): AgentRecord => ({
  id: 'bg_00000001', name: 'helper', givenName: 'Helper', persona: 'coding-agent', state: 'succeeded', presentationState: 'done', parentId: 'root:1', dependencies: [], activity: 'do the thing', model: 'scripted/alpha',
  depth: 1, background: true, category: 'quick', spawnedAt: '2026-11-03T10:00:05.000Z', completedAt: '2026-11-03T10:00:55.000Z', toolCalls: 1, delegationTask: 'do the thing', reasoning: 'medium', contextUsed: 1000, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: ['read_file'], calledTools: ['read_file'], activeTools: [], delegationSessionId: null, inheritedContext: '', live: false, grantRecorded: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null, timedOut: null, ...over,
});
const row = (over: Partial<SessionListItemPayload> = {}): SessionListItemPayload => ({ sessionId: 's1', label: 'Exercise the overview.', status: 'completed', branch: 'main', relativeTime: 'now', detail: 'C:\\ws', awaitingInput: false, stale: false, tokens: 336, durationLabel: '0:57', busy: false, requirementId: null, worktree: null, checkpointCount: 0, unreadable: null, ...over });
const repository: RepositoryState = { gitAvailable: true, isRepository: true, branch: 'main', base: null, ahead: 0, behind: 0, touched: 1, uncommitted: 0, failed: [], readMs: 12 };
const ok = async () => ({ ok: true as const });
const render = (over: Partial<OverviewProps> = {}) => renderToStaticMarkup(createElement(OverviewView, {
  session: null, sessions: [], sessionsState: 'idle', sessionsError: null, repository, caps: { depth: 3, fanOut: 4 }, layout: undefined, onLayout: () => undefined, nowIso: '2026-11-03T10:01:00.000Z',
  onListSessions: () => undefined, onNewSession: ok, onRefresh: () => undefined, onOpenSession: () => undefined, onContinueSession: () => undefined, onGoTo: () => undefined,
  improvements: [], onOpenProposal: () => undefined, onReviewProposal: ok, reducedMotion: false,
  ...over,
}));
const count = (html: string, needle: string) => html.split(needle).length - 1;
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const rule = (selector: string) => css.split('\n').find((line) => line.startsWith(`${selector} {`)) ?? '';

describe('the Overview header (REQ-MONITOR-164)', () => {
  it('spells the status as the lower-case REQ-NOTIFY-048 member, as the sessions card does — item 15', () => {
    const html = render({ session: session(), sessions: [row()] });
    expect(html).toContain('session Exercise the overview. · completed · ');
    expect(html).not.toContain('· Completed ·');
    expect(html).toContain('class="visually-hidden">completed<');
  });
  it('puts the title and the session label in one baseline group, before the two controls — item 14', () => {
    const html = render();
    expect(html).toMatch(/<div class="overview__heading"><h1 class="display overview__title">Overview<\/h1><span class="page-header-sub overview__session mono" data-testid="overview-session">No session is active<\/span><\/div><span class="overview__spacer">/);
    expect(rule('.overview__heading')).toContain('align-items: baseline');
    expect(rule('.overview__heading')).toContain('gap: var(--rt-space-3)');
  });
});

describe('the body with nothing listed and no session (REQ-MONITOR-165; audit P1, P3, items 3 and 12)', () => {
  it('draws the onboarding empty state once a read settled on zero sessions, its one control secondary and in the action slot', () => {
    const html = render({ sessionsState: 'idle' });
    expect(html).toContain('data-testid="overview-empty"');
    expect(html).toContain('class="empty-state-title">Nothing to show yet<');
    expect(html).toMatch(/<div class="empty-state-action"><button type="button" class="btn btn-secondary"[^>]*>Open Workspace<\/button><\/div>/);
    // §1.7, item 3: "New session" is the view's one filled control in every state.
    expect(count(html, 'btn btn-primary')).toBe(1);
    expect(html).not.toContain('data-testid="overview-loading"');
    expect(rule('.empty-state-action')).toContain('margin-top: var(--rt-space-2)');
  });
  it('draws one spinner named for its wait while the first read is pending — never the empty state, never a zero grid (P3)', () => {
    const html = render({ sessionsState: 'loading' });
    expect(html).toContain('data-testid="overview-loading"');
    expect(html).toContain(`aria-label="${OVERVIEW_LOADING_LABEL}"`);
    expect(html).toContain('data-ui-component="Spinner"');
    expect(html).not.toContain('data-testid="overview-empty"');
    expect(html).not.toContain('data-testid="overview-tokens"');
  });
  it('draws a refused read as the sessions card\'s own cell, not as an empty store (P1)', () => {
    const html = render({ sessionsState: 'error', sessionsError: 'The session store for this workspace is not where it is kept' });
    expect(html).not.toContain('data-testid="overview-empty"');
    expect(html).toContain('data-testid="overview-sessions-failed"');
    expect(html).toContain(`<p class="card-body">${OVERVIEW_SESSIONS_FAILED}</p>`);
    expect(html).toContain('data-testid="overview-sessions-failed-detail">The session store for this workspace is not where it is kept<');
    expect(html).toMatch(/<button type="button" class="btn btn-secondary btn-compact"[^>]*>Read again<\/button>/);
    expect(count(html, 'btn btn-primary')).toBe(1);
  });
});

describe('the three session-scoped cards with sessions listed and none focused (REQ-MONITOR-166/167/169; audit P4)', () => {
  it('draws a dash in every figure and one sentence as the caption, and keeps the Repository card\'s workspace figures', () => {
    const html = render({ sessions: [row()] });
    expect(html).toContain('data-testid="overview-tokens">—<');
    expect(html).toContain('data-testid="overview-tool-calls">—<');
    expect(html).toContain('data-testid="overview-agent-count">—<');
    expect(html).toContain('data-testid="overview-agent-caps">depth — / 3 · fan-out — / 4<');
    expect(count(html, OVERVIEW_NO_SESSION_CAPTION)).toBe(3);
    expect(html).not.toContain('across 0 agents');
    expect(html).not.toContain('running 0 · waiting 0');
    expect(html).toContain('data-testid="overview-repo-touched">1 file touched · 0 uncommitted<');
    // The sentence is prose: it is not set in the data face (the audit's taste note on prose in mono).
    expect(html).toContain('<div class="card-meta" data-testid="overview-tool-agents">');
  });
});

describe('the populated cards (REQ-MONITOR-166..169; audit items 4, 5, 6, 13, 16)', () => {
  const html = render({ session: session({ agents: [agent()] }), sessions: [row()] });
  it('sets every caption that carries a figure in the mono face — item 5', () => {
    expect(html).toContain('<div class="card-meta mono"><span data-testid="overview-cost" data-qualifier="configured">0.0028 at configured rates</span></div>');
    expect(html).toContain('<div class="card-meta mono" data-testid="overview-tool-agents">across 1 agent</div>');
    expect(html).toContain('<div class="card-meta mono" data-testid="overview-repo-touched">1 file touched · 0 uncommitted</div>');
    expect(html).toContain('<span class="card-meta mono">1 listed</span>');
  });
  it('draws REQ-MONITOR-168\'s markers as Phosphor arrows beside the numerals, the words carrying the direction — item 6', () => {
    expect(html).toContain('<span class="ov-kpi__count"><i class="ph ph-arrow-up ov-kpi__marker" aria-hidden="true"></i><span class="kpi-value">0</span><span class="kpi-unit">ahead</span></span><span class="ov-kpi__count"><i class="ph ph-arrow-down ov-kpi__marker" aria-hidden="true"></i><span class="kpi-value">0</span><span class="kpi-unit">behind</span></span>');
    expect(html).not.toContain('↑');
    expect(html).not.toContain('↓');
    expect(rule('.ov-kpi__marker')).toContain('font-size: var(--rt-icon-size)');
  });
  it('draws the tree row\'s dot with the design StatusDot in the done state, and publishes the kicker keyline — items 4 and 13', () => {
    expect(html).toContain('<span class="card-kicker" data-ui="overview-agents-kicker" data-ui-contract="[]">Agents</span>');
    expect(html).toMatch(/<span class="status-dot" data-state="done" aria-hidden="true" data-ui-component="StatusDot" data-ui="overview-agents-first-dot" data-ui-contract="\[\{&quot;kind&quot;:&quot;align-x&quot;,&quot;target&quot;:&quot;overview-agents-kicker&quot;,&quot;edge&quot;:&quot;left&quot;,&quot;tolerance&quot;:1\}\]"><\/span>/);
    expect(html).not.toContain('agent-row__dot');
    expect(css).not.toMatch(/^\.agent-row__dot/m);
    expect(rule('.ov-card--tree .agent-row')).toContain('column-gap: 0');
    expect(rule('.ov-card--tree .agent-row__prefix:empty + .status-dot')).toContain('margin-inline-start: 0');
  });
  it('publishes one card-to-card gap on both columns, --rt-space-4 — item 16', () => {
    const contract = 'data-ui-contract="[{&quot;kind&quot;:&quot;spacing-token&quot;,&quot;property&quot;:&quot;gap&quot;,&quot;token&quot;:&quot;--rt-space-4&quot;}]"';
    expect(html).toContain(`<div class="overview__left" data-ui="overview-left" ${contract}>`);
    expect(html).toContain(`data-ui="overview-right" ${contract}>`);
    expect(rule('.overview__right')).toContain('gap: var(--rt-space-4)');
    expect(rule('.overview__left')).toContain('gap: var(--rt-space-4');
    expect(rule('.overview__metrics')).toContain('gap: var(--rt-space-3');
  });
  it('draws the empty proposals as the card\'s own body, without a second frame or the grid motif — item 10', () => {
    const card = html.slice(html.indexOf('aria-label="Improvement proposals"'));
    expect(card).toContain('<div class="ov-card__empty" data-testid="overview-proposals-empty"><span class="empty-state-title">No proposals</span>');
    expect(card).toContain(`<p class="card-body ov-card__empty-hint" data-testid="overview-proposals-hint">${OVERVIEW_PROPOSALS_HINT.replaceAll("'", '&#x27;')}</p>`);
    expect(card).not.toContain('rt-dot-grid-bg');
    expect(card).not.toContain('data-ui-component="EmptyState"');
    expect(rule('.ov-card__empty-hint')).toContain('max-width: var(--rt-prose-measure)');
  });
});

describe('the seam between the columns (REQ-MONITOR-165; audit item 9)', () => {
  it('is the --rt-space-4 track in the template and the stylesheet, and the clamp knows its width', () => {
    const html = render({ sessions: [row()] });
    expect(html).toContain('grid-template-columns:minmax(320px, 1fr) var(--rt-space-4) 340px');
    expect(rule('.overview__divider')).toContain('width: var(--rt-space-4)');
    expect(rule('.overview__body')).toContain('var(--rt-space-4) 340px');
    expect(OVERVIEW_DIVIDER_WIDTH).toBe(16);
    expect(clampRight(560, 880)).toBe(880 - 320 - OVERVIEW_DIVIDER_WIDTH);
  });
});

describe('the view title (UIR-003; audit item 8)', () => {
  it('asks for --rt-h4 with the display face\'s tracking and leading, and names no token the theme does not declare', () => {
    const display = rule('.display');
    expect(display).toContain('font-size: var(--rt-h4)');
    expect(display).toContain('letter-spacing: var(--rt-tracking-tight)');
    expect(display).toContain('line-height: var(--rt-leading-tight)');
    expect(display).not.toContain('--rt-text-lg');
    expect(display).not.toMatch(/\d+px/);
  });
  it('leaves the adopted sheet as the one definition of the status pulse (the archived agent-row note)', () => {
    expect(css).not.toContain('@keyframes rt-pulse');
  });
});
