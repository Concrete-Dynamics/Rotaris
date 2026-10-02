/**
 * REQ-SHELL-076: an auxiliary window's replica reaches React through one trailing timer per interval, and none while
 * the window is hidden. The window's first render reads the replica, but the subscription is only taken afterwards,
 * in an effect. A publication applied in between reaches no listener. In a live run the next publication repairs it.
 * A session at rest (REQ-CHAT-008's recovery state, a paused session) publishes nothing more, so the window would keep
 * what its first render read, for example the session without its transcript. That is why the value is delivered once
 * as the subscription is taken. A persona window in the recovery state then shows the run-level agent's last activity,
 * which PD-ORCH-005 clause 13 keeps (OQ-100).
 */
export interface CoalescedFollow<T> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly read: () => T;
  readonly deliver: (value: T) => void;
  readonly hidden: () => boolean;
  readonly intervalMs: number;
  readonly timers?: { readonly set: (fn: () => void, ms: number) => unknown; readonly clear: (handle: unknown) => void };
}

const platformTimers = { set: (fn: () => void, ms: number): unknown => setTimeout(fn, ms), clear: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>) };

/** Subscribe, deliver what the source holds now, then at most one delivery per interval while visible. Returns the release. */
export function followCoalesced<T>(f: CoalescedFollow<T>): () => void {
  const timers = f.timers ?? platformTimers;
  let timer: unknown = null;
  const unsubscribe = f.subscribe(() => {
    if (f.hidden() || timer !== null) return;
    timer = timers.set(() => { timer = null; if (!f.hidden()) f.deliver(f.read()); }, f.intervalMs);
  });
  if (!f.hidden()) f.deliver(f.read());
  return () => { unsubscribe(); if (timer !== null) timers.clear(timer); };
}
