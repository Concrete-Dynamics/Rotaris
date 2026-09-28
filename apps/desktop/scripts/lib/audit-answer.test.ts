/**
 * `ui-audit` survives a thrown audit expression (the evidence of `docs/design/README.md` §7, R-007; docs/architecture/views/04-seams.md
 * §8 step 6). The driver answers a renderer exception with `{ error }`; that must become a finding, not a crash.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the audit library is plain ESM beside the scripts that run it.
import { readAuditAnswer } from './audit-answer.mjs';

describe('design README §7 (R-007): ui-audit reads the driver answer without dying on it', () => {
  it('parses the JSON string a healthy audit expression builds', () => {
    expect(readAuditAnswer('{"viewport":{"w":1400,"h":900},"tracks":[]}')).toEqual({ ok: true, value: { viewport: { w: 1400, h: 900 }, tracks: [] } });
  });

  it('names the renderer exception the driver caught, the one that once killed every audit', () => {
    expect(readAuditAnswer({ error: 'TypeError: relations is not iterable' })).toEqual({
      ok: false, error: 'the renderer threw: TypeError: relations is not iterable',
    });
  });

  it('refuses an answer that is not the JSON string the audit builds, rather than coercing it', () => {
    expect(readAuditAnswer(undefined)).toEqual({ ok: false, error: 'the audit answered undefined rather than the JSON string it builds' });
    expect(readAuditAnswer(null)).toEqual({ ok: false, error: 'the audit answered null rather than the JSON string it builds' });
    expect(readAuditAnswer({ viewport: {} })).toEqual({ ok: false, error: 'the audit answered object rather than the JSON string it builds' });
  });

  it('reports unreadable JSON as a finding rather than throwing', () => {
    const answer = readAuditAnswer('{"viewport":');
    expect(answer.ok).toBe(false);
    expect(answer.error).toMatch(/^the audit answered unreadable JSON: /);
  });
});
