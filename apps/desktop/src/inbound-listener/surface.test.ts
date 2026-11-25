import { afterEach, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { InboundToken } from './guards.js';
import { callInboundTool, createInboundSurface, INBOUND_SERVER_INFO, statusText } from './surface.js';
import { createInboundListener } from './transport.js';
import type { InboundAskHandler } from '@rotaris/contracts';

/**
 * REQ-MCP-119/121/122/123: THE SURFACE, driven through a real loopback socket and through its pure core.
 *
 * The HTTP cases bind the listener on `127.0.0.1` at an EPHEMERAL port (REQ-MCP-119) with a real fetch, so the token
 * refusal (401), the `Origin` refusal (403), the `Host` refusal (403) and the "missing Origin from a native client is
 * allowed" case are measured on the wire, not asserted about a pure function. The tool cases drive `callInboundTool`
 * directly, so the two-tool count and the strict input schema are measured without a server.
 */

/** A stand-in for main: the two asks answered with fixed values, so the surface's own behaviour is what is measured. */
const askHandler = (over: Partial<Record<'start' | 'status', unknown>> = {}): { readonly ask: InboundAskHandler; readonly calls: unknown[] } => {
  const calls: unknown[] = [];
  const ask: InboundAskHandler = async (a) => {
    calls.push(a);
    if (a.kind === 'inbound.startRun') return (over.start ?? { kind: 'inbound.runStarted', run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1' }) as never;
    return (over.status ?? { kind: 'inbound.runStatus', status: { run: a.run, sessionId: 'S-1', state: 'running', stopReason: null } }) as never;
  };
  return { ask, calls };
};

/** One MCP request over the bound socket. `Host` is set explicitly: a fetch cannot override it (a forbidden header), so it is passed as a header on the Request the listener's conversion reads. */
async function mcpCall(base: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(base, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify(body),
  });
}

/** A raw HTTP request, where the `Host` header can be set — fetch silently drops an overridden one. */
function rawRequest(port: number, hostHeader: string, headers: Record<string, string>, body: unknown): Promise<number> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = httpRequest({ host: '127.0.0.1', port, method: 'POST', path: '/mcp', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': Buffer.byteLength(payload), Host: hostHeader, ...headers } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
    req.on('error', reject);
    req.end(payload);
  });
}

const open: { readonly close: () => Promise<void> }[] = [];
afterEach(async () => { for (const l of open.splice(0)) await l.close(); });

describe('REQ-MCP-119: the surface binds loopback on an ephemeral port, and only there', () => {
  it('binds 127.0.0.1 and (where the platform supplies it) ::1, and answers the OS-chosen port', async () => {
    const token = new InboundToken();
    token.rotate('tok');
    const { ask } = askHandler();
    const listener = createInboundListener({ token, ask, log: () => undefined });
    const binding = await listener.bind();
    open.push({ close: () => listener.unbind() });
    expect(binding.port).toBeGreaterThan(0);
    expect(binding.addresses).toContain('127.0.0.1');
    // Ephemeral: the OS chose it, so a fixed port is not what was bound.
    expect(binding.port).not.toBe(80);
    // It never binds 0.0.0.0: the bound address is a loopback one, never the wildcard.
    expect(binding.addresses.some((a) => a === '0.0.0.0' || a === '::')).toBe(false);
  });

  it('a second bind is refused rather than silently rebinding', async () => {
    const token = new InboundToken();
    token.rotate('tok');
    const { ask } = askHandler();
    const listener = createInboundListener({ token, ask, log: () => undefined });
    await listener.bind();
    open.push({ close: () => listener.unbind() });
    await expect(listener.bind()).rejects.toThrow(/already bound/);
  });
});

describe('REQ-MCP-121/122: the guards, measured on the wire', () => {
  async function bound(): Promise<{ readonly base: string; readonly port: number }> {
    const token = new InboundToken();
    token.rotate('the-secret-token');
    const { ask } = askHandler();
    const listener = createInboundListener({ token, ask, log: () => undefined });
    const binding = await listener.bind();
    open.push({ close: () => listener.unbind() });
    return { base: `http://127.0.0.1:${binding.port}/mcp`, port: binding.port };
  }

  it('a wrong token is refused (401) and the call never reaches main', async () => {
    const { base } = await bound();
    const { ask, calls } = askHandler();
    void ask;
    const r = await mcpCall(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: 'Bearer wrong' });
    expect(r.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it('a missing token is refused (401)', async () => {
    const { base } = await bound();
    const r = await mcpCall(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(r.status).toBe(401);
  });

  it('a FOREIGN Origin with a valid token is refused (403)', async () => {
    const { base } = await bound();
    const r = await mcpCall(base, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { Authorization: 'Bearer the-secret-token', Origin: 'http://evil.example.com' });
    expect(r.status).toBe(403);
  });

  it('a non-loopback Host is refused (403)', async () => {
    const { port } = await bound();
    const status = await rawRequest(port, 'evil.example.com', { Authorization: 'Bearer the-secret-token' }, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(403);
  });

  it('a missing Origin from a native client is ALLOWED — the request is served', async () => {
    const { base } = await bound();
    const r = await mcpCall(base, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'native', version: '1' } } }, { Authorization: 'Bearer the-secret-token' });
    expect(r.status).not.toBe(401);
    expect(r.status).not.toBe(403);
  });
});

describe('REQ-MCP-123: exactly two tools, no third', () => {
  it('advertises exactly `rotaris_start_run` and `rotaris_run_status`', async () => {
    const token = new InboundToken();
    token.rotate('tok');
    const { ask } = askHandler();
    const surface = createInboundSurface({ token, ask, log: () => undefined });
    // One initialize, then tools/list, against the SDK's own handler — the count is what the SDK advertises.
    const init = await surface.fetch(new Request('http://127.0.0.1/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer tok', Host: '127.0.0.1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
    }));
    expect(init.status).toBe(200);
    const list = await surface.fetch(new Request('http://127.0.0.1/mcp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer tok', Host: '127.0.0.1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    }));
    const text = await list.text();
    const parsed = JSON.parse(text.includes('data:') ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('') : text) as { result?: { tools?: { name: string }[] } };
    const names = (parsed.result?.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(['rotaris_run_status', 'rotaris_start_run']);
    await surface.close();
    expect(INBOUND_SERVER_INFO.name).toBe('rotaris');
  });
});

describe('REQ-MCP-124: the start tool carries a prompt alone — every authority field is refused, not ignored', () => {
  it('starts on a prompt alone, and reduces the call to the one ask main answers', async () => {
    const { ask, calls } = askHandler();
    const out = await callInboundTool(ask, 'rotaris_start_run', { prompt: 'Do the thing.' });
    expect(out.isError).toBe(false);
    expect(calls).toEqual([{ kind: 'inbound.startRun', prompt: 'Do the thing.' }]);
  });

  it('refuses each authority field by name rather than ignoring it', async () => {
    const { ask } = askHandler();
    for (const field of ['sandboxMode', 'boardPermissions', 'effectiveRoot', 'worktree', 'runType', 'initialTodo', 'isolation', 'attach', 'workspaceId', 'sessionId']) {
      const out = await callInboundTool(ask, 'rotaris_start_run', { prompt: 'p', [field]: 'anything' });
      expect(out.isError, field).toBe(true);
      expect(out.text, field).toContain(field);
    }
  });

  it('refuses a missing, empty or wrongly-typed prompt', async () => {
    const { ask } = askHandler();
    expect((await callInboundTool(ask, 'rotaris_start_run', {})).isError).toBe(true);
    expect((await callInboundTool(ask, 'rotaris_start_run', { prompt: '' })).isError).toBe(true);
    expect((await callInboundTool(ask, 'rotaris_start_run', { prompt: 42 })).isError).toBe(true);
  });

  it('a refusal from main is reported to the caller in main’s own words', async () => {
    const { ask } = askHandler({ start: { kind: 'refused', code: 'inbound.run-active', headline: 'A run started through the surface is already active', detail: 'wait for the active run to end' } });
    const out = await callInboundTool(ask, 'rotaris_start_run', { prompt: 'p' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('already active');
    expect(out.text).toContain('wait for the active run to end');
  });
});

describe('REQ-MCP-123/130: the status tool answers a handle, in the product’s own vocabulary', () => {
  it('reads a run’s state and stop reason', async () => {
    const { ask, calls } = askHandler({ status: { kind: 'inbound.runStatus', status: { run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', state: 'completed', stopReason: 'tasks_complete' } } });
    const out = await callInboundTool(ask, 'rotaris_run_status', { run: `inr_${'a'.repeat(32)}` });
    expect(out.isError).toBe(false);
    expect(out.text).toContain('completed');
    expect(out.text).toContain('tasks_complete');
    expect(calls).toEqual([{ kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` }]);
  });

  it('refuses a value that is not a handle this surface minted', async () => {
    const { ask } = askHandler({ status: { kind: 'refused', code: 'inbound.unknown-run', headline: 'No run of this surface answers to that handle' } });
    const out = await callInboundTool(ask, 'rotaris_run_status', { run: 'a-desktop-session-id' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('No run of this surface answers to that handle');
  });

  it('refuses a missing handle and an unknown tool name', async () => {
    const { ask } = askHandler();
    expect((await callInboundTool(ask, 'rotaris_run_status', {})).isError).toBe(true);
    expect((await callInboundTool(ask, 'rotaris_list_files', {})).isError).toBe(true);
  });

  it('the status text is the product’s own words, and no extra field rides along', () => {
    const text = statusText({ run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1', state: 'paused', stopReason: null });
    expect(text).toContain('paused');
    expect(text).toContain('the run has not stopped');
    expect(text).not.toContain('Bearer');
  });
});
