import { describe, expect, it } from 'vitest';
import { decidedNoticeShown, reviewReads } from './review-reads.js';

/** REQ-TRACE-424..426 (fin34; live-run finding L12). */
describe('the review pane\'s reads — REQ-TRACE-425, REQ-TRACE-426', () => {
  it('a second read asked while one is outstanding is refused, whichever requirement it is for (REQ-TRACE-425)', () => {
    const reads = reviewReads();
    expect(reads.ask('REQ-101')).toEqual({ start: 1 });
    expect(reads.ask('REQ-101')).toEqual({ busy: true });
    expect(reads.ask('REQ-102')).toEqual({ busy: true });
    expect(reads.land(1, 'REQ-101')).toBe('show');
    expect(reads.ask('REQ-101')).toEqual({ start: 2 });
  });

  it('a read that lands after the pane was opened on another requirement is discarded, never drawn under the other\'s identifier', () => {
    const reads = reviewReads();
    expect(reads.ask('REQ-101')).toEqual({ start: 1 });
    // The pane is closed and opened on REQ-102; its read is refused while REQ-101's is outstanding.
    expect(reads.ask('REQ-102')).toEqual({ busy: true });
    expect(reads.land(1, 'REQ-102')).toBe('discard');
    // Once it has landed, REQ-102 can be read.
    expect(reads.ask('REQ-102')).toEqual({ start: 2 });
    expect(reads.land(2, 'REQ-102')).toBe('show');
    // A pane closed before its read landed shows nothing either.
    expect(reads.ask('REQ-103')).toEqual({ start: 3 });
    expect(reads.land(3, null)).toBe('discard');
    // A read that is not the outstanding one is never shown.
    expect(reads.land(2, 'REQ-102')).toBe('discard');
  });

  it('the decision\'s notice is shown only over the payload the decision was made against; a fresh read replaces both (L12)', () => {
    const decided = { text: 'Accept recorded for REQ-101. The review you were reading is out of date.', readSeq: 1 };
    expect(decidedNoticeShown(decided, 1)).toBe(decided.text);
    // The review opened again after the accept: read 2 is the refusal REQ-TRACE-424 names, and the notice no longer applies.
    expect(decidedNoticeShown(decided, 2)).toBeNull();
    expect(decidedNoticeShown(null, 1)).toBeNull();
  });
});
