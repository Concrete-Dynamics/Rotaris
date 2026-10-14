import { describe, expect, it } from 'vitest';
import type { CommandOutcome, CommandRequest } from '@rotaris/contracts';
import { createDisplayPrefs } from './display-prefs.js';

/**
 * REQ-CHAT-167 / REQ-CONFIG-403 with PD-CONFIG-004: a window's boot read of the three display preferences, against main's
 * announcement of a change that lands while it is under way
 * (`docs/defects/fixed/a-windows-boot-read-of-the-display-preferences-can-overwrite-a-newer-announcement.md`).
 */
function scriptedBridge() {
  const gets: { key: string; answer: (v: boolean | undefined) => void }[] = [];
  const sets: CommandRequest[] = [];
  const bridge = {
    command: (req: CommandRequest): Promise<CommandOutcome> => {
      if (req.kind === 'prefs.get') return new Promise((resolve) => { gets.push({ key: req.key, answer: (value) => resolve({ ok: true, value: value === undefined ? {} : { value } } as CommandOutcome) }); });
      sets.push(req);
      return Promise.resolve({ ok: true, value: {} } as CommandOutcome);
    },
  };
  const answer = (key: string, value: boolean | undefined) => { gets.find((g) => g.key === key)!.answer(value); };
  return { bridge, gets, sets, answer };
}

describe('the display preferences\' boot read (REQ-CHAT-167, REQ-CONFIG-403)', () => {
  it('reads the three preferences, groupTools on when unset', async () => {
    const b = scriptedBridge();
    const d = createDisplayPrefs(b.bridge);
    const booting = d.read();
    b.answer('display/showReasoning', true);
    b.answer('display/autoCollapseTools', undefined);
    b.answer('display/groupTools', undefined);
    await booting;
    expect(d.store.getState()).toEqual({ showReasoning: true, autoCollapseTools: false, groupTools: true });
  });

  it('an announcement folded while the read is under way is not overwritten by the read\'s older answer', async () => {
    const b = scriptedBridge();
    const d = createDisplayPrefs(b.bridge);
    const booting = d.read();
    // Main answered the first get with the old value; another window then changed it, and main announced the change.
    b.answer('display/groupTools', true);
    d.fold({ groupTools: false });
    b.answer('display/showReasoning', false);
    b.answer('display/autoCollapseTools', true);
    await booting;
    expect(d.store.getState()).toEqual({ showReasoning: false, autoCollapseTools: true, groupTools: false });
  });

  it('this window\'s own write during the read stands too; a fold after the read ends is an ordinary fold', async () => {
    const b = scriptedBridge();
    const d = createDisplayPrefs(b.bridge);
    const booting = d.read();
    b.answer('display/showReasoning', false);
    expect(await d.write('display/showReasoning', true)).toEqual({ ok: true });
    b.answer('display/autoCollapseTools', false);
    b.answer('display/groupTools', true);
    await booting;
    expect(d.store.getState().showReasoning).toBe(true);
    d.fold({ showReasoning: false });
    expect(d.store.getState().showReasoning).toBe(false);
    expect(b.sets).toEqual([{ kind: 'prefs.set', key: 'display/showReasoning', value: true }]);
  });
});
