import { describe, expect, it } from 'vitest';
import { CONTRACT_SCHEMA_VERSION } from '@rotaris/contracts';
import { createNoticeStore } from './notice.js';

/**
 * ADR-0049 / PD-WORKSPACE-005 ("shown in every open main window"): a window learns the current notice from channel 4, and a
 * window opened after the publication learns it by asking main at boot (`notice.current`) and seeding its store from the
 * answer. Until 2026-10-14 nothing handed a new window the notice already current, so a main window added after the
 * publication showed none (docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).
 */
describe('the renderer\'s notice store is seeded with the notice current when its window boots', () => {
  const notice = (id: number, title: string) => ({ id, severity: 'error', title, message: '', detail: '', persistent: true, sessionId: '' });

  it('a store seeded from main\'s answer holds the current notice, though no publication reached it', () => {
    const store = createNoticeStore();
    expect(store.getState().seed({ v: CONTRACT_SCHEMA_VERSION, current: notice(4, 'Project setup did not finish: atlas-billing') })).toBe(true);
    expect(store.getState().current?.title).toBe('Project setup did not finish: atlas-billing');
  });

  it('a publication that reached the store first wins over the answer, whichever is newer: the channel carries every later change', () => {
    const store = createNoticeStore();
    store.getState().apply({ v: CONTRACT_SCHEMA_VERSION, current: notice(5, 'newer, from the channel') });
    expect(store.getState().seed({ v: CONTRACT_SCHEMA_VERSION, current: notice(4, 'older, from the boot answer') })).toBe(false);
    expect(store.getState().current?.title).toBe('newer, from the channel');
    // A cleared slot published on the channel stays cleared too.
    const cleared = createNoticeStore();
    cleared.getState().apply({ v: CONTRACT_SCHEMA_VERSION, current: null });
    expect(cleared.getState().seed({ v: CONTRACT_SCHEMA_VERSION, current: notice(4, 'stale') })).toBe(false);
    expect(cleared.getState().current).toBeNull();
  });

  it('an answer that does not parse seeds nothing', () => {
    const store = createNoticeStore();
    expect(store.getState().seed({ current: 'nonsense' })).toBe(false);
    expect(store.getState().current).toBeNull();
  });
});
