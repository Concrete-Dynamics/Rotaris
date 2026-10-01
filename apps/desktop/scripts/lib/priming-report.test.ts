/**
 * The opening credential report `slice-proof` reads, pinned against the run host's own writer (REQ-PROVIDER-067,
 * REQ-PROVIDER-068). `slice-proof`'s step 3 asserted `credentials: 1 provider(s) authenticated`, which no product code
 * writes (`docs/defects/fixed/slice-proof-asserts-a-priming-line-the-product-does-not-write.md`); the lines here are
 * `LeaseReportLog`'s real output, written the way main's log carries the run host's lines, so a change to that line
 * that the reader does not follow is a red here and not a failure at the end of a paid run.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LeaseReportLog, type LeaseReport } from '../../src/run-host/launch.js';
import { openingReport, primingProblem } from './priming-report.mjs';

const PROVIDER = 'openai-compatible--openrouter';
const ROOT = '/tmp/slice proof (scratch)/workspace';

/** The application log as main writes the run host's lines: its own prefix, then the run host's message. */
function logOf(...reports: LeaseReport[]): string {
  const reportLog = new LeaseReportLog();
  const lines = ['[main 2026-10-01T00:00:00.000Z] info    workspace opened'];
  for (const r of reports) reportLog.report(ROOT, r, (m) => lines.push(`[main 2026-10-01T00:00:01.000Z] info    run host: ${m}`));
  return `${lines.join('\n')}\n`;
}

describe('the run host\'s opening credential report, as slice-proof reads it (REQ-PROVIDER-067, REQ-PROVIDER-068)', () => {
  it('reads LeaseReportLog\'s opening line: the authenticated providers, the root, nothing unresolved', () => {
    const log = logOf({ authenticated: [PROVIDER], unresolved: {} });
    expect(openingReport(log)).toMatchObject({ authenticated: [PROVIDER], workspace: ROOT, unresolved: null });
    expect(primingProblem(log, PROVIDER)).toBeNull();
    // The defect, confirmed: the line step 3 used to require is not what the run host writes for a primed provider.
    expect(log).not.toMatch(/credentials: 1 provider\(s\) authenticated/);
  });

  it('names every authenticated provider, so the one the proof needs is found among several', () => {
    const log = logOf({ authenticated: ['zeta', PROVIDER, 'alpha'], unresolved: {} });
    expect(openingReport(log)?.authenticated).toEqual(['alpha', PROVIDER, 'zeta']);
    expect(primingProblem(log, PROVIDER)).toBeNull();
  });

  it('REQ-PROVIDER-068: a report with an unresolved provider is not ok, and the reason is quoted', () => {
    const log = logOf({ authenticated: [PROVIDER], unresolved: { codex: 'Authentication expired; re-authentication required.' } });
    expect(openingReport(log)?.unresolved).toBe('codex (Authentication expired; re-authentication required.)');
    expect(primingProblem(log, PROVIDER)).toMatch(/not ok .*codex \(Authentication expired/);
  });

  it('REQ-PROVIDER-067: a report that does not name the provider as authenticated is a problem', () => {
    expect(primingProblem(logOf({ authenticated: [], unresolved: { [PROVIDER]: 'Authentication required' } }), PROVIDER)).toMatch(/does not name openai-compatible--openrouter/);
    expect(primingProblem(logOf({ authenticated: ['other'], unresolved: {} }), PROVIDER)).toMatch(/does not name/);
  });

  it('reads the OPENING report, not a later change line, and finds none in a log without one', () => {
    // The opening report left the provider unresolved; the later change line says it authenticated since. The opening
    // report is REQ-PROVIDER-068's, and it was not ok.
    const log = logOf({ authenticated: [], unresolved: { [PROVIDER]: 'Authentication required' } }, { authenticated: [PROVIDER], unresolved: {} });
    expect(log).toContain(`credentials (workspace ${ROOT}): ${PROVIDER} is authenticated`);
    expect(primingProblem(log, PROVIDER)).toMatch(/does not name/);
    expect(primingProblem('[main] info    nothing about credentials\n', PROVIDER)).toMatch(/no opening credential report/);
  });

  it('slice-proof\'s step 3 asserts the priming through this reader, and no longer the line nothing writes', () => {
    const text = readFileSync(resolve(import.meta.dirname, '..', 'slice-proof.mjs'), 'utf8');
    const step = text.slice(text.indexOf('// 3. One real run'), text.indexOf('const requests ='));
    expect(step).toMatch(/primingProblem\(log3, PROVIDER_ID\)/);
    expect(step).not.toMatch(/provider\\\(s\\\) authenticated/);
  });
});
