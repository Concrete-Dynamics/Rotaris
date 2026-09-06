import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { ACKNOWLEDGEMENT_LIFETIME_MS, ACKNOWLEDGEMENT_STACK_DEPTH, createAcknowledgementStore } from './acknowledgements.js';

const titles = (s: ReturnType<typeof createAcknowledgementStore>) => s.getState().items.map((a) => a.title);

describe('the acknowledgement stack — REQ-NOTIFY-011 to REQ-NOTIFY-021', () => {
  it('declares the lifetime once, and the depth the requirement fixes', () => {
    expect(ACKNOWLEDGEMENT_LIFETIME_MS).toBe(4_200);
    expect(ACKNOWLEDGEMENT_STACK_DEPTH).toBe(3);
  });

  it('shows three at most, the fourth removing the oldest, and never reorders what stands', () => {
    const s = createAcknowledgementStore();
    for (const t of ['one', 'two', 'three']) s.getState().publish({ kind: 'info', title: t });
    expect(titles(s)).toEqual(['one', 'two', 'three']);
    s.getState().publish({ kind: 'ok', title: 'four' });
    // Oldest gone, the rest in the order they arrived: the newest is last, which the surface draws nearest the corner.
    expect(titles(s)).toEqual(['two', 'three', 'four']);
  });

  it('gives every member the lifetime of REQ-NOTIFY-011 unless the publisher names another', () => {
    const s = createAcknowledgementStore();
    s.getState().publish({ kind: 'info', title: 'default' });
    s.getState().publish({ kind: 'warn', title: 'explicit', timeoutMs: 9_000 });
    s.getState().publish({ kind: 'fail', title: 'until removed', timeoutMs: 0 });
    expect(s.getState().items.map((a) => a.timeoutMs)).toEqual([ACKNOWLEDGEMENT_LIFETIME_MS, 9_000, 0]);
  });

  it('removes one by identifier, and removing one already gone raises nothing (REQ-NOTIFY-020)', () => {
    const s = createAcknowledgementStore();
    const id = s.getState().publish({ kind: 'info', title: 'only' });
    s.getState().close(id);
    expect(titles(s)).toEqual([]);
    // The same instant its timer expires: the second removal is a no-op rather than a second event.
    expect(() => s.getState().close(id)).not.toThrow();
    expect(titles(s)).toEqual([]);
  });

  it('clears every visible member at once (REQ-NOTIFY-021)', () => {
    const s = createAcknowledgementStore();
    s.getState().publish({ kind: 'info', title: 'a' });
    s.getState().publish({ kind: 'ok', title: 'b' });
    s.getState().clearAll();
    expect(titles(s)).toEqual([]);
  });

  it('restarts a countdown, the non-expiring case included (REQ-NOTIFY-020)', () => {
    const s = createAcknowledgementStore();
    const id = s.getState().publish({ kind: 'info', title: 'held', timeoutMs: 0 });
    s.getState().restart(id, ACKNOWLEDGEMENT_LIFETIME_MS);
    expect(s.getState().items[0]?.timeoutMs).toBe(ACKNOWLEDGEMENT_LIFETIME_MS);
    s.getState().restart(999, 1_000);
    expect(s.getState().items).toHaveLength(1);
  });

  it('takes channel 8\'s payload and ignores a message it cannot read', () => {
    const s = createAcknowledgementStore();
    expect(s.getState().apply({ v: CONTRACT_SCHEMA_VERSION, kind: 'warn', title: 'from main', body: 'detail' })).toBe(true);
    expect(s.getState().items[0]).toMatchObject({ kind: 'warn', title: 'from main', body: 'detail' });
    expect(s.getState().apply({ v: CONTRACT_SCHEMA_VERSION, kind: 'nonsense', title: 'x' })).toBe(false);
    expect(s.getState().apply({ v: CONTRACT_SCHEMA_VERSION, kind: 'info', title: '' })).toBe(false);
    expect(s.getState().items).toHaveLength(1);
  });
});
