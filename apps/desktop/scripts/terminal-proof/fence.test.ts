/**
 * REQ-SHELL-101's three input checks in `terminal-proof` (`wheel.subNotch`, `selection.text`, `selection.emptyCopyFails`)
 * read the page after an input. Until 2026-10-01 they read it after a fixed pause, which a loaded host outran: the page had
 * not yet handled the event, and the check read the state from before it
 * (`docs/defects/fixed/terminal-proofs-input-checks-fail-at-random-on-a-heavily-loaded-host.md`). The fence waits until
 * the page has counted the event. The page here is a counter that counts the event only on its fourth read — a host on
 * which the event arrives late, deterministically, with no clock in the test.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the fence is plain CommonJS beside the Electron half that requires it.
import { inputFence, until } from './fence.cjs';

/** A page that counts one keydown, but only once it has been read `lateBy` times. */
function latePage(lateBy: number) {
  let reads = 0;
  return {
    read: async () => { reads += 1; return { keydowns: reads > lateBy ? 1 : 0, pointerUps: 0, wheels: 0 }; },
    get reads() { return reads; },
  };
}
const noPause = async () => undefined;

describe('terminal-proof: an input is read once the page has counted it, never after a fixed pause', () => {
  it('the fence waits for a late event that one read after a pause would have missed', async () => {
    const page = latePage(3);
    // The old form: one read after the pause. The page has not counted the key yet, so the check read the state before it.
    expect((await page.read()).keydowns).toBe(0);
    const misses: unknown[] = [];
    const fence = inputFence({ read: () => page.read(), misses, pause: noPause });
    expect(await fence('key a', 'keydowns', 0)).toBe(true);
    expect((await page.read()).keydowns).toBe(1);
    expect(misses).toEqual([]);
  });

  it('an event the page never counts is recorded as a miss, not read as a pass', async () => {
    const misses: unknown[] = [];
    const fence = inputFence({ read: async () => ({ keydowns: 0, pointerUps: 2, wheels: 0 }), misses, pause: noPause });
    expect(await fence('click', 'pointerUps', 2, 0)).toBe(false);
    expect(misses).toEqual([{ what: 'click', field: 'pointerUps', before: 2, now: 2 }]);
  });

  it('until answers the predicate\'s value, or null once the bound has passed', async () => {
    let n = 0;
    expect(await until(async () => { n += 1; return n >= 3 ? { n } : null; }, 1_000, 0, noPause)).toEqual({ n: 3 });
    expect(await until(async () => null, 0, 0, noPause)).toBeNull();
  });
});
