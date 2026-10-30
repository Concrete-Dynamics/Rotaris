import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep, isAbsolute } from 'node:path';
import { compareReqIds, type AdoptionAdapter, type CandidateStore, type DetectionResult, type Extraction } from '@rotaris/contracts';
import { canonicalHash, contentHash, decodeUtf8, normaliseLineEndings } from '../traceability/hashes.js';
import { identifierPattern } from '../traceability/identifiers.js';
import { LAYOUT_CONFIG_FILE, LayoutError, parseLayout, validatePath, type ResolvedLayout } from '../traceability/layout.js';
import { isSkipped, parseStore } from '../traceability/store.js';
import { DOCUMENT_EXTENSIONS } from './detect.js';

/**
 * The adapter of the adoption assistant (REQ-ADOPT-011 to REQ-ADOPT-017, PD-TRACE-001): a data-plus-code artifact
 * composed from the detection result and one model interpretation — the layout document of REQ-TRACE-038, its
 * conventions (REQ-TRACE-073), and the extraction that maps the project's identifier form to the record form — and
 * then EXECUTED against the workspace.
 *
 * The interpretation is untrusted input (REQ-ADOPT-013). Nothing it says is written or executed before every field has
 * passed the toolchain's own validators: the layout document it composes is handed to `parseLayout` whole, so a path
 * meets REQ-TRACE-043's rule and a convention REQ-TRACE-073's exactly as a hand-written layout file would. The store
 * directory is the DETECTION's, never a path the model names (REQ-ADOPT-014), and the model names no file to write.
 */
export const INTERPRETATION_KEYS = ['annotation_conventions', 'candidate', 'definition_pattern', 'id_prefix', 'impl_roots', 'notes', 'test_roots'] as const;
export const PATTERN_MAX = 300;
export const NOTES_MAX = 500;
/** REQ-ADOPT-017: a longer line is passed over and counted, so a pattern never runs over unbounded input. */
export const LINE_MAX = 2_000;

export type Refusal = { readonly ok: false; readonly field: string; readonly reason: string };
export type Validated<T> = { readonly ok: true; readonly value: T } | Refusal;

const refuse = (field: string, reason: string): Refusal => ({ ok: false, field, reason });

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** REQ-ADOPT-014: a directory that exists and stays inside the root after symbolic links. */
export function insideRoot(root: string, rel: string): boolean {
  try {
    const realRoot = realpathSync(root);
    const real = realpathSync(join(root, rel));
    const r = relative(realRoot, real);
    return !isAbsolute(r) && r.split(sep)[0] !== '..' && statSync(real).isDirectory();
  } catch {
    return false;
  }
}

/** REQ-ADOPT-013: a pattern compiles, is bounded, and has exactly one capture group. */
export function checkPattern(pattern: string): string | null {
  if (pattern.length === 0 || pattern.length > PATTERN_MAX) return `must be a regular expression of 1 to ${PATTERN_MAX} characters`;
  let groups: number;
  try { groups = (new RegExp(`${pattern}|`).exec('')?.length ?? 1) - 1; } catch (e) { return `does not compile — ${e instanceof Error ? e.message : String(e)}`; }
  return groups === 1 ? null : `must hold exactly one capture group, the identifier (it holds ${groups})`;
}

/** The layout document's table for a candidate and the interpretation's roots and conventions, parsed by the toolchain's own reader. */
function layoutFor(table: Record<string, unknown>): Validated<ResolvedLayout> {
  try {
    return { ok: true, value: parseLayout(JSON.stringify({ layout: table }), LAYOUT_CONFIG_FILE) };
  } catch (e) {
    const cause = e instanceof LayoutError ? e.cause_ : String(e);
    const field = /^(annotation_conventions|impl_roots|test_roots|id_prefix|requirements_dir)|^convention /.exec(cause)?.[1] ?? 'annotation_conventions';
    return refuse(field, cause);
  }
}

/**
 * Read the model's answer — already reduced to its first JSON object by the run host — into an adapter, or refuse
 * naming the field (REQ-ADOPT-013, REQ-ADOPT-015). Never throws.
 */
export function composeAdapter(answer: string, detection: DetectionResult, root: string): Validated<AdoptionAdapter> {
  if (answer.trim() === '') return refuse('answer', 'the model answered with no content (a reasoning model that spent its budget reasoning answers this way)');
  let doc: unknown;
  try { doc = JSON.parse(answer); } catch (e) { return refuse('answer', `not one JSON object: ${e instanceof Error ? e.message : String(e)}`); }
  if (!isObject(doc)) return refuse('answer', 'not one JSON object');
  const unknown = Object.keys(doc).filter((k) => !(INTERPRETATION_KEYS as readonly string[]).includes(k)).sort();
  if (unknown.length > 0) return refuse(unknown[0]!, `unknown key${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}; the interpretation holds exactly ${INTERPRETATION_KEYS.join(', ')}`);
  const missing = INTERPRETATION_KEYS.filter((k) => !(k in doc));
  if (missing.length > 0) return refuse(missing[0]!, `missing key${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);

  const candidate: CandidateStore | undefined = typeof doc.candidate === 'string' ? detection.candidates.find((c) => c.id === doc.candidate) : undefined;
  if (candidate === undefined) return refuse('candidate', `${JSON.stringify(doc.candidate)} is not a candidate the detection reported (${detection.candidates.map((c) => c.id).join(', ') || 'none'})`);
  if (candidate.numbering === 'dotted' || candidate.numbering === 'zero-padded') return refuse('candidate', `${candidate.id} carries ${candidate.numbering} numbers, which REQ-TRACE-078 cannot write`);
  if (candidate.prefix.includes('-')) return refuse('candidate', `${candidate.id} carries the namespaced prefix ${candidate.prefix}, which REQ-TRACE-038's id_prefix cannot hold`);
  if (doc.id_prefix !== candidate.prefix) return refuse('id_prefix', `${JSON.stringify(doc.id_prefix)} is not the chosen candidate's family ${candidate.prefix}`);
  if (typeof doc.notes !== 'string' || doc.notes.length > NOTES_MAX) return refuse('notes', `must be a string of at most ${NOTES_MAX} characters`);

  for (const key of ['impl_roots', 'test_roots'] as const) {
    const list = doc[key];
    if (!Array.isArray(list)) return refuse(key, 'must be a list of repository-relative directories');
    for (const p of list) {
      let path: string;
      try { path = validatePath(key, p); } catch (e) { return refuse(key, e instanceof Error ? e.message : String(e)); }
      if (!insideRoot(root, path)) return refuse(key, `${JSON.stringify(p)} is not a directory inside the workspace`);
    }
  }

  let extraction: Extraction;
  if (candidate.shape === 'frontmatter') {
    if (doc.definition_pattern !== null) return refuse('definition_pattern', 'must be null for a frontmatter candidate, whose identifier block the toolchain reads itself');
    extraction = { kind: 'frontmatter' };
  } else {
    if (typeof doc.definition_pattern !== 'string') return refuse('definition_pattern', `must be a regular expression for a ${candidate.shape} candidate`);
    const bad = checkPattern(doc.definition_pattern);
    if (bad !== null) return refuse('definition_pattern', bad);
    extraction = { kind: 'definition-lines', pattern: doc.definition_pattern };
  }

  const table: Record<string, unknown> = { requirements_dir: candidate.dir, id_prefix: candidate.prefix, impl_roots: doc.impl_roots, test_roots: doc.test_roots, annotation_conventions: doc.annotation_conventions };
  const layout = layoutFor(table);
  if (!layout.ok) return layout;
  if (!insideRoot(root, layout.value.requirementsDir)) return refuse('candidate', `the store directory ${candidate.dir} does not resolve inside the workspace`);
  return { ok: true, value: { candidate: candidate.id, storeDir: candidate.dir, idPrefix: candidate.prefix, extraction, layout: table, notes: doc.notes } };
}

/** REQ-ADOPT-025: a recorded adapter re-validated before it is executed — the record is a file a person can edit. */
export function revalidateAdapter(adapter: unknown, root: string): Validated<AdoptionAdapter> {
  if (!isObject(adapter)) return refuse('adapter', 'not an object');
  const { candidate, storeDir, idPrefix, extraction, layout, notes } = adapter;
  if (typeof candidate !== 'string' || typeof storeDir !== 'string' || typeof idPrefix !== 'string' || typeof notes !== 'string' || !isObject(layout) || !isObject(extraction)) return refuse('adapter', 'a field is missing or of the wrong kind');
  if (layout['requirements_dir'] !== storeDir || layout['id_prefix'] !== idPrefix) return refuse('adapter.layout', 'the layout names another store or family than the adapter');
  const parsed = layoutFor(layout);
  if (!parsed.ok) return parsed;
  if (!insideRoot(root, parsed.value.requirementsDir)) return refuse('adapter.storeDir', `${storeDir} is not a directory inside the workspace`);
  let ex: Extraction;
  if (extraction['kind'] === 'frontmatter') ex = { kind: 'frontmatter' };
  else if (extraction['kind'] === 'definition-lines' && typeof extraction['pattern'] === 'string') {
    const bad = checkPattern(extraction['pattern']);
    if (bad !== null) return refuse('adapter.extraction', bad);
    ex = { kind: 'definition-lines', pattern: extraction['pattern'] };
  } else return refuse('adapter.extraction', 'an extraction is frontmatter or definition-lines');
  return { ok: true, value: { candidate, storeDir, idPrefix, extraction: ex, layout, notes } };
}

export interface Execution {
  readonly documents: readonly { readonly path: string; readonly contentHash: string; readonly identifiers: readonly string[] }[];
  readonly requirements: readonly { readonly id: string; readonly document: string; readonly canonicalHash: string }[];
  /** REQ-ADOPT-017: lines over the bound, passed over. */
  readonly skippedLines: number;
  /** The store parse's own errors for a frontmatter adapter (REQ-TRACE-026), the first five — what a refusal quotes. */
  readonly problems: readonly string[];
}

function enumerateDocuments(root: string, layout: ResolvedLayout): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const path = `${rel}/${e.name}`;
      if (isSkipped(path.slice(layout.requirementsDir.length + 1).split('/'), layout.skipParts) || e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(path);
      else if (e.isFile() && DOCUMENT_EXTENSIONS.some((x) => e.name.toLowerCase().endsWith(x))) out.push(path);
    }
  };
  walk(layout.requirementsDir);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

const HEADING = /^#{1,6}\s/;

/**
 * Execute an adapter (REQ-ADOPT-016, REQ-ADOPT-017): read-only, in path order. A frontmatter adapter runs the toolchain's
 * own store parse; a definition-lines adapter applies its pattern one bounded line at a time, and a requirement's
 * definition text runs from its defining line to the line before the next definition or heading. The first
 * definition of an identifier in path order wins, as REQ-TRACE-023's does.
 */
export function executeAdapter(root: string, adapter: AdoptionAdapter): Validated<Execution> {
  const parsed = layoutFor({ ...adapter.layout });
  if (!parsed.ok) return parsed;
  const layout = parsed.value;
  if (adapter.extraction.kind === 'frontmatter') {
    const store = parseStore({ root, layout, retiredLog: null });
    const documents = store.details.documents.filter((d) => d.kind === 'requirements').map((d) => ({ path: d.path, contentHash: d.hash, identifiers: [...d.ids] }));
    const requirements = store.records.map((r) => ({ id: r.id, document: r.sourcePath, canonicalHash: r.canonicalHash }));
    return { ok: true, value: { documents, requirements, skippedLines: 0, problems: store.errors.slice(0, 5).map((e) => e.message) } };
  }
  let re: RegExp;
  try { re = new RegExp(adapter.extraction.pattern); } catch (e) { return refuse('adapter.extraction', e instanceof Error ? e.message : String(e)); }
  const valid = identifierPattern(adapter.idPrefix);
  const documents: { path: string; contentHash: string; identifiers: string[] }[] = [];
  const requirements: { id: string; document: string; canonicalHash: string }[] = [];
  const seen = new Set<string>();
  let skippedLines = 0;
  for (const path of enumerateDocuments(root, layout)) {
    let text: string;
    try { text = normaliseLineEndings(decodeUtf8(readFileSync(join(root, path)))); } catch { continue; }
    const lines = text.split('\n');
    const ids: string[] = [];
    let open: { id: string; lines: string[] } | null = null;
    const close = (): void => {
      if (open === null) return;
      // Trailing blank lines belong to the gap before the next definition, not to this one's text.
      const body = [...open.lines];
      while (body.length > 1 && body[body.length - 1]!.trim() === '') body.pop();
      if (!seen.has(open.id)) { seen.add(open.id); ids.push(open.id); requirements.push({ id: open.id, document: path, canonicalHash: canonicalHash(body) }); }
      open = null;
    };
    for (const line of lines) {
      if (line.length > LINE_MAX) { skippedLines += 1; continue; }
      const m = re.exec(line);
      const id = m?.[1];
      if (id !== undefined && valid.test(id)) { close(); open = { id, lines: [line] }; continue; }
      if (HEADING.test(line)) { close(); continue; }
      (open as { lines: string[] } | null)?.lines.push(line);
    }
    close();
    if (ids.length > 0) documents.push({ path, contentHash: contentHash(text), identifiers: ids });
  }
  requirements.sort((a, b) => compareReqIds(a.id, b.id));
  return { ok: true, value: { documents, requirements, skippedLines, problems: [] } };
}
