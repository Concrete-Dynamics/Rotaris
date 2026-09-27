import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type SessionRecord } from '@rotaris/contracts';
import { CONTINUE_WITHOUT_THEM_HINT, resumeCountText, WorkspaceView } from './WorkspaceView.js';

/**
 * PD-ORCH-005 clause 6: "The Continue action SHALL state how many agents will resume, and SHALL offer to continue without
 * them." What a unit test can prove here is the markup of each state — which controls exist, what they say and what
 * describes them; the click reaching the command is driven against the built product (`pnpm app:drive`), because this
 * repository has no DOM in vitest.
 */
const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: 's1', executionStatus: 'paused', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-27T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: 'user_cancelled', runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-27T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, ...over,
});
const render = (s: SessionRecord) => renderToStaticMarkup(createElement(WorkspaceView, {
  session: s, rows: [],
  onSubmit: async () => ({ ok: true as const }), onStop: async () => ({ ok: true as const }), onContinue: async () => ({ ok: true as const }),
}));

describe('PD-ORCH-005 clause 6: the Continue action states how many agents resume and offers to continue without them', () => {
  it('the count reads as a sentence, singular and plural', () => {
    expect(resumeCountText(1)).toBe('1 agent resumes');
    expect(resumeCountText(3)).toBe('3 agents resume');
  });

  it('a paused session with an open iteration: the count, which describes both continues, and "Continue without them"', () => {
    const html = render(session({ resumable: { iteration: 2, agents: 3 } }));
    expect(html).toContain('<span id="composer-resume-count" class="composer__resume mono" data-testid="composer-resume-count">3 agents resume</span>');
    // Continue run and Continue with a message both resume them, so the count describes both.
    expect(html.match(/aria-describedby="composer-resume-count"/g)).toHaveLength(2);
    expect(html).toMatch(/>Continue run</);
    expect(html).toMatch(/data-testid="composer-continue-without"[^>]*>Continue without them</);
    expect(html).toContain(`title="${CONTINUE_WITHOUT_THEM_HINT}"`);
    expect(html).toMatch(/>Continue with a message</);
  });

  it('a paused session with nothing to resume offers the Continue action as before: no count and no decline', () => {
    const html = render(session({ resumable: null }));
    expect(html).toMatch(/>Continue run</);
    expect(html).not.toContain('composer-resume-count');
    expect(html).not.toContain('Continue without them');
  });

  it('only a `paused` session offers it: a session at the message limit or the plan gate states no count', () => {
    for (const executionStatus of ['paused_message_limit', 'interrupted', 'completed']) {
      expect(render(session({ executionStatus, resumable: { iteration: 1, agents: 2 } }))).not.toContain('Continue without them');
    }
  });
});
