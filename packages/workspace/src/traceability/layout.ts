import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LayoutConfig } from '@rotaris/contracts';

/**
 * The layout configuration (REQ-TRACE-038 to REQ-TRACE-047): one value carrying every location the toolchain needs,
 * thirteen keys each with a default, read from `rotaris-traceability.json` at the repository root and nowhere else
 * (040 — this constant is the product's single definition of the name), JSON because the parser must run without
 * an activated project environment (013). Every path is repository-relative; the caller resolves it against a root.
 */
export const LAYOUT_CONFIG_FILE = 'rotaris-traceability.json';

/** The single source extension the built-in convention claims (REQ-TRACE-075; ADR-0040 #4). */
export const BUILT_IN_EXTENSION = '.ts';

/**
 * REQ-TRACE-039 `skip_parts`: `fixtures` is fixed there; the two toolchain names are the implementation language's —
 * for TypeScript, `node_modules` (installed dependencies) and `dist` (the compiler's emitted output, the nearest thing
 * its toolchain has to a generated cache). Exactly those two and no third.
 */
export const DEFAULT_SKIP_PARTS: readonly string[] = ['dist', 'fixtures', 'node_modules'];

/** REQ-TRACE-073: one project-declared convention, exactly six keys. */
export interface AnnotationConvention {
  readonly name: string;
  readonly extensions: readonly string[];
  readonly referencePattern: string;
  readonly annotationPattern: string;
  readonly testPattern: string;
  readonly exemptModulePattern: string;
}

/** The thirteen keys, resolved. Serialisable (crosses the worker boundary by structured clone). */
export interface ResolvedLayout {
  readonly requirementsDir: string;
  readonly idPrefix: string;
  readonly generatedPath: string;
  readonly implRoots: readonly string[];
  readonly testRoots: readonly string[];
  readonly excusedTestRoots: readonly string[];
  readonly baselinePath: string;
  readonly orphanBaselinePath: string;
  readonly testOrphanBaselinePath: string;
  readonly tombstonePath: string;
  readonly exemptMarker: string;
  /** An unordered set (044), held sorted so two layouts compare by value. */
  readonly skipParts: readonly string[];
  readonly annotationConventions: readonly AnnotationConvention[];
}

const KEYS = ['annotation_conventions', 'baseline_path', 'excused_test_roots', 'exempt_marker', 'generated_path', 'id_prefix', 'impl_roots', 'orphan_baseline_path', 'requirements_dir', 'skip_parts', 'test_orphan_baseline_path', 'test_roots', 'tombstone_path'] as const;
const CONVENTION_KEYS = ['annotation_pattern', 'exempt_module_pattern', 'extensions', 'name', 'reference_pattern', 'test_pattern'] as const;

/** REQ-TRACE-038/039: the default layout, complete. */
export function defaultLayout(): ResolvedLayout {
  const dir = 'docs/requirements';
  return {
    requirementsDir: dir, idPrefix: 'REQ', generatedPath: `src/requirement_ids${BUILT_IN_EXTENSION}`,
    implRoots: ['src'], testRoots: ['tests'], excusedTestRoots: [],
    baselinePath: `${dir}/debt-baseline.txt`, orphanBaselinePath: `${dir}/orphan-modules.txt`, testOrphanBaselinePath: `${dir}/orphan-tests.txt`, tombstonePath: `${dir}/retired-identifiers.tsv`,
    exemptMarker: 'trace-exempt', skipParts: [...DEFAULT_SKIP_PARTS], annotationConventions: [],
  };
}

export class LayoutError extends Error {
  constructor(readonly configPath: string, readonly cause_: string) { super(`${configPath}: ${cause_}`); }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** REQ-TRACE-043: non-empty, forward slashes, relative, no `..` segment — two distinct messages. */
export function validatePath(key: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${key}: not a non-empty repository-relative path (got ${JSON.stringify(value)})`);
  let p = value.replace(/\\/g, '/');
  while (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p.split('/').includes('..')) throw new Error(`${key}: must be relative and stay inside the repository (got ${JSON.stringify(value)})`);
  return p;
}

function validatePathList(key: string, value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error(`${key}: expected a list of repository-relative paths${typeof value === 'string' ? ', not a single string' : ''} (got ${JSON.stringify(value)})`);
  return value.map((v) => validatePath(key, v));
}

function validateConvention(index: number, value: unknown): AnnotationConvention {
  if (!isObject(value)) throw new Error(`annotation_conventions[${index}]: expected an object carrying exactly these keys: ${CONVENTION_KEYS.join(', ')}`);
  const present = Object.keys(value).sort();
  const unknown = present.filter((k) => !(CONVENTION_KEYS as readonly string[]).includes(k));
  const missing = CONVENTION_KEYS.filter((k) => !present.includes(k));
  if (unknown.length > 0 || missing.length > 0) throw new Error(`annotation_conventions[${index}]: ${unknown.length > 0 ? `unrecognized keys ${unknown.join(', ')}` : ''}${unknown.length > 0 && missing.length > 0 ? '; ' : ''}${missing.length > 0 ? `missing keys ${missing.join(', ')}` : ''}; accepted keys: ${CONVENTION_KEYS.join(', ')}`);
  const name = value.name;
  if (typeof name !== 'string' || name.length === 0) throw new Error(`annotation_conventions[${index}].name: expected a non-empty string`);
  const extensions = value.extensions;
  if (!Array.isArray(extensions) || extensions.length === 0 || !extensions.every((e) => typeof e === 'string' && e.startsWith('.') && e.length > 1)) throw new Error(`annotation_conventions[${index}] (${name}).extensions: expected a non-empty list of extensions written with their leading dot`);
  const pattern = (key: 'reference_pattern' | 'annotation_pattern' | 'test_pattern' | 'exempt_module_pattern'): string => {
    const p = value[key];
    if (typeof p !== 'string') throw new Error(`annotation_conventions[${index}] (${name}).${key}: expected a regular expression string`);
    try { new RegExp(p, 'g'); } catch (e) { throw new Error(`convention ${name}, key ${key}: the pattern does not compile — ${e instanceof Error ? e.message : String(e)}`); }
    return p;
  };
  return { name, extensions: extensions as string[], referencePattern: pattern('reference_pattern'), annotationPattern: pattern('annotation_pattern'), testPattern: pattern('test_pattern'), exemptModulePattern: pattern('exempt_module_pattern') };
}

/**
 * Parse a configuration document's text. Every validation failure is re-raised prefixed with the configuration
 * path (046). Application order is REQ-TRACE-045's: the store-directory move first, then the generated path, the
 * path-list fields, the four explicit bookkeeping paths, the exempt marker, the skip components, the identifier
 * prefix, then the annotation conventions — so an explicit baseline path wins regardless of key order.
 */
export function parseLayout(text: string, configPath: string): ResolvedLayout {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch (e) { throw new LayoutError(configPath, `the layout configuration cannot be read: ${e instanceof Error ? e.message : String(e)}`); }
  if (!isObject(doc)) throw new LayoutError(configPath, 'a JSON object was expected at the top level');
  let table: Record<string, unknown> = doc;
  if ('layout' in doc) {
    if (!isObject(doc.layout)) throw new LayoutError(configPath, 'the `layout` key must hold an object');
    table = doc.layout;
  }
  try {
    const present = Object.keys(table).sort();
    const unknown = present.filter((k) => !(KEYS as readonly string[]).includes(k));
    if (unknown.length > 0) throw new Error(`unrecognized keys: ${unknown.join(', ')}; accepted keys: ${KEYS.join(', ')}`);
    const d = defaultLayout();
    const out: { -readonly [K in keyof ResolvedLayout]: ResolvedLayout[K] } = { ...d };
    if ('requirements_dir' in table) {
      out.requirementsDir = validatePath('requirements_dir', table.requirements_dir);
      out.baselinePath = `${out.requirementsDir}/debt-baseline.txt`;
      out.orphanBaselinePath = `${out.requirementsDir}/orphan-modules.txt`;
      out.testOrphanBaselinePath = `${out.requirementsDir}/orphan-tests.txt`;
      out.tombstonePath = `${out.requirementsDir}/retired-identifiers.tsv`;
    }
    if ('generated_path' in table) out.generatedPath = validatePath('generated_path', table.generated_path);
    if ('impl_roots' in table) out.implRoots = validatePathList('impl_roots', table.impl_roots);
    if ('test_roots' in table) out.testRoots = validatePathList('test_roots', table.test_roots);
    if ('excused_test_roots' in table) out.excusedTestRoots = validatePathList('excused_test_roots', table.excused_test_roots);
    if ('baseline_path' in table) out.baselinePath = validatePath('baseline_path', table.baseline_path);
    if ('orphan_baseline_path' in table) out.orphanBaselinePath = validatePath('orphan_baseline_path', table.orphan_baseline_path);
    if ('test_orphan_baseline_path' in table) out.testOrphanBaselinePath = validatePath('test_orphan_baseline_path', table.test_orphan_baseline_path);
    if ('tombstone_path' in table) out.tombstonePath = validatePath('tombstone_path', table.tombstone_path);
    if ('exempt_marker' in table) {
      const m = table.exempt_marker;
      if (typeof m !== 'string' || m.length === 0) throw new Error(`exempt_marker: expected a non-empty string (got ${JSON.stringify(m)})`);
      out.exemptMarker = m;
    }
    if ('skip_parts' in table) {
      const s = table.skip_parts;
      if (!Array.isArray(s) || !s.every((p) => typeof p === 'string' && p.length > 0)) throw new Error(`skip_parts: expected a list of path components${typeof s === 'string' ? ', not a single string' : ''} (got ${JSON.stringify(s)})`);
      out.skipParts = [...new Set(s as string[])].sort();
    }
    if ('id_prefix' in table) {
      const p = table.id_prefix;
      if (typeof p !== 'string' || !/^[A-Z][A-Z0-9]*$/.test(p)) throw new Error(`id_prefix: expected a non-empty string of uppercase letters and digits beginning with a letter and containing no hyphen (got ${JSON.stringify(p)})`);
      out.idPrefix = p;
    }
    if ('annotation_conventions' in table) {
      const c = table.annotation_conventions;
      if (!Array.isArray(c)) throw new Error(`annotation_conventions: expected a list of convention objects (got ${JSON.stringify(c)})`);
      out.annotationConventions = c.map((entry, i) => validateConvention(i, entry));
    }
    return out;
  } catch (e) {
    if (e instanceof LayoutError) throw e;
    throw new LayoutError(configPath, e instanceof Error ? e.message : String(e));
  }
}

export type LayoutLoad = { readonly ok: true; readonly layout: ResolvedLayout; readonly configPath: string | null } | { readonly ok: false; readonly path: string; readonly cause: string };

/** REQ-TRACE-040: the file at the root or nothing; absent → the default layout with no error. */
export function loadLayout(root: string): LayoutLoad {
  const configPath = join(root, LAYOUT_CONFIG_FILE);
  if (!existsSync(configPath)) return { ok: true, layout: defaultLayout(), configPath: null };
  let text: string;
  try { text = readFileSync(configPath, 'utf8'); } catch (e) { return { ok: false, path: configPath, cause: `the layout configuration cannot be read: ${e instanceof Error ? e.message : String(e)}` }; }
  try { return { ok: true, layout: parseLayout(text, configPath), configPath }; } catch (e) {
    return { ok: false, path: configPath, cause: e instanceof LayoutError ? e.cause_ : String(e) };
  }
}

/** The seam's `LayoutConfig` (contracts/src/requirements.ts): the project conventions' patterns flattened in order. */
export function toSeamLayout(l: ResolvedLayout): LayoutConfig {
  return {
    storeDir: l.requirementsDir, idPrefix: l.idPrefix, artifactPath: l.generatedPath,
    debtBaselinePath: l.baselinePath, orphanModuleBaselinePath: l.orphanBaselinePath, orphanTestBaselinePath: l.testOrphanBaselinePath,
    retiredLogPath: l.tombstonePath, sourceRoots: [...l.implRoots], testRoots: [...l.testRoots], skip: [...l.skipParts],
    annotationPatterns: l.annotationConventions.flatMap((c) => [c.referencePattern, c.annotationPattern, c.testPattern, c.exemptModulePattern]),
  };
}

/** REQ-TRACE-047: excused by path prefix, decided before the file is read. */
export function isUnderRoot(repoRelativePath: string, root: string): boolean {
  return repoRelativePath === root || repoRelativePath.startsWith(`${root}/`);
}
