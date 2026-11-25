import { describe, expect, it } from 'vitest';
import type { InboundAskHandler, InboundListenerAsk } from '@rotaris/contracts';
import { InboundToken } from './guards.js';
import { createInboundHost } from './host.js';
import { listenerAsk, readAnswerEnvelope, readListenerEnvelope, serveListenerRequest } from './protocol.js';
import type { InboundListener } from './transport.js';

/**
 * REQ-MCP-119/120/121/127: the listener's `utilityProcess` state machine, and its wire. Driven with a stand-in socket so
 * no port is bound and no process is forked: the enable/disable/state behaviour, the token's rotation, and the fact that
 * a request main refused reached no run host are all measured here.
 */

/** A stand-in socket that records bind/unbind and answers a fixed port. */
function standInListener(port = 51234): { readonly listener: InboundListener; readonly binds: number; } & { binds2: () => number } {
  let binds = 0;
  let bound: { addresses: readonly string[]; port: number } | null = null;
  return {
    binds2: () => binds,
    get binds() { return binds; },
    listener: {
      binding: () => bound,
      bind: async () => { binds += 1; bound = { addresses: ['127.0.0.1'], port }; return bound; },
      unbind: async () => { bound = null; },
    },
  };
}

describe('REQ-MCP-120/121: enable, disable and the token', () => {
  it('starts off; enabling binds on loopback and answers the OS-chosen port', async () => {
    const token = new InboundToken();
    const s = standInListener(51234);
    const host = createInboundHost({ token, log: () => undefined, listener: s.listener, mainAsk: async () => ({ kind: 'refused', code: 'x', headline: 'x' }) });
    expect(await host.apply({ kind: 'inbound.state' })).toEqual({ kind: 'inbound.state', state: { listening: false, port: null } });
    const on = await host.apply({ kind: 'inbound.enable', token: 'tok-1' });
    expect(on).toEqual({ kind: 'inbound.state', state: { listening: true, port: 51234 } });
    expect(token.value).toBe('tok-1');
    expect(s.binds2()).toBe(1);
  });

  it('disabling unbinds and invalidates the token with it', async () => {
    const token = new InboundToken();
    const s = standInListener();
    const host = createInboundHost({ token, log: () => undefined, listener: s.listener, mainAsk: async () => ({ kind: 'refused', code: 'x', headline: 'x' }) });
    await host.apply({ kind: 'inbound.enable', token: 'tok-1' });
    const off = await host.apply({ kind: 'inbound.disable' });
    expect(off).toEqual({ kind: 'inbound.state', state: { listening: false, port: null } });
    expect(token.value).toBeNull();
    expect(token.accepts('Bearer tok-1')).toBe(false);
  });

  it('re-enabling ROTATES the token: the old one is refused, the new one accepted', async () => {
    const token = new InboundToken();
    const s = standInListener();
    const host = createInboundHost({ token, log: () => undefined, listener: s.listener, mainAsk: async () => ({ kind: 'refused', code: 'x', headline: 'x' }) });
    await host.apply({ kind: 'inbound.enable', token: 'tok-1' });
    await host.apply({ kind: 'inbound.disable' });
    await host.apply({ kind: 'inbound.enable', token: 'tok-2' });
    expect(token.accepts('Bearer tok-1')).toBe(false);
    expect(token.accepts('Bearer tok-2')).toBe(true);
  });

  it('a bind that FAILS leaves nothing exposed and revokes the token with the failure', async () => {
    const token = new InboundToken();
    const failing: InboundListener = { binding: () => null, bind: async () => { throw new Error('EADDRINUSE'); }, unbind: async () => undefined };
    const host = createInboundHost({ token, log: () => undefined, listener: failing, mainAsk: async () => ({ kind: 'refused', code: 'x', headline: 'x' }) });
    const r = await host.apply({ kind: 'inbound.enable', token: 'tok-1' });
    expect(r.kind).toBe('refused');
    expect(r.kind === 'refused' && r.code).toBe('inbound.bindFailed');
    expect(token.value).toBeNull();
  });
});

describe('REQ-MCP-124: a refused request reaches no run host', () => {
  it('the ask path forwards to main and nothing else; a refusal is main’s own words', async () => {
    const token = new InboundToken();
    const asks: InboundListenerAsk[] = [];
    const mainAsk: InboundAskHandler = async (a) => { asks.push(a); return { kind: 'refused', code: 'inbound.no-workspace', headline: 'No workspace is open', detail: 'open one' }; };
    const s = standInListener();
    const host = createInboundHost({ token, log: () => undefined, listener: s.listener, mainAsk });
    const answer = await host.ask({ kind: 'inbound.startRun', prompt: 'p' });
    expect(asks).toEqual([{ kind: 'inbound.startRun', prompt: 'p' }]);
    expect(answer.kind).toBe('refused');
    expect(answer.kind === 'refused' && answer.detail).toBe('open one');
  });
});

describe('REQ-MCP-127: the listener’s wire parses by shape', () => {
  it('reads a main → listener request envelope and writes its reply', async () => {
    const sent: unknown[] = [];
    const applied: unknown[] = [];
    const host = { apply: async (r: unknown) => { applied.push(r); return { kind: 'ack' as const }; } };
    const handled = await serveListenerRequest({ id: 7, request: { kind: 'inbound.disable' } }, host, (m) => sent.push(m));
    expect(handled).toBe(true);
    expect(applied).toEqual([{ kind: 'inbound.disable' }]);
    expect(sent).toEqual([{ id: 7, reply: { kind: 'ack' } }]);
  });

  it('a message that is not a request envelope is left for the other reader', async () => {
    const handled = await serveListenerRequest({ ask: 1, answer: { kind: 'refused', code: 'x', headline: 'y' } }, { apply: async () => ({ kind: 'ack' as const }) }, () => undefined);
    expect(handled).toBe(false);
    expect(readListenerEnvelope({ ask: 1 })).toBeNull();
    expect(readAnswerEnvelope({ ask: 1, answer: { kind: 'refused', code: 'x', headline: 'y' } })?.ask).toBe(1);
  });

  it('an ask is correlated by its own number', () => {
    expect(listenerAsk(3, { kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` })).toEqual({ ask: 3, request: { kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` } });
  });
});
