import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import type { AnnotationForm, CandidateStore, DefinitionShape, DetectionResult, Numbering, UndecidedCode } from '@rotaris/contracts';
import { WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { fieldValue, readFrontmatter } from '../traceability/frontmatter.js';
import { decodeUtf8, normaliseLineEndings } from '../traceability/hashes.js';

/**
 * The detection pass of the adoption assistant (REQ-ADOPT-005 to REQ-ADOPT-010, PD-TRACE-001): a read-only walk of the
 * open workspace, by script and without a model, that reports the candidate requirement stores and why, the identifier
 * family and its numbering, the implementation and test roots, the annotation vocabulary the code uses, and — by name
 * — what it could not decide. It is the `probeStore` shape one level up: it reads, it never writes, and a bound it
 * reaches is reported rather than raised (REQ-ADOPT-006).
 */
export const DETECTION_BOUNDS = { files: 20_000, bytesPerFile: 512 * 1024, bytes: 64 * 1024 * 1024 } as const;

/** REQ-ADOPT-005: never walked. Hidden directories (the version-control one among them) are skipped by their dot. */
export const DETECTION_SKIP: readonly string[] = ['node_modules', 'dist', 'build', 'out', 'target', 'vendor', 'coverage', 'fixtures', WORKSPACE_SCOPE_DIR];

/** Where requirement stores are looked for: prose documents. */
export const DOCUMENT_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt', '.rst', '.adoc'];
/** Where annotations are looked for: source in the languages a project is commonly written in. */
export const SOURCE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.rb', '.php', '.c', '.h', '.cc', '.cpp', '.hpp', '.swift', '.scala', '.sh'];
const TEST_DIR_NAMES = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'e2e']);
const TEST_FILE_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['*.test.*', /\.test\.[A-Za-z0-9]+$/], ['*.spec.*', /\.spec\.[A-Za-z0-9]+$/], ['*_test.*', /_test\.[A-Za-z0-9]+$/], ['test_*.*', /^test_[^/]*\.[A-Za-z0-9]+$/],
];
const SAMPLE_CAP = 5;
const SAMPLE_CHARS = 160;
/** An identifier as a project may write one: an uppercase prefix, a hyphen, a number that may be dotted. */
const TOKEN = /\b([A-Z][A-Z0-9]*)-(\d+(?:\.\d+)*)\b/g;
const ID = '([A-Z][A-Z0-9]*-\\d+(?:\\.\\d+)*)';
/** REQ-ADOPT-007's line shapes; frontmatter is read through the toolchain's own reader. */
const SHAPES: readonly (readonly [DefinitionShape, RegExp])[] = [
  ['bullet', new RegExp(`^\\s*[-*+]\\s+\\*\\*${ID}\\*\\*`)],
  ['heading', new RegExp(`^#{1,6}\\s+(?:\\*\\*)?${ID}(?![\\w.-])`)],
  ['bold-line', new RegExp(`^\\*\\*${ID}\\*\\*`)],
  ['table-row', new RegExp(`^\\|\\s*(?:\\*\\*)?${ID}(?:\\*\\*)?\\s*\\|`)],
];

interface Walked { readonly path: string; readonly name: string; readonly ext: string }

export function cutSample(line: string): string {
  const t = line.trim().replace(/\s+/g, ' ');
  return t.length > SAMPLE_CHARS ? `${t.slice(0, SAMPLE_CHARS - 1)}…` : t;
}

function isTestFile(path: string, name: string): string | null {
  for (const [label, re] of TEST_FILE_PATTERNS) if (re.test(name)) return label;
  return path.split('/').slice(0, -1).some((p) => TEST_DIR_NAMES.has(p)) ? 'directory' : null;
}

/** The workspace's files, repository-relative POSIX paths in ascending order, symbolic links never followed. */
function walk(root: string, cap: number): { files: Walked[]; reached: boolean } {
  const files: Walked[] = [];
  const pending: string[] = [''];
  while (pending.length > 0) {
    const rel = pending.shift()!;
    let entries;
    try { entries = readdirSync(rel === '' ? root : join(root, rel), { withFileTypes: true }); } catch { continue; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const dirs: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const path = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name.startsWith('.') || DETECTION_SKIP.includes(e.name)) continue;
        dirs.push(path);
      } else if (e.isFile()) {
        if (files.length >= cap) return { files, reached: true };
        files.push({ path, name: e.name, ext: extname(e.name).toLowerCase() });
      }
    }
    pending.unshift(...dirs);
  }
  return { files, reached: false };
}

function commonDir(paths: readonly string[]): string {
  const dirs = paths.map((p) => p.split('/').slice(0, -1));
  let common = dirs[0] ?? [];
  for (const d of dirs.slice(1)) {
    let i = 0;
    while (i < common.length && i < d.length && common[i] === d[i]) i += 1;
    common = common.slice(0, i);
  }
  return common.join('/');
}

export function numberingOf(numbers: readonly string[]): { numbering: Numbering; gaps: number } {
  if (numbers.some((n) => n.includes('.'))) return { numbering: 'dotted', gaps: 0 };
  const ints = [...new Set(numbers.map(Number))].sort((a, b) => a - b);
  if (ints.length === 0) return { numbering: 'contiguous', gaps: 0 };
  const gaps = ints[ints.length - 1]! - ints[0]! + 1 - ints.length;
  return { numbering: gaps === 0 ? 'contiguous' : 'sparse', gaps };
}

interface Group { prefix: string; shape: DefinitionShape; files: Map<string, Set<string>>; numbers: string[]; samples: string[] }

/** Detect. Pure over the filesystem: reads, never writes (REQ-ADOPT-005). */
export function detectWorkspace(root: string): DetectionResult {
  const walked = walk(root, DETECTION_BOUNDS.files);
  let bytes = 0;
  let bytesReached = false;
  const read = (path: string): string | null => {
    if (bytes >= DETECTION_BOUNDS.bytes) { bytesReached = true; return null; }
    let buf: Buffer;
    try { buf = readFileSync(join(root, path)); } catch { return null; }
    const slice = buf.byteLength > DETECTION_BOUNDS.bytesPerFile ? buf.subarray(0, DETECTION_BOUNDS.bytesPerFile) : buf;
    bytes += slice.byteLength;
    return normaliseLineEndings(decodeUtf8(slice));
  };

  // 1 — definitions in prose documents, grouped by family and shape (REQ-ADOPT-007).
  const groups = new Map<string, Group>();
  const define = (prefix: string, number: string, shape: DefinitionShape, path: string, line: string): void => {
    const key = `${prefix}#${shape}`;
    const g: Group = groups.get(key) ?? { prefix, shape, files: new Map(), numbers: [], samples: [] };
    groups.set(key, g);
    const ids = g.files.get(path) ?? new Set<string>();
    g.files.set(path, ids);
    const id = `${prefix}-${number}`;
    if (!ids.has(id)) { ids.add(id); g.numbers.push(number); }
    if (g.samples.length < SAMPLE_CAP) g.samples.push(cutSample(line));
  };
  for (const f of walked.files) {
    if (!DOCUMENT_EXTENSIONS.includes(f.ext)) continue;
    const text = read(f.path);
    if (text === null) continue;
    const lines = text.split('\n');
    const fm = readFrontmatter(lines);
    const reqId = fm === null ? undefined : fieldValue(fm, 'req-id');
    if (reqId !== undefined) for (const m of reqId.matchAll(TOKEN)) define(m[1]!, m[2]!, 'frontmatter', f.path, `req-id: ${reqId}`);
    for (const line of lines) {
      if (line.length > 2_000) continue;
      for (const [shape, re] of SHAPES) {
        const m = re.exec(line);
        if (m === null) continue;
        const at = m[1]!.indexOf('-');
        define(m[1]!.slice(0, at), m[1]!.slice(at + 1), shape, f.path, line);
        break;
      }
    }
  }
  const undecided: { code: UndecidedCode; detail: string }[] = [];
  const candidates: CandidateStore[] = [];
  const rootOnly: string[] = [];
  for (const g of groups.values()) {
    const identifiers = g.numbers.length;
    if (identifiers < 2) continue;
    const dir = commonDir([...g.files.keys()]);
    if (dir === '') { rootOnly.push(`${g.prefix} (${g.shape})`); continue; }
    const { numbering, gaps } = numberingOf(g.numbers);
    const reasons = [
      `${identifiers} distinct ${g.prefix} identifiers defined as ${g.shape === 'frontmatter' ? 'an identifier block in frontmatter' : `a ${g.shape} line`}`,
      `${g.files.size} document${g.files.size === 1 ? '' : 's'} under ${dir}`,
      numbering === 'sparse' ? `numbered with ${gaps} gap${gaps === 1 ? '' : 's'}` : `numbering ${numbering}`,
    ];
    candidates.push({ id: `${dir}#${g.prefix}#${g.shape}`, dir, prefix: g.prefix, shape: g.shape, documents: g.files.size, identifiers, numbering, gaps, reasons, samples: g.samples });
  }
  candidates.sort((a, b) => b.identifiers - a.identifiers || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) undecided.push({ code: 'no-store', detail: rootOnly.length > 0 ? `definitions were found only in documents at the repository root (${rootOnly.join(', ')}); a store is a directory` : 'no document defines two or more identifiers in a shape REQ-ADOPT-007 names' });
  if (candidates.length > 1) undecided.push({ code: 'several-stores', detail: `${candidates.length} candidates: ${candidates.map((c) => c.id).join(', ')}` });
  const families = [...new Set(candidates.map((c) => c.prefix))];
  if (families.length > 1) undecided.push({ code: 'several-families', detail: `identifier families ${families.join(', ')}` });
  const dotted = candidates.filter((c) => c.numbering === 'dotted');
  if (dotted.length > 0) undecided.push({ code: 'dotted-numbering', detail: `${dotted.map((c) => c.id).join(', ')} carry dotted numbers, which REQ-TRACE-078's <PREFIX>-<digits> cannot write` });
  const byStore = new Map<string, string[]>();
  for (const c of candidates) byStore.set(`${c.dir}#${c.prefix}`, [...(byStore.get(`${c.dir}#${c.prefix}`) ?? []), c.shape]);
  for (const [k, shapes] of byStore) if (shapes.length > 1) undecided.push({ code: 'mixed-shapes', detail: `${k.replace('#', ' ')} defines identifiers as ${shapes.join(' and ')}` });

  // 2 — implementation and test roots (REQ-ADOPT-009).
  const implCount = new Map<string, number>();
  const testDirs = new Set<string>();
  const testPatterns = new Set<string>();
  let colocated = 0;
  for (const f of walked.files) {
    if (!SOURCE_EXTENSIONS.includes(f.ext)) continue;
    const parts = f.path.split('/');
    if (parts.length < 2) continue;
    const test = isTestFile(f.path, f.name);
    if (test === null) { implCount.set(parts[0]!, (implCount.get(parts[0]!) ?? 0) + 1); continue; }
    if (test !== 'directory') testPatterns.add(test);
    const at = parts.findIndex((p) => TEST_DIR_NAMES.has(p));
    if (at >= 0 && at < parts.length - 1) testDirs.add(parts.slice(0, at + 1).join('/'));
    else { colocated += 1; testDirs.add(parts[0]!); }
  }
  const implRoots = [...implCount.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 8).map(([d]) => d);
  const testRoots = [...testDirs].sort().slice(0, 12);
  if (colocated > 0) undecided.push({ code: 'tests-colocated', detail: `${colocated} test file${colocated === 1 ? '' : 's'} sit beside the code they test, outside a test directory` });

  // 3 — the annotation vocabulary: the text before a candidate family's identifier on a source line (REQ-ADOPT-009).
  const prefixes = new Set(families);
  const forms = new Map<string, { extension: string; form: string; count: number; samples: string[] }>();
  if (prefixes.size > 0) {
    for (const f of walked.files) {
      if (!SOURCE_EXTENSIONS.includes(f.ext)) continue;
      const text = read(f.path);
      if (text === null) continue;
      for (const line of text.split('\n')) {
        if (line.length > 2_000) continue;
        for (const m of line.matchAll(TOKEN)) {
          if (!prefixes.has(m[1]!)) continue;
          const before = line.slice(0, m.index).trim().replace(/\s+/g, ' ');
          const form = before.length > 40 ? before.slice(before.length - 40) : before;
          const key = `${f.ext}\u0000${form}`;
          const entry = forms.get(key) ?? { extension: f.ext, form, count: 0, samples: [] };
          forms.set(key, entry);
          entry.count += 1;
          if (entry.samples.length < SAMPLE_CAP) entry.samples.push(cutSample(line));
          break;
        }
      }
    }
  }
  const annotations: AnnotationForm[] = [...forms.values()].sort((a, b) => b.count - a.count || (a.form < b.form ? -1 : 1)).slice(0, 20);
  if (prefixes.size > 0 && annotations.length === 0) undecided.push({ code: 'no-annotations', detail: `no source line names an identifier of ${[...prefixes].join(', ')}` });

  const reached = walked.reached ? 'files' : bytesReached ? 'bytes' : null;
  if (reached !== null) undecided.push({ code: 'bound-reached', detail: reached === 'files' ? `the walk stopped at ${DETECTION_BOUNDS.files} files; what lies beyond was not read` : `the reads stopped at ${DETECTION_BOUNDS.bytes} bytes; later files were not read` });
  return { candidates, implRoots, testRoots, testFilePatterns: [...testPatterns].sort(), annotations, undecided, bounds: { files: walked.files.length, bytes, reached } };
}
