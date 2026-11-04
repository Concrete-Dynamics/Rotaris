import { describe, expect, it, vi } from 'vitest';
import { RENDER_FAILURE_WORDS } from '@rotaris/ui';
import { RENDER_FAILURE_DETAIL_MAX, RENDER_FAILURE_MESSAGES, RENDER_FAILURE_REPORTS_MAX, RENDER_RECOVERED_TITLE, renderFailureReport, reportingRootOptions } from './render-failure.js';

/**
 * R-091 (hardening §3.2 row 4; REQ-NOTIFY-005, REQ-NOTIFY-023): what a window's root sends main when React reports an error.
 * Until 2026-11-04 no root was given React's error options, so a component that threw left a blank window and nothing anywhere;
 * now each of the three options sends one `notice.report`, the headline plain and the stack in the detail, redacted.
 */
const componentStack = '\n    at RenderFaultSeam\n    at RenderFailureBoundary';

describe('renderFailureReport — one error, two parts (REQ-NOTIFY-005)', () => {
  it('an error the boundary caught is a persistent error notice: the failure\'s words, the error, the window and both stacks in the detail', () => {
    const error = new Error('proof: a component threw');
    const report = renderFailureReport('caught', error, componentStack, 'main');
    expect(report).toMatchObject({ kind: 'notice.report', severity: 'error', title: RENDER_FAILURE_WORDS.title, message: RENDER_FAILURE_MESSAGES.caught, persistent: true });
    expect(report.detail).toContain('Error: proof: a component threw');
    expect(report.detail).toContain('Window: main');
    expect(report.detail).toContain(`Component stack:${componentStack}`);
    expect(report.detail).toContain(`Stack:\n${error.stack!}`);
    // The headline is plain words, never the diagnostic output (REQ-NOTIFY-005).
    expect(report.title).not.toContain('Error');
  });

  it('an uncaught error is an error notice too; a recovered one is a warning under its own title (OQ-475)', () => {
    expect(renderFailureReport('uncaught', new Error('x'), undefined, 'approval')).toMatchObject({ severity: 'error', title: RENDER_FAILURE_WORDS.title, message: RENDER_FAILURE_MESSAGES.uncaught });
    expect(renderFailureReport('recoverable', new Error('x'), undefined, 'main')).toMatchObject({ severity: 'warning', title: RENDER_RECOVERED_TITLE, message: RENDER_FAILURE_MESSAGES.recoverable });
  });

  it('a credential in the error is masked before it leaves the renderer, and the detail is bounded', () => {
    const report = renderFailureReport('caught', new Error('fetch failed: Authorization: Bearer sk-live-abc'), `${componentStack}${'\n    at Deep'.repeat(5_000)}`, 'main');
    expect(report.detail).not.toContain('sk-live-abc');
    expect(report.detail).toContain('Bearer ***');
    expect(report.detail!.length).toBe(RENDER_FAILURE_DETAIL_MAX + 1);
    expect(report.detail!.endsWith('…')).toBe(true);
  });

  it('a thrown value that is not an Error is still reported, by its text', () => {
    expect(renderFailureReport('caught', 'a string was thrown', undefined, 'main').detail).toMatch(/^a string was thrown\n\nWindow: main/);
  });
});

describe('reportingRootOptions — each of React\'s three error options sends its report once', () => {
  it('sends one notice.report per error, through the option React called, and writes it to the console as React would', async () => {
    const sent: unknown[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const options = reportingRootOptions(async (r) => { sent.push(r); }, 'main');
    const error = new Error('proof: a component threw');
    options.onCaughtError!(error, { componentStack });
    // React may report the same error again for the retry it makes: still one report.
    options.onCaughtError!(error, { componentStack });
    options.onUncaughtError!(new Error('outside every boundary'), { componentStack: '' });
    options.onRecoverableError!(new Error('recovered'), { componentStack });
    expect(sent.map((r) => (r as { severity: string }).severity)).toEqual(['error', 'error', 'warning']);
    expect(consoleError).toHaveBeenCalledTimes(4);
  });

  it('sends no more than its bound from one document, and a send that fails throws nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let sent = 0;
    const options = reportingRootOptions(async () => { sent += 1; throw new Error('the bridge is gone'); }, 'main');
    for (let i = 0; i < RENDER_FAILURE_REPORTS_MAX + 3; i += 1) options.onCaughtError!(new Error(`fault ${i}`), { componentStack });
    expect(sent).toBe(RENDER_FAILURE_REPORTS_MAX);
  });
});
