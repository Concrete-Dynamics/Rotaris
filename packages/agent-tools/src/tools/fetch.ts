import { z } from 'zod';
import { directFetch } from './direct-fetch.js';
import { millis, type Timers } from '@rotaris/kernel';
import { canonicalizeHost, classifyExplained, describeSource, PERMISSIVE_EGRESS, type Classification, type EgressPolicy } from '../egress.js';
import type { Observation, ToolContext, ToolExecutor } from './types.js';

/**
 * The `fetch` tool — ADR-0023's second and third pieces over its classifier: the validation front door
 * (REQ-SANDBOX-020), the policy read at each call (REQ-SANDBOX-038, REQ-TOOLS-089), the timeout precedence
 * chain (REQ-SANDBOX-021), the hand-driven redirect loop that classifies every host before a connection is
 * opened (REQ-SANDBOX-022..024, -027..032, REQ-TOOLS-090/091), the transport outcomes (REQ-SANDBOX-033), the
 * shaping (REQ-SANDBOX-034) and the rendering (REQ-SANDBOX-036). The failure-kind vocabulary is REQ-TOOLS-092's
 * eight spellings and nothing else.
 *
 * OQ-37: a dedicated direct dispatcher is supplied on every production request,
 * including redirect hops. Environment and process-global proxy settings have no effect.
 *
 * The `ask` disposition belongs to the gate (REQ-TOOLS-091): the named host reaches `execute` already approved
 * and is seeded into the request's permitted set; a hop onto a NEW host classifying `ask` is refused, because
 * nothing can prompt mid-request. Time comes from the caller's timer port, never a bare timer.
 */
export const FETCH_FAILURE_KINDS = ['egress_denied', 'egress_redirect_denied', 'egress_policy_error', 'too_many_redirects', 'invalid_request', 'timeout', 'network_error', 'http_error'] as const;
export type FetchFailureKind = (typeof FETCH_FAILURE_KINDS)[number];

/** REQ-SANDBOX-021: reachable only where there is no owning run. */
export const FETCH_BUILT_IN_TIMEOUT_S = 10.0;
/** REQ-SANDBOX-024 / REQ-TOOLS-090: the hop budget. */
export const FETCH_HOP_BUDGET = 20;
export const FETCH_DEFAULT_MAX_LINES = 1000;

/** What one call reads from the owning run's saved configuration; `toolCallTimeoutS: null` = no owning run. */
export type PolicyRead =
  | { readonly ok: true; readonly policy: EgressPolicy; readonly toolCallTimeoutS: number | null }
  | { readonly ok: false; readonly reason: string };

/** REQ-SANDBOX-037 / ADR-0023 c.5: the fallback for a caller with no run-scoped configuration — a real, tested path. */
export const permissivePolicyRead = async (): Promise<PolicyRead> => ({ ok: true, policy: PERMISSIVE_EGRESS, toolCallTimeoutS: null });

export interface FetchDeps {
  readonly policy: () => Promise<PolicyRead>;
  readonly timers: Timers;
  readonly fetchImpl?: typeof fetch;
}

/** REQ-SANDBOX-035's nine fields, plus the shaped body (not a result field; rendered under `[fetch_output]`). */
export interface FetchResult {
  readonly url: string;
  readonly final_url: string | null;
  readonly status_code: number | null;
  readonly content_type: string | null;
  readonly truncated: boolean;
  readonly failure_kind: FetchFailureKind | null;
  readonly timeout_seconds: number | null;
  readonly error_class: string | null;
  readonly detail: string | null;
  readonly body: string | null;
}

const fetchSchema = z.object({
  url: z.string().optional().describe('The URL to retrieve. Required.'),
  max_lines: z.number().int().default(FETCH_DEFAULT_MAX_LINES).describe('At most this many body lines are returned (default 1000).'),
  from_line: z.number().int().optional().describe('First body line to return, 1-based, inclusive.'),
  to_line: z.number().int().optional().describe('Last body line to return, 1-based, inclusive.'),
  timeout: z.number().optional().describe('Seconds before the call is abandoned; 0 means no time limit. Defaults to the run\'s tool_call_timeout.'),
});
export type FetchArgs = z.infer<typeof fetchSchema>;

const describeValue = (v: unknown): string => (v === undefined ? 'nothing' : JSON.stringify(v));

/**
 * REQ-SANDBOX-020's six conditions, checked before the policy is read and before any connection. Returns the
 * detail naming the offending parameter, its value and the constraint, or null when the request is well formed.
 * `timeout: 0` passes: zero means no deadline, never a deadline already past.
 */
export function validateFetchRequest(a: FetchArgs): string | null {
  if (typeof a.url !== 'string' || a.url.trim() === '') return `parameter 'url' carried ${describeValue(a.url)}; it is required and must not be empty or only whitespace`;
  if (a.timeout !== undefined && !(a.timeout >= 0)) return `parameter 'timeout' carried ${describeValue(a.timeout)}; it must be 0 or greater (0 means no time limit)`;
  if (!(a.max_lines >= 1)) return `parameter 'max_lines' carried ${describeValue(a.max_lines)}; it must be at least 1`;
  if (a.from_line !== undefined && !(a.from_line >= 1)) return `parameter 'from_line' carried ${describeValue(a.from_line)}; it must be at least 1`;
  if (a.to_line !== undefined && !(a.to_line >= 1)) return `parameter 'to_line' carried ${describeValue(a.to_line)}; it must be at least 1`;
  if (a.from_line !== undefined && a.to_line !== undefined && a.to_line < a.from_line) return `parameter 'to_line' carried ${describeValue(a.to_line)}; it must not be less than from_line (${a.from_line})`;
  return null;
}

export type TimeoutLevel = 'call' | 'run' | 'built-in';

/** REQ-SANDBOX-021: the call's `timeout`, else the run's `tool_call_timeout`, else 10.0 — the lower never overrides the higher. */
export function settleTimeout(call: number | undefined, run: number | null): { readonly seconds: number; readonly level: TimeoutLevel } {
  if (call !== undefined) return { seconds: call, level: 'call' };
  if (run !== null) return { seconds: run, level: 'run' };
  return { seconds: FETCH_BUILT_IN_TIMEOUT_S, level: 'built-in' };
}

const LEVEL_TEXT: Record<TimeoutLevel, string> = {
  call: "the call's own timeout parameter",
  run: "the owning run's runtime.tool_call_timeout",
  'built-in': 'the built-in default (no owning run supplied a value)',
};

/**
 * REQ-SANDBOX-034: lines, then the window, then the cap; only the cap sets `truncated`. One trailing line
 * terminator is not a line of its own (a three-line body ending in a newline has three lines); `\r\n` and `\n`
 * both terminate a line.
 */
export function shapeBody(body: string, fromLine: number | undefined, toLine: number | undefined, maxLines: number): { readonly lines: readonly string[]; readonly truncated: boolean } {
  const lines = body === '' ? [] : body.replace(/\r?\n$/, '').split(/\r?\n/);
  const from = fromLine ?? 1;
  const to = toLine ?? lines.length;
  const selected = from > lines.length ? [] : lines.slice(from - 1, to);
  if (selected.length > maxLines) return { lines: selected.slice(0, maxLines), truncated: true };
  return { lines: selected, truncated: false };
}

/** REQ-SANDBOX-036: the diagnostic object — the nine fields, keys sorted, nulls left out, `failure_kind` always present. */
export function diagnosticOf(r: FetchResult): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    url: r.url, final_url: r.final_url, status_code: r.status_code, content_type: r.content_type, truncated: r.truncated,
    failure_kind: r.failure_kind, timeout_seconds: r.timeout_seconds, error_class: r.error_class, detail: r.detail,
  };
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(fields).sort()) if (fields[key] !== null && fields[key] !== undefined) out[key] = fields[key];
  return out;
}

/** REQ-SANDBOX-036: fixed in structure, free in wording. */
export function renderFetch(r: FetchResult): string {
  if (r.failure_kind !== null) {
    const lines = [`Fetch of ${r.url} failed: ${r.failure_kind}.`, '[fetch_diagnostic]', JSON.stringify(diagnosticOf(r))];
    if (r.body !== null) lines.push('[fetch_output]', r.body);
    return lines.join('\n');
  }
  return [`url: ${r.url}`, `final_url: ${r.final_url ?? ''}`, `status_code: ${r.status_code ?? ''}`, `content_type: ${r.content_type ?? ''}`, `truncated: ${r.truncated}`, '', r.body ?? ''].join('\n');
}

const platformMessage = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as { cause?: unknown }).cause;
  return cause instanceof Error && cause.message !== e.message ? `${e.message}: ${cause.message}` : e.message;
};

export function fetchTool(deps: FetchDeps): ToolExecutor<FetchArgs> {
  const fetchImpl = deps.fetchImpl ?? directFetch;

  async function run(a: FetchArgs, ctx: ToolContext): Promise<FetchResult> {
    const url = typeof a.url === 'string' ? a.url : '';
    const base: FetchResult = { url, final_url: null, status_code: null, content_type: null, truncated: false, failure_kind: null, timeout_seconds: null, error_class: null, detail: null, body: null };
    const refused = (failure_kind: FetchFailureKind, error_class: string, detail: string, extra: Partial<FetchResult> = {}): FetchResult => ({ ...base, ...extra, failure_kind, error_class, detail });

    // 1. The front door: before the policy is read, before any connection.
    const invalid = validateFetchRequest(a);
    if (invalid !== null) return refused('invalid_request', 'InvalidFetchRequest', invalid);
    const host = canonicalizeHost(url);
    const hostText = host === '' ? `an unreadable host (${JSON.stringify(url.trim())})` : host;

    // 2. The policy, read at this call from the owning run's saved configuration; a failed read refuses (fail closed).
    let read: PolicyRead;
    try { read = await deps.policy(); } catch (cause) { read = { ok: false, reason: platformMessage(cause) }; }
    if (!read.ok) return refused('egress_policy_error', 'NetworkEgressDenied', `Network egress to ${hostText} was refused: the egress policy could not be read, so no host can be classified (fail closed). ${read.reason}`);
    const policy = read.policy;

    // 3. The timeout in force, whichever level supplied it.
    const t = settleTimeout(a.timeout, read.toolCallTimeoutS);
    const timed: FetchResult = { ...base, timeout_seconds: t.seconds };
    const refusedTimed = (failure_kind: FetchFailureKind, error_class: string, detail: string, extra: Partial<FetchResult> = {}): FetchResult => ({ ...timed, ...extra, failure_kind, error_class, detail });
    const classifyOrError = (h: string): Classification | FetchResult => {
      try { return classifyExplained(policy, h); } catch (cause) {
        return refusedTimed('egress_policy_error', 'NetworkEgressDenied', `Network egress to ${h === '' ? hostText : h} was refused: the stored egress policy could not be applied to that host: ${platformMessage(cause)}`);
      }
    };

    // 4. The named host, classified before any connection is opened.
    const named = classifyOrError(host);
    if ('failure_kind' in named) return named;
    if (named.disposition === 'deny') return refusedTimed('egress_denied', 'NetworkEgressDenied', `Network egress to ${hostText} was refused: ${describeSource(named.source, 'deny')}.`);
    // `allow`, or `ask` the gate already resolved (REQ-TOOLS-091): the host is permitted for this request.
    const permitted = new Set<string>([host]);

    // 5. The deadline, on the timer port; 0 = no deadline. The run's own abort reaches the request too.
    const controller = new AbortController();
    let expired = false;
    const timer = t.seconds > 0 ? deps.timers.after(millis(t.seconds * 1000), () => { expired = true; controller.abort(); }) : null;
    const onOuterAbort = (): void => controller.abort();
    if (ctx.signal.aborted) controller.abort(); else ctx.signal.addEventListener('abort', onOuterAbort, { once: true });
    const transportFailure = (cause: unknown, hopUrl: string, hopHost: string, received: Partial<FetchResult>): FetchResult => {
      if (expired) return refusedTimed('timeout', 'FetchTimeout', `The fetch of ${hopUrl} did not complete within ${t.seconds} s, the deadline supplied by ${LEVEL_TEXT[t.level]}.`, received);
      if (ctx.signal.aborted) return refusedTimed('network_error', 'NetworkError', `The fetch of ${hopUrl} was cancelled by the run before it completed.`, received);
      return refusedTimed('network_error', 'NetworkError', `The direct connection to ${hopHost} failed before a response was received: ${platformMessage(cause)}. This fetch tool uses direct connections; proxy environment variables and system proxy settings have no effect.`, received);
    };

    try {
      // 6. The hand-driven redirect loop: one request with redirects disabled per hop, every hop classified first.
      let hopUrl = url;
      let hopHost = host;
      let redirects = 0;
      for (;;) {
        let response: Response;
        try { response = await fetchImpl(hopUrl, { redirect: 'manual', signal: controller.signal }); } catch (cause) { return transportFailure(cause, hopUrl, hopHost, {}); }
        const status = response.status;
        const location = response.headers.get('location');
        const contentType = response.headers.get('content-type');
        if (status >= 300 && status < 400 && location !== null && location.trim() !== '') {
          try { await response.body?.cancel(); } catch { /* the hop's body is not read */ }
          const received: Partial<FetchResult> = { final_url: hopUrl, status_code: status, content_type: contentType };
          if (redirects >= FETCH_HOP_BUDGET) return refusedTimed('too_many_redirects', 'TooManyRedirects', `The redirect hop budget of ${FETCH_HOP_BUDGET} was exhausted at ${hopUrl} and no terminal response was ever reached.`, received);
          let next: URL;
          try { next = new URL(location.trim(), hopUrl); } catch {
            return refusedTimed('egress_redirect_denied', 'NetworkEgressDenied', `The redirect from ${hopUrl} to ${JSON.stringify(location)} was refused: the location could not be resolved into an absolute URL bearing a host, and an unknown host is denied.`, received);
          }
          const nextHost = canonicalizeHost(next.href);
          const verdict = classifyOrError(nextHost);
          if ('failure_kind' in verdict) return { ...verdict, ...received };
          if (verdict.disposition === 'deny') return refusedTimed('egress_redirect_denied', 'NetworkEgressDenied', `The redirect from ${hopUrl} to ${next.href} was refused: network egress to ${nextHost === '' ? 'an unreadable host' : nextHost} is denied because ${describeSource(verdict.source, 'deny')}.`, received);
          if (!permitted.has(nextHost)) {
            if (verdict.disposition === 'ask') return refusedTimed('egress_redirect_denied', 'NetworkEgressDenied', `The redirect from ${hopUrl} to ${next.href} was refused: the hop originated from the requested URL ${url}, the destination host ${nextHost} was never approved for this request, and access to it has to be asked for as its own fetch request when it is actually required (${describeSource(verdict.source, 'ask')}).`, received);
            permitted.add(nextHost);
          }
          redirects += 1;
          hopUrl = next.href;
          hopHost = nextHost;
          continue;
        }
        // 7. The terminal response: its body, shaped; a status ≥ 400 is an error that still carries the body.
        let text: string;
        try { text = await response.text(); } catch (cause) { return transportFailure(cause, hopUrl, hopHost, { final_url: hopUrl, status_code: status, content_type: contentType }); }
        const shaped = shapeBody(text, a.from_line, a.to_line, a.max_lines);
        const result: FetchResult = { ...timed, final_url: hopUrl, status_code: status, content_type: contentType, truncated: shaped.truncated, body: shaped.lines.join('\n') };
        if (status >= 400) return { ...result, failure_kind: 'http_error', error_class: 'HttpError', detail: `HTTP request completed with status code ${status}.` };
        return result;
      }
    } finally {
      timer?.cancel();
      ctx.signal.removeEventListener('abort', onOuterAbort);
    }
  }

  return {
    name: 'fetch',
    description: 'Retrieve one HTTP(S) resource as raw text (HTML included), at most max_lines lines, optionally windowed by from_line/to_line. Every host, the requested one and every redirect target, is checked against the workspace egress policy before a connection is opened; redirects are never followed onto a host the policy does not permit. Connections are direct; proxy environment variables and system proxy settings have no effect.',
    schema: fetchSchema,
    // REQ-SANDBOX-042: the URL is the gated subject; it is what the row header shows.
    label: (a) => `fetch ${typeof a.url === 'string' ? a.url : ''}`.trimEnd(),
    execute: async (a, ctx): Promise<Observation> => {
      const r = await run(a, ctx);
      return { text: renderFetch(r), isError: r.failure_kind !== null, failureKind: r.failure_kind, outcomeKind: 'fetch', label: `fetch ${r.url}`.trimEnd() };
    },
  };
}
