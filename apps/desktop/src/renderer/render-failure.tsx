import { useEffect, useState, type ReactNode } from 'react';
import { createRoot, type RootOptions } from 'react-dom/client';
import type { CommandRequest } from '@rotaris/contracts';
import { redact } from '@rotaris/kernel';
import { RENDER_FAILURE_WORDS, RenderFailureBoundary } from '@rotaris/ui';

/**
 * A WINDOW'S OWN FAILURE TO DRAW, REPORTED (R-091, hardening §3.2 row 4; REQ-NOTIFY-001, REQ-NOTIFY-003, REQ-NOTIFY-005,
 * REQ-NOTIFY-023; ADR-0044), AND AN ERROR REACT RECOVERED FROM, LOGGED (OQ-475; PD-MONITOR-002).
 *
 * Until 2026-11-04 no window had an error boundary and no root was created with React's error options, so a component that
 * threw while it was drawn unmounted the whole tree: a blank window, nothing said to the person, nothing in main's log. Every
 * root is now made here: wrapped in `RenderFailureBoundary`, whose fallback offers "Reload this window" (`window.reload`), and
 * created with `onCaughtError`, `onUncaughtError` and `onRecoverableError`. The two failures — an error the boundary caught,
 * one no boundary caught — each send ONE `notice.report` to main at `error`: the renderer raises a persistent notice by
 * asking main, never by drawing one (ADR-0049 decision B). Main raises it in its one slot and writes it to the log at the
 * notice's level (`main/commands/shell.ts`).
 *
 * The third is not a failure. React recovered by drawing the tree again, the window looks as it did and nothing was lost, so
 * OQ-475's ruling (2026-11-04) shows it to no one: it is none of REQ-NOTIFY-003's three, and a notice would replace whatever
 * stood in the one slot (REQ-NOTIFY-024) and write a redraw into a run's timeline (REQ-NOTIFY-268). It sends
 * `window.recovered`, the log-only sibling of `notice.report`, which main writes as ONE `warning` line and nothing else
 * (`main/commands/windows.ts`). Until that ruling it was a persistent `warning` notice, "This window recovered from a drawing
 * error"; the title and its message are withdrawn.
 *
 * Either way the report is two parts (REQ-NOTIFY-005): a plain headline, and a detail block carrying the error, the window it
 * happened in, the component stack and the script stack — through the one redaction pass (REQ-TOOLS-171) before it leaves
 * the renderer.
 */

/** The two ways React reports a failure the person sees: a notice each (REQ-NOTIFY-003). */
export type RenderFailureKind = 'caught' | 'uncaught';
type NoticeReport = Extract<CommandRequest, { kind: 'notice.report' }>;
type WindowRecovered = Extract<CommandRequest, { kind: 'window.recovered' }>;
export type SendReport = (request: NoticeReport | WindowRecovered) => Promise<unknown>;

/** The detail block's bound: a component stack of a deep tree is long, and the notice's detail is meant to be read. */
export const RENDER_FAILURE_DETAIL_MAX = 16_000;
/**
 * How many failure reports one document sends at most. A tree that throws is drawn once more by React and then held in the
 * boundary's fallback, so one error is one report; the bound is for a fault that repeats (an effect that throws on every
 * publication), which would otherwise replace the one notice slot again and again.
 */
export const RENDER_FAILURE_REPORTS_MAX = 5;
/**
 * How many recovered-error lines one document sends at most: its OWN bound, beside its own dedupe set, so a fault React
 * retries and recovers from again and again never spends `RENDER_FAILURE_REPORTS_MAX` before a real failure needs it (OQ-475,
 * the system's advocate). Five lines are enough to see that it repeats; the log is not a place to count every retry.
 */
export const RENDER_RECOVERED_LINES_MAX = 5;

/** The notice's message for each failure React reports. */
export const RENDER_FAILURE_MESSAGES: Record<RenderFailureKind, string> = {
  caught: 'Part of this window failed while it was being drawn. Reload this window to draw it again.',
  uncaught: 'This window failed while it was being drawn and could not show what failed. Close it and open it again.',
};

const HOW: Record<RenderFailureKind | 'recovered', string> = {
  caught: 'caught by the window\'s error boundary',
  uncaught: 'not caught by any boundary; the window\'s tree was removed',
  recovered: 'recovered by React, which drew the tree again',
};

/** Cuts a redacted text to the detail's bound, marking the cut. */
function bounded(text: string): string {
  return text.length > RENDER_FAILURE_DETAIL_MAX ? `${text.slice(0, RENDER_FAILURE_DETAIL_MAX)}…` : text;
}

/** The error's headline, and the parts of the detail block after it (the window, how, the component and script stacks). */
function reportParts(how: RenderFailureKind | 'recovered', error: unknown, componentStack: string | undefined, windowRole: string): { headline: string; rest: string[] } {
  const thrown = error instanceof Error ? error : null;
  const headline = thrown === null ? String(error) : `${thrown.name}: ${thrown.message}`;
  const rest = [`Window: ${windowRole}`, `How it was reported: ${HOW[how]}`];
  if (componentStack !== undefined && componentStack.trim() !== '') rest.push(`Component stack:${componentStack}`);
  if (thrown?.stack !== undefined && thrown.stack !== '') rest.push(`Stack:\n${thrown.stack}`);
  return { headline, rest };
}

/** The `notice.report` one failure becomes: severity, the two parts, nothing else. Pure, so a test reads it whole. */
export function renderFailureReport(kind: RenderFailureKind, error: unknown, componentStack: string | undefined, windowRole: string): NoticeReport {
  const { headline, rest } = reportParts(kind, error, componentStack, windowRole);
  return {
    kind: 'notice.report',
    severity: 'error',
    title: RENDER_FAILURE_WORDS.title,
    message: RENDER_FAILURE_MESSAGES[kind],
    detail: bounded(redact([headline, ...rest].join('\n\n'))),
    persistent: true,
  };
}

/**
 * The `window.recovered` one recovered error becomes (OQ-475): the error's headline, and the detail block after it — the
 * window, how it was reported, both stacks — each redacted and bounded as a failure's detail. No severity and no title: main
 * writes the line at `warning` and shows nothing. Pure, so a test reads it whole.
 */
export function renderRecoveredLine(error: unknown, componentStack: string | undefined, windowRole: string): WindowRecovered {
  const { headline, rest } = reportParts('recovered', error, componentStack, windowRole);
  const said = bounded(redact(headline));
  return { kind: 'window.recovered', error: said === '' ? '(an error with no message)' : said, detail: bounded(redact(rest.join('\n\n'))) };
}

/**
 * The three error options of one root. Each sends its report once — the same error reported twice (React may call a handler
 * for the retry it makes) is sent once. The two failures share one dedupe set and `RENDER_FAILURE_REPORTS_MAX` per document;
 * a recovered error has its own set and its own `RENDER_RECOVERED_LINES_MAX` (OQ-475), so it never spends the failures'
 * budget. Each also writes the error to the console, which is what React does when no option is given and what a developer
 * reading the window's tools expects.
 */
export function reportingRootOptions(send: SendReport, windowRole: string): Pick<RootOptions, 'onCaughtError' | 'onUncaughtError' | 'onRecoverableError'> {
  const sent = new Set<string>();
  const recovered = new Set<string>();
  const report = (kind: RenderFailureKind) => (error: unknown, info: { readonly componentStack?: string | undefined }): void => {
    console.error(error);
    const request = renderFailureReport(kind, error, info.componentStack, windowRole);
    const key = `${kind}\n${request.detail ?? ''}`;
    if (sent.has(key) || sent.size >= RENDER_FAILURE_REPORTS_MAX) return;
    sent.add(key);
    void send(request).catch(() => undefined);
  };
  const recover = (error: unknown, info: { readonly componentStack?: string | undefined }): void => {
    console.error(error);
    const request = renderRecoveredLine(error, info.componentStack, windowRole);
    const key = `${request.error}\n${request.detail}`;
    if (recovered.has(key) || recovered.size >= RENDER_RECOVERED_LINES_MAX) return;
    recovered.add(key);
    void send(request).catch(() => undefined);
  };
  return { onCaughtError: report('caught'), onUncaughtError: report('uncaught'), onRecoverableError: recover };
}

/** A root whose every render is wrapped in the boundary: the one shape every window's root takes. */
export interface ReportingRoot {
  render(node: ReactNode): void;
}

/** Makes a window's root: the error options that report, and the boundary around whatever it draws. */
export function createReportingRoot(container: Element, windowRole: string, send: SendReport, reload: () => void): ReportingRoot {
  const root = createRoot(container, reportingRootOptions(send, windowRole));
  return { render: (node) => { root.render(<RenderFailureBoundary onReload={reload}>{node}</RenderFailureBoundary>); } };
}

declare global {
  interface Window {
    /** Verification only (`__ROTARIS_SEAMS__`): makes `RenderFaultSeam` throw on its next render, with this message. */
    __rotarisRenderFault?: (message?: string) => void;
  }
}

/**
 * Verification only — mounted under `__ROTARIS_SEAMS__`, so a packaged build carries neither it nor the global it sets. A
 * component that throws while it is drawn, on request: what `exit-trace-proof`'s `render-fault` launch asks of a built window
 * through the driver's `eval`, so the boundary, the report and main's line are measured on a real throw.
 */
export function RenderFaultSeam(): null {
  const [fault, setFault] = useState<string | null>(null);
  useEffect(() => {
    window.__rotarisRenderFault = (message) => { setFault(message ?? 'render fault seam'); };
    return () => { delete window.__rotarisRenderFault; };
  }, []);
  if (fault !== null) throw new Error(fault);
  return null;
}
