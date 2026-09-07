import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { FakeClock } from '@rotaris/kernel';
import { PERMISSIVE_EGRESS, type EgressPolicy } from '../egress.js';
import { diagnosticOf, fetchTool, FETCH_HOP_BUDGET, permissivePolicyRead, renderFetch, settleTimeout, shapeBody, validateFetchRequest, type FetchArgs, type FetchResult, type PolicyRead } from './fetch.js';
import type { ToolContext } from './types.js';

/**
 * ADR-0023's second first execution: the tool over the classifier. Every network-free path runs against an
 * injected `fetchImpl` that records the URL of every request it was asked for — so "zero connection attempts"
 * (REQ-SANDBOX-022) is asserted as an empty list, not inferred. One suite runs against a real `node:http`
 * server on 127.0.0.1.
 */
const clock = new FakeClock();
const ctx = (signal: AbortSignal = new AbortController().signal): ToolContext => ({ workspaceRoot: 'C:/ws', sessionId: 's', agentName: 'a', persona: 'p', monotonic: clock, wall: clock, signal, warn: () => undefined });

const ASK_DEFAULT: EgressPolicy = { denied: [], allowed: [], defaultDisposition: 'ask' };
const policyOf = (policy: EgressPolicy, toolCallTimeoutS: number | null = 30): (() => Promise<PolicyRead>) => async () => ({ ok: true, policy, toolCallTimeoutS });
const args = (a: Partial<FetchArgs>): FetchArgs => ({ max_lines: 1000, ...a });

type Route = { status?: number; body?: string; headers?: Record<string, string> } | ((url: string) => never);
/** A fetch stand-in: the routes by exact URL, every request recorded in order, a thrower for a transport fault. */
function fakeFetch(routes: Record<string, Route>, fallback: Route = { status: 200, body: 'fallback\n' }): { impl: typeof fetch; requests: string[] } {
  const requests: string[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    if (init?.redirect !== 'manual') throw new Error('the loop must disable automatic redirects');
    const route = routes[url] ?? fallback;
    if (typeof route === 'function') route(url);
    const r = route as Exclude<Route, (url: string) => never>;
    return new Response(r.body ?? null, { status: r.status ?? 200, headers: r.headers ?? {} });
  }) as typeof fetch;
  return { impl, requests };
}
const diag = (o: { text: string }): Record<string, unknown> => JSON.parse(o.text.split('\n')[2] ?? '{}') as Record<string, unknown>;

describe('the front door (REQ-SANDBOX-020)', () => {
  it.each<[string, Partial<FetchArgs>, RegExp]>([
    ['url absent', { url: undefined }, /parameter 'url' carried nothing/],
    ['url empty', { url: '' }, /parameter 'url' carried ""/],
    ['url whitespace', { url: '  \t' }, /parameter 'url'/],
    ['timeout negative', { url: 'http://h/', timeout: -1 }, /parameter 'timeout' carried -1; it must be 0 or greater/],
    ['max_lines below one', { url: 'http://h/', max_lines: 0 }, /parameter 'max_lines' carried 0; it must be at least 1/],
    ['from_line below one', { url: 'http://h/', from_line: 0 }, /parameter 'from_line' carried 0/],
    ['to_line below one', { url: 'http://h/', to_line: -3 }, /parameter 'to_line' carried -3/],
    ['to_line below from_line', { url: 'http://h/', from_line: 5, to_line: 4 }, /parameter 'to_line' carried 4; it must not be less than from_line \(5\)/],
  ])('%s → invalid_request before the policy is read and before any connection', async (_name, a, detail) => {
    expect(validateFetchRequest(args(a))).toMatch(detail);
    let reads = 0;
    const f = fakeFetch({});
    const tool = fetchTool({ policy: async () => { reads += 1; return { ok: true, policy: PERMISSIVE_EGRESS, toolCallTimeoutS: null }; }, timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args(a), ctx());
    expect(o.isError).toBe(true);
    expect(o.failureKind).toBe('invalid_request');
    const d = diag(o);
    expect(d['failure_kind']).toBe('invalid_request');
    expect(d['error_class']).toBe('InvalidFetchRequest');
    expect('status_code' in d).toBe(false);
    expect(String(d['detail'])).toMatch(detail);
    expect(reads).toBe(0);
    expect(f.requests).toEqual([]);
  });
  it('timeout: 0 is well formed and means no deadline — no timer is armed', async () => {
    expect(validateFetchRequest(args({ url: 'http://h/', timeout: 0 }))).toBeNull();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let armedDuringCall = -1;
    const impl = (async () => { armedDuringCall = clock.pendingCount(); await gate; return new Response('x\n', { status: 200 }); }) as typeof fetch;
    const tool = fetchTool({ policy: policyOf(PERMISSIVE_EGRESS, 30), timers: clock, fetchImpl: impl });
    const p = tool.execute(args({ url: 'http://h/', timeout: 0 }), ctx());
    await new Promise((r) => setImmediate(r));
    release();
    const o = await p;
    expect(armedDuringCall).toBe(0);
    expect(o.isError).toBe(false);
    expect(o.text).toContain('truncated: false');
  });
});

describe('the policy read at each call (REQ-SANDBOX-038, REQ-SANDBOX-032, REQ-TOOLS-089)', () => {
  it('a read that fails, or throws, refuses with egress_policy_error and opens nothing (fail closed)', async () => {
    const f = fakeFetch({});
    const failing = fetchTool({ policy: async () => ({ ok: false, reason: 'agents.yaml: mapping values are not allowed here' }), timers: clock, fetchImpl: f.impl });
    const o = await failing.execute(args({ url: 'http://api.example.com/x' }), ctx());
    expect(o.failureKind).toBe('egress_policy_error');
    expect(diag(o)).toMatchObject({ error_class: 'NetworkEgressDenied', failure_kind: 'egress_policy_error' });
    expect(String(diag(o)['detail'])).toMatch(/api\.example\.com.*could not be read.*mapping values are not allowed here/);
    const throwing = fetchTool({ policy: async () => { throw new Error('disk gone'); }, timers: clock, fetchImpl: f.impl });
    const o2 = await throwing.execute(args({ url: 'http://api.example.com/x' }), ctx());
    expect(o2.failureKind).toBe('egress_policy_error');
    expect(String(diag(o2)['detail'])).toContain('disk gone');
    expect(f.requests).toEqual([]);
  });
  it('a stored pattern the grammar rejects refuses with egress_policy_error naming the host and embedding the error', async () => {
    const f = fakeFetch({});
    const tool = fetchTool({ policy: policyOf({ denied: ['api.*.example.com'], allowed: [], defaultDisposition: 'allow' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'https://api.example.com/v1' }), ctx());
    expect(o.failureKind).toBe('egress_policy_error');
    expect(String(diag(o)['detail'])).toMatch(/api\.example\.com.*Host pattern 'api\.\*\.example\.com' is not supported/);
    expect(f.requests).toEqual([]);
  });
  it('each call reads afresh: the second call sees the edited list', async () => {
    let policy: EgressPolicy = { denied: ['blocked.example'], allowed: [], defaultDisposition: 'allow' };
    const f = fakeFetch({});
    const tool = fetchTool({ policy: async () => ({ ok: true, policy, toolCallTimeoutS: 30 }), timers: clock, fetchImpl: f.impl });
    expect((await tool.execute(args({ url: 'http://blocked.example/' }), ctx())).failureKind).toBe('egress_denied');
    policy = { denied: [], allowed: [], defaultDisposition: 'allow' };
    expect((await tool.execute(args({ url: 'http://blocked.example/' }), ctx())).isError).toBe(false);
    expect(f.requests).toEqual(['http://blocked.example/']);
  });
});

describe('the named host (REQ-SANDBOX-022, -026, -029; REQ-TOOLS-092)', () => {
  it('a denied host observes zero requests; the detail names the host and the list that denied it', async () => {
    const f = fakeFetch({});
    const tool = fetchTool({ policy: policyOf({ denied: ['*.internal.example'], allowed: [], defaultDisposition: 'allow' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://db.internal.example:5432/' }), ctx());
    expect(o.failureKind).toBe('egress_denied');
    expect(o.isError).toBe(true);
    expect(diag(o)).toMatchObject({ error_class: 'NetworkEgressDenied', failure_kind: 'egress_denied', timeout_seconds: 30, url: 'http://db.internal.example:5432/' });
    expect(String(diag(o)['detail'])).toBe("Network egress to db.internal.example was refused: it matches '*.internal.example' on runtime.network_denied_hosts.");
    expect('status_code' in diag(o)).toBe(false);
    expect(f.requests).toEqual([]);
  });
  it('the default disposition deny names the setting; an unreadable URL is the unknown host and is denied', async () => {
    const f = fakeFetch({});
    const tool = fetchTool({ policy: policyOf({ denied: [], allowed: ['ok.example'], defaultDisposition: 'deny' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://other.example/' }), ctx());
    expect(String(diag(o)['detail'])).toBe("Network egress to other.example was refused: the egress policy (runtime.network_egress_policy) resolves that host to 'deny'.");
    const unknown = await tool.execute(args({ url: 'not a url at all' }), ctx());
    expect(unknown.failureKind).toBe('egress_denied');
    expect(String(diag(unknown)['detail'])).toMatch(/an unreadable host \("not a url at all"\).*could not be read/);
    expect(f.requests).toEqual([]);
    const allowed = await tool.execute(args({ url: 'http://ok.example/a' }), ctx());
    expect(allowed.isError).toBe(false);
    expect(f.requests).toEqual(['http://ok.example/a']);
  });
  it('the `ask` disposition on the named host is the gate\'s: at execution the host counts as permitted', async () => {
    const f = fakeFetch({});
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'https://docs.example/page' }), ctx());
    expect(o.isError).toBe(false);
    expect(f.requests).toEqual(['https://docs.example/page']);
  });
});

describe('the redirect loop (REQ-SANDBOX-023, -024, -027..031; REQ-TOOLS-090/091)', () => {
  const redirect = (to: string): Route => ({ status: 302, headers: { location: to } });
  it('a permitted host redirecting to a denied host: refused at that hop; the denied server sees nothing', async () => {
    const f = fakeFetch({ 'http://a.example/start': redirect('http://evil.example/x') });
    const tool = fetchTool({ policy: policyOf({ denied: ['evil.example'], allowed: [], defaultDisposition: 'allow' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/start' }), ctx());
    expect(o.failureKind).toBe('egress_redirect_denied');
    expect(diag(o)).toMatchObject({ error_class: 'NetworkEgressDenied', final_url: 'http://a.example/start', status_code: 302 });
    expect(String(diag(o)['detail'])).toMatch(/redirect from http:\/\/a\.example\/start to http:\/\/evil\.example\/x was refused.*evil\.example is denied because it matches 'evil\.example' on runtime\.network_denied_hosts/);
    expect(f.requests).toEqual(['http://a.example/start']);
  });
  it('a hop onto a NEW host classifying `ask` is refused with the three facts of REQ-SANDBOX-028', async () => {
    const f = fakeFetch({ 'http://a.example/start': redirect('http://b.example/there') });
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/start' }), ctx());
    expect(o.failureKind).toBe('egress_redirect_denied');
    const detail = String(diag(o)['detail']);
    expect(detail).toContain('originated from the requested URL http://a.example/start');
    expect(detail).toContain('the destination host b.example was never approved for this request');
    expect(detail).toContain('has to be asked for as its own fetch request');
    expect(f.requests).toEqual(['http://a.example/start']);
  });
  it('an allow-listed hop is followed; a hop back onto a permitted host is not re-gated; the verdict-allowed host stays permitted', async () => {
    const f = fakeFetch({
      'http://a.example/start': redirect('http://cdn.example/one'),
      'http://cdn.example/one': redirect('http://a.example/two'),
      'http://a.example/two': redirect('http://cdn.example/final'),
      'http://cdn.example/final': { status: 200, body: 'done\n', headers: { 'content-type': 'text/plain' } },
    });
    const tool = fetchTool({ policy: policyOf({ denied: [], allowed: ['cdn.example'], defaultDisposition: 'ask' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/start' }), ctx());
    expect(o.isError).toBe(false);
    expect(o.text).toBe('url: http://a.example/start\nfinal_url: http://cdn.example/final\nstatus_code: 200\ncontent_type: text/plain\ntruncated: false\n\ndone');
    expect(f.requests).toEqual(['http://a.example/start', 'http://cdn.example/one', 'http://a.example/two', 'http://cdn.example/final']);
  });
  it('a same-host hop — a path change and http→https — is followed under the shipped `ask` default', async () => {
    const f = fakeFetch({
      'http://a.example/old': redirect('/new'),
      'http://a.example/new': redirect('https://a.example/new'),
      'https://a.example/new': { status: 200, body: 'secure\n' },
    });
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/old' }), ctx());
    expect(o.isError).toBe(false);
    expect(f.requests).toEqual(['http://a.example/old', 'http://a.example/new', 'https://a.example/new']);
  });
  it('a relative location is resolved against the hop that returned it, and the resolved URL is what is classified', async () => {
    const f = fakeFetch({
      'http://a.example/dir/page': redirect('../up?x=1'),
      'http://a.example/up?x=1': redirect('//evil.example/here'),
    });
    const tool = fetchTool({ policy: policyOf({ denied: ['evil.example'], allowed: [], defaultDisposition: 'allow' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/dir/page' }), ctx());
    expect(o.failureKind).toBe('egress_redirect_denied');
    expect(String(diag(o)['detail'])).toContain('to http://evil.example/here was refused');
    expect(f.requests).toEqual(['http://a.example/dir/page', 'http://a.example/up?x=1']);
  });
  it('a location that cannot become an absolute URL with a host is the unknown host: refused, nothing opened', async () => {
    const f = fakeFetch({ 'http://a.example/start': redirect('http://[bad'), 'http://a.example/file': redirect('file:///etc/passwd') });
    const tool = fetchTool({ policy: policyOf({ denied: [], allowed: [], defaultDisposition: 'allow' }), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/start' }), ctx());
    expect(o.failureKind).toBe('egress_redirect_denied');
    expect(String(diag(o)['detail'])).toMatch(/could not be resolved into an absolute URL bearing a host/);
    const hostless = await tool.execute(args({ url: 'http://a.example/file' }), ctx());
    expect(hostless.failureKind).toBe('egress_redirect_denied');
    expect(String(diag(hostless)['detail'])).toContain('an unreadable host is denied');
    expect(f.requests).toEqual(['http://a.example/start', 'http://a.example/file']);
  });
  it('a blank or absent location ends the chain: that response is the result, no failure unless its status is ≥ 400', async () => {
    const f = fakeFetch({
      'http://a.example/blank': { status: 302, body: 'moved\n', headers: { location: '   ' } },
      'http://a.example/none': { status: 304 },
    });
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const blank = await tool.execute(args({ url: 'http://a.example/blank' }), ctx());
    expect(blank.isError).toBe(false);
    expect(blank.text).toContain('final_url: http://a.example/blank\nstatus_code: 302');
    expect(blank.text.endsWith('\n\nmoved')).toBe(true);
    const none = await tool.execute(args({ url: 'http://a.example/none' }), ctx());
    expect(none.isError).toBe(false);
    expect(none.text).toContain('status_code: 304');
    expect(f.requests).toEqual(['http://a.example/blank', 'http://a.example/none']);
  });
  it(`${FETCH_HOP_BUDGET} hops are followed; the ${FETCH_HOP_BUDGET + 1}st is too_many_redirects and is never fetched`, async () => {
    const routes: Record<string, Route> = {};
    for (let i = 0; i <= FETCH_HOP_BUDGET + 1; i += 1) routes[`http://a.example/${i}`] = redirect(`http://a.example/${i + 1}`);
    const f = fakeFetch(routes);
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/0' }), ctx());
    expect(o.failureKind).toBe('too_many_redirects');
    expect(diag(o)).toMatchObject({ error_class: 'TooManyRedirects', final_url: `http://a.example/${FETCH_HOP_BUDGET}`, status_code: 302 });
    expect(String(diag(o)['detail'])).toMatch(/budget of 20 was exhausted.*no terminal response was ever reached/);
    expect(f.requests.length).toBe(FETCH_HOP_BUDGET + 1);
    expect(f.requests.at(-1)).toBe(`http://a.example/${FETCH_HOP_BUDGET}`);
    // exactly the budget: followed to the end
    const ok = fakeFetch({ ...routes, [`http://a.example/${FETCH_HOP_BUDGET}`]: { status: 200, body: 'end\n' } });
    const okTool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: ok.impl });
    const o2 = await okTool.execute(args({ url: 'http://a.example/0' }), ctx());
    expect(o2.isError).toBe(false);
    expect(ok.requests.length).toBe(FETCH_HOP_BUDGET + 1);
  });
});

describe('transport outcomes (REQ-SANDBOX-033, REQ-TOOLS-092)', () => {
  it('a status ≥ 400 is http_error with the fixed detail, the status carried, the body still rendered under [fetch_output]', async () => {
    const f = fakeFetch({ 'http://a.example/missing': { status: 404, body: '<h1>Not here</h1>\n', headers: { 'content-type': 'text/html' } } });
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://a.example/missing' }), ctx());
    expect(o.isError).toBe(true);
    expect(o.failureKind).toBe('http_error');
    expect(diag(o)).toEqual({ content_type: 'text/html', detail: 'HTTP request completed with status code 404.', error_class: 'HttpError', failure_kind: 'http_error', final_url: 'http://a.example/missing', status_code: 404, timeout_seconds: 30, truncated: false, url: 'http://a.example/missing' });
    expect(o.text.split('\n').slice(3)).toEqual(['[fetch_output]', '<h1>Not here</h1>']);
  });
  it('a transport failure is network_error carrying the host and the platform message, cause included', async () => {
    const f = fakeFetch({ 'http://down.example/': () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED 10.0.0.9:80') }); } });
    const tool = fetchTool({ policy: policyOf(PERMISSIVE_EGRESS), timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://down.example/' }), ctx());
    expect(o.failureKind).toBe('network_error');
    expect(diag(o)).toMatchObject({ error_class: 'NetworkError' });
    expect(String(diag(o)['detail'])).toBe('The direct connection to down.example failed before a response was received: fetch failed: connect ECONNREFUSED 10.0.0.9:80. This fetch tool uses direct connections; proxy environment variables and system proxy settings have no effect.');
    expect('final_url' in diag(o)).toBe(false);
  });
  it('the run\'s own abort is not a timeout', async () => {
    const outer = new AbortController();
    const impl = (async (_i: string | URL | Request, init?: RequestInit) => new Promise<Response>((_r, reject) => { init?.signal?.addEventListener('abort', () => reject(new Error('This operation was aborted'))); })) as typeof fetch;
    const tool = fetchTool({ policy: policyOf(PERMISSIVE_EGRESS), timers: clock, fetchImpl: impl });
    const p = tool.execute(args({ url: 'http://a.example/' }), ctx(outer.signal));
    await new Promise((r) => setImmediate(r));
    outer.abort();
    const o = await p;
    expect(o.failureKind).toBe('network_error');
    expect(String(diag(o)['detail'])).toContain('cancelled by the run');
  });
});

describe('the timeout precedence chain (REQ-SANDBOX-021, REQ-CONFIG-115, REQ-TOOLS-093)', () => {
  it.each<[number | undefined, number | null, number, string]>([
    [5, 30, 5, 'call'],
    [0, 30, 0, 'call'],
    [undefined, 30, 30, 'run'],
    [undefined, 7, 7, 'run'],
    [undefined, null, 10, 'built-in'],
    [2.5, null, 2.5, 'call'],
  ])('call %s over run %s → %s s from the %s level', (call, run, seconds, level) => {
    expect(settleTimeout(call, run)).toEqual({ seconds, level });
  });
  it('the value in force is reported as timeout_seconds; the deadline is the timer port\'s and names its level', async () => {
    const impl = (async (_i: string | URL | Request, init?: RequestInit) => new Promise<Response>((_r, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))); })) as typeof fetch;
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT, 30), timers: clock, fetchImpl: impl });
    const p = tool.execute(args({ url: 'http://a.example/slow' }), ctx());
    await new Promise((r) => setImmediate(r));
    expect(clock.pendingCount()).toBe(1);
    clock.advance(29_999);
    await new Promise((r) => setImmediate(r));
    clock.advance(1);
    const o = await p;
    expect(o.failureKind).toBe('timeout');
    expect(diag(o)).toMatchObject({ error_class: 'FetchTimeout', timeout_seconds: 30 });
    expect(String(diag(o)['detail'])).toBe("The fetch of http://a.example/slow did not complete within 30 s, the deadline supplied by the owning run's runtime.tool_call_timeout.");
    expect(clock.pendingCount()).toBe(0);
  });
  it('the permissive fallback (ADR-0023 c.5): no owning run → 10.0 s and every host allowed', async () => {
    const f = fakeFetch({ 'http://169.254.169.254/latest': { status: 200, body: 'meta\n' } });
    const tool = fetchTool({ policy: permissivePolicyRead, timers: clock, fetchImpl: f.impl });
    const o = await tool.execute(args({ url: 'http://169.254.169.254/latest' }), ctx());
    expect(o.isError).toBe(false);
    expect(f.requests).toEqual(['http://169.254.169.254/latest']);
    const timed = fetchTool({ policy: permissivePolicyRead, timers: clock, fetchImpl: fakeFetch({ 'http://x.example/': { status: 500, body: '' } }).impl });
    expect(diag(await timed.execute(args({ url: 'http://x.example/' }), ctx()))).toMatchObject({ timeout_seconds: 10, status_code: 500 });
  });
});

describe('shaping (REQ-SANDBOX-034)', () => {
  const body = 'l1\nl2\nl3\nl4\nl5\n';
  it.each<[string, number | undefined, number | undefined, number, string[], boolean]>([
    ['everything', undefined, undefined, 1000, ['l1', 'l2', 'l3', 'l4', 'l5'], false],
    ['a window', 2, 4, 1000, ['l2', 'l3', 'l4'], false],
    ['a window past the end yields what exists', 4, 99, 1000, ['l4', 'l5'], false],
    ['a window starting past the end yields nothing, not truncated', 9, 12, 1000, [], false],
    ['the cap on the whole body', undefined, undefined, 2, ['l1', 'l2'], true],
    ['the cap on the window', 2, 5, 3, ['l2', 'l3', 'l4'], true],
    ['the window alone never truncates', 1, 2, 1000, ['l1', 'l2'], false],
    ['the cap equal to the selection is not truncation', 1, 3, 3, ['l1', 'l2', 'l3'], false],
  ])('%s', (_n, from, to, max, lines, truncated) => {
    expect(shapeBody(body, from, to, max)).toEqual({ lines, truncated });
  });
  it('an empty body has no lines; CRLF terminates a line; one trailing terminator is not a line', () => {
    expect(shapeBody('', undefined, undefined, 10)).toEqual({ lines: [], truncated: false });
    expect(shapeBody('a\r\nb\r\n', undefined, undefined, 10)).toEqual({ lines: ['a', 'b'], truncated: false });
    expect(shapeBody('a\nb', undefined, undefined, 10)).toEqual({ lines: ['a', 'b'], truncated: false });
    expect(shapeBody('a\n\n', undefined, undefined, 10)).toEqual({ lines: ['a', ''], truncated: false });
  });
});

describe('rendering (REQ-SANDBOX-036) — the snapshot', () => {
  const base: FetchResult = { url: 'http://a.example/p', final_url: null, status_code: null, content_type: null, truncated: false, failure_kind: null, timeout_seconds: 30, error_class: null, detail: null, body: null };
  it('a refusal: the first line, the diagnostic block with sorted keys and nulls omitted, no output block', () => {
    const r: FetchResult = { ...base, failure_kind: 'egress_denied', error_class: 'NetworkEgressDenied', detail: 'Network egress to a.example was refused: x.' };
    expect(renderFetch(r)).toBe([
      'Fetch of http://a.example/p failed: egress_denied.',
      '[fetch_diagnostic]',
      '{"detail":"Network egress to a.example was refused: x.","error_class":"NetworkEgressDenied","failure_kind":"egress_denied","timeout_seconds":30,"truncated":false,"url":"http://a.example/p"}',
    ].join('\n'));
    expect(Object.keys(diagnosticOf(r))).toEqual(['detail', 'error_class', 'failure_kind', 'timeout_seconds', 'truncated', 'url']);
  });
  it('a failure with a body received: the output block follows the diagnostic', () => {
    const r: FetchResult = { ...base, final_url: 'http://a.example/p', status_code: 503, content_type: 'text/plain', failure_kind: 'http_error', error_class: 'HttpError', detail: 'HTTP request completed with status code 503.', body: 'try later' };
    expect(renderFetch(r)).toBe([
      'Fetch of http://a.example/p failed: http_error.',
      '[fetch_diagnostic]',
      '{"content_type":"text/plain","detail":"HTTP request completed with status code 503.","error_class":"HttpError","failure_kind":"http_error","final_url":"http://a.example/p","status_code":503,"timeout_seconds":30,"truncated":false,"url":"http://a.example/p"}',
      '[fetch_output]',
      'try later',
    ].join('\n'));
  });
  it('a success: the five header lines in order, then the body', () => {
    const r: FetchResult = { ...base, final_url: 'https://a.example/p', status_code: 200, content_type: 'text/html; charset=utf-8', truncated: true, body: '<html>\n<body>' };
    expect(renderFetch(r)).toBe('url: http://a.example/p\nfinal_url: https://a.example/p\nstatus_code: 200\ncontent_type: text/html; charset=utf-8\ntruncated: true\n\n<html>\n<body>');
  });
});

describe('against a real node:http server on 127.0.0.1', () => {
  let server: Server;
  let port = 0;
  const seen: string[] = [];
  const pendingSlow: (() => void)[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      seen.push(req.url ?? '');
      if (req.url === '/ok') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('one\ntwo\nthree\n'); return; }
      if (req.url === '/to-localhost') { res.writeHead(302, { location: `http://localhost:${port}/ok` }); res.end(); return; }
      if (req.url === '/404') { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('nothing here\n'); return; }
      if (req.url === '/slow') { pendingSlow.push(() => { res.writeHead(200); res.end('late\n'); }); return; }
      res.writeHead(500); res.end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
  });
  afterAll(async () => {
    for (const release of pendingSlow) release();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const origin = () => `http://127.0.0.1:${port}`;

  it('a 3-line body: the header lines and the body, truncated false', async () => {
    const tool = fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock });
    const o = await tool.execute(args({ url: `${origin()}/ok` }), ctx());
    expect(o.isError).toBe(false);
    expect(o.text).toBe(`url: ${origin()}/ok\nfinal_url: ${origin()}/ok\nstatus_code: 200\ncontent_type: text/plain\ntruncated: false\n\none\ntwo\nthree`);
    expect(o.outcomeKind).toBe('fetch');
    expect(o.label).toBe(`fetch ${origin()}/ok`);
    const windowed = await tool.execute(args({ url: `${origin()}/ok`, from_line: 2, max_lines: 1 }), ctx());
    expect(windowed.text.endsWith('truncated: true\n\ntwo')).toBe(true);
  });
  it('a redirect to `localhost` — a different host name — is refused under the default `ask` and followed when allow-listed', async () => {
    seen.length = 0;
    const refused = await fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock }).execute(args({ url: `${origin()}/to-localhost` }), ctx());
    expect(refused.failureKind).toBe('egress_redirect_denied');
    expect(String(diag(refused)['detail'])).toContain('the destination host localhost was never approved');
    expect(seen).toEqual(['/to-localhost']);
    seen.length = 0;
    const followed = await fetchTool({ policy: policyOf({ denied: [], allowed: ['localhost'], defaultDisposition: 'ask' }), timers: clock }).execute(args({ url: `${origin()}/to-localhost` }), ctx());
    expect(followed.isError).toBe(false);
    expect(followed.text).toContain(`final_url: http://localhost:${port}/ok`);
    expect(seen).toEqual(['/to-localhost', '/ok']);
  });
  it('a 404: http_error, the status and the body', async () => {
    const o = await fetchTool({ policy: policyOf(ASK_DEFAULT), timers: clock }).execute(args({ url: `${origin()}/404` }), ctx());
    expect(o.failureKind).toBe('http_error');
    expect(diag(o)).toMatchObject({ status_code: 404, detail: 'HTTP request completed with status code 404.' });
    expect(o.text.endsWith('[fetch_output]\nnothing here')).toBe(true);
  });
  it('a route that never answers: the FakeClock-driven deadline ends it as timeout, from the call level', async () => {
    seen.length = 0;
    const p = fetchTool({ policy: policyOf(ASK_DEFAULT, 30), timers: clock }).execute(args({ url: `${origin()}/slow`, timeout: 1 }), ctx());
    for (let i = 0; i < 200 && !seen.includes('/slow'); i += 1) await new Promise((r) => setTimeout(r, 10));
    expect(seen).toEqual(['/slow']);
    clock.advance(1000);
    const o = await p;
    expect(o.failureKind).toBe('timeout');
    expect(diag(o)).toMatchObject({ timeout_seconds: 1 });
    expect(String(diag(o)['detail'])).toContain("the deadline supplied by the call's own timeout parameter");
  });
});
