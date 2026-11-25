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
  askEnable: (token: string) => Promise<{ ok: true; port: number } | { ok: false; outcome: CommandOutcome; definite: boolean }>;
  askDisable: () => Promise<boolean>;
  /** The listener's own state, read to resolve a bind question left open by an unanswered enable. */
  askState: () => Promise<{ listening: boolean; port: number | null } | null>;
}

function ports(over: Partial<TestPorts> = {}): TestPorts {
  let n = 0;
  return {
    exposure: new InboundExposure(),
    mintToken: () => `tok-${++n}`,
    askEnable: async () => ({ ok: true as const, port: 51234 }),
    askDisable: async () => true,
    askState: async () => null,
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
    // The second enable is a QUEUED gesture, not a join (review 5, point 1): it finds the surface bound and reads the
    // exposure — same port, and the token is shown once, on the enabling press alone.
    expect(okValue(b)).toEqual({ enabled: true, port: 51234 });
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
    p.askEnable = async () => ({ ok: false, outcome: { ok: false, code: 'inbound.bindFailed', headline: 'could not bind' }, definite: true });
    const seq = createInboundEnableSequencer(p);
    const out = await seq.enable();
    expect(out.ok).toBe(false);
    expect(p.exposure.view(true)).toEqual({ enabled: false, port: null });
    expect(seq.listenerBound()).toBe(false);
  });
});

describe('REQ-MCP-120/121 (MAJOR of review 5): a timeout leaves the bind question OPEN, and the next gesture resolves it', () => {
  it('an enable that TIMED OUT leaves listenerBound true, and a following disable still reaches the listener', async () => {
    const p = ports();
    let disableAsks = 0;
    // The enable's ask is answered with a no-reply: the listener may still be binding with the token it was handed.
    p.askEnable = async () => ({ ok: false, outcome: { ok: false, code: 'inbound.unreachable', headline: 'did not answer' }, definite: false });
    p.askDisable = async () => { disableAsks += 1; return true; };
    const seq = createInboundEnableSequencer(p);
    const out = await seq.enable();
    expect(out.ok).toBe(false);
    // Main does NOT claim the listener is off: the bind question is open, so a disable must still reach it.
    expect(seq.listenerBound()).toBe(true);
    const off = await seq.disable();
    expect(disableAsks).toBe(1);
    expect(off.ok).toBe(true);
    expect(seq.listenerBound()).toBe(false);
  });

  it('the NEXT enable after a timeout READS the listener: listening adopts the token already handed over (no rotation)', async () => {
    const p = ports();
    const handed: string[] = [];
    let bound: number | null = null;
    // The first enable is not answered; the listener in fact bound on the token it was handed.
    p.askEnable = async (token) => { handed.push(token); return bound === null ? { ok: false, outcome: { ok: false, code: 'inbound.unreachable', headline: 'did not answer' }, definite: false } : { ok: true, port: bound }; };
    const seq = createInboundEnableSequencer(p);
    await seq.enable();
    bound = 51234;
    // The listener's own state says it IS listening: main adopts the SAME token it handed over.
    p.askState = async () => ({ listening: true, port: 51234 });
    const second = await seq.enable();
    expect(second.ok).toBe(true);
    // One token was ever minted, so the display and the listener agree on it.
    expect(handed).toEqual(['tok-1']);
    expect(okValue(second)).toMatchObject({ enabled: true, port: 51234, token: 'tok-1' });
  });

  it('the next enable after a timeout whose bind never landed closes the question and binds fresh', async () => {
    const p = ports();
    const handed: string[] = [];
    p.askEnable = async (token) => {
      handed.push(token);
      return handed.length === 1
        ? { ok: false, outcome: { ok: false, code: 'inbound.unreachable', headline: 'did not answer' }, definite: false }
        : { ok: true, port: 51234 };
    };
    const seq = createInboundEnableSequencer(p);
    await seq.enable();
    p.askState = async () => ({ listening: false, port: null });
    const second = await seq.enable();
    expect(second.ok).toBe(true);
    // The stale token is discarded and a fresh one is minted for the new exposure.
    expect(handed).toEqual(['tok-1', 'tok-2']);
    expect(okValue(second)).toMatchObject({ token: 'tok-2' });
  });

  it('Enable → Disable → Enable performs the LAST enable: the gesture in between is never skipped', async () => {
    const p = ports();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const handed: string[] = [];
    p.askEnable = async (token) => { handed.push(token); if (handed.length === 1) { await gate; } p.exposure.turnOn(token); p.exposure.bound(51234); return { ok: true, port: 51234 }; };
    let disableAsks = 0;
    p.askDisable = async () => { disableAsks += 1; return true; };
    const seq = createInboundEnableSequencer(p);
    const first = seq.enable();
    const off = seq.disable();
    const second = seq.enable();
    release();
    const [a, b, c] = await Promise.all([first, off, second]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    // The disable reached the listener, and the LAST enable was performed — the surface ends ON, not off.
    expect(disableAsks).toBe(1);
    expect(c.ok).toBe(true);
    expect(handed).toHaveLength(2);
    expect(p.exposure.view(false)).toMatchObject({ enabled: true, port: 51234 });
    expect(seq.listenerBound()).toBe(true);
  });
});

describe('REQ-MCP-120/121 (MAJOR of review 4): a disable behind an in-flight enable actually disables', () => {
  it('a disable that arrives while an enable is still binding waits for it, then asks the listener to unbind', async () => {
    const p = ports();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let disableAsks = 0;
    // The enable binds only when released, so the disable genuinely overlaps it (the fault of review 4: the disable read
    // both flags as false, skipped the listener, and the enable's reply then switched the exposure ON).
    p.askEnable = async (token) => { await gate; p.exposure.turnOn(token); p.exposure.bound(51234); return { ok: true, port: 51234 }; };
    p.askDisable = async () => { disableAsks += 1; return true; };
    const seq = createInboundEnableSequencer(p);
    const enabling = seq.enable();
    const disabling = seq.disable();
    release();
    const [on, off] = await Promise.all([enabling, disabling]);
    expect(on.ok).toBe(true);
    // The disable ASKED the listener (it did not skip it on a stale `enabled === false`), confirmed, and the surface is off.
    expect(disableAsks).toBe(1);
    expect(off.ok).toBe(true);
    expect(p.exposure.view(false)).toEqual({ enabled: false, port: null });
    expect(seq.listenerBound()).toBe(false);
  });

  it('a disable queued behind an enable whose bind FAILED still ends off, and asks nothing it must not', async () => {
    const p = ports();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let disableAsks = 0;
    p.askEnable = async () => { await gate; return { ok: false, outcome: { ok: false, code: 'inbound.bindFailed', headline: 'could not bind' }, definite: true }; };
    p.askDisable = async () => { disableAsks += 1; return true; };
    const seq = createInboundEnableSequencer(p);
    const enabling = seq.enable();
    const disabling = seq.disable();
    release();
    await enabling;
    const off = await disabling;
    // Nothing was ever bound, so the disable has nothing to ask and reports the surface off.
    expect(disableAsks).toBe(0);
    expect(off.ok).toBe(true);
    expect(p.exposure.view(false)).toEqual({ enabled: false, port: null });
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
