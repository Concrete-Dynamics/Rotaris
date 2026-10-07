import { describe, expect, it } from 'vitest';
import { activeRunCloseBox, anotherMainWindowStays, confirmActiveRunClose, windowCloseBox, type ActiveRunCloseDeps } from './close-confirmation.js';

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

  it('asks nothing when another main window stays open and the closing window holds no workspace, and reads no count', async () => {
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

describe('the close of one of several main windows ends its own project\'s runs, asking first (PD-SHELL-009, REQ-STARTUP-046)', () => {
  /** A non-last window on a workspace: `others` stays, the instance holds `instance` runs and the window's workspace `own`. */
  function several(over: { own?: () => Promise<number | null>; instance?: number; answer?: number; stop?: () => Promise<void>; ask?: ActiveRunCloseDeps['ask'] }, order: string[] = [], asked: { message: string; detail: string }[] = [], logged: string[] = []): ActiveRunCloseDeps {
    return {
      othersStaying: () => true,
      activeRuns: async () => { order.push('instance count'); return over.instance ?? 3; },
      workspaceRuns: over.own ?? (async () => { order.push('workspace count'); return 1; }),
      stopWorkspaceRuns: over.stop ?? (async () => { order.push('stop'); }),
      ask: over.ask ?? (async (box) => { order.push('ask'); asked.push(box); return over.answer ?? 0; }),
      log: (m) => logged.push(m),
    };
  }

  it('the window box names this window and its project\'s runs, with REQ-STARTUP-046\'s two answers, Cancel first and the default', () => {
    const one = windowCloseBox(1);
    expect(one.title).toBe('Close this window while a run is active?');
    expect(one.message).toBe('Close this window while a run is active?');
    expect(one.detail).toBe('A run is still executing in this project. Closing this window ends it: Rotaris will stop the run, and work in flight may not finish. Choose Cancel to return to the window and let it finish.');
    expect(one.buttons).toEqual(['Cancel', 'Yes']);
    expect(one.defaultId).toBe(0);
    expect(one.cancelId).toBe(0);
    expect(windowCloseBox(2).message).toBe('Close this window while 2 runs are active?');
    expect(windowCloseBox(2).detail).toBe('2 runs are still executing in this project. Closing this window ends them: Rotaris will stop the runs, and work in flight may not finish. Choose Cancel to return to the window and let them finish.');
    expect(windowCloseBox(null).message).toBe('Close this window while a run is active?');
  });

  it('a window whose own workspace has a run active asks the window box over its own count, and Yes stops those runs before the close goes on', async () => {
    const order: string[] = [];
    const asked: { message: string; detail: string }[] = [];
    expect(await confirmActiveRunClose(several({ answer: 1 }, order, asked))).toBe(true);
    expect(order).toEqual(['workspace count', 'ask', 'stop']);
    expect(asked.map((b) => b.message)).toEqual(['Close this window while a run is active?']);
  });

  it('Cancel (the default, Escape, the close control) aborts the close and stops nothing', async () => {
    const order: string[] = [];
    expect(await confirmActiveRunClose(several({ answer: 0 }, order))).toBe(false);
    expect(order).toEqual(['workspace count', 'ask']);
  });

  it('a window whose own workspace is idle closes without asking, whatever runs elsewhere, and touches no run', async () => {
    const order: string[] = [];
    expect(await confirmActiveRunClose(several({ own: async () => { order.push('workspace count'); return 0; }, instance: 4 }, order))).toBe(true);
    expect(order).toEqual(['workspace count']);
  });

  it('a workspace count that cannot be read asks the window box', async () => {
    const asked: { message: string; detail: string }[] = [];
    expect(await confirmActiveRunClose(several({ own: async () => { throw new Error('the run host is gone'); }, answer: 1 }, [], asked))).toBe(true);
    expect(asked.map((b) => b.message)).toEqual(['Close this window while a run is active?']);
  });

  it('a window box that cannot be shown keeps the window and stops nothing', async () => {
    const order: string[] = [];
    const logged: string[] = [];
    expect(await confirmActiveRunClose(several({ ask: async () => { throw new Error('no display'); } }, order, [], logged))).toBe(false);
    expect(order).toEqual(['workspace count']);
    expect(logged.some((l) => l.includes('could not be shown'))).toBe(true);
  });

  it('a stop the run host refuses is logged, and the close the person confirmed goes on', async () => {
    const logged: string[] = [];
    expect(await confirmActiveRunClose(several({ answer: 1, stop: async () => { throw new Error('refused'); } }, [], [], logged))).toBe(true);
    expect(logged.some((l) => l.includes('could not be stopped'))).toBe(true);
  });

  it('the last window asks as before: REQ-SHELL-119\'s question over the instance count, and stops nothing itself (the quit does)', async () => {
    const order: string[] = [];
    const asked: { message: string; detail: string }[] = [];
    expect(await confirmActiveRunClose({ ...several({ answer: 1 }, order, asked), othersStaying: () => false })).toBe(true);
    expect(order).toEqual(['instance count', 'ask']);
    expect(asked.map((b) => b.message)).toEqual(['Quit while 3 runs are active?']);
  });
});

describe('which main windows stay at a close (PD-SHELL-009, REQ-STARTUP-161)', () => {
  const open = (wcId: number, destroyed = false) => ({ wcId, win: { isDestroyed: () => destroyed } });
  const none = () => false;

  it('the last main window stays alone: nothing else stays, so the close asks', () => {
    expect(anotherMainWindowStays([open(1)], 1, none)).toBe(false);
  });

  it('another open main window stays: the close ends only its own workspace\'s runs', () => {
    expect(anotherMainWindowStays([open(1), open(2)], 1, none)).toBe(true);
  });

  it('a window already destroyed, or one whose close is already confirmed, does not stay', () => {
    expect(anotherMainWindowStays([open(1), open(2, true)], 1, none)).toBe(false);
    expect(anotherMainWindowStays([open(1), open(2)], 1, (id) => id === 2)).toBe(false);
    expect(anotherMainWindowStays([open(1), open(2), open(3)], 1, (id) => id === 2)).toBe(true);
  });
});
