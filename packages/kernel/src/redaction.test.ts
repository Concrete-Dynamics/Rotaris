import { describe, expect, it } from 'vitest';
import { clipValue, displayMask, isSecretLookingName, maskArguments, namesCredential, redact, redactRowString, similarity, editDistance } from './index.js';

describe('kernel — redaction (REQ-TOOLS-171/172, REQ-EVENTS-060..063)', () => {
  it('REQ-TOOLS-172: whole segments, case-insensitive, leading dashes stripped', () => {
    for (const k of ['api_key', 'api_keys', 'apiKey', 'APIKEY', 'GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'Authorization', 'MY_PASSWORD', '--api-key', '--auth-token', '--client-secret', 'passwd']) {
      expect(isSecretLookingName(k), k).toBe(true);
    }
    for (const k of ['keyboard_layout', '--secretly-verbose', 'path', 'url', 'command']) expect(isSecretLookingName(k), k).toBe(false);
  });

  it("REQ-TOOLS-171: the worked examples, and the value extent of exactly one token", () => {
    expect(redact('--token abc def')).toBe('--token *** def');
    expect(redact('password: a b')).toBe('password: *** b');
    expect(redact('password: "a b"')).toBe('password: "***"');
    expect(redact('Bearer sk-live-1')).toBe('Bearer ***');
    expect(redact('curl -H "Authorization: Bearer abc.def" https://x')).toBe('curl -H "Authorization: Bearer ***" https://x');
    expect(redact('export API_KEY=xyz && run')).toBe('export API_KEY=*** && run');
    expect(redact('--api-key=shhh')).toBe('--api-key=***');
  });

  it('layer 3 keywords fold case; layer 4 prefixes at a token boundary fold case', () => {
    expect(redact('basic dXNlcjpwYXNz')).toBe('basic ***');
    expect(redact('Token 12345')).toBe('Token ***');
    expect(redact('key GHP_abcdef')).toBe('key ***');
    expect(redact('a eyJhbGciOiJIUzI1NiJ9.x.y b')).toBe('a *** b');
    expect(redact('a iv1.abc b')).toBe('a *** b');
    // an ordinary word that merely contains a prefix is left alone
    expect(redact('whisky_drinker')).toBe('whisky_drinker');
    expect(redact('tasks_done')).toBe('tasks_done');
  });

  it('REQ-EVENTS-060: URL userinfo password and PEM body', () => {
    expect(redact('git clone https://bob:hunter2@example.com/r.git')).toBe('git clone https://bob:***@example.com/r.git');
    const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\nkqhkiG9w0BAQEF\n-----END PRIVATE KEY-----';
    expect(redact(pem)).toBe('-----BEGIN PRIVATE KEY-----\n***\n-----END PRIVATE KEY-----');
  });

  it('is idempotent and leaves credential-free text byte-identical', () => {
    const samples = ['--token abc def', 'password: "a b"', 'Bearer sk-live-1', 'https://bob:hunter2@example.com', 'git status && rm -rf /', 'sha256:9f86d081884c7d659a2feaa0c55ad015', 'C:\\Users\\me\\keyboard_layout.txt'];
    for (const s of samples) {
      const once = redact(s);
      expect(redact(once)).toBe(once);
    }
    expect(redact('git status && rm -rf /')).toBe('git status && rm -rf /');
    expect(redact('sha256:9f86d081884c7d659a2feaa0c55ad015')).toBe('sha256:9f86d081884c7d659a2feaa0c55ad015');
  });

  it('REQ-EVENTS-060: the normalised-key test over the closed six fragments', () => {
    for (const k of ['apiKey', 'api_key', 'API-KEY', 'api key', 'authToken', 'clientSecret', 'db_password', 'credentials']) expect(namesCredential(k), k).toBe(true);
    for (const k of ['path', 'command', 'url', 'passwd']) expect(namesCredential(k), k).toBe(false);
  });

  it('REQ-EVENTS-060/061: arguments render as strings, a credential key masks whole, values clip at 240 + …', () => {
    const m = maskArguments({ apiKey: 'plain prose value', command: 'curl --token abc', count: 3, big: 'x'.repeat(300) });
    expect(m['apiKey']).toBe('***');
    expect(m['command']).toBe('curl --token ***');
    expect(m['count']).toBe('3');
    expect(m['big']).toHaveLength(241);
    expect(m['big']?.endsWith('…')).toBe(true);
    expect(Object.keys(m)).toEqual(['apiKey', 'big', 'command', 'count']);
  });

  it('REQ-EVENTS-063: a row string is masked before it is clipped', () => {
    const s = `${'a'.repeat(15_995)} password=hunter2`;
    const out = redactRowString(s);
    expect(out).not.toContain('hunter2');
    expect(out).toHaveLength(16_001);
    expect(clipValue('short')).toBe('short');
  });

  it('REQ-TOOLS-171 display mask: 4 or fewer → ****, else first two, ****, last two', () => {
    expect(displayMask('abcd')).toBe('****');
    expect(displayMask('sk-live-1234567890')).toBe('sk****90');
    expect(displayMask('sk****10')).toHaveLength(8);
  });
});

describe('kernel — similarity (REQ-TOOLS-188)', () => {
  it('is 1 for two empty strings, symmetric, unit-cost over code points', () => {
    expect(similarity('', '')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(similarity('kitten', 'sitting')).toBeCloseTo(1 - 3 / 7, 10);
    expect(similarity('a', 'b')).toBe(similarity('b', 'a'));
    expect(editDistance('😀x', 'x')).toBe(1);
  });
});
