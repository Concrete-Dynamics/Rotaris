import { encodeKey, type EncodedKey, type KeyEvent } from '@rotaris/contracts';

/**
 * Part AM — REQ-SHELL-097's five ordered rules, as one pure decision over the grid's state and one key event
 * (ADR-0047: "the grid's key handler implements the five ordered rules; the arming state decides whether anything is
 * transmitted at all; the encoder implements the closed vocabulary"). Nothing here touches the DOM; `TerminalGrid`
 * turns a decision into `preventDefault`, a scroll, a copy, a banner or a transmission.
 */
export interface KeyState {
  /** REQ-SHELL-089: take-control armed. */
  readonly armed: boolean;
  /** REQ-SHELL-091: once the process has exited, grid input is disabled. */
  readonly running: boolean;
  /** REQ-SHELL-097 (1): copy beats interrupt only while a selection is active. */
  readonly hasSelection: boolean;
}

export type ScrollTarget = 'page-up' | 'page-down' | 'top' | 'bottom';

export type KeyDecision =
  /** (1) Ctrl+C with an active selection, and Ctrl+Shift+C always. */
  | { readonly kind: 'copy' }
  /** (2) Shift+Tab: focus leaves the grid by the browser's own traversal; never forwarded. */
  | { readonly kind: 'leave' }
  /** (2) plain Tab while unarmed: traverses too. */
  | { readonly kind: 'traverse' }
  /** (3) the scrollback keys, local. */
  | { readonly kind: 'scroll'; readonly to: ScrollTarget }
  /** (4) unarmed and the key would have meant something: the rejected-input event, and the key is consumed. */
  | { readonly kind: 'rejected' }
  /** (5) armed: forwarded per REQ-SHELL-096. */
  | { readonly kind: 'send'; readonly key: EncodedKey }
  /** Consumed with no effect: a modifier alone, a key with no encoding while armed, or anything once the process ended. */
  | { readonly kind: 'ignore' };

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock', 'Dead', 'Unidentified', 'Process']);
const SCROLL_KEYS: Readonly<Record<string, ScrollTarget>> = Object.freeze({ PageUp: 'page-up', PageDown: 'page-down', Home: 'top', End: 'bottom' });

export function decideKey(state: KeyState, event: KeyEvent): KeyDecision {
  const { key, ctrlKey, shiftKey, altKey, metaKey } = event;
  const plainCtrl = ctrlKey && !altKey && !metaKey;
  // (1) copy beats interrupt.
  if (plainCtrl && key.toLowerCase() === 'c' && (shiftKey || state.hasSelection)) return { kind: 'copy' };
  // (2) Shift+Tab always leaves; plain Tab traverses while unarmed.
  if (key === 'Tab' && !ctrlKey && !altKey && !metaKey) {
    if (shiftKey) return { kind: 'leave' };
    if (!state.armed) return { kind: 'traverse' };
  }
  // (3) scrollback keys: local while unarmed; while armed their Shift- or Ctrl-modified forms still scroll.
  const scroll = SCROLL_KEYS[key];
  if (scroll !== undefined && !altKey && !metaKey && (!state.armed || shiftKey || ctrlKey)) return { kind: 'scroll', to: scroll };
  if (MODIFIER_KEYS.has(key)) return { kind: 'ignore' };
  // REQ-SHELL-091: input is disabled once the process has exited — nothing is rejected and nothing is sent.
  if (!state.running) return { kind: 'ignore' };
  const encoded = encodeKey(event);
  // (4) unarmed: a printable or named key is never silently discarded.
  if (!state.armed) return encoded !== null || isNamedKeyboardKey(key) ? { kind: 'rejected' } : { kind: 'ignore' };
  // (5) armed: forwarded, or nothing at all for a key outside the vocabulary (REQ-SHELL-096).
  return encoded === null ? { kind: 'ignore' } : { kind: 'send', key: encoded };
}

/** A key with a name a person would expect to do something (Delete, Insert, F1…), which the vocabulary does not carry. */
function isNamedKeyboardKey(key: string): boolean {
  return key.length > 1 && !MODIFIER_KEYS.has(key);
}
