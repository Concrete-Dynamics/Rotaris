import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type AgentRecord, type SessionRecord } from '@rotaris/contracts';
import type * as DesignSystem from './design-system/index.js';
import type * as HostModule from './terminal/host.js';
import { AuthRecoveryDialog } from './AuthRecoveryDialog.js';
import { Inspector } from './Inspector.js';
import { annotatedModelOptions, EXCLUDED_MODEL_HINT } from './model-options.js';
import { RunHeader } from './RunHeader.js';
import { WorkspaceView } from './WorkspaceView.js';

/*
 * The repair of the-other-model-selectors-do-not-annotate-a-pair-held-out-of-quota (REQ-MONITOR-194: an excluded pair may be
 * chosen "from any model selector … listed there rather than hidden, annotated with the reason"; spec resolution 21). Each of
 * the four selectors outside the quota-wait header — the run header's Switch model, the inspector's Model field, the
 * composer's next-run chip and the recovery dialog — lists a key the record's `excludedModels` names with EXCLUDED_MODEL_HINT,
 * still choosable. Before, each listed it plainly.
 *
 * The design system's SearchableSelect draws its rows only once opened, which a static render never does, so it is drawn here
 * as the rows it was handed (value, hint, and whether greyed out) — what the surface decides, which is what is under test.
 */
vi.mock('./design-system/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof DesignSystem>();
  return {
    ...original,
    SearchableSelect: ({ ariaLabel, options }: { ariaLabel: string; options: readonly { value: string; label: string; hint?: string; unavailableReason?: string }[] }) =>
      createElement('div', { 'data-select': ariaLabel }, options.map((o) => createElement('span', { key: o.value, 'data-option': o.value, 'data-hint': o.hint ?? '', 'data-unavailable': o.unavailableReason ?? '' }, o.label))),
  };
});
vi.mock('./terminal/host.js', async (importOriginal) => ({ ...(await importOriginal<typeof HostModule>()), TerminalToolbarControl: () => null }));

const root: AgentRecord = {
  id: 'run', name: 'orchestrator', givenName: 'orchestrator', persona: 'orchestrator', state: 'running', presentationState: 'running', parentId: '', dependencies: [], activity: '', model: 'beta',
  depth: 0, background: false, category: '', spawnedAt: '2026-10-02T10:00:00.000Z', completedAt: null, toolCalls: 0, delegationTask: '', reasoning: 'medium', contextUsed: 0, contextLimit: DEFAULT_CONTEXT_CAPACITY,
  grantedTools: [], grantRecorded: false, calledTools: [], activeTools: [], delegationSessionId: null, inheritedContext: '', live: true, grantedMcp: {}, mcpServers: [], compressions: 0, interruption: null, stalledSeconds: null,
} as AgentRecord;
const session = (excludedModels: string[]): SessionRecord => ({
  id: 's1', executionStatus: 'completed', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-10-02T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [root], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: 'tasks_complete', runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-10-02T10:00:00.000Z', iterationsCompleted: 1, summary: null, permissionMode: 'ask', sandboxed: false, sandboxBackend: '', backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, modelOverrides: [], excludedModels, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryPersona: null, entryStalledSeconds: null, entryToolCalls: null, compressions: 0,
} as SessionRecord);
const ok = async () => ({ ok: true as const });
const MODELS = ['alpha', 'beta', 'gamma'];
/** The rows one select was handed, by its accessible name: `value:hint:unavailable` each. */
const rows = (html: string, select: string): string[] => {
  const at = html.indexOf(`data-select="${select}"`);
  if (at < 0) return [];
  const body = html.slice(at, html.indexOf('</div>', at));
  return [...body.matchAll(/data-option="([^"]*)" data-hint="([^"]*)" data-unavailable="([^"]*)"/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}`);
};
const H = EXCLUDED_MODEL_HINT;

describe('REQ-MONITOR-194: every model selector annotates a pair the session holds out of quota, still choosable', () => {
  it('the shared helper: an excluded key keeps its place with the reason as its hint and no unavailable reason', () => {
    expect(annotatedModelOptions(MODELS, ['gamma', 'alpha'])).toEqual([{ value: 'alpha', label: 'alpha', hint: H }, { value: 'beta', label: 'beta' }, { value: 'gamma', label: 'gamma', hint: H }]);
    expect(annotatedModelOptions(MODELS, [])).toEqual(MODELS.map((m) => ({ value: m, label: m })));
  });

  it('the run header\'s Switch model', () => {
    const html = renderToStaticMarkup(createElement(RunHeader, { runState: 'running', session: session(['alpha']), runActive: true, stepStartedAt: null, models: MODELS, onSetModel: ok, onError: () => undefined }));
    expect(rows(html, 'Active run model')).toEqual(['::', 'alpha:' + H + ':', 'beta::', 'gamma::']);
  });

  it('the inspector\'s Model field, beside REQ-MONITOR-067\'s withheld models (which stay unavailable)', () => {
    const html = renderToStaticMarkup(createElement(Inspector, {
      session: session(['alpha']), rows: [], personas: [], runLevel: root, selectedAgentId: 'run', onSelect: () => undefined, models: MODELS, withheldModels: [{ model: 'delta', reason: 'region' }],
      compressionThresholdPercent: 60, runActive: true, resting: false, nowIso: null, onSteer: () => undefined, onCancel: () => undefined, onPopOut: () => undefined, onSetModel: ok,
    }));
    expect(rows(html, 'Agent model')).toEqual(['alpha:' + H + ':', 'beta::', 'gamma::', 'delta::region']);
  });

  it('the composer\'s model for the next run', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceView, { session: session(['alpha']), rows: [], onSubmit: ok, onStop: ok, models: MODELS, modelsLoaded: true, onSetNextModel: ok }));
    expect(rows(html, 'Model for the next run')).toEqual(['::', 'alpha:' + H + ':', 'beta::', 'gamma::']);
    // With nothing excluded, nothing is annotated.
    const plain = renderToStaticMarkup(createElement(WorkspaceView, { session: session([]), rows: [], onSubmit: ok, onStop: ok, models: MODELS, modelsLoaded: true, onSetNextModel: ok }));
    expect(rows(plain, 'Model for the next run')).toEqual(['::', 'alpha::', 'beta::', 'gamma::']);
  });

  it('the recovery dialog\'s list (REQ-NOTIFY-074): the reason beside the pair, the option named by its label and described by the reason', () => {
    const m = (key: string, provider: string, model: string, excluded?: true) => ({ key, provider, providerName: provider, model, ...(excluded ? { excluded } : {}) });
    const html = renderToStaticMarkup(createElement(AuthRecoveryDialog, {
      payload: { sessionId: 's1', failed: m('beta', 'b', 'beta'), active: m('beta', 'b', 'beta'), models: [m('alpha', 'a', 'alpha', true), m('gamma', 'c', 'gamma')], error: 'HTTP 401', reauth: { provider: 'b', providerName: 'b', method: 'configuration', message: 'x' } },
      onRetry: ok, onReauthenticate: ok, onCancel: () => undefined,
    }));
    const option = (value: string) => html.match(new RegExp(`<button[^>]*data-value="${value}"[^>]*>.*?</button>`))?.[0] ?? '';
    expect(option('alpha')).toContain(`>${H}</span>`);
    expect(option('alpha')).toMatch(/aria-labelledby="auth-recovery-option-0-label"/);
    expect(option('alpha')).toMatch(/aria-describedby="auth-recovery-option-0-hint"/);
    expect(option('alpha')).not.toContain('disabled');
    expect(option('gamma')).not.toContain(H);
    expect(option('gamma')).not.toContain('aria-describedby');
  });
});
