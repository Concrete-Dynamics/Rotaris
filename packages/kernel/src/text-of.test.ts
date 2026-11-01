import { describe, expect, it } from 'vitest';
import { textOf } from './text-of.js';

describe('textOf — a value of unknown shape as text (R-091)', () => {
  it('writes every primitive exactly as String() does', () => {
    for (const v of ['a', '', 0, -1.5, NaN, true, false, 10n, null, undefined]) expect(textOf(v)).toBe(String(v));
    const s = Symbol('k');
    expect(textOf(s)).toBe(String(s));
  });

  it('writes an object or an array as its compact JSON, where String() writes [object Object] or a comma list', () => {
    expect(textOf({ a: 1, b: 'x' })).toBe('{"a":1,"b":"x"}');
    expect(textOf(['a', 'b'])).toBe('["a","b"]');
  });

  it('falls back to the object tag where JSON cannot write the value', () => {
    const cycle: Record<string, unknown> = {};
    cycle['self'] = cycle;
    expect(textOf(cycle)).toBe('[object Object]');
  });
});
