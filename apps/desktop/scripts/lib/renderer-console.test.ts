import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { replicaRunStartDeclines, unexpectedRendererErrors, updateDepthErrors, updateDepthVerdict } from './renderer-console.mjs';

/**
 * Live-run finding D8 (docs/defects/fixed/the-renderer-throws-maximum-update-depth-exceeded-while-two-children-stream.md): the run
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

/**
 * The verdict above decides nothing unless the live run takes it as a check: OQ-278's ruling is that the launch FAILS, so
 * `launch` must hand the verdict to `check` (which accumulates), never to `noted` as it did before the ruling.
 */
describe('live-run\'s launch takes the update-depth verdict as a check (D8 guard, OQ-278)', () => {
  it('checks every launch with updateDepthVerdict and notes nothing about update-depth errors', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'live-run.mjs'), 'utf8');
    const body = text.slice(text.indexOf('async function launch('), text.indexOf('/** The store as the run left it'));
    expect(body).toMatch(/const updateDepth = updateDepthVerdict\(name, log\);/);
    expect(body).toMatch(/scenarioEvidence\[name\]\.reactUpdateDepthErrors = updateDepth\.count;/);
    expect(body).toMatch(/\bcheck\(updateDepth\.passed, updateDepth\.what, updateDepth\.detail\);/);
    expect(body).not.toMatch(/noted\([^\n]*update-depth/);
  });
});

/**
 * docs/defects/fixed/palette-proof-fails-on-the-replicas-documented-run-start-decline.md: palette-proof counted the replica's
 * run-start decline, REQ-SESSION-161's own recovery, as a renderer error and went red about one launch in four under load with
 * nothing wrong on screen. The filter mission-proof kept to itself is shared here, and both proofs read through it.
 */
describe('unexpectedRendererErrors (REQ-SESSION-161\'s run-start decline is no fault)', () => {
  const decline = '[main 2026-10-14T10:00:00.000Z] info capture: renderer console: [replica] declined increment on e26ae282-0c1d-4a7e-9a52-1f0f3c2b9d11: earliest-changed 2 precedes oldest held 3 (out/renderer/assets/index.js:1)';
  const other = '[main 2026-10-14T10:00:01.000Z] info capture: renderer console: Uncaught TypeError: x is undefined (out/renderer/assets/index.js:9)';
  const otherReplica = '[main 2026-10-14T10:00:02.000Z] info capture: renderer console: [replica] reconcile failed on e26ae282: store refused (out/renderer/assets/index.js:1)';
  it('lets the decline through and keeps every other line, another [replica] line included', () => {
    expect(unexpectedRendererErrors([decline, other, otherReplica, decline])).toEqual([other, otherReplica]);
    expect(unexpectedRendererErrors([])).toEqual([]);
    expect(replicaRunStartDeclines([decline, other, decline])).toBe(2);
  });
  it('matches the decline only whole: a line naming no positions is still a fault', () => {
    const partial = '[main t] info capture: renderer console: [replica] declined increment on e26ae282 (index.js:1)';
    expect(unexpectedRendererErrors([partial])).toEqual([partial]);
  });
  it('matches the text the replica writes (packages/ui-core/src/replica.ts) as the shell prefixes it (src/renderer/shell.ts)', () => {
    const replica = readFileSync(resolve(import.meta.dirname, '..', '..', '..', '..', 'packages', 'ui-core', 'src', 'replica.ts'), 'utf8');
    const shell = readFileSync(resolve(import.meta.dirname, '..', '..', 'src', 'renderer', 'shell.ts'), 'utf8');
    expect(replica).toContain('`declined increment on ${p.sessionId}: earliest-changed ${p.earliestChanged} precedes oldest held ${oldestHeld}`');
    expect(shell).toContain('onDiagnostic: (m) => console.warn(`[replica] ${m}`)');
  });
});

describe('palette-proof and mission-proof read renderer errors through the shared filter', () => {
  const read = (name: string) => readFileSync(resolve(import.meta.dirname, '..', name), 'utf8');
  it('palette-proof fails no launch on the replica\'s run-start decline (every check goes through unexpectedRendererErrors)', () => {
    const text = read('palette-proof.mjs');
    expect(text).toMatch(/import \{[^}]*\bunexpectedRendererErrors\b[^}]*\} from '\.\/lib\/renderer-console\.mjs';/);
    expect(text).not.toMatch(/\b\w+\.errors\.length === 0/);
    const checks = text.match(/renderer errors: /g) ?? [];
    expect(checks.length).toBe(7);
    expect((text.match(/expect\(unexpectedRendererErrors\(\w+\.errors\)\.length === 0, `renderer errors: \$\{unexpectedRendererErrors\(\w+\.errors\)\.join\(' \| '\)\}`\);/g) ?? []).length).toBe(checks.length);
  });
  it('mission-proof\'s `unexpected` is the shared filter, not a copy of it', () => {
    const text = read('mission-proof.mjs');
    expect(text).toMatch(/const unexpected = unexpectedRendererErrors;/);
    expect(text).not.toMatch(/declined increment on/);
  });
});
