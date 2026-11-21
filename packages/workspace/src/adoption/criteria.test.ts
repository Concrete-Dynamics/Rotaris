/** PD-TRACE-002 clause 7 (REQ-ADOPT-049): the criteria a run is given, and the claims the review reads back. */
import { describe, expect, it } from 'vitest';
import { criteriaPromptTail, parseCriteriaClaims, readClaimLine } from './criteria.js';

const CRITERIA = [{ text: 'rejects a bad password', checked: false, line: 9 }, { text: 'accepts a good one', checked: true, line: 10 }, { text: 'locks after five failures', checked: false, line: 11 }];

describe('the criteria in the run prompt', () => {
  it('lists each by number and tells the agent to tick nothing', () => {
    const tail = criteriaPromptTail(CRITERIA);
    expect(tail).toContain('1. rejects a bad password');
    expect(tail).toContain('2. accepts a good one (already ticked in the document)');
    expect(tail).toMatch(/Do not tick or untick/);
    expect(criteriaPromptTail([])).toBe('');
  });
});

describe('the claims read out of a run\'s summary', () => {
  it('reads the numbered report under the heading', () => {
    const claims = parseCriteriaClaims('I implemented login.\n\n## Acceptance criteria\n1. met — login.test.ts "rejects" passes\n2. met — unchanged\n3. unmet — no lockout was built\n', CRITERIA);
    expect(claims).toEqual([
      { index: 0, text: 'rejects a bad password', checked: false, claim: 'met', evidence: 'login.test.ts "rejects" passes' },
      { index: 1, text: 'accepts a good one', checked: true, claim: 'met', evidence: 'unchanged' },
      { index: 2, text: 'locks after five failures', checked: false, claim: 'unmet', evidence: 'no lockout was built' },
    ]);
  });
  it('reads a report that names the criterion by its words', () => {
    const claims = parseCriteriaClaims('Acceptance criteria\n- met: rejects a bad password — test added\n- unmet: locks after five failures — out of scope\n', CRITERIA);
    expect(claims.map((c) => c.claim)).toEqual(['met', 'unstated', 'unmet']);
    expect(claims[0]!.evidence).toBe('test added');
  });
  it('assumes nothing: no report, no summary, or a number out of range is unstated', () => {
    expect(parseCriteriaClaims(null, CRITERIA).every((c) => c.claim === 'unstated')).toBe(true);
    expect(parseCriteriaClaims('All done, everything works.', CRITERIA).every((c) => c.claim === 'unstated')).toBe(true);
    expect(parseCriteriaClaims('Acceptance criteria\n9. met — x\n', CRITERIA).every((c) => c.claim === 'unstated')).toBe(true);
  });
});

describe('a report line is read in time linear in its length (CodeQL 247, 248)', () => {
  it('reads both forms', () => {
    expect(readClaimLine('3. unmet — no lockout')).toEqual({ n: 3, word: 'unmet', rest: 'no lockout' });
    expect(readClaimLine('- [met] rejects a bad password')).toEqual({ n: undefined, word: 'met', rest: 'rejects a bad password' });
    expect(readClaimLine('2. accepts a good one — not met — broke')).toEqual({ n: 2, word: 'not met', rest: 'accepts a good one broke' });
    expect(readClaimLine('metadata is fine')).toBeNull();
  });
  it('passes over a long run of tabs at once', () => {
    const started = performance.now();
    expect(readClaimLine(`1.${'\t'.repeat(3_990)}x`)).toBeNull();
    expect(parseCriteriaClaims(`Acceptance criteria\n${'1.'.padEnd(200_000, '\t')}`, CRITERIA).every((c) => c.claim === 'unstated')).toBe(true);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

