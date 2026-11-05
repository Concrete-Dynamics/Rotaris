import { describe, expect, it, vi } from 'vitest';
import { RENDER_FAILURE_WORDS } from '@rotaris/ui';
import { RENDER_FAILURE_DETAIL_MAX, RENDER_FAILURE_MESSAGES, RENDER_FAILURE_REPORTS_MAX, RENDER_RECOVERED_LINES_MAX, renderFailureReport, renderRecoveredLine, reportingRootOptions } from './render-failure.js';

/**
 * R-091 (hardening §3.2 row 4; REQ-NOTIFY-005, REQ-NOTIFY-023): what a window's root sends main when React reports an error.
 * Until 2026-11-04 no root was given React's error options, so a component that threw left a blank window and nothing anywhere;
 * now each failure sends one `notice.report`, the headline plain and the stack in the detail, redacted; and an error React
 * recovered from sends `window.recovered`, the log-only command OQ-475's ruling (2026-11-04) gave it, and never a notice.
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

  it('an uncaught error is an error notice too', () => {
    expect(renderFailureReport('uncaught', new Error('x'), undefined, 'approval')).toMatchObject({ severity: 'error', title: RENDER_FAILURE_WORDS.title, message: RENDER_FAILURE_MESSAGES.uncaught });
  });

  it('OQ-475: a recovered error is a window.recovered line — the headline, then the window and both stacks — with no severity, title or message', () => {
    const error = new TypeError('proof: drawn again');
    const line = renderRecoveredLine(error, componentStack, 'main');
    expect(Object.keys(line).sort()).toEqual(['detail', 'error', 'kind']);
    expect(line.kind).toBe('window.recovered');
    expect(line.error).toBe('TypeError: proof: drawn again');
    expect(line.detail).toMatch(/^Window: main\n\nHow it was reported: recovered by React, which drew the tree again/);
    expect(line.detail).toContain(`Component stack:${componentStack}`);
    expect(line.detail).toContain(`Stack:\n${error.stack!}`);
    // The withdrawn notice's words are gone with it.
    expect(Object.keys(RENDER_FAILURE_MESSAGES).sort()).toEqual(['caught', 'uncaught']);
  });

  it('OQ-475: a recovered error is masked and bounded as a failure is before it leaves the renderer', () => {
    const line = renderRecoveredLine(new Error(`token=sk-live-recovered ${'y'.repeat(RENDER_FAILURE_DETAIL_MAX)}`), `${componentStack}${'\n    at Deep'.repeat(5_000)}`, 'main');
    expect(line.error).not.toContain('sk-live-recovered');
    expect(line.error.length).toBe(RENDER_FAILURE_DETAIL_MAX + 1);
    expect(line.detail).not.toContain('sk-live-recovered');
    expect(line.detail.length).toBe(RENDER_FAILURE_DETAIL_MAX + 1);
    expect(renderRecoveredLine('', undefined, 'main').error).not.toBe('');
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
  it('sends one notice.report per failure and one window.recovered per recovered error, and writes each to the console as React would', async () => {
    const sent: { kind: string; severity?: string }[] = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const options = reportingRootOptions(async (r) => { sent.push(r); }, 'main');
    const error = new Error('proof: a component threw');
    options.onCaughtError!(error, { componentStack });
    // React may report the same error again for the retry it makes: still one report.
    options.onCaughtError!(error, { componentStack });
    options.onUncaughtError!(new Error('outside every boundary'), { componentStack: '' });
    const recovered = new Error('recovered');
    options.onRecoverableError!(recovered, { componentStack });
    options.onRecoverableError!(recovered, { componentStack });
    expect(sent.map((r) => `${r.kind}${r.severity === undefined ? '' : `:${r.severity}`}`)).toEqual(['notice.report:error', 'notice.report:error', 'window.recovered']);
    expect(consoleError).toHaveBeenCalledTimes(5);
  });

  it('OQ-475: a recovered error never sends notice.report, and its own cap leaves the failure budget whole', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sent: { kind: string }[] = [];
    const options = reportingRootOptions(async (r) => { sent.push(r); }, 'main');
    // A fault React retries and recovers from, again and again, each time with a different message.
    for (let i = 0; i < RENDER_FAILURE_REPORTS_MAX + RENDER_RECOVERED_LINES_MAX + 3; i += 1) options.onRecoverableError!(new Error(`recovered ${i}`), { componentStack });
    expect(sent.filter((r) => r.kind === 'window.recovered')).toHaveLength(RENDER_RECOVERED_LINES_MAX);
    expect(sent.filter((r) => r.kind === 'notice.report')).toHaveLength(0);
    // Every failure after it is still reported, up to the failures' own bound.
    for (let i = 0; i < RENDER_FAILURE_REPORTS_MAX + 2; i += 1) options.onCaughtError!(new Error(`fault ${i}`), { componentStack });
    expect(sent.filter((r) => r.kind === 'notice.report')).toHaveLength(RENDER_FAILURE_REPORTS_MAX);
  });

  it('sends no more than its bound from one document, and a send that fails throws nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let sent = 0;
    const options = reportingRootOptions(async () => { sent += 1; throw new Error('the bridge is gone'); }, 'main');
    for (let i = 0; i < RENDER_FAILURE_REPORTS_MAX + 3; i += 1) options.onCaughtError!(new Error(`fault ${i}`), { componentStack });
    expect(sent).toBe(RENDER_FAILURE_REPORTS_MAX);
  });
});
