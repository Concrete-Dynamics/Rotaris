/**
 * The precondition a repair scenario states, "a persisted-running session with a dead lock" (REQ-GIT-094,
 * REQ-SESSION-060), read the moment the launch that held the lock has returned. The holder is read once, at once.
 * Probing afterwards only words the failure, so a holder that outlives its application fails the proof at the
 * launch that left it, and does not pass after a wait (REQ-SESSION-047, REQ-SESSION-056, REQ-GIT-093).
 */
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the scripts that run it.
import { describeLingeringHolder, lockHolderAfterExit, pidExists } from './lock-holder.mjs';

/** A scripted probe over a fake clock: the holder answers until `goneAt` ms. */
function scripted(goneAt: number) {
  let t = 0;
  const probes: number[] = [];
  return {
    probes,
    options: {
      probe: () => { probes.push(t); return t < goneAt; },
      now: () => t,
      pause: (ms: number) => { t += ms; },
      boundMs: 10_000,
      stepMs: 50,
    },
  };
}

describe('the lock holder read when the launch that held it returns (REQ-SESSION-056, REQ-GIT-093)', () => {
  it('a holder already gone is the precondition met, read once and never waited on', () => {
    const s = scripted(0);
    expect(lockHolderAfterExit(4321, s.options)).toEqual({ pid: 4321, aliveAtExit: false, goneAfterMs: 0, boundMs: 10_000 });
    expect(s.probes).toEqual([0]);
  });

  it('a holder that goes 1 750 ms later is still a failure, and the reading says how long it outlived main', () => {
    const s = scripted(1_750);
    const reading = lockHolderAfterExit(4321, s.options);
    expect(reading.aliveAtExit).toBe(true);
    expect(reading.goneAfterMs).toBe(1_750);
    const sentence = describeLingeringHolder('live', reading);
    expect(sentence).toContain("the 'live' launch returned");
    expect(sentence).toContain('pid 4321');
    expect(sentence).toContain('went 1750 ms later');
    expect(sentence).toMatch(/REQ-SESSION-047, REQ-SESSION-056/);
    expect(sentence).toMatch(/REQ-GIT-093/);
  });

  it('a holder that never goes is bounded, and the sentence says it was still alive', () => {
    const s = scripted(Number.POSITIVE_INFINITY);
    const reading = lockHolderAfterExit(4321, s.options);
    expect(reading).toEqual({ pid: 4321, aliveAtExit: true, goneAfterMs: null, boundMs: 10_000 });
    expect(s.probes.at(-1)).toBe(10_000);
    expect(describeLingeringHolder('live', reading)).toContain('still alive 10000 ms later');
  });

  it('the real probe: a running child exists, the same pid after its exit does not, and no pid ≤ 0 is probed', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
    const pid = child.pid ?? -1;
    expect(pidExists(pid)).toBe(true);
    await new Promise<void>((resolve) => { child.once('exit', () => resolve()); child.kill(); });
    expect(pidExists(pid)).toBe(false);
    expect(lockHolderAfterExit(pid).aliveAtExit).toBe(false);
    expect(pidExists(0)).toBe(false);
    expect(pidExists(-1)).toBe(false);
  });
});
