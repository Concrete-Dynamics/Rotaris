/**
 * `linePairs` (`PD-TOOLS-016` clause 1): the pairing a level-2 `write_file` edit carries the window's bytes through, read from
 * the same walk the diff row counts with, so the two never disagree about which lines are unchanged.
 */
import { describe, expect, it } from 'vitest';
import { diffChanges, lineChanges, linePairs } from './diff.js';

describe('linePairs (PD-TOOLS-016)', () => {
  it('pairs the equal leading run, the table walk between, then the equal trailing run', () => {
    expect(linePairs(['a', 'b', 'c'], ['a', 'X', 'c'])).toEqual([[0, 0], [2, 2]]);
    expect(linePairs(['one', 'two', 'three'], ['ONE', 'two', 'THREE'])).toEqual([[1, 1]]);
    expect(linePairs(['a', 'b'], ['a', 'X', 'b'])).toEqual([[0, 0], [1, 2]]);
    expect(linePairs([], ['x'])).toEqual([]);
  });

  it('the trailing run is taken before the walk, and on a tie the walk skips the before line, so a repeated line pairs with its later copy', () => {
    // '}' repeated: the trailing run pairs the last copies, and nothing in the middle is equal.
    expect(linePairs(['a', '}', '}'], ['A', '}'])).toEqual([[2, 1]]);
    // 'q' repeated in the middle: skipping p, then the first q (a tie), pairs the new q with the second copy.
    expect(linePairs(['p', 'q', 'q', 'r'], ['P', 'q', 'R'])).toEqual([[2, 1]]);
  });

  it('agrees with the count: every line not paired is one the diff row counts as removed or added', () => {
    const before = ['p', 'q', 'x', 'q', 'r', 's'];
    const after = ['p', 'Q', 'q', 'r', 'y', 's'];
    const pairs = linePairs(before, after);
    const { added, removed } = lineChanges(before, after);
    expect(removed).toBe(before.length - pairs.length);
    expect(added).toBe(after.length - pairs.length);
    expect(diffChanges(before.join('\n'), after.join('\n')).length).toBe(added + removed);
  });

  it('past the table bound between the runs only the two runs pair', () => {
    const middle = (tag: string, n: number) => Array.from({ length: n }, (_, i) => `${tag}${i % 7}`);
    const before = ['head', ...middle('b', 2_001), 'tail'];
    const after = ['head', ...middle('b', 2_001).reverse(), 'X', 'tail'];
    expect(linePairs(before, after)).toEqual([[0, 0], [before.length - 1, after.length - 1]]);
  });
});
