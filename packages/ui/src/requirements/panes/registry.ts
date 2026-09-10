import { PANE_KEYS, type PaneKey } from '@rotaris/contracts';

/**
 * Part AP — REQ-TRACE-369/375: the five panes are constructed the first time each is needed and reused after; whether
 * one is installed is answerable for every key at any time, and asking constructs nothing. The registry holds VALUES
 * (whatever a pane's host builds — a React element factory, a state cell, a subscription), never the panes' modules:
 * the components in this directory are imported by the host that mounts them, and a board opened only to be read
 * never calls `open`. REQ-TRACE-370: a pane a caller attached first is never displaced — `open` returns it.
 */
export interface PaneRegistry<T> {
  /** REQ-TRACE-375: answerable for any key, constructs nothing. */
  installed(key: PaneKey): boolean;
  /** Constructs on first use through `build`, reuses after (REQ-TRACE-369). */
  open(key: PaneKey, build: () => T): T;
  /** The pane as installed, or undefined — never constructs. */
  peek(key: PaneKey): T | undefined;
  /** Discards an installed pane so the next `open` builds afresh (a workspace change); a key never opened is a no-op. */
  discard(key: PaneKey): void;
  readonly keys: readonly PaneKey[];
}

export function createPaneRegistry<T>(): PaneRegistry<T> {
  const installed = new Map<PaneKey, T>();
  const check = (key: PaneKey): void => { if (!(PANE_KEYS as readonly string[]).includes(key)) throw new Error(`'${String(key)}' is not a pane key (REQ-TRACE-375 closes the namespace to ${PANE_KEYS.join(', ')})`); };
  return {
    installed: (key) => { check(key); return installed.has(key); },
    open: (key, build) => { check(key); const found = installed.get(key); if (found !== undefined) return found; const made = build(); installed.set(key, made); return made; },
    peek: (key) => { check(key); return installed.get(key); },
    discard: (key) => { check(key); installed.delete(key); },
    keys: PANE_KEYS,
  };
}
