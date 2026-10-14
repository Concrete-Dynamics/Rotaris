import { createStore, type StoreApi } from 'zustand/vanilla';
import { NoticeCurrentSchema, type NoticeCurrent } from '@rotaris/contracts';

/**
 * ADR-0049 / REQ-SHELL-114 — the renderer's copy of the ONE current
 * persistent notice, fed by channel 4. Main owns the notice (compare-and-clear
 * on acknowledge); this store only mirrors what main last published, so two
 * windows cannot disagree about which notice is current.
 */
export type Notice = NonNullable<NoticeCurrent['current']>;

export interface NoticeState {
  readonly current: Notice | null;
  /** A channel-4 publication: always applied. */
  apply(p: unknown): boolean;
  /**
   * Main's answer to `notice.current`, asked once when the window boots: the notice current BEFORE this window existed, which
   * no publication will repeat (ADR-0049, PD-WORKSPACE-005 "shown in every open main window"). Applied only while no channel-4
   * publication has reached the store — every change after the answer is published on the channel, so a publication that
   * arrived first is never older than what it would overwrite. Until 2026-10-14 no window was handed the current notice at
   * boot (docs/defects/fixed/a-main-window-added-after-a-notice-was-published-does-not-show-it.md).
   */
  seed(p: unknown): boolean;
}
export type NoticeStore = StoreApi<NoticeState>;

export function createNoticeStore(): NoticeStore {
  let published = false;
  return createStore<NoticeState>((set) => ({
    current: null,
    apply: (p) => {
      const parsed = NoticeCurrentSchema.safeParse(p);
      if (!parsed.success) return false;
      published = true;
      set({ current: parsed.data.current });
      return true;
    },
    seed: (p) => {
      if (published) return false;
      const parsed = NoticeCurrentSchema.safeParse(p);
      if (!parsed.success) return false;
      set({ current: parsed.data.current });
      return true;
    },
  }));
}
