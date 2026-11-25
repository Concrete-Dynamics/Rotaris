import { afterEach, describe, expect, it } from 'vitest';
import { connect } from 'node:net';
import { InboundToken } from './guards.js';
import { createInboundListener, loopbackAddresses, type InboundListener } from './transport.js';
import type { InboundAskHandler } from '@rotaris/contracts';

/**
 * REQ-MCP-119/120/121: the LOOPBACK BIND over a REAL socket — bind, unbind, and bind again. The defects the review found
 * here (2026-11-25) are only visible across a bind/unbind/bind cycle and across two overlapping binds, so the socket is
 * real: the SDK's streamable-HTTP leg holds a connection open and the second bind's handler must be a FRESH one.
 */

const ask: InboundAskHandler = async () => ({ kind: 'refused', code: 'x', headline: 'x' });

function listener(): InboundListener {
  const token = new InboundToken();
  token.rotate('tok');
  return createInboundListener({ token, ask, log: () => undefined });
}

/** One MCP `initialize` over the socket, answered with its status. */
async function initialize(port: number): Promise<number> {
  const r = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer tok' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
  });
  await r.text();
  return r.status;
}

const open: InboundListener[] = [];
afterEach(async () => { for (const l of open.splice(0)) await l.unbind(); });

describe('REQ-MCP-119: the bind is loopback and ephemeral', () => {
  it('loopbackAddresses names 127.0.0.1 always and ::1 only where the platform supplies it', () => {
    expect([...loopbackAddresses(true)]).toEqual(['127.0.0.1', '::1']);
    expect([...loopbackAddresses(false)]).toEqual(['127.0.0.1']);
  });

  it('bind answers an OS-chosen positive port on a loopback address, never the wildcard', async () => {
    const l = listener();
    open.push(l);
    const b = await l.bind();
    expect(b.port).toBeGreaterThan(0);
    expect(b.addresses).toContain('127.0.0.1');
    expect(b.addresses.some((a) => a === '0.0.0.0' || a === '::')).toBe(false);
  });
});

describe('REQ-MCP-120/121 (MAJOR, 2026-11-25): disable → enable serves again', () => {
  it('a request is SERVED after an unbind and a second bind (the SDK handler is fresh, not the closed one)', async () => {
    const l = listener();
    open.push(l);
    const first = await l.bind();
    expect(await initialize(first.port)).toBe(200);
    // A disable: the socket is torn down and the SDK handler is closed for good.
    await l.unbind();
    expect(l.binding()).toBeNull();
    // An enable: a NEW socket and a NEW handler. Reusing the closed handler would leave this request unanswered.
    const second = await l.bind();
    expect(second.port).toBeGreaterThan(0);
    expect(await initialize(second.port)).toBe(200);
  });

  it('two OVERLAPPING binds cannot both take the socket — the second is refused synchronously', async () => {
    const l = listener();
    open.push(l);
    const a = l.bind();
    // The guard is taken synchronously, so this rejects before the first bind's await resolves (the race the review named).
    await expect(l.bind()).rejects.toThrow(/already bound/);
    await a;
  });
});

describe('REQ-MCP-121 (MAJOR, 2026-11-25): teardown does not hang on an open connection', () => {
  it('unbind completes while a client holds a half-sent request open, and leaves nothing listening', async () => {
    const l = listener();
    const b = await l.bind();
    /*
     * A client that opens a request and does NOT finish its body: the socket is open and the server is holding it waiting
     * for the rest. `server.close()` waits for exactly this connection to end — measured: it never fires — so an `unbind`
     * that only called `close()` would never return and main's revocation would report success while the socket stayed up.
     */
    const sock = connect(b.port, '127.0.0.1');
    await new Promise<void>((r) => sock.on('connect', () => r()));
    sock.write('POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n');
    await new Promise((r) => setTimeout(r, 100));
    // A bounded race: the fix's `closeAllConnections()` makes unbind return at once; a bare `close()` would time out.
    const result = await Promise.race([
      l.unbind().then(() => 'unbound' as const),
      new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 1_500)),
    ]);
    expect(result).toBe('unbound');
    expect(l.binding()).toBeNull();
    sock.destroy();
  });
});
