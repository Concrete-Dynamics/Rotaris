import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import { CHILD_CLOSE_BOUND_MS, exitAfterChildWindows, type ClosableWindow } from './exit.js';

/** A window whose destruction reports `closed` at once, later, or never. */
function win(opts: { parent: boolean; closes?: 'now' | 'never' }, log: string[], name: string): ClosableWindow & { closed: () => void } {
  let listener: (() => void) | null = null;
  let destroyed = false;
  return {
    isDestroyed: () => destroyed,
    getParentWindow: () => (opts.parent ? {} : null),
    once: (_e, l) => { listener = l; },
    destroy: () => { destroyed = true; log.push(`destroy ${name}`); if (opts.closes !== 'never') listener?.(); },
    closed: () => listener?.(),
  };
}

describe('an immediate exit that does not crash on Linux (exit.ts)', () => {
  function harness(windows: ClosableWindow[]) {
    const log: string[] = [];
    const clock = new FakeClock();
    const turns: (() => void)[] = [];
    const deps = { windows: () => windows, exit: (c: number) => log.push(`exit ${c}`), timers: clock, nextTurn: (fn: () => void) => turns.push(fn) };
    const turn = () => { for (const fn of turns.splice(0)) fn(); };
    return { log, clock, deps, turn };
  }

  it('destroys every child window, waits for each to close, and exits on the NEXT turn — never in the same one', () => {
    const log: string[] = [];
    const parent = win({ parent: false }, log, 'main');
    const dialog = win({ parent: true }, log, 'provider');
    const h = harness([parent, dialog]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 3);
    expect(log).toEqual(['destroy provider']);
    h.turn();
    expect(log).toEqual(['destroy provider', 'exit 3']);
  });

  it('with no child window it still exits on the next turn, and leaves the main window alone', () => {
    const log: string[] = [];
    const h = harness([win({ parent: false }, log, 'main')]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 0);
    h.turn();
    expect(log).toEqual(['exit 0']);
  });

  it('a child that never reports closed does not hold the process open past the bound, and the exit happens once', () => {
    const log: string[] = [];
    const stuck = win({ parent: true, closes: 'never' }, log, 'stuck');
    const h = harness([stuck]);
    exitAfterChildWindows({ ...h.deps, exit: (c) => log.push(`exit ${c}`) }, 0);
    h.clock.advance(CHILD_CLOSE_BOUND_MS - 1);
    h.turn();
    expect(log).toEqual(['destroy stuck']);
    h.clock.advance(1);
    h.turn();
    stuck.closed();
    h.turn();
    expect(log).toEqual(['destroy stuck', 'exit 0']);
  });
});
