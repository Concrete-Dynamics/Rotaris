import { describe, expect, it } from 'vitest';
import { hooksReviewOpenReport } from './hooks-review-notice.js';
import { runNoticeReport, type NoticePublish } from './run-notice.js';

const SKIPPED = "Skipped 2 hooks declared by this workspace's .rotaris/agents.yaml: workspace hooks run shell commands and this workspace has not been reviewed and trusted yet. Review the hooks in Rotaris to allow them to run.";
const FP = 'a'.repeat(64);

/** The engine's `hooks.review` notice as the run host forwards it (`Run.start`, the run host's `notice` port). */
function hooksPublish(over: Partial<NoticePublish> = {}): NoticePublish {
  return {
    kind: 'notice.publish', severity: 'warning', title: 'Workspace hooks need review', message: SKIPPED, detail: '',
    action: 'hooks.review', key: `hooks.review:/w/alpha:${FP}`, sessionId: 'S-1', persistent: true, workspaceRoot: '/w/alpha', ...over,
  };
}

describe('the run host\'s notices as main raises them (Part V, REQ-NOTIFY-028)', () => {
  it('builds a run\'s unreviewed-hooks notice exactly as the open slot builds it: title, message, detail and action (OQ-293)', () => {
    const run = runNoticeReport(hooksPublish(), () => '/w/alpha');
    const open = hooksReviewOpenReport('/w/alpha', { workspace: '/w/alpha', fingerprint: FP, notice: SKIPPED });
    expect({ title: run.title, message: run.message, detail: run.detail, action: run.action })
      .toEqual({ title: open.title, message: open.message, detail: open.detail, action: open.action });
    expect(run.title).toBe('Workspace hooks need review: alpha');
    expect(run.message).toBe(SKIPPED);
    expect(run.detail).toBe('Project folder: /w/alpha');
    // The key is the engine's, unchanged, so the open slot's publication suppresses the run's for one hook set.
    expect(run.key).toBe(`hooks.review:/w/alpha:${FP}`);
    expect(run.key).toBe(open.key);
    expect(run.sessionId).toBe('S-1');
  });

  it('names the run\'s own workspace, not the active window\'s, when another window is focused (REQ-NOTIFY-044, PD-SHELL-001)', () => {
    const run = runNoticeReport(hooksPublish(), () => '/w/beta');
    expect(run.action).toEqual({ label: 'Review hooks', action: { kind: 'open-hook-review', workspace: '/w/alpha' } });
    expect(run.title).toBe('Workspace hooks need review: alpha');
    expect(run.detail).toBe('Project folder: /w/alpha');
  });

  it('keeps every other notice\'s own words and action', () => {
    const settings = runNoticeReport({ kind: 'notice.publish', severity: 'warning', title: 'Hooks were switched off', message: 'm', detail: 'd', action: 'hooks.settings', sessionId: 'S-1', persistent: true, workspaceRoot: '/w/alpha' }, () => '/w/beta');
    expect(settings).toEqual({ severity: 'warning', persistent: true, sessionId: 'S-1', title: 'Hooks were switched off', message: 'm', detail: 'd', action: { label: 'Open hook settings', action: { kind: 'open-settings', category: 'hooks' } } });
    const reopen = runNoticeReport({ kind: 'notice.publish', severity: 'error', title: 'Run recording failed; completion is unconfirmed', message: '', detail: 'x', action: 'session.reopen', sessionId: 'S-2', persistent: true, workspaceRoot: '/w/alpha' }, () => '/w/beta');
    expect(reopen.action).toEqual({ label: 'Reopen the session', action: { kind: 'focus-session', sessionId: 'S-2', workspace: '/w/alpha' } });
    expect(reopen.title).toBe('Run recording failed; completion is unconfirmed');
    const plain = runNoticeReport({ kind: 'notice.publish', severity: 'info', title: 't', message: '', detail: '', sessionId: '', persistent: true }, () => '/w/beta');
    expect(plain).toEqual({ severity: 'info', persistent: true, sessionId: '', title: 't', message: '', detail: '' });
  });

  // OQ-293: the action names the workspace whose hooks the notice counts, never the focused window's. A notice the run host could
  // not stamp names no workspace, so it carries the engine's words and no action (until 2026-10-14 it reviewed the active window's).
  it('raises a hooks notice that carries no workspace with the engine\'s words and no action, never the active window\'s review', () => {
    const { workspaceRoot: _dropped, ...unstamped } = hooksPublish();
    const run = runNoticeReport(unstamped, () => '/w/beta');
    expect(run.title).toBe('Workspace hooks need review');
    expect(run.message).toBe(SKIPPED);
    expect(run.action).toBeUndefined();
    expect(run.key).toBe(`hooks.review:/w/alpha:${FP}`);
  });
});
