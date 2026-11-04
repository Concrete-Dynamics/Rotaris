import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { REFUSAL_FOLD_WINDOW_MS, RefusalFold, refusalPaths } from './refusal-fold.js';

/**
 * OQ-485 (ruled 2026-11-04): the bound on refusal lines both of main's boundaries share — per class, the first in full, the
 * rest of a 60 s window counted into one line at its close or the boundary's end — on `FakeClock`, and the issue paths a
 * line may name, capped so they cannot become a payload.
 */
describe('RefusalFold (OQ-485)', () => {
  const fold = () => {
    const clock = new FakeClock();
    const lines: string[] = [];
    let built = 0;
    const f = new RefusalFold(clock, (line) => { lines.push(line); });
    const refuse = (cls: string) => { f.refuse(cls, () => { built += 1; return `first ${cls}`; }, (n) => `${n} more ${cls}`); };
    return { clock, lines, f, refuse, built: () => built };
  };

  it('writes the first refusal of a class in full, counts the rest of its window and writes the count when the window closes', () => {
    const { clock, lines, refuse, built } = fold();
    refuse('a');
    refuse('a');
    refuse('a');
    expect(lines).toEqual(['first a']);
    // The full line is built only when it is written: a refusal inside a window costs a count.
    expect(built()).toBe(1);
    clock.advance(REFUSAL_FOLD_WINDOW_MS - 1);
    expect(lines).toEqual(['first a']);
    clock.advance(1);
    expect(lines).toEqual(['first a', '2 more a']);
    expect(clock.pendingCount()).toBe(0);
  });

  it('keeps a window per class, and writes no count line for a window that counted nothing', () => {
    const { clock, lines, refuse } = fold();
    refuse('a');
    refuse('b');
    refuse('b');
    clock.advance(REFUSAL_FOLD_WINDOW_MS);
    expect(lines).toEqual(['first a', 'first b', '1 more b']);
  });

  it('opens a new window for the next refusal after one closed, so a flood writes at most two lines per class per window', () => {
    const { clock, lines, refuse } = fold();
    for (let minute = 0; minute < 3; minute += 1) {
      for (let i = 0; i < 100; i += 1) refuse('a');
      clock.advance(REFUSAL_FOLD_WINDOW_MS);
    }
    expect(lines).toEqual(['first a', '99 more a', 'first a', '99 more a', 'first a', '99 more a']);
  });

  it('flush closes every open window at once, each with its count, and cancels their timers', () => {
    const { clock, lines, f, refuse } = fold();
    refuse('a');
    refuse('a');
    refuse('b');
    f.flush();
    expect(lines).toEqual(['first a', 'first b', '1 more a']);
    expect(clock.pendingCount()).toBe(0);
    f.flush();
    expect(lines).toHaveLength(3);
  });
});

describe('refusalPaths (OQ-485)', () => {
  it('names at most three distinct paths, each at most four segments deep, a record key that is not a short identifier as [key]', () => {
    expect(refusalPaths([{ path: ['reply', 'kind'] }, { path: ['reply', 'kind'] }, { path: ['event', 'rows', 3, 'text'] }])).toEqual(['reply.kind', 'event.rows[3].text']);
    expect(refusalPaths([{ path: ['a', 'b', 'c', 'd', 'e'] }])).toEqual(['a.b.c.d…']);
    expect(refusalPaths([{ path: ['state', 'sk-live 0123456789abcdef'] }, { path: ['state', 'x'.repeat(33)] }])).toEqual(['state[key]']);
    expect(refusalPaths([{ path: [] }, { path: ['a'] }, { path: ['b'] }, { path: ['c'] }])).toEqual(['(the message)', 'a', 'b']);
  });
});
