import { describe, expect, it } from 'vitest';
import type { CommandOutcome } from '@rotaris/contracts';
import { InboundExposure } from './inbound-exposure.js';
import { createInboundEnableSequencer } from './inbound-enable.js';

/**
 * REQ-MCP-120/121 (MAJOR of review 3, 2026-11-25): main's enable/disable sequencer, measured without Electron. Two
 * faults the review found are the two cases below:
 *
 * 1. two enables that OVERLAP must be serialized — the second sees the first's bind and is idempotent, so it never
 *    rotates the token out from under the first's successful bind;
 * 2. a disable the listener does NOT confirm is not treated as done — the next disable asks the listener again.
 */

interface TestPorts {
  exposure: InboundExposure;
  mintToken: () => string;
  askEnable: (token: string) => Promise<{ ok: true; port: number } | { ok: false; outcome: CommandOutcome }>;
  askDisable: () => Promise<boolean>;
}

function ports(over: Partial<TestPorts> = {}): TestPorts {
  let n = 0;
  return {
    exposure: new InboundExposure(),
    mintToken: () => `tok-${++n}`,
    askEnable: async () => ({ ok: true as const, port: 51234 }),
    askDisable: async () => true,
    ...over,
  };
}

const okValue = (o: CommandOutcome): unknown => (o.ok ? o.value : undefined);

describe('REQ-MCP-120/121 (MAJOR): two overlapping enables are serialized', () => {
  it('the second enable joins the first — one rotation, one bind, the first token in force', async () => {
    const p = ports();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let asks = 0;
    let bound = false;
    p.askEnable = async (token) => { asks += 1; await gate; bound = true; p.exposure.turnOn(token); p.exposure.bound(51234); return { ok: true, port: 51234 }; };
    const seq = createInboundEnableSequencer(p);
    const first = seq.enable();
    const second = seq.enable();
    release();
    const [a, b] = await Promise.all([first, second]);
    // Exactly ONE ask reached the listener, and both answers show the same exposure (no drift).
    expect(asks).toBe(1);
    expect(a.ok && b.ok).toBe(true);
    expect(okValue(a)).toMatchObject({ enabled: true, port: 51234, token: 'tok-1' });
    expect(okValue(b)).toMatchObject({ enabled: true, port: 51234, token: 'tok-1' });
    expect(bound).toBe(true);
  });

  it('a repeat once bound is idempotent: no fresh token, no second bind', async () => {
    const p = ports();
    let asks = 0;
    p.askEnable = async (token) => { asks += 1; p.exposure.turnOn(token); p.exposure.bound(51234); return { ok: true, port: 51234 }; };
    const seq = createInboundEnableSequencer(p);
    const a = await seq.enable();
    const b = await seq.enable();
    expect(asks).toBe(1);
    expect(okValue(a)).toMatchObject({ token: 'tok-1' });
    // A repeat is a READ of the exposure: the token was shown once, on the enabling press, so it does not ride again.
    expect(okValue(b)).toEqual({ enabled: true, port: 51234 });
  });

  it('a failed bind leaves the exposure off and the token revoked', async () => {
    const p = ports();
    p.askEnable = async () => ({ ok: false, outcome: { ok: false, code: 'inbound.bindFailed', headline: 'could not bind' } });
    const seq = createInboundEnableSequencer(p);
    const out = await seq.enable();
    expect(out.ok).toBe(false);
    expect(p.exposure.view(true)).toEqual({ enabled: false, port: null });
    expect(seq.listenerBound()).toBe(false);
  });
});

describe('REQ-MCP-120/121 (MAJOR): a non-confirmed disable is retried, not treated as done', () => {
  it('after a timed-out disable, the NEXT disable asks the listener again', async () => {
    const p = ports();
    p.askEnable = async (token) => { p.exposure.turnOn(token); p.exposure.bound(51234); return { ok: true, port: 51234 }; };
    const seq = createInboundEnableSequencer(p);
    await seq.enable();
    let disableAsks = 0;
    let confirm = false;
    p.askDisable = async () => { disableAsks += 1; return confirm; };
    const first = await seq.disable();
    expect(first.ok).toBe(false); // the listener did not confirm
    expect(seq.listenerBound()).toBe(true);
    // Second disable: main's exposure is off, but the listener may still hold a socket, so it must ask AGAIN.
    confirm = true;
    const second = await seq.disable();
    expect(disableAsks).toBe(2);
    expect(second.ok).toBe(true);
    expect(seq.listenerBound()).toBe(false);
  });

  it('a disable with nothing on and nothing bound asks nothing', async () => {
    const p = ports();
    let asks = 0;
    p.askDisable = async () => { asks += 1; return true; };
      const seq = createInboundEnableSequencer(p);
    const out = await seq.disable();
    expect(asks).toBe(0);
    expect(out).toEqual({ ok: true, value: { enabled: false, port: null } });
  });
});
