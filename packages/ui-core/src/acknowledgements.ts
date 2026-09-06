import { createStore, type StoreApi } from 'zustand/vanilla';
import { AcknowledgementPublishSchema, type AcknowledgementKind } from '@rotaris/contracts';

/**
 * ADR-0049 (Part V) — the transient acknowledgement stack, ONE per window.
 *
 * The stack is not the notice store and does not belong to main (ADR-0049's fourth decision): each window that raises
 * an acknowledgement owns its own, so a persona window's acknowledgements are its own and nothing crosses a boundary
 * to show one. What main pushes over channel 8 lands in the window it was pushed to and nowhere else.
 *
 * REQ-NOTIFY-016: three are visible at most; publishing a fourth removes the oldest immediately.
 * REQ-NOTIFY-017: the newest occupies the slot nearest the anchoring corner and earlier ones move away from it; the
 * order here is oldest first, and the surface draws it downward so the newest is lowest. Nothing is ever reordered.
 * REQ-NOTIFY-011: the lifetime is 4200 ms and this module is the product's single declaration of it — REQ-SHELL-112
 * and REQ-SHELL-113 cite REQ-NOTIFY-011 rather than declaring a lifetime of their own, and so does every surface.
 * REQ-NOTIFY-020: a timeout of zero or less stays until something removes it, and the countdown can be restarted.
 * Closing one in the same instant its timer expires removes it once and raises nothing — the store is keyed by
 * identifier and a second removal of the same identifier is a no-op.
 * REQ-NOTIFY-021: one clear operation removes every visible acknowledgement at once (a view change, a shutdown).
 *
 * Time comes from the caller, never from a global: the surface supplies the timer so a test can drive it and so the
 * renderer's own clock rules hold.
 */
export const ACKNOWLEDGEMENT_LIFETIME_MS = 4_200;
/** REQ-NOTIFY-016: three visible at most. */
export const ACKNOWLEDGEMENT_STACK_DEPTH = 3;

export interface Acknowledgement {
  readonly id: number;
  readonly kind: AcknowledgementKind;
  readonly title: string;
  readonly body: string;
  /** Milliseconds on screen; zero or less never expires (REQ-NOTIFY-020). */
  readonly timeoutMs: number;
}

export interface AcknowledgementState {
  readonly items: readonly Acknowledgement[];
  /** Raises one and returns its identifier. The oldest goes where a fourth arrives (REQ-NOTIFY-016). */
  publish(input: { kind: AcknowledgementKind; title: string; body?: string; timeoutMs?: number }): number;
  /** Channel 8's payload; false where the message did not parse (the window ignores what it cannot read). */
  apply(payload: unknown): boolean;
  /** Removes one by identifier; removing one that is already gone does nothing (REQ-NOTIFY-020). */
  close(id: number): void;
  /** REQ-NOTIFY-021: every visible acknowledgement at once. */
  clearAll(): void;
  /** REQ-NOTIFY-020: restart a non-expiring one's countdown, or any one's. */
  restart(id: number, timeoutMs: number): void;
}
export type AcknowledgementStore = StoreApi<AcknowledgementState>;

export function createAcknowledgementStore(): AcknowledgementStore {
  let seq = 0;
  return createStore<AcknowledgementState>((set, get) => ({
    items: [],
    publish({ kind, title, body, timeoutMs }) {
      const id = ++seq;
      const item: Acknowledgement = { id, kind, title, body: body ?? '', timeoutMs: timeoutMs ?? ACKNOWLEDGEMENT_LIFETIME_MS };
      // Newest last, oldest evicted; no existing member is reordered or replaced where it stands (REQ-NOTIFY-017).
      const kept = [...get().items, item];
      set({ items: kept.length > ACKNOWLEDGEMENT_STACK_DEPTH ? kept.slice(kept.length - ACKNOWLEDGEMENT_STACK_DEPTH) : kept });
      return id;
    },
    apply(payload) {
      const parsed = AcknowledgementPublishSchema.safeParse(payload);
      if (!parsed.success) return false;
      const { kind, title, body, timeoutMs } = parsed.data;
      get().publish({ kind, title, ...(body === undefined ? {} : { body }), ...(timeoutMs === undefined ? {} : { timeoutMs }) });
      return true;
    },
    close(id) {
      const items = get().items;
      if (!items.some((a) => a.id === id)) return;
      set({ items: items.filter((a) => a.id !== id) });
    },
    clearAll() {
      if (get().items.length > 0) set({ items: [] });
    },
    restart(id, timeoutMs) {
      const items = get().items;
      if (!items.some((a) => a.id === id)) return;
      set({ items: items.map((a) => (a.id === id ? { ...a, timeoutMs } : a)) });
    },
  }));
}
