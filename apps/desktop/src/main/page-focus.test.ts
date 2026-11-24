import { describe, expect, it } from 'vitest';
import type { WebContents } from 'electron';
import { holdPageFocus } from './page-focus.js';

function fakeContents(options: { attached?: boolean; destroyed?: boolean; fail?: string } = {}) {
  const sent: { method: string; params: unknown }[] = [];
  let attached = options.attached ?? false;
  let attaches = 0;
  const wc = {
    isDestroyed: () => options.destroyed === true,
    debugger: {
      isAttached: () => attached,
      attach: () => { attaches += 1; attached = true; },
      sendCommand: (method: string, params: unknown) => {
        if (options.fail) return Promise.reject(new Error(options.fail));
        sent.push({ method, params });
        return Promise.resolve({});
      },
    },
  } as unknown as WebContents;
  return { wc, sent, attaches: () => attaches };
}

describe('holdPageFocus', () => {
  it('attaches once and enables focus emulation once per page', async () => {
    const page = fakeContents();
    const log: string[] = [];
    await holdPageFocus(page.wc, (m) => log.push(m));
    await holdPageFocus(page.wc, (m) => log.push(m));
    expect(page.attaches()).toBe(1);
    expect(page.sent).toEqual([{ method: 'Emulation.setFocusEmulationEnabled', params: { enabled: true } }]);
    expect(log).toEqual([]);
  });

  it('reuses a debugger already attached', async () => {
    const page = fakeContents({ attached: true });
    await holdPageFocus(page.wc, () => undefined);
    expect(page.attaches()).toBe(0);
    expect(page.sent).toHaveLength(1);
  });

  it('logs and never throws when the page cannot be held', async () => {
    const page = fakeContents({ fail: 'Target closed' });
    const log: string[] = [];
    await expect(holdPageFocus(page.wc, (m) => log.push(m))).resolves.toBeUndefined();
    expect(log).toEqual(['page focus: could not hold the page focused: Target closed']);
  });

  it('leaves a destroyed page alone', async () => {
    const page = fakeContents({ destroyed: true });
    await holdPageFocus(page.wc, () => undefined);
    expect(page.attaches()).toBe(0);
    expect(page.sent).toEqual([]);
  });
});
