import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, type ProcessReply, type ServiceAnswerEnvelope } from '@rotaris/contracts';
import { NoReplyWithinBound, ProcessLink, type MessagePortLike } from './process-link.js';

/**
 * Main's side of the process protocol (ADR-0002; consequence 11: every request is bounded, and expiry refuses) over a
 * fake port, with the deadline on `FakeClock`. R-091 (`docs/architecture/hardening.md` §3.5 row 7, F3): until
 * 2026-11-04 the link was reached only through main's composition.
 */

/** A port whose far side is the test: what the link posts is kept, and `deliver` is the child sending a message. */
function fakePort(): { port: MessagePortLike; posted: unknown[]; deliver: (message: unknown) => void; listening: () => number } {
  const listeners = new Set<(message: unknown) => void>();
  const posted: unknown[] = [];
  return {
    port: { postMessage: (message) => { posted.push(message); }, onMessage: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; } },
    posted,
    deliver: (message) => { for (const fn of [...listeners]) fn(message); },
    listening: () => listeners.size,
  };
}

const reply = (id: number, r: ProcessReply): unknown => ({ v: CONTRACT_SCHEMA_VERSION, id, reply: r });
const pong: ProcessReply = { kind: 'pong' };

/** Whether a promise has settled, read after the microtasks the settlement needs have run. */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false;
  p.then(() => { done = true; }, () => { done = true; });
  await Promise.resolve();
  await Promise.resolve();
  return done;
}

describe('ProcessLink — every request bounded (ADR-0002 consequence 11)', () => {
  it('a reply within the bound resolves the request and cancels its deadline', async () => {
    const clock = new FakeClock();
    const { port, posted, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const asked = link.request({ kind: 'ping' }, millis(1_000));
    expect(posted).toEqual([{ v: CONTRACT_SCHEMA_VERSION, id: 1, request: { kind: 'ping' } }]);
    clock.advance(999);
    deliver(reply(1, pong));
    await expect(asked).resolves.toEqual(pong);
    // The deadline was cancelled with the reply: nothing is left to fire, and passing the bound changes nothing.
    expect(clock.pendingCount()).toBe(0);
    clock.advance(10_000);
    link.close();
  });

  it('no reply within the bound rejects NoReplyWithinBound at the bound — not a millisecond before', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const asked = link.request({ kind: 'ping' }, millis(2_000));
    clock.advance(1_999);
    expect(await settled(asked)).toBe(false);
    clock.advance(1);
    const refused = await asked.then(() => null, (cause: unknown) => cause);
    expect(refused).toBeInstanceOf(NoReplyWithinBound);
    expect((refused as Error).name).toBe('NoReplyWithinBound');
    expect((refused as Error).message).toBe('no reply to ping within 2000 ms');
    // A reply that arrives after the bound finds nothing pending: it is ignored, and nothing throws.
    expect(() => deliver(reply(1, pong))).not.toThrow();
    link.close();
  });

  it('two requests in flight are told apart by id, answered out of order, each with its own deadline', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const first = link.request({ kind: 'ping' }, millis(1_000));
    const second = link.request({ kind: 'ping' }, millis(5_000));
    deliver(reply(2, { kind: 'refused', code: 'second', headline: 'the second' }));
    await expect(second).resolves.toEqual({ kind: 'refused', code: 'second', headline: 'the second' });
    clock.advance(1_000);
    await expect(first).rejects.toBeInstanceOf(NoReplyWithinBound);
    link.close();
  });
});

describe('ProcessLink — what it reads from the port', () => {
  it('drops a message the protocol cannot read, and answers the next valid one (OQ-485: the drop leaves no line)', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const asked = link.request({ kind: 'ping' }, millis(1_000));
    // A reply with no body, one from another contract version, one whose reply is no reply kind, and no object at all.
    for (const invalid of [{ v: CONTRACT_SCHEMA_VERSION, id: 1 }, { v: CONTRACT_SCHEMA_VERSION + 1, id: 1, reply: pong }, reply(1, { kind: 'no.such.reply' } as unknown as ProcessReply), null, 'pong', 42]) {
      expect(() => deliver(invalid)).not.toThrow();
    }
    expect(await settled(asked)).toBe(false);
    deliver(reply(1, pong));
    await expect(asked).resolves.toEqual(pong);
    link.close();
  });

  it('ignores a reply for an id it never asked, and keeps the request it did ask pending', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const asked = link.request({ kind: 'ping' }, millis(1_000));
    deliver(reply(99, { kind: 'refused', code: 'stray', headline: 'a reply nobody asked for' }));
    expect(await settled(asked)).toBe(false);
    expect(clock.pendingCount()).toBe(1);
    deliver(reply(1, pong));
    await expect(asked).resolves.toEqual(pong);
    link.close();
  });

  it('answers a child\'s ask with its handler, refuses it with none set, and refuses it when the handler rejects (ADR-0002 c.7)', async () => {
    const clock = new FakeClock();
    const { port, posted, deliver } = fakePort();
    const link = new ProcessLink(port, clock);
    const ask = (n: number): unknown => ({ v: CONTRACT_SCHEMA_VERSION, ask: n, request: { kind: 'runHost.release', workspaceId: 'w' } });
    const answers = (): ServiceAnswerEnvelope[] => posted.filter((m): m is ServiceAnswerEnvelope => typeof m === 'object' && m !== null && 'ask' in m);
    deliver(ask(1));
    expect(answers()).toEqual([{ v: CONTRACT_SCHEMA_VERSION, ask: 1, reply: { kind: 'refused', code: 'ask.unhandled', headline: 'main does not answer this request' } }]);
    link.onAsk((request) => (request.kind === 'runHost.release' ? Promise.resolve(pong) : Promise.reject(new Error('unexpected'))));
    deliver(ask(2));
    await Promise.resolve();
    await Promise.resolve();
    expect(answers()[1]).toEqual({ v: CONTRACT_SCHEMA_VERSION, ask: 2, reply: pong });
    link.onAsk(() => Promise.reject(new Error('the store is gone')));
    deliver(ask(3));
    await Promise.resolve();
    await Promise.resolve();
    expect(answers()[2]).toEqual({ v: CONTRACT_SCHEMA_VERSION, ask: 3, reply: { kind: 'refused', code: 'ask.failed', headline: 'Error: the store is gone' } });
    link.close();
  });
});

describe('ProcessLink — close', () => {
  it('rejects every pending request, cancels their deadlines and stops reading the port', async () => {
    const clock = new FakeClock();
    const { port, deliver, listening } = fakePort();
    const link = new ProcessLink(port, clock);
    const events: unknown[] = [];
    link.onEvent((e) => { events.push(e); });
    const first = link.request({ kind: 'ping' }, millis(1_000));
    const second = link.request({ kind: 'ping' }, millis(1_000));
    expect(listening()).toBe(1);
    link.close();
    await expect(first).rejects.toThrow('link closed');
    await expect(second).rejects.toThrow('link closed');
    // A closed link is told apart from a deadline: the rejection is not NoReplyWithinBound.
    await expect(first).rejects.not.toBeInstanceOf(NoReplyWithinBound);
    expect(clock.pendingCount()).toBe(0);
    expect(listening()).toBe(0);
    deliver({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: 'info', message: 'after the close' } });
    expect(events).toEqual([]);
  });
});
