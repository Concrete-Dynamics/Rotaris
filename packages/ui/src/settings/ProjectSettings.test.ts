import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ChangeEntry, VerificationReport } from '@rotaris/contracts';
import { OPERATION_LABEL, changeEntryLines, describeOperation, type OperationReply } from './ProjectSettings.js';

/**
 * Part AJ2 — the Project category's traceability card states every distinct result spec 08 §1481 requires a surface
 * to be able to state, through the one pure mapping `describeOperation`; and, when the proof supplies the workspace
 * service's real replies (`ROTARIS_TRACEABILITY_PROCESS_RESULTS`), the same mapping over those.
 */
const reply = (operation: OperationReply['operation'], result: OperationReply['result'], elapsedMs = 12): OperationReply => ({ kind: 'traceability.result', operation, root: 'D:/repo', elapsedMs, result });
const ok = (operation: OperationReply['operation'], value: unknown) => reply(operation, { ok: true, value });
const statistics: VerificationReport['statistics'] = { total: 11, approved: 8, traced: 4, testCovered: 4, debt: { trace: 1, test: 0, orphan: 2, orphanTest: 0 } };
const report = (findings: VerificationReport['findings']): VerificationReport => ({ generation: 3, findings, statistics, evidence: {} });

describe('describeOperation states every result of §1481', () => {
  it('check: no violations; a violation count; an error; a warning; the statistics; the empty-store warning', () => {
    const clean = describeOperation('check', ok('check', { report: report([]), parseErrorsOnly: false }));
    expect(clean).toMatchObject({ tone: 'ok', headline: 'No violations.' });
    expect(clean.lines).toEqual(['Statistics: 11 requirements; 8 approved, 4 traced, 4 test-covered; baselined debt — trace 1, test 0, orphan 2, orphan-test 0.']);
    const findings: VerificationReport['findings'] = [
      { severity: 'warning', code: 'empty-store', path: 'docs/requirements', message: 'docs/requirements: the requirement store directory is absent; create the directory and write the first requirement document in it' },
      { severity: 'error', code: 'missing-trace', id: 'REQ-102', path: 'docs/requirements/REQ-102.md', message: 'docs/requirements/REQ-102.md (REQ-102): "Trace missing" is approved with trace: required, and no implementation reference exists; trace it' },
      { severity: 'error', code: 'orphan-test', path: 'tests/renamed.ts', line: 4, message: 'tests/renamed.ts:4 (tests/renamed.ts::testRenamed): no coverage annotation or comment reference is present' },
      { severity: 'warning', code: 'baseline-stale', path: 'docs/requirements/orphan-tests.txt', message: 'docs/requirements/orphan-tests.txt: entry tests/renamed.ts::testOriginal is now annotated, exempt or removed; prune it' },
    ];
    const dirty = describeOperation('check', ok('check', { report: report(findings), parseErrorsOnly: false }));
    expect(dirty.tone).toBe('error');
    expect(dirty.headline).toBe('2 violations. 2 warnings.');
    expect(dirty.lines).toEqual([
      'warning: docs/requirements: the requirement store directory is absent; create the directory and write the first requirement document in it',
      'error: docs/requirements/REQ-102.md (REQ-102): "Trace missing" is approved with trace: required, and no implementation reference exists; trace it',
      'error: tests/renamed.ts:4 (tests/renamed.ts::testRenamed): no coverage annotation or comment reference is present',
      'warning: docs/requirements/orphan-tests.txt: entry tests/renamed.ts::testOriginal is now annotated, exempt or removed; prune it',
      'Statistics: 11 requirements; 8 approved, 4 traced, 4 test-covered; baselined debt — trace 1, test 0, orphan 2, orphan-test 0.',
    ]);
    const one = describeOperation('check', ok('check', { report: report([findings[1]!]), parseErrorsOnly: false }));
    expect(one.headline).toBe('1 violation.');
  });
  it('check: a parse error, alone, with nothing else checked', () => {
    const parseOnly = describeOperation('check', ok('check', { report: report([{ severity: 'error', code: 'parse-error', path: 'docs/requirements/REQ-9.md', line: 3, message: 'docs/requirements/REQ-9.md:3: status "wrong" is not one of draft, approved, deprecated' }]), parseErrorsOnly: true }));
    expect(parseOnly).toMatchObject({ tone: 'error', headline: 'The requirement store does not parse: 1 parse error.' });
    expect(parseOnly.lines).toEqual(['parse error: docs/requirements/REQ-9.md:3: status "wrong" is not one of draft, approved, deprecated', 'Nothing else was checked; the parse errors are the whole report.']);
  });
  it('a configuration error naming the configuration path and its cause; an unanticipated failure naming what failed; busy; cancelled', () => {
    expect(describeOperation('regenerate', reply('regenerate', { ok: false, error: { kind: 'configuration', path: 'rotaris-traceability.json', cause: 'the key "layout.impl_roots" must be a non-empty list of strings' } })))
      .toEqual({ tone: 'error', headline: 'The layout configuration rotaris-traceability.json cannot be used: the key "layout.impl_roots" must be a non-empty list of strings', lines: ['No operation was performed and nothing was written.'] });
    expect(describeOperation('baselines', reply('baselines', { ok: false, error: { kind: 'failed', what: 'replacing docs/requirements/debt-baseline.txt', cause: 'EPERM: operation not permitted' } })))
      .toMatchObject({ tone: 'error', headline: 'replacing docs/requirements/debt-baseline.txt failed: EPERM: operation not permitted' });
    expect(describeOperation('check', reply('check', { ok: false, error: { kind: 'busy', operation: 'check' } })).headline).toBe('A check is already in flight for this workspace; this request was refused rather than queued or raced.');
    expect(describeOperation('compare', reply('compare', { ok: false, error: { kind: 'cancelled' } })).headline).toBe('The comparison was cancelled; nothing was written.');
  });
  it('regenerate: the artifact path, which of the two outcomes, the count; parse errors leave the artifact exactly as it stood', () => {
    expect(describeOperation('regenerate', ok('regenerate', { artifactPath: 'src/requirement_ids.ts', outcome: 'regenerated', count: 11 })))
      .toEqual({ tone: 'ok', headline: 'src/requirement_ids.ts: regenerated (11 requirements).', lines: ['The retired-identifier log was written before the artifact.'] });
    expect(describeOperation('regenerate', ok('regenerate', { artifactPath: 'src/requirement_ids.ts', outcome: 'already up to date', count: 1 })))
      .toEqual({ tone: 'ok', headline: 'src/requirement_ids.ts: already up to date (1 requirement).', lines: ['Nothing was written.'] });
    const parse = describeOperation('regenerate', reply('regenerate', { ok: false, error: { kind: 'parse', errors: [{ path: 'docs/requirements/a.md', line: 2, message: 'req-id is malformed' }, { path: 'docs/requirements/b.md', message: 'no frontmatter' }] } }));
    expect(parse.headline).toBe('The requirement store does not parse: 2 parse errors.');
    expect(parse.lines).toEqual(['parse error: docs/requirements/a.md:2: req-id is malformed', 'parse error: docs/requirements/b.md: no frontmatter', 'Nothing was written; the artifact was left exactly as it stood.']);
  });
  it('baselines: the three written, each with a path and an entry count', () => {
    const s = describeOperation('baselines', ok('baselines', [{ path: 'docs/requirements/debt-baseline.txt', entries: 1 }, { path: 'docs/requirements/orphan-modules.txt', entries: 0 }, { path: 'docs/requirements/orphan-tests.txt', entries: 2 }]));
    expect(s).toEqual({ tone: 'ok', headline: '3 baselines written.', lines: ['docs/requirements/debt-baseline.txt: 1 entry', 'docs/requirements/orphan-modules.txt: 0 entries', 'docs/requirements/orphan-tests.txt: 2 entries'] });
  });
  it('compare: no base artifact; no requirement changes; the per-change entries in the Data & Formats form; the unpropagated count; drift stated apart', () => {
    expect(describeOperation('compare', ok('compare', { entries: [], drift: false, noBase: true, unpropagated: 0 })).headline).toBe('No base artifact to compare against.');
    expect(describeOperation('compare', ok('compare', { entries: [], drift: false, noBase: false, unpropagated: 0 }))).toEqual({ tone: 'ok', headline: 'No requirement changes.', lines: [] });
    const entries: ChangeEntry[] = [
      { kind: 'modified', id: 'REQ-101', title: 'Traced and covered', obligation: 'Re-read the requirement in full and bring every site into line with its current text', drift: true, sites: [{ path: 'src/traced.ts', line: 3, kind: 'implementation', ids: ['REQ-101'] }, { path: 'tests/covers.ts', line: 6, kind: 'test', ids: ['REQ-101'], testNode: 'tests/covers.ts::testTraced' }] },
      { kind: 'added', id: 'REQ-108', title: 'Brand new', obligation: 'Implement and cover it', drift: false, sites: [] },
      { kind: 'status', id: 'REQ-104', title: 'Draft', from: 'draft', to: 'approved', obligation: 'Its obligations now apply', drift: false, sites: [] },
      { kind: 'removed', id: 'REQ-107', title: 'Gone', from: 'approved', obligation: 'Remove every reference', drift: false, sites: [] },
    ];
    const s = describeOperation('compare', ok('compare', { entries, drift: true, noBase: false, unpropagated: 1 }));
    expect(s.tone).toBe('warning');
    expect(s.headline).toBe('4 requirement changes; 1 unpropagated; drift found.');
    expect(s.lines).toEqual([
      "MODIFIED REQ-101 'Traced and covered': Re-read the requirement in full and bring every site into line with its current text  [drift]",
      '    src/traced.ts:3 (implementation)',
      '    tests/covers.ts:6 (test)',
      "ADDED REQ-108 'Brand new': Implement and cover it",
      '    no annotation sites yet',
      "STATUS REQ-104 'Draft' (draft -> approved): Its obligations now apply",
      "REMOVED REQ-107 'Gone': Remove every reference",
      '1 unpropagated requirement.',
      'Drift: at least one changed requirement has annotation sites untouched since the base (REQ-TRACE-168); those sites are marked [drift] above.',
    ]);
    expect(changeEntryLines(entries[3]!)).toHaveLength(1);
  });
  it('a reply in a form the card does not read is said so, never rendered as a result', () => {
    expect(describeOperation('check', { ok: false, error: { reason: 'refused' } })).toMatchObject({ tone: 'error', headline: 'The check answered in a form this build does not read.' });
    expect(Object.keys(OPERATION_LABEL)).toEqual(['check', 'regenerate', 'baselines', 'compare']);
  });
});

const processResults = process.env['ROTARIS_TRACEABILITY_PROCESS_RESULTS'];
describe.skipIf(!processResults || !existsSync(processResults))('the workspace service\'s real replies through the board\'s command family (the proof)', () => {
  it('every operation the proof drove through requirements.operation maps to a §1481 sentence', () => {
    const proc = JSON.parse(readFileSync(processResults!, 'utf8')) as Record<string, { value?: unknown }>;
    const value = (k: string) => proc[k]?.value;
    const check = describeOperation('check', value('boardCheck'));
    expect(check.headline).toMatch(/^\d+ violations?\. \d+ warnings?\.$/);
    expect(check.lines.at(-1)).toMatch(/^Statistics: 11 requirements; 8 approved, 4 traced, 4 test-covered; baselined debt/);
    expect(check.lines.some((l) => l.startsWith('error: tests/renamed.ts:4 (tests/renamed.ts::testRenamed)'))).toBe(true);
    expect(describeOperation('regenerate', value('boardRegenerate')).headline).toBe('src/requirement_ids.ts: already up to date (11 requirements).');
    const baselines = describeOperation('baselines', value('boardBaselines'));
    expect(baselines.headline).toBe('3 baselines written.');
    expect(baselines.lines).toHaveLength(3);
    // the process copy is not a Git repository, so the comparison is stated as a failure or as no base — never left blank
    const compare = describeOperation('compare', value('boardCompare'));
    expect(compare.headline.length).toBeGreaterThan(0);
    expect(compare.tone).not.toBe('ok');
    const busy = (proc['boardBusy'] as unknown as { value: unknown }[]).map((r) => describeOperation('check', r.value));
    expect(busy.filter((b) => b.headline.startsWith('A check is already in flight for this workspace')).length).toBe(1);
  });
});
