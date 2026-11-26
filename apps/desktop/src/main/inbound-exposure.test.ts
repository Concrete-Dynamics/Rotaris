import { describe, expect, it } from 'vitest';
import { InboundExposure, newInboundToken } from './inbound-exposure.js';

/**
 * REQ-MCP-120/121: the exposure main holds — off in every build until the user turns it on, for that session alone, with
 * a per-exposure token shown once. Quitting revokes it; disabling revokes the token with it.
 */
describe('REQ-MCP-120/121: the exposure and its token', () => {
  it('starts off, with no port and no token', () => {
    const e = new InboundExposure();
    expect(e.view(true)).toEqual({ enabled: false, port: null });
    expect(e.token).toBeNull();
  });

  it('shows the token on the enabling view and the port once the listener bound', () => {
    const e = new InboundExposure();
    e.turnOn('tok-1');
    e.bound(51234);
    expect(e.view(true)).toEqual({ enabled: true, port: 51234, token: 'tok-1' });
    // A read WITHOUT the token flag (a later `inbound.status`) never carries it (REQ-MCP-121: shown once).
    expect(e.view(false)).toEqual({ enabled: true, port: 51234 });
  });

  it('rotates the token on a fresh exposure, and disabling revokes it', () => {
    const e = new InboundExposure();
    e.turnOn('tok-1');
    e.bound(1);
    e.turnOn('tok-2');
    e.bound(2);
    expect(e.token).toBe('tok-2');
    e.turnOff();
    expect(e.token).toBeNull();
    expect(e.view(true)).toEqual({ enabled: false, port: null });
  });

  it('mints a token that looks like a bearer value and is not logged here', () => {
    const t = newInboundToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThan(30);
  });
});
