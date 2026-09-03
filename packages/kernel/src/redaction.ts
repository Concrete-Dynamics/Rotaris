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

/** REQ-TOOLS-172: the closed segment list. */
const SECRET_SEGMENTS: ReadonlySet<string> = new Set([
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

const SCHEME_WORDS = /^(bearer|basic|token)$/i;
const VALUE = String.raw`("[^"]*"|'[^']*'|[^\s"']+)`;
const KEY = String.raw`(-{0,2}[A-Za-z0-9][A-Za-z0-9_.\-]*)`;

/** Replace the credential part of one value token; quotes are kept around the mark. */
function maskToken(value: string): string {
  if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) {
    return `${value[0]}${REDACTION_MARK}${value[0]}`;
  }
  return REDACTION_MARK;
}

function layerAssignments(text: string): string {
  // (1) key=value / key: value; a quoted key followed by whitespace counts as an assignment too (REQ-EVENTS-060).
  const plain = new RegExp(String.raw`(^|[^A-Za-z0-9_.\-])${KEY}(\s*[=:]\s*)${VALUE}`, 'g');
  text = text.replace(plain, (m, pre: string, key: string, sep: string, value: string) => {
    if (!isSecretLookingName(key) || SCHEME_WORDS.test(value)) return m;
    return `${pre}${key}${sep}${maskToken(value)}`;
  });
  const quoted = new RegExp(String.raw`(^|\s)(["'])([A-Za-z0-9_.\-]+)\2(\s+)${VALUE}`, 'g');
  return text.replace(quoted, (m, pre: string, q: string, key: string, ws: string, value: string) => {
    if (!isSecretLookingName(key) || SCHEME_WORDS.test(value)) return m;
    return `${pre}${q}${key}${q}${ws}${maskToken(value)}`;
  });
}

function layerFlags(text: string): string {
  // (2) --flag value with a secret-looking flag.
  const re = new RegExp(String.raw`(^|\s)(-{1,2}[A-Za-z][A-Za-z0-9_.\-]*)(\s+)${VALUE}`, 'g');
  return text.replace(re, (m, pre: string, flag: string, ws: string, value: string) => {
    if (!isSecretLookingName(flag) || SCHEME_WORDS.test(value) || value.startsWith('-')) return m;
    return `${pre}${flag}${ws}${maskToken(value)}`;
  });
}

function layerSchemes(text: string): string {
  // (3) the value after Bearer / Basic / token, keywords compared without regard to case.
  const re = new RegExp(String.raw`(^|[^A-Za-z0-9_])(bearer|basic|token)(\s+)${VALUE}`, 'gi');
  return text.replace(re, (_m, pre: string, word: string, ws: string, value: string) => `${pre}${word}${ws}${maskToken(value)}`);
}

/** REQ-TOOLS-171 layer 4: the closed prefix list, at a token boundary, case-insensitive. */
const PREFIXES = ['ghp_', 'ghs_', 'ghu_', 'gho_', 'sk-', 'sk_', 'iv1.', 'eyj'] as const;

function layerShapes(text: string): string {
  const alts = PREFIXES.map((p) => p.replace(/[.]/g, '\\.')).join('|');
  const re = new RegExp(String.raw`(^|[^A-Za-z0-9_.\-])(${alts})[^\s"']*`, 'gi');
  return text.replace(re, (_m, pre: string) => `${pre}${REDACTION_MARK}`);
}

function urlPasswords(text: string): string {
  // REQ-EVENTS-060: scheme://user:password@host — the password alone.
  return text.replace(/([A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/g, (_m, a: string, _p: string, c: string) => `${a}${REDACTION_MARK}${c}`);
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
    return String(value);
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
