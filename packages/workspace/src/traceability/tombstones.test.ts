import { describe, expect, it } from 'vitest';
import { detectRetired, mergeTombstones, parseTombstones, renderTombstones } from './tombstones.js';

/** REQ-TRACE-130 to REQ-TRACE-141: the retired-identifier log. */
describe('the retired-identifier log', () => {
  it('REQ-TRACE-135: tolerant — blanks, comments, short lines, foreign prefixes and non-digits skipped; a later duplicate overwrites', () => {
    const t = parseTombstones('# header\n\nREQ-5\t2026-01-01\tFirst\nreq-6\t2026-01-02\nREQ-7\nOTHER-1\t2026-01-01\tx\nREQ-8x\t2026-01-01\nREQ-5\t2026-02-02\tSecond\n', 'REQ');
    expect([...t.values()]).toEqual([{ number: 5, id: 'REQ-5', date: '2026-02-02', title: 'Second' }, { number: 6, id: 'REQ-6', date: '2026-01-02', title: '' }]);
    expect(parseTombstones(null, 'REQ').size).toBe(0);
  });
  it('REQ-TRACE-130/137: the header makes the three statements; records ascend; LF; newline-terminated', () => {
    const text = renderTombstones(new Map([[20, { number: 20, id: 'REQ-20', date: '2026-01-01', title: 'b' }], [3, { number: 3, id: 'REQ-3', date: '2026-01-01', title: 'a' }]]), 'REQ');
    expect(text).toMatch(/sole surviving evidence/);
    expect(text).toMatch(/claim a retired identifier again is rejected/);
    expect(text).toMatch(/never handed out a second time/);
    expect(text.endsWith('REQ-3\t2026-01-01\ta\nREQ-20\t2026-01-01\tb\n')).toBe(true);
    expect(text).not.toContain('\r');
  });
  it('REQ-TRACE-136/139/140/141: present before, absent now, not already tombstoned — sorted; existing dates never move; a rename is not a deletion', () => {
    const previous = [{ number: 9, title: 'nine' }, { number: 2, title: 'two' }, { number: 4, title: 'four' }, { number: 4, title: 'four again' }];
    const live = new Set([9]);
    const existing = new Map([[2, { number: 2, id: 'REQ-2', date: '2020-01-01', title: 'old two' }]]);
    expect(detectRetired(previous, live, existing)).toEqual([{ number: 4, title: 'four' }]);
    const merged = mergeTombstones(existing, [{ number: 4, title: 'four' }, { number: 2, title: 'renamed' }], '2026-09-09', 'REQ');
    expect(merged.get(2)).toEqual({ number: 2, id: 'REQ-2', date: '2020-01-01', title: 'old two' });
    expect(merged.get(4)).toEqual({ number: 4, id: 'REQ-4', date: '2026-09-09', title: 'four' });
  });
});
