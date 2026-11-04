import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { CONTRACT_SCHEMA_VERSION, type ProcessReply, type ServiceAnswerEnvelope } from '@rotaris/contracts';
import { NoReplyWithinBound, ProcessLink, type MessagePortLike, type ProcessLinkLog } from './process-link.js';

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

/** OQ-485: a link whose refusal lines nobody reads, for the cases about something else. */
const quiet = (): ProcessLinkLog => ({ boundary: 'run host', warn: () => {} });

/** OQ-485: a link whose refusal lines are kept, in order. */
function captured(boundary: string): { log: ProcessLinkLog; lines: string[] } {
  const lines: string[] = [];
  return { log: { boundary, warn: (line) => { lines.push(line); } }, lines };
}

/** Put in every value a refused message carries: a line that holds it has carried a value. */
const MARKER = 'PAYLOAD-MARKER-485';

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
    const link = new ProcessLink(port, clock, quiet());
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
    const link = new ProcessLink(port, clock, quiet());
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
    const link = new ProcessLink(port, clock, quiet());
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
  it('OQ-485: drops a message the protocol cannot read with one warning line naming the child, the class and the pending id, never a value, and answers the next valid one', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const { log, lines } = captured('run host');
    const link = new ProcessLink(port, clock, log);
    const asked = link.request({ kind: 'ping' }, millis(1_000));
    // One message of each class, each carrying the marker in every value it has.
    deliver({ v: CONTRACT_SCHEMA_VERSION + 1, id: 1, reply: { kind: 'refused', code: MARKER, headline: MARKER } });
    deliver(reply(1, { kind: `${MARKER}.kind` } as unknown as ProcessReply));
    deliver({ v: CONTRACT_SCHEMA_VERSION, event: { kind: 'log', level: MARKER, message: 42 } });
    expect(lines).toEqual([
      `refused a message from the run host (wrong version): contract version ${CONTRACT_SCHEMA_VERSION + 1} against this build's ${CONTRACT_SCHEMA_VERSION}; request 1 still waits to its bound; dropped (OQ-485)`,
      'refused a message from the run host (unknown kind): a reply of a kind main does not know; request 1 still waits to its bound; dropped (OQ-485)',
      'refused a message from the run host (unreadable): an event main cannot read at event.level, event.message; dropped (OQ-485)',
    ]);
    expect(lines.join('\n')).not.toContain(MARKER);
    expect(await settled(asked)).toBe(false);
    deliver(reply(1, pong));
    await expect(asked).resolves.toEqual(pong);
    link.close();
    // Each window counted nothing past its first line, so closing the link writes nothing more.
    expect(lines).toHaveLength(3);
  });

  it('OQ-485: a request whose only reply was refused still ends NoReplyWithinBound at its bound (ADR-0002 consequence 11(b) unchanged)', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const { log, lines } = captured('run host');
    const link = new ProcessLink(port, clock, log);
    const asked = link.request({ kind: 'ping' }, millis(2_000));
    deliver({ v: 'one', id: 1, reply: pong });
    expect(lines).toEqual(["refused a message from the run host (wrong version): contract version not a number against this build's 1; request 1 still waits to its bound; dropped (OQ-485)"]);
    clock.advance(1_999);
    expect(await settled(asked)).toBe(false);
    clock.advance(1);
    await expect(asked).rejects.toBeInstanceOf(NoReplyWithinBound);
    link.close();
  });

  it('OQ-485: what is not an object, or no reply, event or ask, is unreadable; an id nothing waits for is said to be so', () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const { log, lines } = captured('workspace service for C:/ws');
    const link = new ProcessLink(port, clock, log);
    deliver(MARKER);
    clock.advance(60_000);
    deliver({ v: CONTRACT_SCHEMA_VERSION, id: 9, note: MARKER });
    clock.advance(60_000);
    deliver({ v: CONTRACT_SCHEMA_VERSION, ask: 1, request: { kind: MARKER } });
    deliver({ v: CONTRACT_SCHEMA_VERSION, id: -1, reply: pong });
    expect(lines).toEqual([
      'refused a message from the workspace service for C:/ws (unreadable): not an object; dropped (OQ-485)',
      'refused a message from the workspace service for C:/ws (unreadable): neither a reply, an event nor an ask; request 9 is not waiting; dropped (OQ-485)',
      'refused a message from the workspace service for C:/ws (unknown kind): an ask of a kind main does not know; dropped (OQ-485)',
      'refused a message from the workspace service for C:/ws (unreadable): a reply main cannot read at id; request -1 is not waiting; dropped (OQ-485)',
    ]);
    expect(lines.join('\n')).not.toContain(MARKER);
    link.close();
  });

  it('OQ-485: a kind main does not know deeper in a body it knows is a shape it cannot read, not an unknown kind', () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const { log, lines } = captured('workspace service for C:/ws');
    const link = new ProcessLink(port, clock, log);
    const report = { ok: false, abandoned: true, refusal: { why: MARKER }, leftovers: [], steps: [], restoredInto: 'C:/ws', identifierEstablished: false };
    deliver(reply(4, { kind: 'workspace.restored', report } as unknown as ProcessReply));
    expect(lines).toEqual(['refused a message from the workspace service for C:/ws (unreadable): a reply main cannot read at reply.report.refusal.why; request 4 is not waiting; dropped (OQ-485)']);
    link.close();
  });

  it('OQ-485: a burst is folded per class — the first in full, one count line when the 60 s window closes, and a new window after it', () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const { log, lines } = captured('run host');
    const link = new ProcessLink(port, clock, log);
    const stale = { v: CONTRACT_SCHEMA_VERSION + 1, event: { kind: 'log', level: 'info', message: MARKER } };
    for (let i = 0; i < 1_000; i += 1) deliver(stale);
    deliver(null); // another class: a window of its own, written in full
    expect(lines).toHaveLength(2);
    clock.advance(59_999);
    expect(lines).toHaveLength(2);
    clock.advance(1);
    expect(lines.slice(2)).toEqual(['refused 999 more messages from the run host (wrong version) within 60 s of the first; dropped (OQ-485)']);
    deliver(stale);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toMatch(/^refused a message from the run host \(wrong version\)/);
    expect(lines.join('\n')).not.toContain(MARKER);
    link.close();
  });

  it('OQ-485: the link\'s end and its close each write the count of every window still open', () => {
    const clock = new FakeClock();
    const ending = fakePort();
    const ended = captured('run host');
    const link = new ProcessLink(ending.port, clock, ended.log);
    for (let i = 0; i < 3; i += 1) ending.deliver(42);
    link.end({ kind: 'refused', code: 'child.gone', headline: 'the run host is gone' });
    expect(ended.lines).toEqual(['refused a message from the run host (unreadable): not an object; dropped (OQ-485)', 'refused 2 more messages from the run host (unreadable) within 60 s of the first; dropped (OQ-485)']);
    expect(clock.pendingCount()).toBe(0);
    const closing = fakePort();
    const closed = captured('run host');
    const other = new ProcessLink(closing.port, clock, closed.log);
    closing.deliver(42);
    closing.deliver(43);
    other.close();
    expect(closed.lines[1]).toBe('refused 1 more message from the run host (unreadable) within 60 s of the first; dropped (OQ-485)');
    expect(clock.pendingCount()).toBe(0);
  });

  it('ignores a reply for an id it never asked, and keeps the request it did ask pending', async () => {
    const clock = new FakeClock();
    const { port, deliver } = fakePort();
    const link = new ProcessLink(port, clock, quiet());
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
    const link = new ProcessLink(port, clock, quiet());
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
    const link = new ProcessLink(port, clock, quiet());
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
