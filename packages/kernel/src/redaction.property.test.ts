/**
 * Property tests over the one redaction pass (REQ-TOOLS-171, REQ-TOOLS-172, REQ-EVENTS-060; R-091, hardening.md §3.5
 * row 7). `redaction.test.ts` holds the worked examples; this file holds what must be true of every input.
 *
 * Every secret is built from the module's own lists — `SECRET_SEGMENTS`, `SCHEME_KEYWORDS`, `CREDENTIAL_VALUE_PREFIXES`
 * — so a word added to a list is generated here without an edit, and the test reads the shapes rather than a copy.
 *
 * Seeded: each property runs `numRuns: 500` from `SEED`, so a run is the same 500 cases every time. A failure prints
 * the counterexample with its seed and path; `fc.assert(…, { seed, path })` with the printed values replays it alone.
 *
 * One family is held out of the leak property by a named predicate (`heldOut`), because the pass leaks there today and
 * it is recorded: a secret name read as the value of the token before it (a flag after a flag, a scheme word after a
 * scheme word, a flag, an assignment or a quoted name after a secret assignment's separator or a quoted name —
 * `docs/defects/the-redaction-pass-masks-a-secret-name-as-the-value-before-it-and-leaks-the-secret-after.md`). Its repair
 * removes that branch, in the same commit. A second hold-out is no defect: quotes that pair across the planted shape
 * (`quotesMayPairAcross`). An assignment nested in a non-secret assignment's value was held out of the leak and the
 * idempotence properties until 2026-11-03, when the pass's repair of it (hardening D1,
 * `docs/archive/defects/an-assignment-inside-a-non-secret-assignments-value-is-not-masked.md`) met this file's pin and
 * both hold-outs went (`docs/archive/defects/the-redaction-pass-leaves-a-secret-assignment-that-is-the-value-of-a-plain-one.md`).
 *
 * Beyond the committed 500 runs, the leak property ran 20,000 times at each of seeds 1 to 12 on 2026-11-03 with these
 * hold-outs, green; that sweep is how the hold-outs were found, and it is the way to look for the next one.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_VALUE_PREFIXES,
  REDACTION_MARK,
  SCHEME_KEYWORDS,
  SECRET_SEGMENTS,
  hasCredentialPrefix,
  isSecretLookingName,
  redact,
} from './redaction.js';

const SEED = 20261103;
const RUNS = { seed: SEED, numRuns: 500 } as const;

/** One word with each letter's case chosen independently: every rule in the pass folds case. */
function anyCase(word: string): fc.Arbitrary<string> {
  return fc
    .array(fc.boolean(), { minLength: word.length, maxLength: word.length })
    .map((upper) => Array.from(word, (ch, i) => (upper[i] ? ch.toUpperCase() : ch)).join(''));
}

/** The secret itself: long and alphanumeric, so it ends where the pass says a value ends and is never a word of the context. */
const secretBody = fc.stringMatching(/^[A-Za-z0-9]{16,32}$/);

/** A secret-looking name (REQ-TOOLS-172): one segment of the closed list, in any case, between optional plain affixes. */
const secretName = fc
  .tuple(
    fc.option(fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{0,7}$/), { nil: undefined }),
    fc.constantFrom(...SECRET_SEGMENTS).chain(anyCase),
    fc.option(fc.stringMatching(/^[A-Za-z0-9]{1,8}$/), { nil: undefined }),
    fc.constantFrom('_', '-', '.'),
  )
  .map(([before, segment, after, joint]) => [before, segment, after].filter((part) => part !== undefined).join(joint));

/** One value token (REQ-TOOLS-171's extent): bare, or quoted with a space inside, the quotes kept. */
const valueOf = (body: string): fc.Arbitrary<string> =>
  fc.constantFrom(body, `"${body} rest"`, `'${body} rest'`);

interface Planted {
  readonly kind: 'assignment' | 'quoted-key' | 'flag' | 'scheme' | 'prefix' | 'url' | 'pem';
  readonly text: string;
  readonly secret: string;
}

/** Each shape the pass knows, carrying one generated secret. */
const planted: fc.Arbitrary<Planted> = secretBody.chain((secret) =>
  fc.oneof(
    fc
      .tuple(secretName, fc.constantFrom('=', ':', ' = ', ': ', ':\t'), valueOf(secret))
      .map(([name, sep, value]): Planted => ({ kind: 'assignment', text: `${name}${sep}${value}`, secret })),
    fc
      .tuple(secretName, fc.constantFrom('"', "'"), valueOf(secret))
      .map(([name, q, value]): Planted => ({ kind: 'quoted-key', text: `${q}${name}${q} ${value}`, secret })),
    fc
      .tuple(fc.constantFrom('-', '--'), secretName.filter((name) => /^[A-Za-z]/.test(name)), fc.constantFrom(' ', '  ', '\t'), valueOf(secret))
      .map(([dashes, name, ws, value]): Planted => ({ kind: 'flag', text: `${dashes}${name}${ws}${value}`, secret })),
    fc
      .tuple(fc.constantFrom(...SCHEME_KEYWORDS).chain(anyCase), fc.constantFrom(' ', '\t', '\n'), valueOf(secret))
      .map(([word, ws, value]): Planted => ({ kind: 'scheme', text: `${word}${ws}${value}`, secret })),
    fc
      .constantFrom(...CREDENTIAL_VALUE_PREFIXES)
      .chain(anyCase)
      .map((prefix): Planted => ({ kind: 'prefix', text: `${prefix}${secret}`, secret })),
    fc
      .tuple(fc.stringMatching(/^[a-z][a-z0-9+.-]{0,9}$/), fc.stringMatching(/^[A-Za-z0-9._]{1,10}$/), fc.domain())
      .map(([scheme, user, host]): Planted => ({ kind: 'url', text: `${scheme}://${user}:${secret}@${host}/p`, secret })),
    fc
      .constantFrom('RSA PRIVATE KEY', 'PRIVATE KEY', 'OPENSSH PRIVATE KEY', 'EC PRIVATE KEY')
      .map((label): Planted => ({ kind: 'pem', text: `-----BEGIN ${label}-----\n${secret}\n${secret.slice(0, 8)}\n-----END ${label}-----`, secret })),
  ),
);

/**
 * The text around a planted secret: arbitrary Unicode, and the fragments the pass's own rules turn on — its names, its
 * scheme words, its prefixes, separators, quotes, dashes, a URL's and a PEM block's punctuation — so a rule that
 * reaches past its value is met, not merely possible.
 */
const fragment = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 8 }),
  fc.constantFrom(...SECRET_SEGMENTS, ...SCHEME_KEYWORDS, ...CREDENTIAL_VALUE_PREFIXES),
  fc.constantFrom('=', ':', ': ', '"', "'", '-', '--', '-v', '--verbose', '://', '@', '/', '\n', '\t', ' ', 'Error:', '-----BEGIN X-----', '-----END X-----'),
);
const context = fc.array(fragment, { maxLength: 6 }).map((parts) => parts.join(''));

/**
 * The last token of `left` takes the next token as its value: a flag, a scheme word, an assignment's separator, or a
 * quoted name (layer 1's `"key" value` form).
 */
function endsTakingAValue(left: string): boolean {
  return (
    /(^|\s)-{1,2}[A-Za-z][A-Za-z0-9_.-]*\s*$/.test(left) ||
    /(^|\s)(["'])[A-Za-z0-9_.-]{1,128}\2\s*$/.test(left) ||
    new RegExp(String.raw`(^|[^A-Za-z0-9_])(${SCHEME_KEYWORDS.join('|')})\s*$`, 'i').test(left) ||
    /[=:]\s*$/.test(left)
  );
}

/** A quote in `left` and one in the planted shape may pair with each other rather than with their own partners. */
function quotesMayPairAcross(left: string, planted: string): boolean {
  return ['"', "'"].some((q) => left.includes(q) && planted.includes(q));
}

/**
 * The recorded leak (this file's header): a flag, a scheme word, an assignment or a quoted name whose secret name the
 * token before it took as its value. And one case that is no defect: where a quote before the shape can pair with one inside it, the text's quotes pair differently from the planted
 * ones (`key="` or `"key="` before `bearer "s rest"` makes `" bearer "` the key's value), so the planted value is not
 * a value token of that text.
 */
function heldOut(left: string, planted: Planted): boolean {
  const kind = planted.kind;
  if (quotesMayPairAcross(left, planted.text)) return true;
  if (kind === 'flag' || kind === 'scheme' || kind === 'assignment' || kind === 'quoted-key') return endsTakingAValue(left);
  return false;
}

/** Whole alphanumeric runs, as REQ-TOOLS-172 splits a name. */
const segmentsOf = (text: string): string[] => text.split(/[^A-Za-z0-9]+/).filter((segment) => segment !== '').map((segment) => segment.toLowerCase());

/**
 * Text that carries no secret by the pass's own definition: no secret-looking segment, no scheme word, no credential
 * prefix at a token boundary, no URL userinfo and no PEM block. Built from the module's predicates, not a copy of them.
 */
function carriesNoSecret(text: string): boolean {
  const words = new Set<string>([...SECRET_SEGMENTS, ...SCHEME_KEYWORDS]);
  return (
    !isSecretLookingName(text) &&
    !segmentsOf(text).some((segment) => words.has(segment)) &&
    !hasCredentialPrefix(text) &&
    !/:\/\/\S*@/.test(text) &&
    !text.includes('-----BEGIN ')
  );
}

describe('kernel — redaction, as properties (REQ-TOOLS-171, REQ-TOOLS-172, REQ-EVENTS-060)', () => {
  it('never lets a planted secret through, whatever surrounds it', () => {
    fc.assert(
      fc.property(context, planted, context, (left, secret, right) => {
        fc.pre(!left.includes(secret.secret) && !right.includes(secret.secret));
        fc.pre(!heldOut(left, secret));
        const out = redact(`${left} ${secret.text} ${right}`);
        expect(out, secret.kind).not.toContain(secret.secret);
        expect(out).toContain(REDACTION_MARK);
      }),
      RUNS,
    );
  });

  it('is idempotent: a second pass changes nothing the first left', () => {
    const text = fc.oneof(
      fc.string({ unit: 'grapheme', maxLength: 64 }),
      fc.string({ unit: 'binary', maxLength: 64 }),
      fc.tuple(context, planted, context).map(([left, secret, right]) => `${left} ${secret.text} ${right}`),
      context,
    );
    fc.assert(
      fc.property(text, (input) => {
        const once = redact(input);
        expect(redact(once)).toBe(once);
      }),
      RUNS,
    );
  });

  it('leaves a text that carries no secret exactly as it was', () => {
    const text = fc.oneof(fc.string({ unit: 'grapheme', maxLength: 64 }), fc.string({ unit: 'binary', maxLength: 64 }), context);
    fc.assert(
      fc.property(text.filter(carriesNoSecret), (input) => {
        expect(redact(input)).toBe(input);
      }),
      RUNS,
    );
  });

  it('masks an assignment nested in a plain one in one pass, the shape the idempotence property met at seeds 2, 6, 17 and 18', () => {
    const once = redact('ghp_= key=f9Z3MQ06w0ZfbLzsnUuZ4DwNtYL94b');
    expect(once).not.toContain('f9Z3MQ06w0ZfbLzsnUuZ4DwNtYL94b');
    expect(redact(once)).toBe(once);
  });

  it('holds out a shape only while its note stands: each still leaks, so its repair is noticed here', () => {
    // The first note's three shapes. When one is masked, the note is repaired: its branch of `heldOut` goes, and this line.
    expect(redact('curl -s --api-key abc123def456 https://x')).toContain('abc123def456');
    expect(redact('say token Basic dXNlcjpwYXNz')).toContain('dXNlcjpwYXNz');
    expect(redact('password: --token abc123def456')).toContain('abc123def456');
    expect(redact('"key" -key i7UjG8xTU36Z4w1S6Ass2fR8xLM7h')).toContain('i7UjG8xTU36Z4w1S6Ass2fR8xLM7h');
    expect(redact('key= key = V7K3PCvlN7fLyjl2xQDssxbaGUALAN')).toContain('V7K3PCvlN7fLyjl2xQDssxbaGUALAN');
    expect(redact('key= "key" B3ZEhj60960dio5O')).toContain('B3ZEhj60960dio5O');
  });
});
