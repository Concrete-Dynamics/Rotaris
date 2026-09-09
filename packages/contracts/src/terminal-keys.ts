// Part AL — seam per plan; AM owns this file. Minimal table so Part AL compiles; AM's wave-1 branch replaces it.
/**
 * REQ-SHELL-096: the closed key vocabulary, shared by the grid (what it emits) and the PTY writer (what it sends).
 * `encodeKey` is pure with one table; an unmapped key encodes to `null` and transmits nothing.
 */
export type NamedKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'HOME' | 'END' | 'PGUP' | 'PGDN' | 'TAB' | 'BS' | 'ESC' | 'ENTER' | `C-${string}`;
export type EncodedKey = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'named'; readonly key: NamedKey };
export interface KeyEvent { readonly key: string; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean; readonly metaKey: boolean }

const NAMED: Readonly<Record<string, NamedKey>> = {
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Home: 'HOME', End: 'END',
  PageUp: 'PGUP', PageDown: 'PGDN', Tab: 'TAB', Backspace: 'BS', Escape: 'ESC', Enter: 'ENTER',
};
const BYTES: Readonly<Record<string, string>> = {
  UP: '\x1b[A', DOWN: '\x1b[B', LEFT: '\x1b[D', RIGHT: '\x1b[C', HOME: '\x1b[H', END: '\x1b[F',
  PGUP: '\x1b[5~', PGDN: '\x1b[6~', TAB: '\t', BS: '\x7f', ESC: '\x1b', ENTER: '\r',
};

export function encodeKey(event: KeyEvent): EncodedKey | null {
  if (event.metaKey || event.altKey) return null;
  if (event.ctrlKey) {
    const m = /^[a-z]$/i.exec(event.key);
    return m ? { kind: 'named', key: `C-${event.key.toLowerCase()}` } : null;
  }
  const named = NAMED[event.key];
  if (named) return { kind: 'named', key: named };
  if (event.key.length === 1) return { kind: 'text', text: event.key };
  return null;
}

/** The PTY side: the byte sequence for one encoded key. */
export function bytesFor(key: EncodedKey): Uint8Array {
  if (key.kind === 'text') return new TextEncoder().encode(key.text);
  const direct = BYTES[key.key];
  if (direct !== undefined) return new TextEncoder().encode(direct);
  const ctrl = /^C-([a-z])$/i.exec(key.key);
  if (ctrl) return new Uint8Array([ctrl[1]!.toUpperCase().charCodeAt(0) - 64]);
  return new Uint8Array(0);
}
