import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTEXT_CAPACITY, type SessionRecord } from '@rotaris/contracts';
import { declineText, resumeCountText, WorkspaceView } from './WorkspaceView.js';

/**
 * PD-ORCH-005 clause 6: "The Continue action SHALL state how many agents will resume, and SHALL offer to continue without
 * them." What a unit test can prove here is the markup of each state — which controls exist, what they say, what
 * describes them and where they stand; the click reaching the command, and the confirmation it opens, are driven
 * against the built product (`pnpm app:drive`), because this repository has no DOM in vitest.
 */
const session = (over: Partial<SessionRecord>): SessionRecord => ({
  id: 's1', executionStatus: 'paused', workspaceRoot: 'C:\\ws', createdAt: 'x', updatedAt: '2026-09-27T10:05:00.000Z', historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null }, agents: [], pendingApprovals: [], pendingQuestions: [],
  tokenUsage: { input: 0, output: 0 }, cost: '0', stopReason: 'user_cancelled', runType: 'task_run', improvementArtifactIds: [], runStartedAt: '2026-09-27T10:00:00.000Z', iterationsCompleted: 0, summary: null, permissionMode: 'ask', sandboxed: false, backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false, resumable: null,
  usageHistory: [], costLabel: { text: '', qualifier: 'unknown' }, toolCalls: { total: 0, agents: 0, byTool: [] }, worktreeBranch: null, wait: null, compression: null, entryContext: { used: 0, limit: DEFAULT_CONTEXT_CAPACITY }, entryTools: { resolved: [], called: [], active: [] }, artifacts: [], entryRoots: [], entryStalledSeconds: null, ...over,
});
const render = (s: SessionRecord, needsRecovery = false) => renderToStaticMarkup(createElement(WorkspaceView, {
  session: s, rows: [], needsRecovery,
  onSubmit: async () => ({ ok: true as const }), onStop: async () => ({ ok: true as const }), onContinue: async () => ({ ok: true as const }),
}));
/** The markup of one region, from its opening tag to the end of the composer. */
const strip = (html: string) => html.slice(html.indexOf('data-testid="composer-strip"'), html.indexOf('composer__notices'));
const notices = (html: string) => html.slice(html.indexOf('composer__notices'));

describe('PD-ORCH-005 clause 6: the Continue action states how many agents will resume and offers to continue without them', () => {
  it('the count reads as a sentence, singular and plural; the decline says what ends, and that it cannot be undone', () => {
    expect(resumeCountText(1)).toBe('1 agent will resume');
    expect(resumeCountText(3)).toBe('3 agents will resume');
    expect(declineText(3)).toBe('The 2 paused agents end cancelled and cannot be resumed. The open iteration closes, and its task is taken up again in a new iteration.');
    expect(declineText(2)).toBe('The paused agent ends cancelled and cannot be resumed. The open iteration closes, and its task is taken up again in a new iteration.');
    // The root alone: no agent record ends cancelled.
    expect(declineText(1)).toBe('The open iteration closes, and its task is taken up again in a new iteration.');
  });

  it('a paused session with an open iteration: the strip keeps its two continues, both described by the count, which stands with the decline in the notices row (found by phase 5\'s review: the strip lost its one band)', () => {
    const html = render(session({ resumable: { iteration: 2, agents: 3 } }));
    expect(strip(html).match(/aria-describedby="composer-resume-count"/g)).toHaveLength(2);
    // Each continue takes the pill's place, so it shows a short label and names itself in full: `Continue` and `Send`,
    // the word of the send pill it stands in for (PD-CHAT-001 revision 4, "The paused continues").
    expect(strip(html)).toMatch(/aria-label="Continue run" title="Continue run"[^>]*>Continue</);
    expect(strip(html)).toMatch(/aria-label="Continue with a message" title="Continue with a message"[^>]*>Send</);
    expect(strip(html)).not.toContain('>Message<');
    expect(strip(html)).not.toContain('Continue without them');
    expect(strip(html)).not.toContain('agents will resume');
    expect(notices(html)).toContain('<span id="composer-resume-count" class="composer__hint" data-testid="composer-resume-count">3 agents will resume</span>');
    // The decline carries what it does on both channels: the tooltip and the accessible description.
    expect(notices(html)).toMatch(/data-testid="composer-continue-without"[^>]*title="The 2 paused agents end cancelled[^"]*"[^>]*aria-describedby="composer-decline-hint"[^>]*>Continue without them</);
    expect(notices(html)).toContain(`<span id="composer-decline-hint" class="visually-hidden">${declineText(3)}</span>`);
  });

  /**
   * PD-ORCH-005 clause 18 supersedes OQ-98's reading here ("offers no decline — its continue is a message"): a session a
   * crash left offers the Continue action and "Continue without them" as a `paused` session does, with the same count.
   */
  const offersTheSameChoice = (html: string, agents: number) => {
    expect(strip(html)).toMatch(/aria-label="Continue run" title="Continue run"[^>]*aria-describedby="composer-resume-count"[^>]*>Continue</);
    expect(strip(html)).toMatch(/aria-label="Continue with a message" title="Continue with a message"[^>]*aria-describedby="composer-resume-count"[^>]*>Send</);
    expect(strip(html)).not.toContain('data-testid="composer-send"');
    expect(notices(html)).toContain(`>${resumeCountText(agents)}</span>`);
    expect(notices(html)).toMatch(/data-testid="composer-continue-without"[^>]*aria-describedby="composer-decline-hint"[^>]*>Continue without them</);
    expect(notices(html)).toContain(`<span id="composer-decline-hint" class="visually-hidden">${declineText(agents)}</span>`);
    // It is not paused, and draws no pause statement (OQ-103).
    expect(notices(html)).not.toContain('Paused.');
  };

  it('PD-ORCH-005 clause 18: a session a crash left interrupted offers the two continues, the count and "Continue without them", as a paused one does', () => {
    offersTheSameChoice(render(session({ executionStatus: 'interrupted', resumable: { iteration: 2, agents: 4 } })), 4);
  });

  it('PD-ORCH-005 clause 18: a session a crash left persisted busy, opened before any repair (REQ-CHAT-008\'s recovery state), offers the same choice with the same count', () => {
    // The store still says `running`, no run is behind it, and clause 8 forbids recording the crash on a read — the count
    // is what the crash record will pause, and either choice records it first (found by phase 5's second review).
    offersTheSameChoice(render(session({ executionStatus: 'running', resumable: { iteration: 1, agents: 3 } }), true), 3);
    // A run that is live behind the same status offers neither: nothing is at rest.
    const live = render(session({ executionStatus: 'running', resumable: { iteration: 1, agents: 3 } }), false);
    expect(live).not.toContain('composer-resume-count');
    expect(live).not.toContain('Continue without them');
    expect(live).not.toContain('aria-label="Continue run"');
  });

  it('a paused session with nothing to resume offers the Continue action as before: no count and no decline', () => {
    const html = render(session({ resumable: null }));
    expect(html).toMatch(/aria-label="Continue run"[^>]*>Continue</);
    expect(html).not.toContain('composer-resume-count');
    expect(html).not.toContain('Continue without them');
  });

  it('a session at the message limit, at the plan gate or finished states no count', () => {
    for (const executionStatus of ['paused_message_limit', 'awaiting_plan_decision', 'completed']) {
      const html = render(session({ executionStatus, resumable: { iteration: 1, agents: 2 } }));
      expect(html, executionStatus).not.toContain('composer-resume-count');
      expect(html, executionStatus).not.toContain('Continue without them');
    }
  });
});

describe('PD-ORCH-005 clause 18: a crash offers the Continue action as a pause does', () => {
  it('a session a crash left with nothing open to resume still draws the two continues, with no count and no decline, as a paused one does', () => {
    for (const [executionStatus, recovery] of [['interrupted', false], ['running', true]] as const) {
      const html = render(session({ executionStatus, resumable: null }), recovery);
      expect(strip(html), executionStatus).toMatch(/aria-label="Continue run"[^>]*>Continue</);
      expect(strip(html), executionStatus).toMatch(/aria-label="Continue with a message"[^>]*>Send</);
      expect(html, executionStatus).not.toContain('composer-resume-count');
      expect(html, executionStatus).not.toContain('Continue without them');
    }
  });
});

/**
 * PD-CHAT-001 revision 4, "The strip": the plan gate's hint and the pause's statement are two of the four notices that
 * "SHALL stand in the notices row below the dock", and the strip draws no explanatory sentence as visible text (found by
 * the merged build's tenth review: only the count and the decline were measured).
 */
describe('PD-CHAT-001 revision 4: the plan gate\'s hint and the pause\'s statement stand in the notices row, not the strip', () => {
  const PAUSED = 'Paused. Run controls need the run continued before they can be used.';
  const HINT = 'A plan is waiting for your decision above.';

  it('a paused session states its pause in the notices row, and the strip draws no statement', () => {
    for (const executionStatus of ['paused', 'paused_message_limit'] as const) {
      const html = render(session({ executionStatus }));
      expect(notices(html), executionStatus).toContain(`<span class="composer__hint">${PAUSED}</span>`);
      expect(strip(html), executionStatus).not.toContain('Paused.');
      expect(strip(html), executionStatus).not.toContain(HINT);
    }
  });

  it('a session held at the plan gate draws the gate\'s hint in the notices row in place of the pause statement, and the strip draws neither', () => {
    const html = render(session({ executionStatus: 'awaiting_plan_decision', planGate: { cycle: 1, openedAt: 'x', plan: 'Plan: do it.', edited: null, intent: 'task', todo: '', changes: '' } }));
    expect(notices(html)).toMatch(new RegExp(`<span id="plan-gate-hint" class="composer__hint">${HINT}`));
    expect(notices(html)).not.toContain('Paused.');
    expect(strip(html)).not.toContain(HINT);
    // The strip's control is described by the hint (REQ-CHAT-007's two channels); the hint itself is not drawn there.
    expect(strip(html)).toContain('aria-describedby="plan-gate-hint"');
    expect(strip(html)).not.toContain('id="plan-gate-hint"');
    expect(strip(html)).not.toContain('Paused.');
  });
});
