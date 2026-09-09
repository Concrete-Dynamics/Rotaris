import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LAYOUT_CONFIG_FILE, defaultLayout, loadLayout, parseLayout, toSeamLayout } from './layout.js';
import { discoverRoot } from './root.js';

/** REQ-TRACE-038 to REQ-TRACE-049: the layout value, its thirteen keys, the strict loader, and root discovery. */
const at = (text: string) => parseLayout(text, 'rotaris-traceability.json');
const fails = (text: string) => { try { at(text); return ''; } catch (e) { return (e as Error).message; } };

describe('the layout configuration', () => {
  it('REQ-TRACE-038/039: a repository that configures nothing behaves as one that writes all thirteen defaults', () => {
    const explicit = at(JSON.stringify({ layout: { requirements_dir: 'docs/requirements', id_prefix: 'REQ', generated_path: 'src/requirement_ids.ts', impl_roots: ['src'], test_roots: ['tests'], excused_test_roots: [], baseline_path: 'docs/requirements/debt-baseline.txt', orphan_baseline_path: 'docs/requirements/orphan-modules.txt', test_orphan_baseline_path: 'docs/requirements/orphan-tests.txt', tombstone_path: 'docs/requirements/retired-identifiers.tsv', exempt_marker: 'trace-exempt', skip_parts: ['node_modules', 'dist', 'fixtures'], annotation_conventions: [] } }));
    expect(explicit).toEqual(defaultLayout());
    expect(defaultLayout().skipParts).toEqual(['dist', 'fixtures', 'node_modules']);
  });
  it('REQ-TRACE-041/046: keys at the top level or under `layout`; a non-object `layout` and a non-object top level fail naming the file', () => {
    expect(at('{"id_prefix": "ABC"}').idPrefix).toBe('ABC');
    expect(fails('{"layout": 3}')).toBe('rotaris-traceability.json: the `layout` key must hold an object');
    expect(fails('[1]')).toBe('rotaris-traceability.json: a JSON object was expected at the top level');
    expect(fails('{not json')).toMatch(/^rotaris-traceability\.json: the layout configuration cannot be read: /);
  });
  it('REQ-TRACE-042: an unknown key lists the offenders and the accepted keys, both sorted', () => {
    expect(fails('{"zeta": 1, "alpha": 2}')).toBe('rotaris-traceability.json: unrecognized keys: alpha, zeta; accepted keys: annotation_conventions, baseline_path, excused_test_roots, exempt_marker, generated_path, id_prefix, impl_roots, orphan_baseline_path, requirements_dir, skip_parts, test_orphan_baseline_path, test_roots, tombstone_path');
  });
  it('REQ-TRACE-043: path values — backslashes normalised, the two distinct rejections', () => {
    expect(at('{"generated_path": "src\\\\gen\\\\ids.ts/"}').generatedPath).toBe('src/gen/ids.ts');
    expect(fails('{"generated_path": ""}')).toContain('generated_path: not a non-empty repository-relative path');
    expect(fails('{"generated_path": 3}')).toContain('generated_path: not a non-empty repository-relative path');
    expect(fails('{"generated_path": "/abs/ids.ts"}')).toContain('generated_path: must be relative and stay inside the repository');
    expect(fails('{"generated_path": "C:\\\\x.ts"}')).toContain('must be relative and stay inside the repository');
    expect(fails('{"generated_path": "src/../x.ts"}')).toContain('must be relative and stay inside the repository');
  });
  it('REQ-TRACE-044: list keys reject a bare string; skip_parts becomes a set; exempt_marker non-empty; id_prefix shape; conventions exactly six keys and compiling patterns', () => {
    expect(fails('{"impl_roots": "src"}')).toBe('rotaris-traceability.json: impl_roots: expected a list of repository-relative paths, not a single string (got "src")');
    expect(fails('{"skip_parts": "dist"}')).toContain('skip_parts: expected a list of path components, not a single string');
    expect(at('{"skip_parts": ["b", "a", "b"]}').skipParts).toEqual(['a', 'b']);
    expect(fails('{"exempt_marker": ""}')).toContain('exempt_marker: expected a non-empty string');
    for (const p of ['req', 'R-Q', '1RQ', '']) expect(fails(`{"id_prefix": ${JSON.stringify(p)}}`)).toContain(`id_prefix: expected a non-empty string of uppercase letters and digits beginning with a letter and containing no hyphen (got ${JSON.stringify(p)})`);
    expect(at('{"id_prefix": "AB2"}').idPrefix).toBe('AB2');
    const conv = { name: 'py', extensions: ['.py'], reference_pattern: '(\\d+)', annotation_pattern: '@(implements|covers)\\(([^()]*)\\)', test_pattern: '^def (test\\w*)', exempt_module_pattern: '^# re-export' };
    expect(at(JSON.stringify({ annotation_conventions: [conv] })).annotationConventions[0]).toEqual({ name: 'py', extensions: ['.py'], referencePattern: '(\\d+)', annotationPattern: '@(implements|covers)\\(([^()]*)\\)', testPattern: '^def (test\\w*)', exemptModulePattern: '^# re-export' });
    expect(fails(JSON.stringify({ annotation_conventions: [{ ...conv, extra: 1 }] }))).toContain('annotation_conventions[0]: unrecognized keys extra; accepted keys: annotation_pattern, exempt_module_pattern, extensions, name, reference_pattern, test_pattern');
    expect(fails(JSON.stringify({ annotation_conventions: [{ ...conv, extensions: [] }] }))).toContain('(py).extensions: expected a non-empty list of extensions written with their leading dot');
    expect(fails(JSON.stringify({ annotation_conventions: [{ ...conv, test_pattern: '(' }] }))).toMatch(/convention py, key test_pattern: the pattern does not compile — /);
    expect(fails(JSON.stringify({ annotation_conventions: 'py' }))).toContain('annotation_conventions: expected a list of convention objects');
  });
  it('REQ-TRACE-045: requirements_dir relocates the four bookkeeping artifacts; an explicit path still wins whatever the key order', () => {
    const moved = at('{"requirements_dir": "reqs"}');
    expect([moved.baselinePath, moved.orphanBaselinePath, moved.testOrphanBaselinePath, moved.tombstonePath]).toEqual(['reqs/debt-baseline.txt', 'reqs/orphan-modules.txt', 'reqs/orphan-tests.txt', 'reqs/retired-identifiers.tsv']);
    const explicitFirst = at('{"tombstone_path": "meta/retired.tsv", "requirements_dir": "reqs"}');
    expect(explicitFirst.tombstonePath).toBe('meta/retired.tsv');
    expect(explicitFirst.baselinePath).toBe('reqs/debt-baseline.txt');
  });
  it('the seam projection carries the eleven fields the plan fixes', () => {
    const s = toSeamLayout(defaultLayout());
    expect(Object.keys(s).sort()).toEqual(['annotationPatterns', 'artifactPath', 'debtBaselinePath', 'idPrefix', 'orphanModuleBaselinePath', 'orphanTestBaselinePath', 'retiredLogPath', 'skip', 'sourceRoots', 'storeDir', 'testRoots']);
  });
});

describe('root discovery and loading', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'rotaris-root-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });
  it('REQ-TRACE-040/046: absent → the default with no error; unreadable or invalid → the path and the cause', () => {
    expect(loadLayout(dir)).toEqual({ ok: true, layout: defaultLayout(), configPath: null });
    writeFileSync(join(dir, LAYOUT_CONFIG_FILE), '{"bogus": 1}');
    const r = loadLayout(dir);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.path).toBe(join(dir, LAYOUT_CONFIG_FILE)); expect(r.cause).toContain('unrecognized keys: bogus'); }
  });
  it('REQ-TRACE-048/049: innermost first; a configuration file wins outright; else the store and one implementation root; else the start directory', () => {
    const outer = join(dir, 'outer');
    const inner = join(outer, 'a', 'b');
    mkdirSync(join(inner, 'deep'), { recursive: true });
    expect(discoverRoot(join(inner, 'deep'))).toBe(join(inner, 'deep'));
    mkdirSync(join(outer, 'docs', 'requirements'), { recursive: true });
    expect(discoverRoot(join(inner, 'deep'))).toBe(join(inner, 'deep'));
    mkdirSync(join(outer, 'src'), { recursive: true });
    expect(discoverRoot(join(inner, 'deep'))).toBe(outer);
    writeFileSync(join(inner, LAYOUT_CONFIG_FILE), '{}');
    expect(discoverRoot(join(inner, 'deep'))).toBe(inner);
  });
});
