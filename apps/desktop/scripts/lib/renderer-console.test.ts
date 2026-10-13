import { describe, expect, it } from 'vitest';
import { updateDepthErrors } from './renderer-console.mjs';

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
