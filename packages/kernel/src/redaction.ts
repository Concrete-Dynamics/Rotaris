import { textOf } from './text-of.js';
/**
 * The ONE redaction pass (REQ-TOOLS-171): every surface that renders or persists text that might
 * carry a credential — approval prompt, audit, event stream, log, error text, persisted documents,
 * hook payloads — calls this and holds no rule of its own. The marker is `***`, carrying no character
 * and no length of what it replaced. Idempotent by construction: every rule maps `***` to `***`.
 *
 * Four ordered layers over text: (1) `key=value` / `key: value` with a secret-looking key,
 * (2) `--flag value` with a secret-looking flag, (3) the value after `Bearer` / `Basic` / `token`,
 * (4) a value-shape sweep for the known credential prefixes at a token boundary. REQ-EVENTS-060 adds
 * two shapes the same pass must catch in event text — the userinfo password of a URL and the body of
 * a PEM block — and they are applied here so the pass stays single.
 *
 * Value extent (REQ-TOOLS-171): one value token — a quoted value to its closing quote with the quotes
 * kept, otherwise to the next whitespace or the end. `--token abc def` → `--token *** def`;
 * `password: "a b"` → `password: "***"`; `Bearer sk-live-1` → `Bearer ***`, `Bearer` legible.
 *
 * Reading recorded here rather than left implicit: a layer-1/2 value that is itself a scheme keyword
 * (`Authorization: Bearer x`) is left in place so layer 3 masks the credential after it — the only
 * order of application under which `Bearer` survives AND nothing after it leaks, which is what both
 * REQ-TOOLS-171 and REQ-EVENTS-060 ("everything after the scheme word is masked") require.
 */
export const REDACTION_MARK = '***';

/** REQ-TOOLS-172: the closed segment list. Exported so a test builds its names from the list, not a copy of it. */
export const SECRET_SEGMENTS: ReadonlySet<string> = new Set([
  'key', 'keys', 'apikey', 'apikeys', 'token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'passwd',
  'credential', 'credentials', 'auth', 'authorization', 'bearer',
]);

/** REQ-TOOLS-172: strip a leading run of `-`, split on every run of non-alphanumerics, whole segments only. */
export function isSecretLookingName(name: string): boolean {
  const stripped = name.replace(/^-+/, '');
  return stripped.split(/[^A-Za-z0-9]+/).some((seg) => seg.length > 0 && SECRET_SEGMENTS.has(seg.toLowerCase()));
}

/** REQ-EVENTS-060: the closed list of six fragments over the normalised key. */
const CREDENTIAL_FRAGMENTS = ['api key', 'token', 'secret', 'password', 'credentials', 'auth'] as const;

/** REQ-EVENTS-060: `_`, `-` and a camel-case boundary each become one space; lower-cased. */
export function normaliseKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** REQ-EVENTS-060: whether an argument key names a credential. */
export function namesCredential(key: string): boolean {
  const n = normaliseKey(key);
  return CREDENTIAL_FRAGMENTS.some((f) => n.includes(f));
}

/** REQ-TOOLS-171 layer 3: the words whose next value token is masked, compared without regard to case. */
export const SCHEME_KEYWORDS = ['bearer', 'basic', 'token'] as const;
const SCHEME_ALTERNATION = SCHEME_KEYWORDS.join('|');
const SCHEME_WORDS = new RegExp(`^(${SCHEME_ALTERNATION})$`, 'i');
const VALUE = String.raw`("[^"]*"|'[^']*'|[^\s"']+)`;
/**
 * Bounded at 128 characters (first execution under REQ-HOOKS-139's 100 KB payload bound, 2026-09-03): an
 * unbounded `[A-Za-z0-9_.\-]*` made every layer quadratic over a long alphanumeric run — 26 s on 100,000
 * `x` — because each start position re-scanned the whole run looking for the separator that never came.
 * No credential-naming key is longer than this (REQ-TOOLS-172's segments are short words), so the bound
 * changes no masking outcome and is recorded on ADR-0007.
 */
const KEY = String.raw`(-{0,2}[A-Za-z0-9][A-Za-z0-9_.\-]{0,127})`;

/** Replace the credential part of one value token; quotes are kept around the mark. */
function maskToken(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return `${value[0]}${REDACTION_MARK}${value[0]}`;
  }
  return REDACTION_MARK;
}

/**
 * (1) key=value / key: value. A value is consumed only when it is masked, so the value of an assignment whose key is
 * NOT secret-looking is still read for assignments of its own: `https://h/p?api_key=s` is an assignment of `https`
 * whose value holds `api_key=s`, and `error: token=s` one of `error` whose value holds `token=s`. Until 2026-11-01
 * the non-secret value was consumed whole and both secrets came through unmasked (REQ-EVENTS-060's "an assignment
 * inside the text"; `docs/archive/defects/an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md`).
 *
 * The boundary before the key is a lookbehind and nothing after the separator is consumed, so the character that ends
 * one assignment's separator can begin the next (`x:token=s`, `error: token=s`). The value's extent is `VALUE`'s, found
 * by `valueEnd` only for a secret-looking key: a lookahead over the whole token at every key made a run of chained
 * assignments quadratic (3.8 s over 100 KB, measured while this was written).
 */
function layerPlainAssignments(text: string): string {
  const plain = new RegExp(String.raw`(?<![A-Za-z0-9_.\-])${KEY}(\s*[=:])`, 'g');
  const unclosed = new Set<string>();
  let out = '';
  let last = 0;
  for (let m = plain.exec(text); m !== null; m = plain.exec(text)) {
    if (!isSecretLookingName(m[1] as string)) continue;
    let start = m.index + m[0].length;
    while (start < text.length && /\s/.test(text[start] as string)) start += 1;
    const end = valueEnd(text, start, unclosed);
    if (end === null) continue;
    const value = text.slice(start, end);
    if (SCHEME_WORDS.test(value)) continue;
    out += text.slice(last, start) + maskToken(value);
    last = end;
    plain.lastIndex = end;
  }
  return last === 0 ? text : out + text.slice(last);
}

/**
 * Where the one value token at `start` ends, by `VALUE`'s three alternatives — a quoted value to its closing quote, else
 * to the next whitespace or quote; null where none starts there. A quote found unclosed once is unclosed from every later
 * position too, so `unclosed` keeps a run of `token="` from re-scanning the text to its end at each one.
 */
function valueEnd(text: string, start: number, unclosed: Set<string>): number | null {
  const first = text[start];
  if (first === undefined) return null;
  if (first === '"' || first === "'") {
    if (unclosed.has(first)) return null;
    const close = text.indexOf(first, start + 1);
    if (close === -1) { unclosed.add(first); return null; }
    return close + 1;
  }
  let end = start;
  while (end < text.length && !/[\s"']/.test(text[end] as string)) end += 1;
  return end;
}

function layerAssignments(text: string): string {
  // (1) key=value / key: value; a quoted key followed by whitespace counts as an assignment too (REQ-EVENTS-060).
  text = layerPlainAssignments(text);
  const quoted = new RegExp(String.raw`(^|\s)(["'])([A-Za-z0-9_.\-]{1,128})\2(\s+)${VALUE}`, 'g');
  return text.replace(quoted, (m, pre: string, q: string, key: string, ws: string, value: string) => {
    if (!isSecretLookingName(key) || SCHEME_WORDS.test(value)) return m;
    return `${pre}${q}${key}${q}${ws}${maskToken(value)}`;
  });
}

function layerFlags(text: string): string {
  // (2) --flag value with a secret-looking flag.
  const re = new RegExp(String.raw`(^|\s)(-{1,2}[A-Za-z][A-Za-z0-9_.\-]{0,127})(\s+)${VALUE}`, 'g');
  return text.replace(re, (m, pre: string, flag: string, ws: string, value: string) => {
    if (!isSecretLookingName(flag) || SCHEME_WORDS.test(value) || value.startsWith('-')) return m;
    return `${pre}${flag}${ws}${maskToken(value)}`;
  });
}

function layerSchemes(text: string): string {
  // (3) the value after Bearer / Basic / token, keywords compared without regard to case.
  const re = new RegExp(String.raw`(^|[^A-Za-z0-9_])(${SCHEME_ALTERNATION})(\s+)${VALUE}`, 'gi');
  return text.replace(re, (_m, pre: string, word: string, ws: string, value: string) => `${pre}${word}${ws}${maskToken(value)}`);
}

/** REQ-TOOLS-171 layer 4: the closed prefix list, at a token boundary, case-insensitive. */
export const CREDENTIAL_VALUE_PREFIXES = ['ghp_', 'ghs_', 'ghu_', 'gho_', 'sk-', 'sk_', 'iv1.', 'eyj'] as const;
const PREFIXES = CREDENTIAL_VALUE_PREFIXES;

/**
 * REQ-PROVIDER-086: whether a string value carries one of the prefixes at a token boundary, letter case
 * ignored — `Bearer ghp_x` as surely as a bare `ghp_x`. The snapshot's secret screen refuses the write on
 * this where the redaction pass would mask.
 */
export function hasCredentialPrefix(value: string): boolean {
  const alts = PREFIXES.map((p) => p.replace(/[.]/g, '\\.')).join('|');
  return new RegExp(String.raw`(^|[^A-Za-z0-9_.\-])(${alts})`, 'i').test(value);
}

function layerShapes(text: string): string {
  const alts = PREFIXES.map((p) => p.replace(/[.]/g, '\\.')).join('|');
  const re = new RegExp(String.raw`(^|[^A-Za-z0-9_.\-])(${alts})[^\s"']*`, 'gi');
  return text.replace(re, (_m, pre: string) => `${pre}${REDACTION_MARK}`);
}

function urlPasswords(text: string): string {
  // REQ-EVENTS-060: scheme://user:password@host — the password alone.
  // The scheme starts at a boundary and is bounded at 64 characters, for the same reason KEY is bounded
  // above: unbounded and unanchored, this layer alone cost 13 s over 100,000 `x`, and bounded but
  // unanchored still 46 ms (each position re-scanned up to 64 characters for a `://` that never came).
  return text.replace(/(^|[^A-Za-z0-9+.\-])([A-Za-z][A-Za-z0-9+.-]{0,63}:\/\/[^\s:@/]+:)([^\s@/]+)(@)/g, (_m, pre: string, a: string, _p: string, c: string) => `${pre}${a}${REDACTION_MARK}${c}`);
}

function pemBodies(text: string): string {
  // REQ-EVENTS-060: everything between the delimiters of a PEM-delimited private key block.
  return text.replace(/(-----BEGIN [^-\n]*-----)([\s\S]*?)(-----END [^-\n]*-----)/g, (_m, a: string, _b: string, c: string) => `${a}\n${REDACTION_MARK}\n${c}`);
}

/** The pass. Deterministic, idempotent, no entropy or length heuristic anywhere. */
export function redact(text: string): string {
  let t = pemBodies(text);
  t = urlPasswords(t);
  t = layerAssignments(t);
  t = layerFlags(t);
  t = layerSchemes(t);
  t = layerShapes(t);
  return t;
}

/** REQ-EVENTS-061 / REQ-TOOLS-057: 240 characters plus one `…`, so a clipped value is 241 long. */
export const VALUE_CLIP = 240;
export function clipValue(value: string, limit = VALUE_CLIP): string {
  const cps = Array.from(value);
  return cps.length > limit ? `${cps.slice(0, limit).join('')}…` : value;
}

/** REQ-EVENTS-063: a row string is masked THEN clipped, to 16,000 characters plus `…`. */
export const ROW_STRING_CLIP = 16_000;
export function redactRowString(value: string): string {
  return clipValue(redact(value), ROW_STRING_CLIP);
}

/** Every value rendered as a string (REQ-EVENTS-060), compact JSON for non-strings. */
export function renderArgumentValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return textOf(value);
  }
}

/**
 * The `arguments` map of `tool.start` (REQ-EVENTS-060/061): a key naming a credential masks the whole
 * value; every other value passes through the pass; each rendered value is clipped to 240 + `…`.
 * `secretKey` is REQ-EVENTS-060's closed test by default; a caller rendering REQ-TOOLS-057's argument
 * summary passes REQ-TOOLS-172's test instead, which is the one that requirement names.
 */
export function maskArguments(args: Readonly<Record<string, unknown>>, secretKey: (key: string) => boolean = namesCredential): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(args).sort()) {
    const rendered = renderArgumentValue(args[key]);
    out[key] = secretKey(key) ? REDACTION_MARK : clipValue(redact(rendered));
  }
  return out;
}

/** REQ-TOOLS-171's display mask for a secret the user stored on purpose: `****` or `ab****yz`. */
export function displayMask(secret: string): string {
  const cps = Array.from(secret);
  if (cps.length <= 4) return '****';
  return `${cps.slice(0, 2).join('')}****${cps.slice(-2).join('')}`;
}
