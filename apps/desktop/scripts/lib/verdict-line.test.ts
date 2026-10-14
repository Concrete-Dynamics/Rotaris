/**
 * The live run's verdict log line (`live-run.mjs`'s `finish`). At `ce5f952` the `crlf` scenario's two NOTEs, pushed with no
 * detail, printed "— undefined" (`docs/defects/fixed/a-live-run-verdict-with-no-detail-prints-undefined.md`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the reader is plain ESM beside the script that runs it.
import { verdictLine } from './verdict-line.mjs';

describe('the live run\'s verdict line', () => {
  it('prints no dash for a verdict with no detail, absent or null', () => {
    expect(verdictLine({ passed: true, noted: true, what: 'crlf: haet_edit near misses 6 (PD-TOOLS-014)' })).toBe('  NOTE  crlf: haet_edit near misses 6 (PD-TOOLS-014)');
    expect(verdictLine({ passed: true, noted: true, what: 'n', detail: undefined })).toBe('  NOTE  n');
    expect(verdictLine({ passed: true, what: 'p', detail: null })).toBe('  PASS  p');
    expect(verdictLine({ passed: false, what: 'f' })).not.toContain('undefined');
  });

  it('prints the detail after a dash when one was given, falsy values included', () => {
    expect(verdictLine({ passed: false, what: 'f', detail: '2 request(s)' })).toBe('  FAIL  f  — 2 request(s)');
    expect(verdictLine({ passed: true, what: 'p', detail: 0 })).toBe('  PASS  p  — 0');
  });

  it('live-run.mjs prints through it, and `noted` stores an absent detail as null, as `check` does', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    expect(text).toMatch(/for \(const c of checks\) console\.log\(verdictLine\(c\)\);/);
    expect(text).toMatch(/const noted = \(what, detail\) => \{ checks\.push\(\{ passed: true, noted: true, what, detail: detail \?\? null \}\); \};/);
  });
});
