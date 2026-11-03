import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '@rotaris/kernel';
import type { Liveness } from './liveness.js';
import { describeThrown, injectChildFault, installLastResort, LAST_RESORT_EXIT_STATUS, PARENT_GONE_EXIT_STATUS, PARENT_WATCH_PERIOD_MS, superviseUtilityProcess, watchParent } from './utility-process.js';

/** A fake `process`: the two events by hand, and the exits it was asked for. */
function fakeProcess(ppid = 4242) {
  const events = new EventEmitter();
  const exits: number[] = [];
  const self = {
    ppid,
    on(event: string, listener: (...args: never[]) => void) { events.on(event, listener as (...args: unknown[]) => void); return self; },
    exit(code: number) { exits.push(code); },
  };
  return { self, events, exits };
}

describe('the last-resort handler of a utility process (R-091, ADR-0002, PD-MONITOR-002)', () => {
  it('an uncaught exception writes ONE error line with the stack, then exits 70', () => {
    const { self, events, exits } = fakeProcess();
    const lines: string[] = [];
    installLastResort({ process: self, name: 'run host', logError: (m) => lines.push(m) });
    const e = new Error('boom');
    events.emit('uncaughtException', e);
    expect(exits).toEqual([LAST_RESORT_EXIT_STATUS]);
    expect(LAST_RESORT_EXIT_STATUS).toBe(70);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^an uncaught exception reached the run host's last-resort handler; ending with status 70/);
    expect(lines[0]).toContain(e.stack!);
  });

  it('an unhandled rejection does the same, naming the event', () => {
    const { self, events, exits } = fakeProcess();
    const lines: string[] = [];
    installLastResort({ process: self, name: 'workspace service', logError: (m) => lines.push(m) });
    events.emit('unhandledRejection', 'not an error');
    expect(exits).toEqual([70]);
    expect(lines).toEqual([expect.stringMatching(/^an unhandled rejection reached the workspace service's last-resort handler; ending with status 70 \(R-091, ADR-0002\): not an error$/)]);
  });

  it('a second event while the first is ending writes nothing more and asks no second exit', () => {
    const { self, events, exits } = fakeProcess();
    const lines: string[] = [];
    installLastResort({ process: self, name: 'run host', logError: (m) => lines.push(m) });
    events.emit('uncaughtException', new Error('first'));
    events.emit('unhandledRejection', new Error('second'));
    events.emit('uncaughtException', new Error('third'));
    expect(lines).toHaveLength(1);
    expect(exits).toEqual([70]);
  });

  it('a port that throws on the line still ends the process with 70', () => {
    const { self, events, exits } = fakeProcess();
    installLastResort({ process: self, name: 'run host', logError: () => { throw new Error('port closed'); } });
    events.emit('uncaughtException', new Error('boom'));
    expect(exits).toEqual([70]);
  });

  it('describes what was thrown: a stack, a string, an object, and what JSON cannot say', () => {
    const e = new Error('x');
    expect(describeThrown(e)).toBe(e.stack);
    expect(describeThrown('plain')).toBe('plain');
    expect(describeThrown({ a: 1 })).toBe('{"a":1}');
    expect(describeThrown(undefined)).toBe('undefined');
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    expect(describeThrown(circular)).toBe('[object Object]');
  });
});

describe('the child fault seam (verification only)', () => {
  it('a throw from a timer after the given delay, for the named process alone', () => {
    const clock = new FakeClock();
    expect(injectChildFault('workspace-service:uncaught:100', 'run-host', clock)).toEqual({ silent: false });
    expect(clock.pendingCount()).toBe(0);
    expect(injectChildFault('run-host:uncaught:100', 'run-host', clock)).toEqual({ silent: false });
    expect(() => clock.advance(100)).toThrow(/an uncaught throw in the run-host/);
  });

  it('a rejection nothing awaits, the default delay, silence, and no spec at all', async () => {
    const clock = new FakeClock();
    const rejected: unknown[] = [];
    const onRejection = (r: unknown): void => { rejected.push(r); };
    process.on('unhandledRejection', onRejection);
    try {
      injectChildFault('workspace-service:rejection', 'workspace-service', clock);
      clock.advance(2_999);
      await new Promise((r) => setImmediate(r));
      expect(rejected).toEqual([]);
      clock.advance(1);
      await new Promise((r) => setImmediate(r));
      expect(String(rejected[0])).toMatch(/an unhandled rejection in the workspace-service/);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
    expect(injectChildFault('run-host:silent', 'run-host', clock)).toEqual({ silent: true });
    expect(injectChildFault(undefined, 'run-host', clock)).toEqual({ silent: false });
  });
});

describe('a utility process ends when its parent is gone (R-091; the orphaned run host)', () => {
  it('probes the parent every period and calls onGone once when it is dead, then stops', () => {
    const clock = new FakeClock();
    let liveness: Liveness = 'alive';
    const probed: number[] = [];
    const gone: string[] = [];
    watchParent({ parentPid: 4242, currentParentPid: () => 4242, timers: clock, probe: (pid) => { probed.push(pid); return liveness; }, onGone: (why) => gone.push(why) });
    clock.advance(PARENT_WATCH_PERIOD_MS * 4);
    expect(probed).toEqual([4242, 4242, 4242, 4242]);
    expect(gone).toEqual([]);
    liveness = 'dead';
    clock.advance(PARENT_WATCH_PERIOD_MS);
    expect(gone).toEqual(['the parent pid 4242 is gone']);
    clock.advance(PARENT_WATCH_PERIOD_MS * 10);
    expect(gone).toHaveLength(1);
    expect(probed).toHaveLength(5);
    expect(clock.pendingCount()).toBe(0);
  });

  it('a changed parent pid (POSIX reparents an orphan) is the parent gone, without probing', () => {
    const clock = new FakeClock();
    let ppid = 4242;
    const gone: string[] = [];
    watchParent({ parentPid: 4242, currentParentPid: () => ppid, timers: clock, probe: () => 'alive', onGone: (why) => gone.push(why) });
    ppid = 1;
    clock.advance(PARENT_WATCH_PERIOD_MS);
    expect(gone).toEqual(['the parent pid changed from 4242 to 1']);
  });

  it('the period is inside the run host end bound main waits (2,000 ms)', () => {
    expect(PARENT_WATCH_PERIOD_MS).toBeLessThan(2_000);
  });

  it('superviseUtilityProcess exits 69 when the parent is gone, and 70 on the last resort', () => {
    const clock = new FakeClock();
    const { self, events, exits } = fakeProcess(77);
    let liveness: Liveness = 'alive';
    superviseUtilityProcess({ process: self, name: 'run host', logError: () => undefined, timers: clock, probe: () => liveness });
    clock.advance(PARENT_WATCH_PERIOD_MS * 3);
    expect(exits).toEqual([]);
    liveness = 'dead';
    clock.advance(PARENT_WATCH_PERIOD_MS);
    expect(exits).toEqual([PARENT_GONE_EXIT_STATUS]);
    expect(PARENT_GONE_EXIT_STATUS).toBe(69);
    events.emit('uncaughtException', new Error('late'));
    expect(exits).toEqual([69, 70]);
  });
});
