import { describe, expect, it } from 'vitest';
import { activeRunCloseBox, confirmActiveRunClose, type ActiveRunCloseDeps } from './close-confirmation.js';

function deps(over: Partial<ActiveRunCloseDeps> & { answer?: number }, asked: unknown[] = [], logged: string[] = []): ActiveRunCloseDeps {
  return {
    othersStaying: () => false,
    activeRuns: async () => 1,
    ask: async (box) => { asked.push(box); return over.answer ?? 0; },
    log: (m) => logged.push(m),
    ...over,
  };
}

describe('the active-run confirmation at a window\'s close (REQ-STARTUP-046, REQ-SHELL-119)', () => {
  it('asks REQ-SHELL-119\'s question with Cancel first, the default, and Escape\'s answer', () => {
    const one = activeRunCloseBox(1);
    expect(one.title).toBe('Quit while a run is active?');
    expect(one.message).toBe('Quit while a run is active?');
    expect(one.buttons).toEqual(['Cancel', 'Yes']);
    expect(one.defaultId).toBe(0);
    expect(one.cancelId).toBe(0);
    expect(activeRunCloseBox(3).message).toBe('Quit while 3 runs are active?');
    expect(activeRunCloseBox(null).message).toBe('Quit while a run is active?');
  });

  it('conveys that a run is executing, that closing ends it with shutdown requested, and that Cancel returns to let it finish', () => {
    const { detail } = activeRunCloseBox(1);
    expect(detail).toContain('A run is still executing.');
    expect(detail).toContain('Closing this window ends it');
    expect(detail).toContain('Rotaris will request shutdown of the run, and work in flight may not finish.');
    expect(detail).toContain('Cancel to return to the window and let it finish.');
    expect(activeRunCloseBox(2).detail).toContain('2 runs are still executing. Closing this window ends them');
  });

  it('asks nothing when no run is active', async () => {
    const asked: unknown[] = [];
    expect(await confirmActiveRunClose(deps({ activeRuns: async () => 0 }, asked))).toBe(true);
    expect(asked).toEqual([]);
  });

  it('asks nothing when another main window stays open, and does not read the count', async () => {
    const asked: unknown[] = [];
    let read = false;
    expect(await confirmActiveRunClose(deps({ othersStaying: () => true, activeRuns: async () => { read = true; return 2; } }, asked))).toBe(true);
    expect(asked).toEqual([]);
    expect(read).toBe(false);
  });

  it('closes only on Yes; Cancel (the default, Escape, the close control) aborts the close', async () => {
    expect(await confirmActiveRunClose(deps({ answer: 1 }))).toBe(true);
    expect(await confirmActiveRunClose(deps({ answer: 0 }))).toBe(false);
  });

  it('a count that cannot be read asks', async () => {
    const asked: { message: string }[] = [];
    expect(await confirmActiveRunClose(deps({ activeRuns: async () => { throw new Error('the run host is gone'); }, answer: 1 }, asked))).toBe(true);
    expect(asked.map((b) => b.message)).toEqual(['Quit while a run is active?']);
  });

  it('a box that cannot be shown keeps the window', async () => {
    const logged: string[] = [];
    expect(await confirmActiveRunClose(deps({ ask: async () => { throw new Error('no display'); } }, [], logged))).toBe(false);
    expect(logged.some((l) => l.includes('could not be shown'))).toBe(true);
  });
});
