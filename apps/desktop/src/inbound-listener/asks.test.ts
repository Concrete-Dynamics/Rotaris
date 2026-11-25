import { describe, expect, it } from 'vitest';
import { INBOUND_LISTENER_ASK_BOUND_MS, INBOUND_START_BOUND_MS } from '@rotaris/contracts';
import { FakeClock } from '@rotaris/kernel';
import { createInboundAsker } from './asks.js';

/**
 * REQ-MCP-123/124 (BLOCKER 1, 2026-11-25): the listener's one ask path, and the bound it waits on. Driven with a fake
 * clock and a stand-in main, so the two cases the review named are measured with no process, no port and no real timer:
 * a main that answers AFTER 30 s (but inside its own bound) still delivers the handle, and only a main past the
 * listener's own (derived) bound is a genuine timeout.
 */

function asker(clock: FakeClock, sent: unknown[]) {
  return createInboundAsker({ send: (m) => sent.push(m), timers: clock.timers });
}

describe('REQ-MCP-123/124 (BLOCKER 1): the ask bound is derived from main’s own start bound', () => {
  it('the listener bound is the shared figure, above main’s start bound', () => {
    expect(INBOUND_LISTENER_ASK_BOUND_MS).toBeGreaterThan(INBOUND_START_BOUND_MS);
  });

  it('a start main confirms only AFTER 30 s (inside main’s bound) still reaches the caller with its handle', async () => {
    const clock = new FakeClock();
    const sent: unknown[] = [];
    const a = asker(clock, sent);
    const asked = a.ask({ kind: 'inbound.startRun', prompt: 'p' });
    // Let the ask be posted, then advance 30 s — the OLD listener bound, at which point the caller used to be timed out.
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    const envelope = sent[0] as { ask: number };
    clock.advance(30_000);
    // Main answers now, with the handle it reserved (main's own bound is 60 s, so this is a normal, slow confirmation).
    expect(a.pending()).toBe(1);
    a.answer(envelope.ask, { kind: 'inbound.runStarted', run: `inr_${'a'.repeat(32)}`, sessionId: 'S-1' });
    await expect(asked).resolves.toMatchObject({ kind: 'inbound.runStarted', run: `inr_${'a'.repeat(32)}` });
  });

  it('only a main past the listener’s own bound is a timeout', async () => {
    const clock = new FakeClock();
    const a = asker(clock, []);
    const asked = a.ask({ kind: 'inbound.runStatus', run: `inr_${'a'.repeat(32)}` });
    await Promise.resolve();
    clock.advance(INBOUND_LISTENER_ASK_BOUND_MS + 1);
    await expect(asked).rejects.toThrow(/did not answer within/);
    expect(a.pending()).toBe(0);
  });
});
