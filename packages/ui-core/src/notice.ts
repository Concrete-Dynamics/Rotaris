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
  apply(p: unknown): boolean;
}
export type NoticeStore = StoreApi<NoticeState>;

export function createNoticeStore(): NoticeStore {
  return createStore<NoticeState>((set) => ({
    current: null,
    apply: (p) => {
      const parsed = NoticeCurrentSchema.safeParse(p);
      if (!parsed.success) return false;
      set({ current: parsed.data.current });
      return true;
    },
  }));
}
