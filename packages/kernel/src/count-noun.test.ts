import { describe, expect, it } from 'vitest';
import { countNoun } from './count-noun.js';

describe('countNoun (REQ-SHELL-044)', () => {
  it('the noun agrees with its count: one is singular, zero and many are plural, an irregular plural is taken as given', () => {
    expect(countNoun(1, 'model')).toBe('1 model');
    expect(countNoun(0, 'model')).toBe('0 models');
    expect(countNoun(3, 'model')).toBe('3 models');
    expect(countNoun(1, 'match', 'matches')).toBe('1 match');
    expect(countNoun(2, 'match', 'matches')).toBe('2 matches');
    expect(countNoun(2, 'child', 'children')).toBe('2 children');
  });
});
