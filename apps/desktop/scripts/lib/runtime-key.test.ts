/**
 * `withRuntimeKey` (fin32; OQ-214 reopened and ruled 2026-10-07 under R-072): the duress launch writes
 * `runtime.child_timeout` as PD-CONFIG-003's Save stores it, and faults-args its `child_stall_timeout`, through one helper.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the helper is plain ESM beside the script that runs it.
import { withRuntimeKey } from './runtime-key.mjs';

const BASE = ['# workspace', 'runtime:', '  permission_mode: autonomous', '  child_stall_timeout: 90', 'circuit_breaker:', '  child_timeout: 5', 'rotaris:', '  delegation_strategy: single', ''].join('\n');

describe('withRuntimeKey (live-run harness)', () => {
  it('replaces the key under runtime: and nothing else', () => {
    const out = withRuntimeKey(BASE, 'child_stall_timeout', 10);
    expect(out).toBe(BASE.replace('  child_stall_timeout: 90', '  child_stall_timeout: 10'));
  });

  it('inserts the key directly after runtime: when runtime: does not hold it, leaving a same-named key of another section alone', () => {
    const out = withRuntimeKey(BASE, 'child_timeout', 2700);
    expect(out).toBe(BASE.replace('runtime:\n', 'runtime:\n  child_timeout: 2700\n'));
    expect(out).toContain('circuit_breaker:\n  child_timeout: 5\n');
  });

  it('appends a runtime: block when the file has none', () => {
    expect(withRuntimeKey('rotaris:\n  delegation_strategy: single\n', 'child_timeout', 2700)).toBe('rotaris:\n  delegation_strategy: single\nruntime:\n  child_timeout: 2700\n');
    expect(withRuntimeKey('rotaris: {}', 'child_timeout', 60)).toBe('rotaris: {}\nruntime:\n  child_timeout: 60\n');
    expect(withRuntimeKey('', 'child_timeout', 60)).toBe('runtime:\n  child_timeout: 60\n');
  });

  it('leaves every other key and comment untouched, and a second write replaces the first', () => {
    const once = withRuntimeKey(BASE, 'child_timeout', 2700);
    const twice = withRuntimeKey(once, 'child_timeout', 1200);
    expect(twice).toBe(BASE.replace('runtime:\n', 'runtime:\n  child_timeout: 1200\n'));
    expect(twice.split('\n').filter((l) => !/child_timeout: 1200/.test(l))).toEqual(BASE.split('\n'));
  });
});
