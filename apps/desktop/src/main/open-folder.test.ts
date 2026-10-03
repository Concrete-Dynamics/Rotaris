import { describe, expect, it } from 'vitest';
import { FakeClock, millis } from '@rotaris/kernel';
import { openFolder } from './open-folder.js';

/** REQ-SHELL-040: neither failure to open the workspace folder is silent, an opener that never answers included. */
describe('main/open-folder — the strip\'s workspace-path link', () => {
  it('answers success when the opener reports none, and the opener\'s refusal as the reason', async () => {
    const clock = new FakeClock();
    expect(await openFolder('/w', async () => '', clock.timers)).toEqual({ ok: true });
    expect(await openFolder('/w', async () => 'Failed to open path', clock.timers)).toEqual({ ok: false, reason: 'Failed to open path' });
    expect(await openFolder('/w', async () => { throw new Error('no handler'); }, clock.timers)).toEqual({ ok: false, reason: 'no handler' });
  });

  it('reports an opener that never answers as a failure once the bound passes', async () => {
    const clock = new FakeClock();
    const pending = openFolder('/w', () => new Promise<string>(() => undefined), clock.timers, millis(5_000));
    clock.advance(4_999);
    let settled = false;
    void pending.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    clock.advance(1);
    expect(await pending).toEqual({ ok: false, reason: 'the file manager did not answer within 5 s' });
    expect(clock.pendingCount()).toBe(0);
  });
});
