import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { followCoalesced } from './coalesced-follow.js';

/**
 * REQ-SHELL-076 with PD-ORCH-005 clause 13 (OQ-73): a persona window's replica reaches React through `followCoalesced`.
 * The case that matters: in REQ-CHAT-008's recovery state the fourteenth review round saw a persona window show the
 * run-level agent `paused` with "0 rows". The one route found to that picture is a transcript applied to the replica
 * after the window's first render read it and before the effect subscribed, since a session at rest publishes nothing
 * more. The subscription therefore delivers what the source holds as it is taken.
 */
function source<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    set: (next: T) => { value = next; for (const l of listeners) l(); },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    listeners,
  };
}
function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    set: (fn: () => void) => { const id = next++; pending.set(id, fn); return id; },
    clear: (h: unknown) => { pending.delete(h as number); },
    fire: () => { const fns = [...pending.values()]; pending.clear(); for (const fn of fns) fn(); },
    get size() { return pending.size; },
  };
}

describe('followCoalesced (REQ-SHELL-076; PD-ORCH-005 clause 13)', () => {
  it('delivers what was applied between the first read and the subscription, with nothing published after', () => {
    const s = source({ session: 'paused-root', rows: 0 });
    const firstRender = s.read();
    s.set({ session: 'paused-root', rows: 6 }); // the attach's transcript, applied before the effect ran
    const delivered: { session: string; rows: number }[] = [];
    followCoalesced({ subscribe: s.subscribe, read: s.read, deliver: (v) => delivered.push(v), hidden: () => false, intervalMs: 120, timers: manualTimers() });
    expect(firstRender.rows).toBe(0);
    expect(delivered).toEqual([{ session: 'paused-root', rows: 6 }]);
  });

  it('coalesces later changes into one trailing delivery per interval, and delivers nothing while hidden', () => {
    const s = source(0);
    const timers = manualTimers();
    let hidden = false;
    const delivered: number[] = [];
    const release = followCoalesced({ subscribe: s.subscribe, read: s.read, deliver: (v) => delivered.push(v), hidden: () => hidden, intervalMs: 120, timers });
    s.set(1); s.set(2); s.set(3);
    expect(timers.size).toBe(1);
    timers.fire();
    expect(delivered).toEqual([0, 3]);
    hidden = true;
    s.set(4);
    expect(timers.size).toBe(0);
    release();
    expect(s.listeners.size).toBe(0);
  });

  it('delivers nothing on subscribing while the window is hidden', () => {
    const s = source(1);
    const delivered: number[] = [];
    followCoalesced({ subscribe: s.subscribe, read: s.read, deliver: (v) => delivered.push(v), hidden: () => true, intervalMs: 120, timers: manualTimers() });
    expect(delivered).toEqual([]);
  });

  // The persona window mounts under Electron, which no `node` test reaches; what pins its wiring is its source.
  it('the persona window follows its replica through followCoalesced', () => {
    const text = readFileSync(new URL('./windows.tsx', import.meta.url), 'utf8');
    expect(text).toContain('useEffect(() => followCoalesced({');
    expect(text).not.toMatch(/replica\.subscribe\(\(\) =>/);
  });
});
