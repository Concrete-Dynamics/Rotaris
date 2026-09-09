import { describe, expect, it } from 'vitest';
import { STATUS_MARKERS, isArtifactUpToDate, recoverEntries, recoverEntry, recoverFingerprint, renderArtifact, sanitiseTitle, type ArtifactRecord } from './artifact.js';
import { parseDebtBaseline, parseOrphanModuleBaseline, parseOrphanTestBaseline, ratchetDebt, ratchetSet, renderDebtBaseline, renderOrphanModuleBaseline, renderOrphanTestBaseline } from './baselines.js';

/** REQ-TRACE-051 to REQ-TRACE-065 (the artifact) and REQ-TRACE-116 to REQ-TRACE-129 (the baselines). */
const rec = (number: number, status: ArtifactRecord['status'], extra: Partial<ArtifactRecord> = {}): ArtifactRecord => ({
  id: `REQ-${number}`, number, status, title: `Title ${number}`, sourcePath: `docs/requirements/REQ-${number}.md`, traceRequired: true, testRequired: true, contentHash: '0123456789abcdef', kind: 'product', derivedFrom: [], ...extra,
});
const FP = 'f'.repeat(64);

describe('the generated artifact', () => {
  it('REQ-TRACE-051..059: the fixed order, ascending members, JSDoc markers, the empty deprecated set, positional metadata, LF and a trailing newline; a reversed input is byte-identical', () => {
    const records = [rec(102, 'draft'), rec(100, 'approved', { title: 'The "quoted" epic', traceRequired: false, testRequired: false }), rec(101, 'approved', { kind: 'technical', derivedFrom: ['REQ-100'] })];
    const text = renderArtifact(records, 'docs/requirements', FP);
    expect(text).toBe(renderArtifact([...records].reverse(), 'docs/requirements', FP));
    const lines = text.split('\n');
    expect(lines[0]).toBe('/**');
    expect(text).toContain('GENERATED requirement-symbol artifact. Do not edit by hand');
    expect(text).toContain('Compiled from the requirement store at `docs/requirements`');
    expect(text).toContain('REQ-TRACE-509');
    expect(lines).toContain('/* eslint-disable */');
    expect(lines).toContain('// prettier-ignore');
    expect(lines).toContain(`// rotaris-traceability-fingerprint: ${FP}`);
    expect(lines).toContain("import { Lifecycle, RequirementMeta } from 'rotaris-traceability';");
    expect(text.indexOf('REQ_100 = 100')).toBeLessThan(text.indexOf('REQ_101 = 101'));
    expect(text.indexOf('REQ_101 = 101')).toBeLessThan(text.indexOf('REQ_102 = 102'));
    expect(text).toContain(`  /** ${STATUS_MARKERS.approved} The "quoted" epic - docs/requirements/REQ-100.md */\n  REQ_100 = 100,\n\n`);
    expect(text).toContain(`  /** ${STATUS_MARKERS.draft} Title 102 - docs/requirements/REQ-102.md */\n  REQ_102 = 102,\n\n}`);
    expect(text).toContain('export const DEPRECATED_REQUIREMENTS: ReadonlySet<Requirement> = new Set<Requirement>([]);');
    expect(text).toContain('  [100, new RequirementMeta("REQ-100", 100, Lifecycle.Approved, "The \\"quoted\\" epic", "docs/requirements/REQ-100.md", false, false, "0123456789abcdef", "product", [])],');
    expect(text).toContain('  [101, new RequirementMeta("REQ-101", 101, Lifecycle.Approved, "Title 101", "docs/requirements/REQ-101.md", true, true, "0123456789abcdef", "technical", [100])],');
    expect(text.endsWith(']);\n')).toBe(true);
    expect(text).not.toContain('\r');
  });
  it('REQ-TRACE-054/056: the deprecated marker is the longest, carries @deprecated, and the set spans lines when populated', () => {
    expect(STATUS_MARKERS.deprecated.length).toBeGreaterThan(STATUS_MARKERS.approved.length);
    expect(STATUS_MARKERS.approved.length).toBeGreaterThan(0);
    expect(new Set(Object.values(STATUS_MARKERS)).size).toBe(3);
    const text = renderArtifact([rec(300, 'deprecated'), rec(301, 'deprecated')], 'docs/requirements', FP);
    expect(text).toContain(`  /** @deprecated ${STATUS_MARKERS.deprecated} Title 300 - docs/requirements/REQ-300.md */`);
    expect(text).toContain('export const DEPRECATED_REQUIREMENTS: ReadonlySet<Requirement> = new Set<Requirement>([\n  Requirement.REQ_300,\n  Requirement.REQ_301,\n]);');
  });
  it('REQ-TRACE-055: a title cannot terminate the documentation string', () => {
    expect(sanitiseTitle('a """ b \\ c */ d')).toBe("a ''' b / c * / d");
  });
  it('REQ-TRACE-060/062: up to date is an equality over normalised text; missing is stale', () => {
    const text = renderArtifact([rec(1, 'draft')], 'd', FP);
    expect(isArtifactUpToDate(text, text)).toBe(true);
    expect(isArtifactUpToDate(text.replace(/\n/g, '\r\n'), text)).toBe(true);
    expect(isArtifactUpToDate(null, text)).toBe(false);
    expect(isArtifactUpToDate(`${text}\n`, text)).toBe(false);
  });
  it('REQ-TRACE-138/157: entries recover intact, a quote in a title survives, an uninterpretable line is passed over, an unreadable artifact yields none', () => {
    const text = renderArtifact([rec(7, 'approved', { title: 'say "hi", friend', kind: 'technical', derivedFrom: ['REQ-1', 'REQ-2'] }), rec(8, 'deprecated', { traceRequired: false })], 'd', FP);
    const broken = text.replace('[8, new RequirementMeta("REQ-8"', '[8, new RequirementMeta(REQ-8');
    expect(recoverEntries(broken)).toEqual([{ id: 'REQ-7', number: 7, status: 'approved', title: 'say "hi", friend', sourcePath: 'docs/requirements/REQ-7.md', traceRequired: true, testRequired: true, contentHash: '0123456789abcdef', kind: 'technical', derivedFrom: [1, 2] }]);
    expect(recoverEntries(text).map((e) => e.number)).toEqual([7, 8]);
    expect(recoverEntries(null)).toEqual([]);
    expect(recoverEntry('  [9, new RequirementMeta("REQ-9", 10, Lifecycle.Draft, "t", "p", true, true, "0123456789abcdef", "product", [])],')).toBeNull();
    expect(recoverFingerprint(text)).toBe(FP);
    expect(recoverFingerprint('nothing')).toBeNull();
  });
});

describe('the baselines', () => {
  it('REQ-TRACE-117/118: shared parsing, 1-based over the raw file, merges by union, renders ascending with sorted flags', () => {
    const b = parseDebtBaseline('# header\n\nREQ-5 test\n  REQ-3 trace test  \nREQ-5 trace\nbogus line\nREQ-6\nREQ-7 trace test extra\nREQ-8 nope\n', 'REQ', 'docs/requirements/debt-baseline.txt');
    expect([...b.entries].map(([n, f]) => [n, [...f].sort()])).toEqual([[5, ['test', 'trace']], [3, ['test', 'trace']]]);
    expect(b.malformed.map((m) => m.message)).toEqual([
      'docs/requirements/debt-baseline.txt:6: malformed baseline line "bogus line"; expected <REQ-n> followed by one or two of the flags trace and test',
      'docs/requirements/debt-baseline.txt:7: malformed baseline line "REQ-6"; expected <REQ-n> followed by one or two of the flags trace and test',
      'docs/requirements/debt-baseline.txt:8: malformed baseline line "REQ-7 trace test extra"; expected <REQ-n> followed by one or two of the flags trace and test',
      'docs/requirements/debt-baseline.txt:9: malformed baseline line "REQ-8 nope"; expected <REQ-n> followed by one or two of the flags trace and test',
    ]);
    const text = renderDebtBaseline(b.entries, 'REQ');
    expect(text.endsWith('REQ-3 test trace\nREQ-5 test trace\n')).toBe(true);
    expect(text).toMatch(/only SHRINK/);
    expect(text).toMatch(/REQ-TRACE-510/);
    expect(text).toMatch(/Never add an entry for new work/);
    expect(parseDebtBaseline(null, 'REQ', 'p').entries.size).toBe(0);
  });
  it('REQ-TRACE-119/120: the two path baselines, loose and strict, rendered sorted with the marker in the header', () => {
    const m = parseOrphanModuleBaseline('src/b.ts\nsrc/a.ts\nno-dot\nhas space.ts\n', 'orphan-modules.txt');
    expect([...m.entries]).toEqual(['src/b.ts', 'src/a.ts']);
    expect(m.malformed.map((x) => x.line)).toEqual([3, 4]);
    expect(renderOrphanModuleBaseline(m.entries, 'trace-exempt')).toBe(`${renderOrphanModuleBaseline(new Set(), 'trace-exempt').trimEnd()}\nsrc/a.ts\nsrc/b.ts\n`);
    expect(renderOrphanModuleBaseline(new Set(), 'my-marker')).toContain('"my-marker"');
    const t = parseOrphanTestBaseline('tests/t.py::test_a\ntests/t.py::Klass::test_b\ntests/t.py\ntests/t::test_c\ntests/t.py::\n', 'orphan-tests.txt');
    expect([...t.entries]).toEqual(['tests/t.py::test_a', 'tests/t.py::Klass::test_b']);
    expect(t.malformed.map((x) => x.line)).toEqual([3, 4, 5]);
    expect(renderOrphanTestBaseline(t.entries, 'trace-exempt')).toContain('tests/t.py::Klass::test_b\ntests/t.py::test_a\n');
  });
  it('REQ-TRACE-124/125/129: the ratchets only ever remove; bootstrap records everything once', () => {
    const current = new Map<number, Set<'trace' | 'test'>>([[1, new Set(['trace'])], [2, new Set(['trace', 'test'])], [3, new Set<'trace' | 'test'>()]]);
    const boot = ratchetDebt(null, current);
    expect([...boot].map(([n, f]) => [n, [...f].sort()])).toEqual([[1, ['trace']], [2, ['test', 'trace']]]);
    const flags = (...f: ('trace' | 'test')[]) => new Set<'trace' | 'test'>(f);
    const later = ratchetDebt(new Map([[1, flags('trace', 'test')], [4, flags('trace')]]), new Map([[1, flags('test')], [5, flags('trace')]]));
    expect([...later].map(([n, f]) => [n, [...f]])).toEqual([[1, ['test']]]);
    expect([...ratchetSet(null, new Set(['b', 'a']))]).toEqual(['b', 'a']);
    expect([...ratchetSet(new Set(['a', 'gone']), new Set(['a', 'new']))]).toEqual(['a']);
  });
});
