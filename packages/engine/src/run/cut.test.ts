import { describe, expect, it } from 'vitest';
import { cut } from './cut.js';

/** REQ-SESSION-194's cut, shared by the handoff, the offers list (PD-ORCH-004 revision 3) and the plan cycle's pending tasks (PD-ORCH-003 revision 2). */
describe('cut (REQ-SESSION-194)', () => {
  it('keeps a text within the cap, and cuts a longer one to the cap with the last three an ellipsis', () => {
    expect(cut('abcdef', 6)).toBe('abcdef');
    expect(cut('abcdefg', 6)).toBe('abc...');
  });

  it('never cuts between the two halves of a surrogate pair', () => {
    expect(cut(`ab\u{1F600}cdef`, 6)).toBe('ab...');
    expect(cut(`a\u{1F600}cdef`, 6)).toBe('a\u{1F600}...');
  });

  it('a cap of three or less keeps only the ellipsis', () => {
    expect(cut('abcdef', 3)).toBe('...');
    expect(cut('\u{1F600}abcdef', 3)).toBe('...');
  });
});
