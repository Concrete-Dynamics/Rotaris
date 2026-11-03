import { describe, expect, it } from 'vitest';
import { CREDENTIAL_VALUE_PREFIXES, REDACTION_MARK, SCHEME_KEYWORDS, redact } from './redaction.js';

/**
 * The redaction pass's known shapes, one example each (REQ-TOOLS-171, REQ-EVENTS-060). R-091
 * (`docs/architecture/hardening.md` §3.5 row 7, F3). The scheme words and the value prefixes are walked from the lists
 * the pass exports, so a word or a prefix added to either without an example here fails; the property test beside it
 * (`redaction.property.test.ts`) covers the space between the examples.
 */
describe('kernel — redaction, one example per shape', () => {
  const shapes: readonly (readonly [shape: string, input: string, expected: string])[] = [
    ['layer 1: key=value', 'run API_KEY=abc123 now', 'run API_KEY=*** now'],
    ['layer 1: key: value', 'secret: abc123 rest', 'secret: *** rest'],
    ['layer 1: a quoted value keeps its quotes', "password='a b c' rest", "password='***' rest"],
    ['layer 1: a quoted key and whitespace', '"client_secret" abc123', '"client_secret" ***'],
    ['layer 1: an assignment inside a non-secret value', 'GET https://h/p?token=abc123', 'GET https://h/p?token=***'],
    ['layer 2: a double-dash flag and its value', 'tool --api-key abc123 --verbose', 'tool --api-key *** --verbose'],
    ['layer 2: a single-dash flag and its value', 'tool -password abc123', 'tool -password ***'],
    ['layer 2: a flag followed by another flag masks nothing', 'tool --password --verbose', 'tool --password --verbose'],
    ['URL userinfo: the password alone', 'postgres://admin:hunter2@db:5432/x', 'postgres://admin:***@db:5432/x'],
    ['PEM: the body between the delimiters', '-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----', '-----BEGIN RSA PRIVATE KEY-----\n***\n-----END RSA PRIVATE KEY-----'],
  ];
  for (const [shape, input, expected] of shapes) {
    it(shape, () => {
      expect(redact(input)).toBe(expected);
      expect(redact(expected)).toBe(expected);
    });
  }

  it.each(SCHEME_KEYWORDS.map((word) => [word]))('layer 3: the value after %s is masked and the word stays legible', (word) => {
    expect(redact(`x ${word} abc123 y`)).toBe(`x ${word} ${REDACTION_MARK} y`);
    expect(redact(`x ${word.toUpperCase()} abc123 y`)).toBe(`x ${word.toUpperCase()} ${REDACTION_MARK} y`);
  });

  it.each(CREDENTIAL_VALUE_PREFIXES.map((prefix) => [prefix]))('layer 4: a value starting %s at a token boundary is masked whole', (prefix) => {
    expect(redact(`x ${prefix}Abc123xyz y`)).toBe(`x ${REDACTION_MARK} y`);
    expect(redact(`x ${prefix.toUpperCase()}Abc123xyz y`)).toBe(`x ${REDACTION_MARK} y`);
    // Inside a word it is not at a token boundary, and is left alone.
    expect(redact(`x word${prefix}Abc y`)).toBe(`x word${prefix}Abc y`);
  });

  it('the lists the examples are walked from are the closed lists REQ-TOOLS-171 names', () => {
    expect([...SCHEME_KEYWORDS]).toEqual(['bearer', 'basic', 'token']);
    expect([...CREDENTIAL_VALUE_PREFIXES]).toEqual(['ghp_', 'ghs_', 'ghu_', 'gho_', 'sk-', 'sk_', 'iv1.', 'eyj']);
  });
});
