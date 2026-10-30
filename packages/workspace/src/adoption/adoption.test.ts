/**
 * Domain 22 (PD-TRACE-001): the adoption assistant's detection pass, its adapter over an untrusted interpretation, the
 * record and the comparison on opening. Every model answer here is a literal: no test reaches a model.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DetectionResult } from '@rotaris/contracts';
import { adopt, adoptionInFlight, adoptionRecordPath, compareAdoption, composeAdapter, detectWorkspace, executeAdapter, readAdoptionRecord, type Interpretation } from './index.js';

const roots: string[] = [];
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }); });

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'rotaris-adopt-'));
  roots.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

/** A foreign project: FR identifiers as bold bullets, Python code annotated `# Implements FR-n`. */
const FOREIGN: Record<string, string> = {
  'docs/requirements/core.md': '# Core\n\n- **FR-1** — The system SHALL accept a login.\n- **FR-2** — The system SHALL reject a bad password.\n\n## Later\n\n- **FR-4** — The system SHALL lock after five failures.\n',
  'docs/requirements/export.md': '# Export\n\n- **FR-3** — The system SHALL export a report.\n',
  'src/app/login.py': '# Implements FR-1\ndef login():\n    pass\n# Implements FR-2\n',
  'src/app/report.py': '# Implements FR-3\ndef report():\n    pass\n',
  'tests/test_login.py': 'def test_login():\n    # Verifies FR-1\n    pass\n',
  'README.md': 'See FR-1 for details.\n',
  'node_modules/dep/README.md': '- **FR-99** — never read\n',
};

const GOOD = (detection: DetectionResult) => JSON.stringify({
  candidate: detection.candidates[0]!.id,
  id_prefix: 'FR',
  definition_pattern: '^-\\s+\\*\\*(FR-\\d+)\\*\\*',
  impl_roots: ['src'],
  test_roots: ['tests'],
  annotation_conventions: [{ name: 'python', extensions: ['.py'], reference_pattern: '(FR-\\d+)', annotation_pattern: '#\\s*Implements\\s+(FR-\\d+)', test_pattern: '#\\s*Verifies\\s+(FR-\\d+)', exempt_module_pattern: 'trace-exempt' }],
  notes: 'tests sit in tests/',
});

const interpreter = (answer: (d: DetectionResult) => string) => {
  const calls: DetectionResult[] = [];
  return { calls, interpret: async (d: DetectionResult): Promise<Interpretation> => { calls.push(d); return { ok: true, text: answer(d) }; } };
};
const deps = (interpret: (d: DetectionResult) => Promise<Interpretation>) => ({ interpret, now: () => '2026-10-29T12:00:00.000Z' });

/** Every file under the root with its size and modification time — what "nothing written" is measured against. */
function snapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) { out.push(`${p}/`); walk(p); } else { const s = statSync(join(root, p)); out.push(`${p} ${s.size} ${s.mtimeMs}`); }
    }
  };
  walk('');
  return out.sort();
}

describe('the detection pass (REQ-ADOPT-005 to REQ-ADOPT-010)', () => {
  it('finds the store, its family and numbering, the roots and the annotation vocabulary, by script', () => {
    const d = detectWorkspace(project(FOREIGN));
    expect(d.candidates.map((c) => c.id)).toEqual(['docs/requirements#FR#bullet']);
    expect(d.candidates[0]).toMatchObject({ prefix: 'FR', shape: 'bullet', documents: 2, identifiers: 4, numbering: 'contiguous', gaps: 0 });
    expect(d.implRoots).toEqual(['src']);
    expect(d.testRoots).toEqual(['tests']);
    expect(d.testFilePatterns).toEqual(['test_*.*']);
    expect(d.annotations.map((a) => `${a.extension} ${a.form} ${a.count}`)).toEqual(['.py # Implements 3', '.py # Verifies 1']);
    expect(d.undecided).toEqual([]);
  });

  it('names what it cannot decide rather than guessing: two families, dotted numbering, no store', () => {
    const two = detectWorkspace(project({ 'a/r.md': '- **FR-1** — a\n- **FR-2** — b\n', 'b/u.md': '## US-1.1 a\n## US-1.2 b\n' }));
    expect(two.undecided.map((u) => u.code).sort()).toEqual(['dotted-numbering', 'no-annotations', 'several-families', 'several-stores']);
    const none = detectWorkspace(project({ 'src/a.ts': 'export const a = 1;\n' }));
    expect(none.candidates).toEqual([]);
    expect(none.undecided.map((u) => u.code)).toEqual(['no-store']);
  });

  it('reports sparse numbering with its gaps and colocated tests', () => {
    const d = detectWorkspace(project({ 'spec/r.md': '| REQ-1 | a |\n| REQ-5 | b |\n', 'src/x.ts': '// REQ-1\n', 'src/x.test.ts': 'it("REQ-5", () => {});\n' }));
    expect(d.candidates[0]).toMatchObject({ shape: 'table-row', numbering: 'sparse', gaps: 3 });
    expect(d.undecided.map((u) => u.code)).toContain('tests-colocated');
  });

  it('never walks node_modules, hidden directories or the scope directory, and never follows a symbolic link out', () => {
    const outside = project({ 'secret/r.md': '- **ZZ-1** — x\n- **ZZ-2** — y\n' });
    const root = project({ ...FOREIGN, '.rotaris/r.md': '- **QQ-1** — x\n- **QQ-2** — y\n' });
    symlinkSync(join(outside, 'secret'), join(root, 'linked'));
    expect(detectWorkspace(root).candidates.map((c) => c.prefix)).toEqual(['FR']);
  });
});

describe('the adapter over an untrusted interpretation (REQ-ADOPT-011 to REQ-ADOPT-017)', () => {
  it('composes a layout the toolchain reads and executes it', () => {
    const root = project(FOREIGN);
    const d = detectWorkspace(root);
    const a = composeAdapter(GOOD(d), d, root);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value.storeDir).toBe('docs/requirements');
    const x = executeAdapter(root, a.value);
    expect(x.ok && x.value.requirements.map((r) => r.id)).toEqual(['FR-1', 'FR-2', 'FR-3', 'FR-4']);
    expect(x.ok && x.value.documents.map((r) => r.path)).toEqual(['docs/requirements/core.md', 'docs/requirements/export.md']);
  });

  it.each([
    ['empty', () => '', 'answer'],
    ['prose', () => 'I think the store is docs/requirements.', 'answer'],
    ['an unknown key', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), write_to: '/etc/passwd' }), 'write_to'],
    ['a missing key', (d: DetectionResult) => { const o = JSON.parse(GOOD(d)); delete o.notes; return JSON.stringify(o); }, 'notes'],
    ['an invented candidate', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), candidate: '../../etc#FR#bullet' }), 'candidate'],
    ['another family', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), id_prefix: 'REQ' }), 'id_prefix'],
    ['an absolute root', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), impl_roots: ['/usr'] }), 'impl_roots'],
    ['a root escaping by ..', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), test_roots: ['../outside'] }), 'test_roots'],
    ['a root that does not exist', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), impl_roots: ['lib'] }), 'impl_roots'],
    ['a pattern that does not compile', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), definition_pattern: '(FR-\\d+' }), 'definition_pattern'],
    ['a pattern with two groups', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), definition_pattern: '(-)\\s+(FR-\\d+)' }), 'definition_pattern'],
    ['a convention with a sixth key missing', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), annotation_conventions: [{ name: 'x', extensions: ['.py'], reference_pattern: 'a', annotation_pattern: 'b', test_pattern: 'c' }] }), 'annotation_conventions'],
    ['a convention pattern that does not compile', (d: DetectionResult) => JSON.stringify({ ...JSON.parse(GOOD(d)), annotation_conventions: [{ name: 'x', extensions: ['.py'], reference_pattern: '(', annotation_pattern: 'b', test_pattern: 'c', exempt_module_pattern: 'd' }] }), 'annotation_conventions'],
  ])('refuses %s, naming the field, and writes nothing', async (_label, answer, field) => {
    const root = project(FOREIGN);
    const before = snapshot(root);
    const r = await adopt(root, { mode: 'run', writeLayout: true }, deps(interpreter(answer).interpret));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.field).toBe(field);
    expect(snapshot(root)).toEqual(before);
  });

  it('a model that cannot be reached is a refusal, not a crash', async () => {
    const root = project(FOREIGN);
    const r = await adopt(root, { mode: 'run', writeLayout: false }, deps(async () => ({ ok: false, reason: 'No model is configured for the requirements-engineer role' })));
    expect(r).toMatchObject({ ok: false, field: 'answer', reason: 'No model is configured for the requirements-engineer role' });
    expect(existsSync(adoptionRecordPath(root))).toBe(false);
  });

  it('an interpreter that throws is a refusal, not a crash', async () => {
    const root = project(FOREIGN);
    const r = await adopt(root, { mode: 'run', writeLayout: false }, deps(async () => { throw new Error('socket hang up'); }));
    expect(r.ok).toBe(false);
    expect(adoptionInFlight(root)).toBe(false);
  });

  it('a store directory that is a symbolic link out of the workspace is refused', () => {
    const outside = project({ 'r/core.md': '- **FR-1** — a\n- **FR-2** — b\n' });
    const root = project({ 'src/a.py': '# FR-1\n' });
    mkdirSync(join(root, 'docs'));
    symlinkSync(join(outside, 'r'), join(root, 'docs', 'reqs'));
    const fake: DetectionResult = { ...detectWorkspace(root), candidates: [{ id: 'docs/reqs#FR#bullet', dir: 'docs/reqs', prefix: 'FR', shape: 'bullet', documents: 1, identifiers: 2, numbering: 'contiguous', gaps: 0, reasons: [], samples: [] }] };
    const r = composeAdapter(JSON.stringify({ candidate: 'docs/reqs#FR#bullet', id_prefix: 'FR', definition_pattern: '(FR-\\d+)', impl_roots: [], test_roots: [], annotation_conventions: [], notes: '' }), fake, root);
    expect(r).toMatchObject({ ok: false, field: 'candidate' });
  });
});

describe('initial run, re-run and the delta (REQ-ADOPT-018 to REQ-ADOPT-025)', () => {
  it('records the store, the family and each hash; the comparison on opening names a new requirement and writes nothing', async () => {
    const root = project(FOREIGN);
    const first = await adopt(root, { mode: 'run', writeLayout: false }, deps(interpreter(GOOD).interpret));
    expect(first.ok).toBe(true);
    expect(first.progress.filter((p) => p.kind === 'phase').map((p) => p.phase)).toEqual(['reading', 'adopting', 'reading', 'recording']);
    const rec = readAdoptionRecord(root);
    expect(rec.state).toBe('readable');
    if (rec.state !== 'readable') return;
    expect(rec.record.adapter).toMatchObject({ storeDir: 'docs/requirements', idPrefix: 'FR' });
    expect(rec.record.documents.every((d) => /^[0-9a-f]{16}$/.test(d.contentHash))).toBe(true);
    expect(rec.record.requirements.every((r) => /^[0-9a-f]{32}$/.test(r.canonicalHash))).toBe(true);
    expect(existsSync(join(root, 'rotaris-traceability.json'))).toBe(false);

    // Nothing changed since: adopted, empty delta.
    const quiet = compareAdoption(root);
    expect(quiet).toMatchObject({ state: 'adopted', delta: { newIds: [], changedIds: [], removedIds: [] }, current: 4 });

    // A requirement added to the codebase, one edited, one removed.
    writeFileSync(join(root, 'docs/requirements/export.md'), '# Export\n\n- **FR-3** — The system SHALL export a report as CSV.\n- **FR-5** — The system SHALL email the report.\n');
    writeFileSync(join(root, 'docs/requirements/core.md'), '# Core\n\n- **FR-1** — The system SHALL accept a login.\n- **FR-2** — The system SHALL reject a bad password.\n');
    const before = snapshot(root);
    const view = compareAdoption(root);
    expect(snapshot(root)).toEqual(before);
    expect(view).toMatchObject({ state: 'adopted', delta: { newIds: ['FR-5'], changedIds: ['FR-3'], removedIds: ['FR-4'], documentsChanged: ['docs/requirements/core.md', 'docs/requirements/export.md'] } });

    // Record current state: no model, the delta becomes the baseline.
    const none = interpreter(GOOD);
    const recorded = await adopt(root, { mode: 'record', writeLayout: false }, deps(none.interpret));
    expect(recorded.ok).toBe(true);
    expect(none.calls).toHaveLength(0);
    expect(compareAdoption(root)).toMatchObject({ state: 'adopted', delta: { newIds: [], changedIds: [], removedIds: [] } });
  });

  it('a re-run interprets again and replaces the record whole', async () => {
    const root = project(FOREIGN);
    const model = interpreter(GOOD);
    await adopt(root, { mode: 'run', writeLayout: false }, deps(model.interpret));
    writeFileSync(join(root, 'docs/requirements/more.md'), '- **FR-6** — new\n');
    await adopt(root, { mode: 'run', writeLayout: false }, deps(model.interpret));
    expect(model.calls).toHaveLength(2);
    const rec = readAdoptionRecord(root);
    expect(rec.state === 'readable' && rec.record.requirements.map((r) => r.id)).toEqual(['FR-1', 'FR-2', 'FR-3', 'FR-4', 'FR-6']);
  });

  it('writes the layout file only by choice and never over an existing one; the toolchain reads what it wrote', async () => {
    const root = project(FOREIGN);
    const r = await adopt(root, { mode: 'run', writeLayout: true }, deps(interpreter(GOOD).interpret));
    expect(r).toMatchObject({ ok: true, layoutFile: 'written' });
    const { loadLayout } = await import('../traceability/layout.js');
    const loaded = loadLayout(root);
    expect(loaded.ok && loaded.layout).toMatchObject({ requirementsDir: 'docs/requirements', idPrefix: 'FR', implRoots: ['src'], testRoots: ['tests'] });
    writeFileSync(join(root, 'rotaris-traceability.json'), '{"layout":{"id_prefix":"OWN"}}\n');
    const again = await adopt(root, { mode: 'run', writeLayout: true }, deps(interpreter(GOOD).interpret));
    expect(again).toMatchObject({ ok: true, layoutFile: 'kept' });
    expect(readFileSync(join(root, 'rotaris-traceability.json'), 'utf8')).toBe('{"layout":{"id_prefix":"OWN"}}\n');
  });

  it('adopts a store already in the toolchain\'s own form through its own parser', async () => {
    const root = project({
      'docs/requirements/a.md': '---\nreq-id: REQ-1\nstatus: approved\n---\n\n# Login\n\nThe system SHALL accept a login.\n',
      'docs/requirements/b.md': '---\nreq-id: REQ-2\nstatus: approved\n---\n\n# Logout\n\nThe system SHALL log out.\n',
      'src/a.ts': '// REQ-1\nexport const a = 1;\n',
    });
    const d = detectWorkspace(root);
    expect(d.candidates[0]?.id).toBe('docs/requirements#REQ#frontmatter');
    const r = await adopt(root, { mode: 'run', writeLayout: false }, deps(interpreter(() => JSON.stringify({ candidate: 'docs/requirements#REQ#frontmatter', id_prefix: 'REQ', definition_pattern: null, impl_roots: ['src'], test_roots: [], annotation_conventions: [], notes: '' })).interpret));
    expect(r.ok && r.record.requirements.map((q) => q.id)).toEqual(['REQ-1', 'REQ-2']);
    // A document the toolchain's parser refuses is named in the refusal, not dropped in silence.
    writeFileSync(join(root, 'docs/requirements/a.md'), '---\nreq-id: REQ-1\n---\n# x\n');
    writeFileSync(join(root, 'docs/requirements/b.md'), '---\nreq-id: REQ-2\n---\n# y\n');
    const refused = await adopt(root, { mode: 'record', writeLayout: false }, deps(interpreter(GOOD).interpret));
    expect(refused.ok === false && refused.reason).toMatch(/status/);
  });

  it('opening with no record reports not adopted with the detection; an unreadable record is reported and left alone', () => {
    const root = project(FOREIGN);
    expect(compareAdoption(root)).toMatchObject({ state: 'not-adopted', detection: { candidates: [{ id: 'docs/requirements#FR#bullet' }] } });
    expect(existsSync(join(root, '.rotaris'))).toBe(false);
    mkdirSync(join(root, '.rotaris'));
    writeFileSync(adoptionRecordPath(root), '{"version":2}');
    const view = compareAdoption(root);
    expect(view.state).toBe('unreadable');
    expect(readFileSync(adoptionRecordPath(root), 'utf8')).toBe('{"version":2}');
  });

  it('a hand-edited record whose adapter escapes the workspace no longer validates', async () => {
    const root = project(FOREIGN);
    await adopt(root, { mode: 'run', writeLayout: false }, deps(interpreter(GOOD).interpret));
    const doc = JSON.parse(readFileSync(adoptionRecordPath(root), 'utf8'));
    doc.adapter.storeDir = '../..';
    doc.adapter.layout.requirements_dir = '../..';
    writeFileSync(adoptionRecordPath(root), JSON.stringify(doc));
    expect(compareAdoption(root).state).toBe('unreadable');
    const r = await adopt(root, { mode: 'record', writeLayout: false }, deps(interpreter(GOOD).interpret));
    expect(r.ok).toBe(false);
  });
});

describe('families REQ-TRACE-078 cannot write are named, not adopted (REQ-ADOPT-008, REQ-ADOPT-010)', () => {
  it('a zero-padded family (REQ-001) is a candidate, named undecidable, and refused at the adapter', async () => {
    const root = project({ 'docs/req/a.md': '- **REQ-001** — a\n- **REQ-002** — b\n', 'src/a.ts': '// REQ-001\n' });
    const d = detectWorkspace(root);
    expect(d.candidates[0]).toMatchObject({ id: 'docs/req#REQ#bullet', numbering: 'zero-padded' });
    expect(d.undecided.map((u) => u.code)).toContain('zero-padded-numbering');
    const r = await adopt(root, { mode: 'run', writeLayout: false }, deps(interpreter(() => JSON.stringify({ candidate: 'docs/req#REQ#bullet', id_prefix: 'REQ', definition_pattern: '\\*\\*(REQ-\\d+)\\*\\*', impl_roots: ['src'], test_roots: [], annotation_conventions: [], notes: '' })).interpret));
    expect(r).toMatchObject({ ok: false, field: 'candidate' });
    expect(existsSync(adoptionRecordPath(root))).toBe(false);
  });

  it('a namespaced family (REQ-AUTH-1), this repository\'s own form, is a candidate named undecidable rather than no store', () => {
    const d = detectWorkspace(project({ 'docs/spec/auth.md': '- **REQ-AUTH-1** — a\n- **REQ-AUTH-2** — b\n' }));
    expect(d.candidates[0]).toMatchObject({ prefix: 'REQ-AUTH', numbering: 'contiguous' });
    expect(d.undecided.map((u) => u.code)).toEqual(expect.arrayContaining(['namespaced-prefix']));
    expect(d.undecided.map((u) => u.code)).not.toContain('no-store');
  });
});
