import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { CancelledError, freshToken } from './cancel.js';
import { canonicalPayload, contentHash } from './hashes.js';
import { defaultLayout } from './layout.js';
import { enumerateStore, indexDocumentOf, parseDocument, parseStore } from './store.js';
import { probeStore } from './probe.js';

/** ADR-0040 specific 1: the streaming store parse against REQ-TRACE-001..037, 134, 198, 199, 503. */
let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rotaris-store-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });
const put = (rel: string, text: string): void => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const layout = defaultLayout();

const single = (id: string, extra = '', body = `# ${id} - A title\n\nSome prose.\n\n## Notes\n\nNot prose.\n`) => `---\nreq-id: ${id}\nstatus: approved\n${extra}---\n\n${body}`;

describe('parseDocument', () => {
  it('REQ-TRACE-003/012: no frontmatter and no req-id are silent', () => {
    expect(parseDocument('# README\n', 'docs/requirements/README.md', 'REQ')).toMatchObject({ kind: 'no-frontmatter', records: [], errors: [] });
    expect(parseDocument('---\ntitle: template\n---\n', 'docs/requirements/t.md', 'REQ')).toMatchObject({ kind: 'no-identifier', records: [], errors: [] });
  });
  it('REQ-TRACE-014..020: the seven keys, the defaults, the provenance fields, the title order, the prose rule', () => {
    const d = parseDocument(single('REQ-101', 'legacy-id: OLD-1\npriority: P1\nepic: REQ-100\ndate: 2026-01-02\nsource: old/doc.md\nowner: ignored\n'), 'docs/requirements/REQ-100-e/REQ-101-x.md', 'REQ');
    expect(d.kind).toBe('requirements');
    expect(d.errors).toEqual([]);
    const r = d.records[0]!;
    expect(r).toMatchObject({ id: 'REQ-101', number: 101, status: 'approved', traceRequired: true, testRequired: true, kind: 'product', derivedFrom: [], legacyId: 'OLD-1', priority: 'P1', date: '2026-01-02', source: 'old/doc.md', title: 'A title', prose: 'Some prose.' });
    expect(r.contentHash).toHaveLength(16);
    expect(r.canonicalHash).toHaveLength(32);
    // the frontmatter title beats the heading; the heading's identifier lead is stripped
    expect(parseDocument(single('REQ-102', 'title: Named\n'), 'p.md', 'REQ').records[0]!.title).toBe('Named');
    expect(parseDocument('---\nreq-id: REQ-103\nstatus: draft\n---\n', 'p.md', 'REQ').records[0]!.title).toBe('');
    expect(parseDocument('---\nreq-id: REQ-104\nstatus: draft\n---\n# Plain heading\n', 'p.md', 'REQ').records[0]!.title).toBe('Plain heading');
  });
  it('REQ-TRACE-016/017/018/022/027: the parse errors name the document, the identifier, the value and the sorted accepted set; a failing document contributes nothing (026)', () => {
    const bad = (text: string) => parseDocument(text, 'docs/requirements/x.md', 'REQ');
    expect(bad('---\nreq-id: REQ-1\nstatus: live\n---\n').errors[0]!.message).toBe('docs/requirements/x.md (REQ-1): status "live" is not accepted; accepted values: approved, deprecated, draft');
    expect(bad('---\nreq-id: REQ-1\n---\n').errors[0]!.message).toBe('docs/requirements/x.md (REQ-1): status is missing; accepted values: approved, deprecated, draft');
    expect(bad('---\nreq-id: REQ-1\nstatus: draft\ntrace: maybe\n---\n').errors[0]!.message).toBe('docs/requirements/x.md (REQ-1): trace "maybe" is not accepted; accepted values: optional, required');
    expect(bad('---\nreq-id: REQ-1\nstatus: draft\ntest: no\n---\n').errors[0]!.message).toContain('test "no" is not accepted');
    expect(bad('---\nreq-id: REQ-1\nstatus: draft\ntype: epic\n---\n').errors[0]!.message).toBe('docs/requirements/x.md (REQ-1): type "epic" is not accepted; accepted values: product, technical');
    expect(bad('---\nreq-id: REQ-1\nstatus: draft\ntype:   \n---\n').records[0]!.kind).toBe('product');
    for (const v of ['REQ-01', 'req-1', 'REQ_1', 'REQ-1a', 'X-1', 'REQ-']) expect(bad(`---\nreq-id: ${v}\nstatus: draft\n---\n`).errors[0]!.message).toContain(`req-id ${JSON.stringify(v)} is not an identifier of the form REQ-<digits>`);
    expect(bad('---\nreq-id: [ , ]\nstatus: draft\n---\n').errors[0]!.message).toContain('req-id is an empty list');
    for (const t of [bad('---\nreq-id: REQ-1\nstatus: live\n---\n'), bad('---\nreq-id: REQ-01\nstatus: draft\n---\n')]) { expect(t.kind).toBe('invalid'); expect(t.records).toEqual([]); }
  });
  it('REQ-TRACE-019: a bad derived-from token errors, is skipped, and the rest still parse', () => {
    const d = parseDocument('---\nreq-id: REQ-1\nstatus: draft\ntype: technical\nderived-from: [REQ-2, nope, REQ-3]\n---\n', 'x.md', 'REQ');
    expect(d.records[0]!.derivedFrom).toEqual(['REQ-2', 'REQ-3']);
    expect(d.errors.map((e) => e.message)).toEqual(['x.md (REQ-1): derived-from token "nope" is not an identifier of the form REQ-<digits>; it was skipped']);
  });
  it('REQ-TRACE-027..035: a multi-identifier document — headings, title overrides, override blocks, per-identifier prose, one hash, no legacy inheritance', () => {
    const text = ['---', 'req-id: [REQ-200, REQ-201, REQ-202, REQ-203]', 'status: approved', 'legacy-id: DOC-LEVEL', 'title: shared', '---', '', '# REQ-200 - The epic', '', 'intro prose', '',
      '## REQ-200', 'epic prose', '', '### REQ-201 - First child', '', 'status: draft', 'legacy-id: OLD-201', 'Prose: not a field (capital)', '', 'first prose', '## REQ-202: Second', 'trace: optional', '', 'second prose', 'trailing: not absorbed', ''].join('\n');
    const d = parseDocument(text, 'docs/requirements/REQ-200-m.md', 'REQ');
    expect(d.records.map((r) => r.id)).toEqual(['REQ-200', 'REQ-201', 'REQ-202']);
    const [e, a, b] = d.records;
    expect(e).toMatchObject({ title: 'shared', status: 'approved', prose: 'epic prose' });
    expect(e!.legacyId).toBeUndefined();
    expect(a).toMatchObject({ title: 'First child', status: 'draft', legacyId: 'OLD-201', traceRequired: true, prose: 'Prose: not a field (capital)\n\nfirst prose' });
    expect(b).toMatchObject({ title: 'Second', status: 'approved', traceRequired: false, prose: 'second prose\ntrailing: not absorbed' });
    expect(new Set(d.records.map((r) => r.contentHash)).size).toBe(1);
    expect(new Set(d.records.map((r) => r.canonicalHash)).size).toBe(3);
    expect(d.errors.map((m) => m.message)).toEqual(['docs/requirements/REQ-200-m.md (REQ-203): no body heading declares REQ-203; expected a heading of level 2 to 6 whose text begins with the identifier, such as "## REQ-203 - <title>"']);
    // REQ-TRACE-034: a single-identifier document never consults body headings
    const s = parseDocument('---\nreq-id: REQ-5\nstatus: approved\n---\n## REQ-5 - Override\nstatus: draft\n', 'x.md', 'REQ');
    expect(s.records[0]).toMatchObject({ status: 'approved', title: '' });
  });
  it('REQ-TRACE-036/037: the content hash is the first 16 hex of SHA-256 over the whole normalised text; the canonical hash ignores key order and formatting and differs per identifier', () => {
    const a = '---\nreq-id: REQ-7\nstatus: approved\ntitle: T\n---\n# REQ-7\n\nprose   here\n';
    const b = '---\ntitle: T\nstatus: approved\nreq-id: REQ-7\n---\n\n\n# REQ-7\n\nprose here\n\n';
    const ra = parseDocument(a, 'x.md', 'REQ').records[0]!;
    const rb = parseDocument(b, 'x.md', 'REQ').records[0]!;
    expect(ra.contentHash).toBe(createHash('sha256').update(a).digest('hex').slice(0, 16));
    expect(contentHash(a)).not.toBe(contentHash(b));
    expect(ra.canonicalHash).toBe(rb.canonicalHash);
    expect(ra.canonicalHash).toBe(createHash('sha256').update(canonicalPayload(['REQ-7', 'approved', 'required', 'required', 'product', '', 'T', 'prose here'])).digest('hex').slice(0, 32));
  });
});

describe('parseStore', () => {
  it('REQ-TRACE-005/006/023/134/199: path order, CRLF-independent hashes, first claimant wins, tombstone reuse refused, epics from layout', () => {
    put('docs/requirements/REQ-100-epic.md', '---\nreq-id: REQ-100\nstatus: approved\ntrace: optional\ntest: optional\n---\n# REQ-100 - Epic\n');
    put('docs/requirements/REQ-100-epic/REQ-101-a.md', single('REQ-101'));
    put('docs/requirements/REQ-100-epic/REQ-102-b.md', single('REQ-102').replace(/\n/g, '\r\n'));
    put('docs/requirements/REQ-100-epic/deep/REQ-103-c.md', single('REQ-103'));
    put('docs/requirements/REQ-100-epic/z-dup.md', single('REQ-101'));
    put('docs/requirements/REQ-200-multi.md', '---\nreq-id: [REQ-200, REQ-205]\nstatus: draft\n---\n## REQ-200\n## REQ-205\n');
    put('docs/requirements/REQ-900-reused.md', single('REQ-900'));
    put('docs/requirements/README.md', '# no frontmatter\n');
    put('docs/requirements/fixtures/REQ-950-skipped.md', single('REQ-950'));
    expect(enumerateStore(root, layout)).toEqual(['docs/requirements/README.md', 'docs/requirements/REQ-100-epic.md', 'docs/requirements/REQ-100-epic/REQ-101-a.md', 'docs/requirements/REQ-100-epic/REQ-102-b.md', 'docs/requirements/REQ-100-epic/deep/REQ-103-c.md', 'docs/requirements/REQ-100-epic/z-dup.md', 'docs/requirements/REQ-200-multi.md', 'docs/requirements/REQ-900-reused.md']);
    const p = parseStore({ root, layout, retiredLog: '# header\nREQ-900\t2026-01-01\tGone\n' });
    expect(p.records.map((r) => [r.id, r.epic, r.isEpic])).toEqual([['REQ-100', undefined, true], ['REQ-101', 'REQ-100', false], ['REQ-102', 'REQ-100', false], ['REQ-103', 'REQ-100', false], ['REQ-200', undefined, true], ['REQ-205', 'REQ-200', false]]);
    expect(p.records[1]!.contentHash).toBe(p.records[2]!.contentHash.length === 16 ? contentHash(single('REQ-101')) : '');
    expect(p.records[2]!.contentHash).toBe(contentHash(single('REQ-102')));
    expect(p.errors.map((e) => e.message)).toEqual([
      'docs/requirements/REQ-100-epic/z-dup.md (REQ-101): REQ-101 is already declared by docs/requirements/REQ-100-epic/REQ-101-a.md; this later declaration is dropped',
      'docs/requirements/REQ-900-reused.md (REQ-900): REQ-900 was retired on 2026-01-01 (last titled "Gone") and cannot be claimed again; claim the next free identifier',
    ]);
    expect(p.fingerprint).toHaveLength(64);
    expect(p.empty).toBeUndefined();
    expect(p.details.documents.find((d) => d.path.endsWith('README.md'))).toMatchObject({ kind: 'no-frontmatter', ids: [] });
    expect(p.details.tombstoned).toEqual([900]);
    expect(indexDocumentOf('docs/requirements/REQ-100-epic/deep/x.md', 'docs/requirements')).toBe('docs/requirements/REQ-100-epic.md');
  });
  it('REQ-TRACE-021: legacy aliases resolve only when claimed by exactly one requirement, case-insensitively', () => {
    put('docs/requirements/a.md', single('REQ-1', 'legacy-id: old-a\n'));
    put('docs/requirements/b.md', single('REQ-2', 'legacy-id: SHARED\n'));
    put('docs/requirements/c.md', single('REQ-3', 'legacy-id: shared\n'));
    expect(parseStore({ root, layout, retiredLog: null }).details.legacyAliases).toEqual({ 'OLD-A': 1, SHARED: null });
  });
  it('REQ-TRACE-503/177..180: the three empty findings, and the probe that decides them by reading', () => {
    expect(parseStore({ root, layout, retiredLog: null }).empty).toBe('no-directory');
    expect(probeStore(root, layout)).toEqual({ declaresIdentifier: false, frontmatterWithoutIdentifier: 0, inspected: 0 });
    put('docs/requirements/README.md', '# nothing\n');
    expect(parseStore({ root, layout, retiredLog: null }).empty).toBe('no-documents');
    expect(probeStore(root, layout)).toEqual({ declaresIdentifier: false, frontmatterWithoutIdentifier: 0, inspected: 1 });
    put('docs/requirements/foreign.md', '---\nid: OTHER-1\nstate: open\n---\n');
    expect(parseStore({ root, layout, retiredLog: null }).empty).toBe('no-requirements');
    expect(probeStore(root, layout)).toEqual({ declaresIdentifier: false, frontmatterWithoutIdentifier: 1, inspected: 2 });
    put('docs/requirements/z.md', single('REQ-1'));
    expect(parseStore({ root, layout, retiredLog: null }).empty).toBeUndefined();
    // the probe stops at the first identifier: `foreign.md` and `README.md` sort before `z.md`
    expect(probeStore(root, layout)).toEqual({ declaresIdentifier: true, frontmatterWithoutIdentifier: 1, inspected: 3 });
  });
  it('REQ-TRACE-222: a checkpoint between documents raises the dedicated error and reads no further', () => {
    put('docs/requirements/a.md', single('REQ-1'));
    put('docs/requirements/b.md', single('REQ-2'));
    const c = new AbortController();
    c.abort();
    expect(() => parseStore({ root, layout, retiredLog: null, token: freshToken(c.signal) })).toThrow(CancelledError);
    try { parseStore({ root, layout, retiredLog: null, token: freshToken(c.signal) }); } catch (e) { expect((e as Error).message).toBe('the requirement index refresh was cancelled (before docs/requirements/a.md)'); }
  });
});
