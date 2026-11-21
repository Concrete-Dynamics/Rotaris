import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import {
  compareReqIds, DELIVERY_COLUMNS, SHAPE_KEYS, SHAPE_ROOTS_MAX, SHAPE_STATUS_WORDS_MAX, SHAPE_STORES_MAX, SURVEYED_ID_MAX, SURVEYED_ID_PATTERN,
  type AnnotationSite, type DeliveryColumn, type Lifecycle, type LayoutConfig, type ReqId, type RequirementEvidence, type RequirementRecord, type RequirementsShape,
  type ShapeDrift, type ShapeMeasurement, type ShapeStatusWord, type ShapeStore, type StoreParse, type SurveyedCriterion, type SurveyedRequirement, type VerificationReport,
} from '@rotaris/contracts';
import { canonicalHash, contentHash, decodeUtf8, fingerprintOf, normaliseLineEndings } from '../traceability/hashes.js';
import { validatePath } from '../traceability/layout.js';
import { insideRoot, NOTES_MAX, PATTERN_MAX, type Refusal, type Validated } from './adapter.js';
import { cutSample, DETECTION_BOUNDS, DETECTION_SKIP, DOCUMENT_EXTENSIONS, SOURCE_EXTENSIONS } from './detect.js';

/**
 * The surveyed shape (PD-TRACE-002 clauses 1, 4, 5, 11 and 12; REQ-ADOPT-031 to REQ-ADOPT-035, REQ-ADOPT-044): a repository's own requirement form in the one
 * validated format, and its execution. `validateShape` is where a proposal — a model's, a hand-edited record's, an
 * exported file's — is read field by field before anything is believed (REQ-ADOPT-013's terms); `measureShape` runs a
 * valid shape over the workspace, read-only and bounded as the detection pass is (REQ-ADOPT-006), and returns the
 * requirements with where each stands in its document, together with the facts a repair round and the drift statement
 * are made of. Nothing here writes, and nothing here consults a model.
 */
/**
 * The longest line a shape reads. REQ-ADOPT-017's 2,000 was set for the adapter's one-capture pattern; a repository
 * that writes a requirement as one long paragraph line (this one does) would lose requirements at that bound, so a
 * shape reads lines eight times as long. A longer line is still passed over and counted.
 */
export const SHAPE_LINE_MAX = 16_000;
const refuse = (field: string, reason: string): Refusal => ({ ok: false, field, reason });

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function exactKeys(field: string, v: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): Refusal | null {
  const unknown = Object.keys(v).filter((k) => !required.includes(k) && !optional.includes(k)).sort();
  if (unknown.length > 0) return refuse(`${field}${unknown[0]!}`, `unknown key${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}; accepted: ${[...required, ...optional].join(', ')}`);
  const missing = required.filter((k) => !(k in v));
  if (missing.length > 0) return refuse(`${field}${missing[0]!}`, `missing key${missing.length === 1 ? '' : 's'} ${missing.join(', ')}`);
  return null;
}

/**
 * A pattern a proposal supplies: bounded, compiling, carrying the named groups asked of it and no other, and free of
 * the two constructs that make a line-at-a-time match run long on a hostile line — a backreference and a quantified
 * group that itself holds a quantifier. A line is at most `SHAPE_LINE_MAX` characters (REQ-ADOPT-017), which bounds the rest.
 */
export function checkShapePattern(pattern: unknown, required: readonly string[], optional: readonly string[] = []): string | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > PATTERN_MAX) return `must be a regular expression of 1 to ${PATTERN_MAX} characters`;
  if (/\\[1-9]|\\k</.test(pattern)) return 'must not use a backreference';
  if (/\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/.test(pattern)) return 'must not quantify a group that itself holds a quantifier';
  let groups: string[];
  try { groups = Object.keys(new RegExp(`${pattern}|`).exec('')?.groups ?? {}); } catch (e) { return `does not compile — ${e instanceof Error ? e.message : String(e)}`; }
  const missing = required.filter((g) => !groups.includes(g));
  if (missing.length > 0) return `must hold the named group${missing.length === 1 ? '' : 's'} ${missing.map((g) => `(?<${g}>…)`).join(', ')}`;
  const extra = groups.filter((g) => !required.includes(g) && !optional.includes(g));
  if (extra.length > 0) return `holds the unknown named group${extra.length === 1 ? '' : 's'} ${extra.join(', ')}`;
  return null;
}

const LIFECYCLES: readonly Lifecycle[] = ['draft', 'approved', 'deprecated'];
const WORD_MAX = 40;

function validateStore(index: number, v: unknown, root: string): Validated<ShapeStore> {
  const at = `stores[${index}].`;
  if (!isObject(v)) return refuse(`stores[${index}]`, 'must be an object');
  const keys = exactKeys(at, v, ['criteria', 'definition', 'dir'], ['status']);
  if (keys !== null) return keys;
  let dir: string;
  try { dir = validatePath(`${at}dir`, v['dir']); } catch (e) { return refuse(`${at}dir`, e instanceof Error ? e.message : String(e)); }
  if (!insideRoot(root, dir)) return refuse(`${at}dir`, `${JSON.stringify(v['dir'])} is not a directory inside the workspace`);
  const bad = checkShapePattern(v['definition'], ['id'], ['title']);
  if (bad !== null) return refuse(`${at}definition`, bad);
  if (typeof v['criteria'] !== 'boolean') return refuse(`${at}criteria`, 'must be true or false');
  let status: ShapeStore['status'];
  if (v['status'] !== undefined && v['status'] !== null) {
    const s = v['status'];
    if (!isObject(s)) return refuse(`${at}status`, 'must be an object or absent');
    const sk = exactKeys(`${at}status.`, s, ['pattern', 'words']);
    if (sk !== null) return sk;
    const sb = checkShapePattern(s['pattern'], ['status']);
    if (sb !== null) return refuse(`${at}status.pattern`, sb);
    const words = s['words'];
    if (!Array.isArray(words) || words.length === 0 || words.length > SHAPE_STATUS_WORDS_MAX) return refuse(`${at}status.words`, `must be a list of 1 to ${SHAPE_STATUS_WORDS_MAX} words`);
    const out: ShapeStatusWord[] = [];
    const seen = new Set<string>();
    for (const [i, w] of words.entries()) {
      const wa = `${at}status.words[${i}]`;
      if (!isObject(w)) return refuse(wa, 'must be an object');
      const wk = exactKeys(`${wa}.`, w, ['word'], ['delivery', 'lifecycle']);
      if (wk !== null) return wk;
      const word = w['word'];
      if (typeof word !== 'string' || word.trim() === '' || word.length > WORD_MAX || /[\r\n]/.test(word)) return refuse(`${wa}.word`, `must be one line of 1 to ${WORD_MAX} characters`);
      if (seen.has(word.toLowerCase())) return refuse(`${wa}.word`, `${JSON.stringify(word)} is listed twice`);
      seen.add(word.toLowerCase());
      const lifecycle = w['lifecycle'] ?? undefined;
      const delivery = w['delivery'] ?? undefined;
      if (lifecycle !== undefined && !LIFECYCLES.includes(lifecycle as Lifecycle)) return refuse(`${wa}.lifecycle`, `must be one of ${LIFECYCLES.join(', ')}`);
      if (delivery !== undefined && !(DELIVERY_COLUMNS as readonly string[]).includes(delivery as string)) return refuse(`${wa}.delivery`, `must be one of ${DELIVERY_COLUMNS.join(', ')}`);
      if (lifecycle === undefined && delivery === undefined) return refuse(wa, 'must name a lifecycle, a delivery state, or both');
      out.push({ word, ...(lifecycle !== undefined ? { lifecycle: lifecycle as Lifecycle } : {}), ...(delivery !== undefined ? { delivery: delivery as DeliveryColumn } : {}) });
    }
    status = { pattern: s['pattern'] as string, words: out };
  }
  return { ok: true, value: { dir, definition: v['definition'] as string, criteria: v['criteria'], ...(status !== undefined ? { status } : {}) } };
}

/** Read a proposal into a shape, or refuse naming the field (REQ-ADOPT-013, REQ-ADOPT-015). Never throws. */
export function validateShape(input: unknown, root: string): Validated<RequirementsShape> {
  if (!isObject(input)) return refuse('shape', 'not one JSON object');
  const keys = exactKeys('', input, SHAPE_KEYS);
  if (keys !== null) return keys;
  if (input['version'] !== 1) return refuse('version', `unknown shape version ${JSON.stringify(input['version'])}`);
  const stores = input['stores'];
  if (!Array.isArray(stores) || stores.length === 0 || stores.length > SHAPE_STORES_MAX) return refuse('stores', `must be a list of 1 to ${SHAPE_STORES_MAX} stores`);
  const out: ShapeStore[] = [];
  for (const [i, s] of stores.entries()) {
    const v = validateStore(i, s, root);
    if (!v.ok) return v;
    if (out.some((o) => o.dir === v.value.dir || o.dir.startsWith(`${v.value.dir}/`) || v.value.dir.startsWith(`${o.dir}/`))) return refuse(`stores[${i}].dir`, `${v.value.dir} overlaps another store's directory`);
    out.push(v.value);
  }
  const idBad = checkShapePattern(input['identifier'], []);
  if (idBad !== null) return refuse('identifier', idBad);
  if (new RegExp(`^(?:${input['identifier'] as string})$`).test('')) return refuse('identifier', 'must not match the empty string');
  const roots: Record<'implRoots' | 'testRoots', string[]> = { implRoots: [], testRoots: [] };
  for (const key of ['implRoots', 'testRoots'] as const) {
    const list = input[key];
    if (!Array.isArray(list) || list.length > SHAPE_ROOTS_MAX) return refuse(key, `must be a list of at most ${SHAPE_ROOTS_MAX} repository-relative directories`);
    for (const p of list) {
      let path: string;
      try { path = validatePath(key, p); } catch (e) { return refuse(key, e instanceof Error ? e.message : String(e)); }
      if (!insideRoot(root, path)) return refuse(key, `${JSON.stringify(p)} is not a directory inside the workspace`);
      if (!roots[key].includes(path)) roots[key].push(path);
    }
  }
  if (input['obligations'] !== 'optional' && input['obligations'] !== 'required') return refuse('obligations', 'must be optional or required');
  if (typeof input['notes'] !== 'string' || input['notes'].length > NOTES_MAX) return refuse('notes', `must be a string of at most ${NOTES_MAX} characters`);
  return { ok: true, value: { version: 1, stores: out, identifier: input['identifier'] as string, implRoots: roots.implRoots, testRoots: roots.testRoots, obligations: input['obligations'], notes: input['notes'] } };
}

const HEADING = /^(#{1,6})\s/;
/** A task-list item: the box's own column range is what a tick rewrites (PD-TRACE-002 clause 6). */
export const CRITERION = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])(\]\s+)(.*)$/;
const TITLE_MAX = 140;
const CAP = 20;

/** The title a definition line gives when the pattern names none: what follows the identifier, without its markup, to the first sentence end. */
export function titleOf(line: string, idEnd: number): string {
  let t = line.slice(idEnd).replace(/^[\s*_`:|\-—–.)\]]+/, '').replace(/[\s|*_`]+$/, '').replace(/\*\*|__|`/g, '');
  const stop = /[.!?](?:\s|$)/.exec(t);
  if (stop !== null && stop.index >= 12) t = t.slice(0, stop.index + 1);
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t;
}

function enumerate(root: string, dir: string, budget: { files: number }): { files: string[]; reached: boolean } {
  const files: string[] = [];
  let reached = false;
  const walk = (rel: string): void => {
    if (reached) return;
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (e.isSymbolicLink() || e.name.startsWith('.')) continue;
      const path = `${rel}/${e.name}`;
      if (e.isDirectory()) { if (!DETECTION_SKIP.includes(e.name)) walk(path); } else if (e.isFile()) {
        if (budget.files >= DETECTION_BOUNDS.files) { reached = true; return; }
        budget.files += 1;
        files.push(path);
      }
    }
  };
  walk(dir);
  return { files, reached };
}

interface Reader { read(path: string): string | null; readonly state: { bytes: number; reached: boolean } }

function reader(root: string): Reader {
  const state = { bytes: 0, reached: false };
  return {
    state,
    read(path) {
      if (state.bytes >= DETECTION_BOUNDS.bytes) { state.reached = true; return null; }
      let buf: Buffer;
      try { buf = readFileSync(join(root, path)); } catch { return null; }
      const slice = buf.byteLength > DETECTION_BOUNDS.bytesPerFile ? buf.subarray(0, DETECTION_BOUNDS.bytesPerFile) : buf;
      state.bytes += slice.byteLength;
      return normaliseLineEndings(decodeUtf8(slice));
    },
  };
}

/**
 * Execute a valid shape (PD-TRACE-002 clauses 3 to 5). A requirement's text runs from its defining line to the line
 * before the next definition, or before the next heading — of any level where the definition is not a heading, of
 * its own level or higher where it is one, so a heading-defined requirement keeps the sub-headings that hold its
 * acceptance criteria. The first definition of an identifier in path order wins and a later one is counted.
 */
export function measureShape(root: string, shape: RequirementsShape): ShapeMeasurement {
  const identifier = new RegExp(`^(?:${shape.identifier})$`);
  const mention = new RegExp(shape.identifier, 'g');
  const r = reader(root);
  const budget = { files: 0 };
  let filesReached = false;
  const documents: { path: string; contentHash: string; identifiers: ReqId[] }[] = [];
  const requirements: SurveyedRequirement[] = [];
  const duplicates: { id: ReqId; document: string; line: number }[] = [];
  const malformed: { document: string; line: number; text: string }[] = [];
  const empty: string[] = [];
  const defined = new Set<string>();
  const mentioned = new Set<string>();
  let skippedLines = 0;

  for (const store of shape.stores) {
    const definition = new RegExp(store.definition);
    const statusRe = store.status === undefined ? null : new RegExp(store.status.pattern, 'd');
    const words = new Map((store.status?.words ?? []).map((w) => [w.word.toLowerCase(), w]));
    const listed = enumerate(root, store.dir, budget);
    filesReached ||= listed.reached;
    for (const path of listed.files) {
      if (!DOCUMENT_EXTENSIONS.includes(extname(path).toLowerCase())) continue;
      const text = r.read(path);
      if (text === null) continue;
      const lines = text.split('\n');
      const ids: ReqId[] = [];
      let open: { id: string; title: string; line: number; level: number; body: string[]; first: boolean } | null = null;
      const close = (endLine: number): void => {
        if (open === null) return;
        const o = open;
        open = null;
        if (!o.first) return;
        const body = [...o.body];
        while (body.length > 1 && body[body.length - 1]!.trim() === '') body.pop();
        let status: SurveyedRequirement['status'];
        const criteria: SurveyedCriterion[] = [];
        // The hash is taken over the text WITHOUT what the board itself writes (clause 6): a status word and a tick are
        // state, and a requirement accepted and then marked done in its document has not changed its specification.
        const hashed = [...body];
        for (const [i, l] of body.entries()) {
          if (statusRe !== null && status === undefined) {
            const m = statusRe.exec(l);
            const span = m?.indices?.groups?.['status'];
            const word = m?.groups?.['status'];
            if (span !== undefined && word !== undefined && word !== '') {
              const known = words.get(word.toLowerCase());
              status = { word, line: o.line + i, start: span[0], end: span[1], ...(known?.lifecycle !== undefined ? { lifecycle: known.lifecycle } : {}), ...(known?.delivery !== undefined ? { delivery: known.delivery } : {}) };
              hashed[i] = `${l.slice(0, span[0])}${l.slice(span[1])}`;
            }
          }
          if (store.criteria) {
            const c = CRITERION.exec(l);
            if (c !== null) { criteria.push({ text: c[4]!.trim(), checked: c[2] !== ' ', line: o.line + i }); hashed[i] = `${c[1]!} ${c[3]!}${c[4]!}`; }
          }
        }
        requirements.push({ id: o.id, title: o.title, document: path, line: o.line, endLine: Math.max(o.line, Math.min(endLine, o.line + body.length - 1)), prose: body.join('\n'), canonicalHash: canonicalHash(hashed), ...(status !== undefined ? { status } : {}), criteria });
      };
      for (const [i, line] of lines.entries()) {
        if (line.length > SHAPE_LINE_MAX) { skippedLines += 1; continue; }
        for (const m of line.matchAll(mention)) if (m[0] !== '') mentioned.add(m[0]);
        const m = definition.exec(line);
        const id = m?.groups?.['id'];
        const heading = HEADING.exec(line);
        if (m !== null && id !== undefined && id !== '') {
          if (!identifier.test(id) || id.length > SURVEYED_ID_MAX || !SURVEYED_ID_PATTERN.test(id)) {
            if (malformed.length < CAP) malformed.push({ document: path, line: i + 1, text: cutSample(line) });
            (open as { body: string[] } | null)?.body.push(line);
            continue;
          }
          close(i);
          const first = !defined.has(id);
          if (first) { defined.add(id); ids.push(id); } else duplicates.push({ id, document: path, line: i + 1 });
          const named = m.groups?.['title']?.trim();
          const title = named !== undefined && named !== '' ? (named.length > TITLE_MAX ? `${named.slice(0, TITLE_MAX - 1)}…` : named) : titleOf(line, line.indexOf(id, m.index) + id.length);
          open = { id, title: title === '' ? id : title, line: i + 1, level: heading === null ? 0 : heading[1]!.length, body: [line], first };
          continue;
        }
        if (heading !== null && open !== null && ((open as { level: number }).level === 0 || heading[1]!.length <= (open as { level: number }).level)) { close(i); continue; }
        (open as { body: string[] } | null)?.body.push(line);
      }
      close(lines.length);
      if (ids.length > 0) documents.push({ path, contentHash: contentHash(text), identifiers: ids });
      else empty.push(path);
    }
  }
  requirements.sort((a, b) => compareReqIds(a.id, b.id));
  const mentionedOnly = [...mentioned].filter((id) => !defined.has(id) && SURVEYED_ID_PATTERN.test(id)).sort(compareReqIds);
  return {
    documents, requirements, duplicates: duplicates.slice(0, CAP * 5), mentionedOnly: mentionedOnly.slice(0, CAP), mentionedCount: mentionedOnly.length,
    emptyDocuments: empty.slice(0, CAP), emptyCount: empty.length, malformed, skippedLines,
    bounds: { files: budget.files, bytes: r.state.bytes, reached: filesReached ? 'files' : r.state.reached ? 'bytes' : null },
  };
}

/** Clause 11: what of a measurement is drift. A store's own index or read-me defines nothing and is not drift by itself. */
export function driftOf(m: ShapeMeasurement): ShapeDrift {
  return { mentionedOnly: m.mentionedOnly, mentionedCount: m.mentionedCount, emptyDocuments: m.emptyDocuments, emptyCount: m.emptyCount, duplicates: m.duplicates.length, malformed: m.malformed.length };
}

const TEST_FILE = /(?:\.(?:test|spec)\.[A-Za-z0-9]+|_test\.[A-Za-z0-9]+)$|(?:^|\/)test_[^/]*\.[A-Za-z0-9]+$|(?:^|\/)(?:tests?|__tests__|specs?|e2e)\//;

/**
 * Clause 4's evidence: every place code or a test names an extracted identifier, read by the shape's own `identifier`
 * pattern under its roots. A file under a test root, or one named as a test, is a covering test; any other is an
 * implementation trace. Bounded as the detection pass is.
 */
export function citeShape(root: string, shape: RequirementsShape, ids: ReadonlySet<string>): { sites: AnnotationSite[]; reached: 'files' | 'bytes' | null } {
  const mention = new RegExp(shape.identifier, 'g');
  const r = reader(root);
  const budget = { files: 0 };
  let filesReached = false;
  const sites: AnnotationSite[] = [];
  const seen = new Set<string>();
  const scan = (dir: string, testRoot: boolean): void => {
    const listed = enumerate(root, dir, budget);
    filesReached ||= listed.reached;
    for (const path of listed.files) {
      if (seen.has(path) || !SOURCE_EXTENSIONS.includes(extname(path).toLowerCase())) continue;
      seen.add(path);
      const text = r.read(path);
      if (text === null) continue;
      const kind = testRoot || TEST_FILE.test(path) ? 'test' : 'implementation';
      for (const [i, line] of text.split('\n').entries()) {
        if (line.length > SHAPE_LINE_MAX) continue;
        const found = [...new Set([...line.matchAll(mention)].map((m) => m[0]).filter((id) => ids.has(id)))];
        if (found.length > 0) sites.push({ path, line: i + 1, kind, ids: found });
      }
    }
  };
  for (const d of shape.testRoots) scan(d, true);
  for (const d of shape.implRoots) scan(d, false);
  return { sites, reached: filesReached ? 'files' : r.state.reached ? 'bytes' : null };
}

/**
 * The measurement as the board's projection takes a store (clause 4): one record per requirement, and the report
 * its evidence is read from. Lifecycle is the status word's where the shape maps one and `approved` otherwise, and
 * both obligations follow the shape's `obligations` (clause 12). The layout names the first store; a surveyed
 * workspace has no generated artifact and no baseline, so those paths are empty.
 */
export function shapeParse(root: string, shape: RequirementsShape, m: ShapeMeasurement, sites: readonly AnnotationSite[], generation: number): { parse: StoreParse; report: VerificationReport } {
  const owed = shape.obligations === 'required';
  const hashes = new Map(m.documents.map((d) => [d.path, d.contentHash]));
  const records: RequirementRecord[] = m.requirements.map((q, i) => ({
    id: q.id, number: i + 1, status: q.status?.lifecycle ?? 'approved', traceRequired: owed, testRequired: owed, title: q.title, kind: 'product',
    derivedFrom: [], sourcePath: q.document, contentHash: hashes.get(q.document) ?? '', canonicalHash: q.canonicalHash, prose: q.prose, isEpic: false, surveyed: true,
  }));
  const layout: LayoutConfig = { storeDir: shape.stores[0]!.dir, idPrefix: '', artifactPath: '', debtBaselinePath: '', orphanModuleBaselinePath: '', orphanTestBaselinePath: '', retiredLogPath: '', sourceRoots: shape.implRoots, testRoots: shape.testRoots, skip: [], annotationPatterns: [shape.identifier] };
  const bySite = new Map<string, AnnotationSite[]>();
  for (const s of sites) for (const id of s.ids) bySite.set(id, [...(bySite.get(id) ?? []), s]);
  const evidence: Record<ReqId, RequirementEvidence> = {};
  let traced = 0;
  let covered = 0;
  for (const q of m.requirements) {
    const own = bySite.get(q.id) ?? [];
    const impl = own.some((s) => s.kind === 'implementation');
    const test = own.some((s) => s.kind !== 'implementation');
    if (impl) traced += 1;
    if (test) covered += 1;
    evidence[q.id] = { ...(impl ? { implementationTrace: 'satisfied' as const } : {}), ...(test ? { coveringTest: 'satisfied' as const } : {}), sites: own };
  }
  const parse: StoreParse = {
    root, layout, records, fingerprint: fingerprintOf(records),
    errors: m.duplicates.map((d) => ({ path: d.document, line: d.line, message: `${d.id} is defined a second time here; the first definition in path order is the one drawn` })),
    ...(records.length === 0 ? { empty: 'no-requirements' as const } : {}),
  };
  const approved = records.filter((x) => x.status === 'approved').length;
  return { parse, report: { generation, findings: [], statistics: { total: records.length, approved, traced, testCovered: covered, debt: { trace: 0, test: 0, orphan: 0, orphanTest: 0 } }, evidence } };
}
