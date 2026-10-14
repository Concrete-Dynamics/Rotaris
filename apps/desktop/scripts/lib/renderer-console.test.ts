import { describe, expect, it } from 'vitest';
import { updateDepthErrors, updateDepthVerdict } from './renderer-console.mjs';

/**
 * Live-run finding D8 (docs/defects/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md): the run
 * counts the relayed renderer console lines naming React's update-depth error, which it read at `info` and passed.
 */
describe('updateDepthErrors (D8)', () => {
  it('counts the relayed #185 and Maximum update depth lines, with their line numbers, and nothing else', () => {
    const log = [
      '[main 2026-10-07T07:19:40.000Z] info capture: renderer console: Uncaught Error: Minified React error #185; visit https://react.dev/errors/185 for the full message (out/preload/index.cjs:8840)',
      '[main 2026-10-07T07:19:41.000Z] info capture: renderer console: Some other warning (renderer.js:1)',
      '[main 2026-10-07T07:19:42.000Z] info run host: Maximum update depth exceeded is a phrase here, not a relayed renderer line',
      '[main 2026-10-07T07:19:43.000Z] info capture: renderer console: Error: Maximum update depth exceeded. This can happen when … (renderer.js:9)',
      '[main 2026-10-07T07:19:44.000Z] info capture: renderer console: Minified React error #1850 (renderer.js:2)',
    ].join('\n');
    expect(updateDepthErrors(log).map((e: { line: number }) => e.line)).toEqual([1, 4]);
    expect(updateDepthErrors('')).toEqual([]);
  });
});

/**
 * OQ-278 (ruled 2026-10-13 under R-072): a relayed update-depth error in any live launch is a FAILURE of that launch, naming
 * each line; a launch with none passes. The live run's `check` takes this verdict as it is.
 */
describe('updateDepthVerdict (D8 guard, OQ-278)', () => {
  it('passes a launch with no relayed update-depth line, and says so in the check\'s words', () => {
    const v = updateDepthVerdict('default', '[main t] info capture: renderer console: Some other warning (renderer.js:1)');
    expect(v).toEqual({ passed: true, count: 0, what: "default: no relayed renderer console line names React's update-depth error (D8, OQ-278)", detail: undefined });
  });
  it('fails a launch with any, naming each line', () => {
    const log = ['x', '[main t] info capture: renderer console: Uncaught Error: Minified React error #185; visit https://react.dev/errors/185 (out/preload/index.cjs:8840)', 'y', '[main t] info capture: renderer console: Error: Maximum update depth exceeded. (renderer.js:9)'].join('\n');
    const v = updateDepthVerdict('duress', log);
    expect(v.passed).toBe(false);
    expect(v.count).toBe(2);
    expect(v.detail).toBe(`app.log line 2: ${log.split('\n')[1]} | app.log line 4: ${log.split('\n')[3]}`);
  });
  it('does not count the lanes trap\'s own lines, which never repeat React\'s message', () => {
    const log = '[main t] info capture: renderer console: rotaris-lanes-trap: installed (:1)\n[main t] info capture: renderer console: rotaris-lanes-trap: {"what":"run","run":10} (:1)';
    expect(updateDepthVerdict('duress', log)).toMatchObject({ passed: true, count: 0 });
  });
});
