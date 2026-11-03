import { describe, expect, it } from 'vitest';
import { err, failure, isOk, mapResult, ok, unwrap, type Result } from './result.js';

/**
 * The one outcome shape every command, control and user-facing failure shares (ADR-0044, ADR-0010, REQ-NOTIFY-005).
 * R-091 (`docs/architecture/hardening.md` §3.5 row 7, F3). The module offers `mapResult` and `unwrap`; it has no
 * `flatMap`, and none is added for a test.
 */
describe('kernel — Result', () => {
  it('ok and err are the two tagged shapes, and isOk narrows on the tag alone', () => {
    const good: Result<number> = ok(3);
    const bad: Result<number> = err(failure('x.code', 'A headline'));
    expect(good).toEqual({ ok: true, value: 3 });
    expect(bad).toEqual({ ok: false, error: { code: 'x.code', headline: 'A headline' } });
    expect(isOk(good)).toBe(true);
    expect(isOk(bad)).toBe(false);
    // A falsy value is still an Ok: the tag decides, never the value.
    expect(isOk(ok(0))).toBe(true);
    expect(isOk(ok(undefined))).toBe(true);
  });

  it('REQ-NOTIFY-005: a failure carries a headline and a code, and a detail and a cause only when given', () => {
    expect(failure('c', 'h')).toEqual({ code: 'c', headline: 'h' });
    expect(Object.keys(failure('c', 'h'))).toEqual(['code', 'headline']);
    const cause = new Error('underneath');
    const full = failure('c', 'h', 'the detail block', cause);
    expect(full).toEqual({ code: 'c', headline: 'h', detail: 'the detail block', cause });
    // An empty detail is a detail; only an absent one is left out.
    expect(failure('c', 'h', '')).toEqual({ code: 'c', headline: 'h', detail: '' });
    expect('detail' in failure('c', 'h', undefined, cause)).toBe(false);
  });

  it('mapResult maps the value of an Ok and passes an Err through untouched, without calling the function', () => {
    let calls = 0;
    const double = (n: number): number => { calls += 1; return n * 2; };
    expect(mapResult(ok(21), double)).toEqual({ ok: true, value: 42 });
    expect(calls).toBe(1);
    const bad: Result<number> = err(failure('x', 'y'));
    const mapped = mapResult(bad, double);
    expect(mapped).toBe(bad);
    expect(calls).toBe(1);
  });

  it('mapResult composes: two maps equal one map of the composed function', () => {
    const inc = (n: number): number => n + 1;
    const str = (n: number): string => `#${n}`;
    expect(mapResult(mapResult(ok(1), inc), str)).toEqual(mapResult(ok(1), (n) => str(inc(n))));
  });

  it('unwrap returns an Ok\'s value and throws on an Err, naming the error as JSON', () => {
    expect(unwrap(ok('v'))).toBe('v');
    expect(() => unwrap(err(failure('store.locked', 'The store is locked')))).toThrow('unwrap on Err: {"code":"store.locked","headline":"The store is locked"}');
    expect(() => unwrap(err('plain'))).toThrow('unwrap on Err: "plain"');
    const thrown = (() => { try { unwrap(err(1)); return null; } catch (cause) { return cause; } })();
    expect(thrown).toBeInstanceOf(Error);
  });
});
