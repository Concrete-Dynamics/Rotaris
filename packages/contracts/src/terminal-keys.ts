/**
 * REQ-SHELL-096 / REQ-SHELL-166 — the closed key-encoding vocabulary, as ONE table shared by the grid's input path
 * and the PTY writer (ADR-0047: "the encoder is a pure function with a table, and it is shared with the agent's own
 * input path, so there is one table and one test suite").
 *
 * The vocabulary is closed. Arrows → UP/DOWN/LEFT/RIGHT; Home/End → HOME/END; Page Up/Down → PGUP/PGDN; Tab → TAB;
 * Backspace → BS; Esc → ESC; Return/Enter → ENTER; Ctrl+A…Z → `C-<lowercase letter>`; printable text verbatim. A key
 * with no encoding here produces **no transmission at all** — `encodeKey` returns `null` and nothing substitutes some
 * other sequence for it. A named key carrying any modifier is such a key: the vocabulary names `Tab`, not `Shift+Tab`,
 * and `Up`, not `Ctrl+Up`, so those transmit nothing (Shift+Tab is REQ-SHELL-097's rule 2 and never reaches the encoder).
 *
 * Part AM (wave 1) owns this file; AL's PTY writer consumes `bytesFor` in wave 2.
 */

export type NamedKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'HOME' | 'END' | 'PGUP' | 'PGDN' | 'TAB' | 'BS' | 'ESC' | 'ENTER' | `C-${string}`;
export type EncodedKey = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'named'; readonly key: NamedKey };
export interface KeyEvent { readonly key: string; readonly ctrlKey: boolean; readonly shiftKey: boolean; readonly altKey: boolean; readonly metaKey: boolean }

type PlainNamedKey = Exclude<NamedKey, `C-${string}`>;

/** The DOM `KeyboardEvent.key` values that carry a named encoding, and the encoding each carries. */
const NAMED_KEYS: Readonly<Record<string, PlainNamedKey>> = Object.freeze({
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  Home: 'HOME', End: 'END', PageUp: 'PGUP', PageDown: 'PGDN',
  Tab: 'TAB', Backspace: 'BS', Escape: 'ESC', Enter: 'ENTER',
});

/** The twelve named keys, in the order REQ-SHELL-096 lists them — for tests and for the PTY table beside it. */
export const NAMED_KEY_LIST: readonly PlainNamedKey[] = Object.freeze(['UP', 'DOWN', 'LEFT', 'RIGHT', 'HOME', 'END', 'PGUP', 'PGDN', 'TAB', 'BS', 'ESC', 'ENTER']);

/**
 * The encoder. `null` means transmit nothing (REQ-SHELL-096). Pure: it reads five fields of the event and nothing else.
 *
 * Alt on a printable is left to the layout: on Windows AltGr arrives as `ctrlKey && altKey` with the printable already
 * in `key` (`@`, `€`), which IS printable text and is sent verbatim; a plain Ctrl+letter is the chord.
 */
export function encodeKey(event: KeyEvent): EncodedKey | null {
  const { key, ctrlKey, altKey, metaKey, shiftKey } = event;
  if (metaKey) return null;
  if (ctrlKey && !altKey && /^[a-zA-Z]$/.test(key)) return { kind: 'named', key: `C-${key.toLowerCase()}` };
  const named = NAMED_KEYS[key];
  if (named !== undefined) return ctrlKey || altKey || shiftKey ? null : { kind: 'named', key: named };
  // A printable: exactly one UTF-16 code unit or one surrogate pair, with no Ctrl unless Alt makes it AltGr.
  if (isPrintable(key) && (!ctrlKey || altKey)) return { kind: 'text', text: key };
  return null;
}

function isPrintable(key: string): boolean {
  if (key.length === 1) return true;
  if (key.length === 2) { const code = key.codePointAt(0) ?? 0; return code > 0xffff; }
  return false;
}

/** The PTY bytes for one encoded key (the run host's side of the same table). Normal cursor-key mode, CSI forms. */
const NAMED_BYTES: Readonly<Record<PlainNamedKey, readonly number[]>> = Object.freeze({
  UP: [0x1b, 0x5b, 0x41], DOWN: [0x1b, 0x5b, 0x42], RIGHT: [0x1b, 0x5b, 0x43], LEFT: [0x1b, 0x5b, 0x44],
  HOME: [0x1b, 0x5b, 0x48], END: [0x1b, 0x5b, 0x46], PGUP: [0x1b, 0x5b, 0x35, 0x7e], PGDN: [0x1b, 0x5b, 0x36, 0x7e],
  TAB: [0x09], BS: [0x7f], ESC: [0x1b], ENTER: [0x0d],
});

export function bytesFor(key: EncodedKey): Uint8Array {
  if (key.kind === 'text') return new TextEncoder().encode(key.text);
  const chord = /^C-([a-z])$/.exec(key.key);
  if (chord) return Uint8Array.of(chord[1]!.charCodeAt(0) - 0x60);
  const bytes = NAMED_BYTES[key.key as PlainNamedKey];
  if (bytes === undefined) throw new Error(`No PTY bytes for named key ${key.key}`);
  return Uint8Array.from(bytes);
}

/** REQ-SHELL-094's attempt phrase for a refused key: "send {KEY}" for a named key, "send that key" for text. */
export function describeKey(key: EncodedKey): string {
  return key.kind === 'named' ? `send ${key.key}` : 'send that key';
}

/** REQ-SHELL-107: navigation keys are not logged; control chords flush and log; the rest accumulate as the typed line. */
export function isNavigationKey(key: EncodedKey): boolean {
  if (key.kind === 'text') return false;
  return key.key === 'UP' || key.key === 'DOWN' || key.key === 'LEFT' || key.key === 'RIGHT' || key.key === 'HOME' || key.key === 'END' || key.key === 'PGUP' || key.key === 'PGDN' || key.key === 'TAB' || key.key === 'ESC';
}
