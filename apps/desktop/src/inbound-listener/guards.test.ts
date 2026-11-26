import { describe, expect, it } from 'vitest';
import { checkInboundHost, checkInboundOrigin, checkInboundRequest, InboundToken, constantTimeEqual, mintInboundToken } from './guards.js';

/**
 * REQ-MCP-121/122: the two guards the surface runs before anything is served — the bearer token that separates a caller
 * from a bystander, and the `Host`/`Origin` checks against loopback that close DNS rebinding. Pure functions: no socket,
 * no process.
 */

describe('REQ-MCP-122: Origin and Host are checked against loopback before the request is served', () => {
  it('a missing Origin from a native client is ALLOWED — only a browser sends one', () => {
    expect(checkInboundOrigin(null)).toEqual({ ok: true });
    expect(checkInboundOrigin(undefined)).toEqual({ ok: true });
    expect(checkInboundOrigin('')).toEqual({ ok: true });
  });

  it('a loopback Origin is allowed, on every loopback hostname', () => {
    for (const origin of ['http://127.0.0.1:51234', 'http://localhost:51234', 'http://[::1]:51234']) {
      expect(checkInboundOrigin(origin), origin).toEqual({ ok: true });
    }
  });

  it('a FOREIGN Origin is refused, port and path irrelevant to the decision', () => {
    const r = checkInboundOrigin('http://evil.example.com');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe('bad-origin');
  });

  it('an unparsable Origin (the literal `null` an opaque context sends) is refused', () => {
    expect(checkInboundOrigin('null').ok).toBe(false);
  });

  it('a non-loopback Host is refused, and a missing Host is refused', () => {
    expect(checkInboundHost('127.0.0.1:51234')).toEqual({ ok: true });
    expect(checkInboundHost('localhost:51234')).toEqual({ ok: true });
    expect(checkInboundHost('[::1]:51234')).toEqual({ ok: true });
    const foreign = checkInboundHost('evil.example.com:51234');
    expect(foreign.ok).toBe(false);
    expect(foreign.ok === false && foreign.reason).toBe('bad-host');
    expect(checkInboundHost(null).ok).toBe(false);
    expect(checkInboundHost('').ok).toBe(false);
  });

  it('the two checks run together: a bad Host is refused even with an allowed Origin, and vice versa', () => {
    expect(checkInboundRequest({ host: '127.0.0.1:1', origin: 'http://127.0.0.1:1' })).toEqual({ ok: true });
    expect(checkInboundRequest({ host: '127.0.0.1:1', origin: 'http://evil.example.com' }).ok).toBe(false);
    expect(checkInboundRequest({ host: 'evil.example.com', origin: 'http://127.0.0.1:1' }).ok).toBe(false);
    expect(checkInboundRequest({ host: '127.0.0.1:1', origin: null })).toEqual({ ok: true });
  });
});

describe('REQ-MCP-121: the per-exposure bearer token', () => {
  it('refuses every request while no exposure is on', () => {
    const token = new InboundToken();
    expect(token.accepts('Bearer abc')).toBe(false);
    expect(token.accepts(null)).toBe(false);
  });

  it('accepts only the token in force, in the `Bearer` form', () => {
    const token = new InboundToken();
    token.rotate('the-token');
    expect(token.accepts('Bearer the-token')).toBe(true);
    expect(token.accepts('bearer the-token')).toBe(true);
    expect(token.accepts('Bearer wrong')).toBe(false);
    expect(token.accepts('Basic the-token')).toBe(false);
    expect(token.accepts('the-token')).toBe(false);
    expect(token.accepts(undefined)).toBe(false);
    expect(token.accepts(null)).toBe(false);
  });

  it('a rotation invalidates the old token, and revoking invalidates every token', () => {
    const token = new InboundToken();
    token.rotate('one');
    token.rotate('two');
    expect(token.accepts('Bearer one')).toBe(false);
    expect(token.accepts('Bearer two')).toBe(true);
    token.revoke();
    expect(token.accepts('Bearer two')).toBe(false);
    expect(token.value).toBeNull();
  });

  it('a minted token is base64url and long enough to be unguessable', () => {
    const t = mintInboundToken((n) => new Uint8Array(n).fill(7));
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(42);
  });

  it('the comparison is length-checked and value-checked (never "close enough")', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
