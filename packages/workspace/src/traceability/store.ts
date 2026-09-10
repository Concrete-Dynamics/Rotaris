import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { compareReqIds, type Lifecycle, type ParseError, type ReqKind, type RequirementRecord, type StoreParse } from '@rotaris/contracts';
import { checkpoint, type CancelToken } from './cancel.js';
import { fieldValue, readFrontmatter, stripOuterQuotes, type Frontmatter } from './frontmatter.js';
import { canonicalHash, contentHash, decodeUtf8, fingerprintOf, normaliseLineEndings } from './hashes.js';
import { buildLegacyAliases, identifierOf, identifierPattern, parseIdentifierList } from './identifiers.js';
import { toSeamLayout, type ResolvedLayout } from './layout.js';
import { reportPhase, type ProgressHost } from './progress.js';
import { parseTombstones, type Tombstone } from './tombstones.js';

/**
 * The store parse (REQ-TRACE-001 to REQ-TRACE-037, 134, 198, 199, 501, 503) — streaming, as ADR-0040 specific 1
 * requires: documents are enumerated in ascending repository-relative POSIX path order (005), and each one is read,
 * decoded with replacement, normalised to LF, hashed, reduced to its metadata records and released before the next
 * is read, so peak memory is one document plus the accumulated records (501). A document without frontmatter is
 * ignored silently (003); one without a `req-id` is skipped without error (012); one that fails validation
 * contributes nothing while the others still parse (026).
 */
export type DocumentKind = 'no-frontmatter' | 'no-identifier' | 'invalid' | 'requirements';

export interface DocumentSummary { readonly path: string; readonly hash: string; readonly kind: DocumentKind; readonly ids: readonly string[] }

export interface StoreParseDetails {
  readonly documents: readonly DocumentSummary[];
  /** REQ-TRACE-021's alias table, upper-cased key → number, or null where two or more requirements claim it. */
  readonly legacyAliases: Readonly<Record<string, number | null>>;
  readonly tombstoned: readonly number[];
}

/** The seam's `StoreParse` plus what the other passes need and the seam does not carry. */
export interface StoreParseOutput extends StoreParse { readonly details: StoreParseDetails }

export interface StoreParseInput {
  readonly root: string;
  readonly layout: ResolvedLayout;
  /** The retired-identifier log's bytes, read by the owner (ADR-0040 #6); null when absent. */
  readonly retiredLog: string | null;
  readonly token?: CancelToken;
  readonly progress?: ProgressHost;
}

const LIFECYCLES: readonly Lifecycle[] = ['approved', 'deprecated', 'draft'];
const FLAGS = ['optional', 'required'] as const;
const KINDS: readonly ReqKind[] = ['product', 'technical'];
const H1 = /^#(?!#)[ \t]+(.*?)[ \t]*$/;
const H2_OPEN = /^##(?!#)[ \t]/;
const OVERRIDE_FIELD = /^([a-z][a-z-]*):(.*)$/;

export function isSkipped(relativeParts: readonly string[], skipParts: readonly string[]): boolean {
  return relativeParts.some((p) => skipParts.includes(p));
}

/** Recursive `*.md` enumeration under the store, repository-relative POSIX paths, ascending (005); skip parts honoured (039). */
export function enumerateStore(root: string, layout: ResolvedLayout): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const relPath = `${rel}/${e.name}`;
      const partsUnderStore = relPath.slice(layout.requirementsDir.length + 1).split('/');
      if (isSkipped(partsUnderStore, layout.skipParts)) continue;
      if (e.isDirectory()) walk(relPath);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(relPath);
    }
  };
  walk(layout.requirementsDir);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

interface DraftRecord {
  id: string; number: number; status: Lifecycle; traceRequired: boolean; testRequired: boolean; title: string; kind: ReqKind;
  derivedFrom: string[]; legacyId?: string; priority?: string; date?: string; source?: string; sourcePath: string; contentHash: string; canonicalHash: string; prose: string;
}

export interface DocumentParse {
  readonly hash: string;
  readonly kind: DocumentKind;
  readonly records: readonly DraftRecord[];
  readonly errors: readonly ParseError[];
}

function firstH1(lines: readonly string[], from: number): { index: number; text: string } | null {
  for (let i = from; i < lines.length; i += 1) {
    const m = H1.exec(lines[i]!);
    if (m) return { index: i, text: m[1]! };
  }
  return null;
}

function stripIdentifierLead(text: string, id: string): string {
  if (!text.startsWith(id) || /[0-9]/.test(text.charAt(id.length))) return text.trim();
  return text.slice(id.length).trim().replace(/^[-—:]+/, '').trim();
}

/** REQ-TRACE-198: single-identifier prose — between the top-level identifier heading and the first `##` section. */
function singleProse(lines: readonly string[], bodyStart: number): string {
  const h1 = firstH1(lines, bodyStart);
  const start = h1 ? h1.index + 1 : bodyStart;
  let end = lines.length;
  for (let i = start; i < lines.length; i += 1) if (H2_OPEN.test(lines[i]!)) { end = i; break; }
  return lines.slice(start, end).join('\n').trim();
}

function resolve<T extends string>(path: string, id: string, key: string, raw: string | undefined, accepted: readonly T[], fallback: T | null, errors: ParseError[]): T | null {
  const value = raw === undefined ? undefined : raw.trim();
  if (value === undefined || value.length === 0) {
    if (fallback !== null) return fallback;
    errors.push({ path, message: `${path} (${id}): ${key} is missing; accepted values: ${[...accepted].sort().join(', ')}` });
    return null;
  }
  if ((accepted as readonly string[]).includes(value)) return value as T;
  errors.push({ path, message: `${path} (${id}): ${key} ${JSON.stringify(value)} is not accepted; accepted values: ${[...accepted].sort().join(', ')}` });
  return null;
}

interface Overrides { status?: string; trace?: string; test?: string; legacyId?: string }

/** REQ-TRACE-030: the override block just after a heading — blank lines passed over, lowercase-and-hyphen keys, closed by the first blank or non-field line. */
function readOverrides(lines: readonly string[], from: number, to: number): { overrides: Overrides; proseStart: number } {
  let i = from;
  while (i < to && lines[i]!.trim().length === 0) i += 1;
  const overrides: Overrides = {};
  let opened = false;
  for (; i < to; i += 1) {
    const m = OVERRIDE_FIELD.exec(lines[i]!);
    if (!m) break;
    opened = true;
    const value = stripOuterQuotes(m[2]!.trim());
    switch (m[1]) {
      case 'status': overrides.status = value; break;
      case 'trace': overrides.trace = value; break;
      case 'test': overrides.test = value; break;
      case 'legacy-id': overrides.legacyId = value; break;
      default: break;
    }
  }
  return { overrides, proseStart: opened ? i : from };
}

/** Parse one normalised document into its records; pure, so the streaming loop holds nothing but this result. */
export function parseDocument(normalised: string, path: string, prefix: string): DocumentParse {
  const hash = contentHash(normalised);
  const lines = normalised.split('\n');
  const fm: Frontmatter | null = readFrontmatter(lines);
  if (fm === null) return { hash, kind: 'no-frontmatter', records: [], errors: [] };
  const reqId = fieldValue(fm, 'req-id');
  if (reqId === undefined) return { hash, kind: 'no-identifier', records: [], errors: [] };
  const errors: ParseError[] = [];
  const list = parseIdentifierList(reqId, prefix);
  if (list.emptyList) {
    errors.push({ path, message: `${path}: req-id is an empty list; declare at least one identifier` });
    return { hash, kind: 'invalid', records: [], errors };
  }
  if (list.invalid.length > 0) {
    for (const bad of list.invalid) errors.push({ path, message: `${path}: req-id ${JSON.stringify(bad)} is not an identifier of the form ${prefix}-<digits> (one uppercase prefix, a hyphen, decimal digits without leading zeros)` });
    return { hash, kind: 'invalid', records: [], errors };
  }
  const shared = {
    status: fieldValue(fm, 'status'), trace: fieldValue(fm, 'trace'), test: fieldValue(fm, 'test'), title: fieldValue(fm, 'title'), type: fieldValue(fm, 'type'),
    derivedFrom: fieldValue(fm, 'derived-from'), legacyId: fieldValue(fm, 'legacy-id'), priority: fieldValue(fm, 'priority'), date: fieldValue(fm, 'date'), source: fieldValue(fm, 'source'),
  };
  const h1 = firstH1(lines, fm.bodyStart);
  const records: DraftRecord[] = [];
  const idPattern = identifierPattern(prefix);
  const anyIdHeading = new RegExp(`^#{2,6}[ \\t]+${prefix}-[0-9]+(?![0-9])`);
  const headingOf = (id: string): { index: number; remainder: string } | null => {
    const re = new RegExp(`^#{2,6}[ \\t]+${id}(?![0-9])(.*)$`);
    for (let i = fm.bodyStart; i < lines.length; i += 1) {
      const m = re.exec(lines[i]!);
      if (m) return { index: i, remainder: m[1]! };
    }
    return null;
  };
  const build = (id: string, overrides: Overrides, titleOverride: string | undefined, prose: string, inheritLegacy: boolean): DraftRecord | null => {
    const number = Number(idPattern.exec(id)![1]);
    const before = errors.length;
    const status = resolve<Lifecycle>(path, id, 'status', overrides.status ?? shared.status, LIFECYCLES, null, errors);
    const trace = resolve(path, id, 'trace', overrides.trace ?? shared.trace, FLAGS, 'required', errors);
    const test = resolve(path, id, 'test', overrides.test ?? shared.test, FLAGS, 'required', errors);
    const kind = resolve<ReqKind>(path, id, 'type', shared.type, KINDS, 'product', errors);
    if (errors.length > before || status === null || trace === null || test === null || kind === null) return null;
    const derivedFrom: string[] = [];
    if (shared.derivedFrom !== undefined && shared.derivedFrom.trim().length > 0) {
      const d = parseIdentifierList(shared.derivedFrom, prefix);
      for (const bad of d.invalid) errors.push({ path, message: `${path} (${id}): derived-from token ${JSON.stringify(bad)} is not an identifier of the form ${prefix}-<digits>; it was skipped` });
      derivedFrom.push(...d.ids);
    }
    const title = titleOverride !== undefined && titleOverride.length > 0 ? titleOverride : shared.title !== undefined && shared.title.length > 0 ? shared.title : h1 ? stripIdentifierLead(h1.text, id) : '';
    const r: DraftRecord = {
      id, number, status, traceRequired: trace === 'required', testRequired: test === 'required', title, kind, derivedFrom, sourcePath: path, contentHash: hash,
      canonicalHash: canonicalHash([id, status, trace, test, kind, derivedFrom.join(','), title, prose]), prose,
    };
    const legacy = overrides.legacyId ?? (inheritLegacy ? shared.legacyId : undefined);
    if (legacy !== undefined && legacy.length > 0) r.legacyId = legacy;
    if (shared.priority !== undefined && shared.priority.length > 0) r.priority = shared.priority;
    if (shared.date !== undefined && shared.date.length > 0) r.date = shared.date;
    if (shared.source !== undefined && shared.source.length > 0) r.source = shared.source;
    return r;
  };
  if (!list.list || list.ids.length === 1 && !list.list) {
    // REQ-TRACE-034: a single-identifier document consults no body headings.
    const r = build(list.ids[0]!, {}, undefined, singleProse(lines, fm.bodyStart), true);
    if (r === null) return { hash, kind: 'invalid', records: [], errors };
    return { hash, kind: 'requirements', records: [r], errors };
  }
  // Multi-identifier document (027 to 035): every declared identifier needs a body heading; blocks run to the next identifier heading.
  const headingIndexes: number[] = [];
  for (let i = fm.bodyStart; i < lines.length; i += 1) if (anyIdHeading.test(lines[i]!)) headingIndexes.push(i);
  for (const id of list.ids) {
    const h = headingOf(id);
    if (h === null) {
      errors.push({ path, message: `${path} (${id}): no body heading declares ${id}; expected a heading of level 2 to 6 whose text begins with the identifier, such as "## ${id} - <title>"` });
      continue;
    }
    const next = headingIndexes.find((i) => i > h.index) ?? lines.length;
    const { overrides, proseStart } = readOverrides(lines, h.index + 1, next);
    const prose = lines.slice(proseStart, next).join('\n').trim();
    const titleOverride = h.remainder.trim().replace(/^[-—:]+/, '').trim();
    const r = build(id, overrides, titleOverride, prose, false);
    if (r !== null) records.push(r);
  }
  if (records.length === 0 && errors.length > 0) return { hash, kind: 'invalid', records: [], errors };
  return { hash, kind: 'requirements', records, errors };
}

/** REQ-TRACE-199: the index document at the store root owning the sibling directory of the same stem. */
export function indexDocumentOf(docPath: string, storeDir: string): string {
  const under = docPath.slice(storeDir.length + 1);
  const parts = under.split('/');
  return parts.length === 1 ? docPath : `${storeDir}/${parts[0]}.md`;
}

/** The streaming parse. Throws `CancelledError` at a checkpoint between documents (REQ-TRACE-222). */
export function parseStore(input: StoreParseInput): StoreParseOutput {
  const { root, layout } = input;
  const prefix = layout.idPrefix;
  reportPhase(input.progress, 'reading', 0);
  const tombstones = parseTombstones(input.retiredLog, prefix);
  const errors: ParseError[] = [];
  const documents: DocumentSummary[] = [];
  const claimed = new Map<number, string>();
  const drafts: DraftRecord[] = [];
  const lowestByDocument = new Map<string, number>();
  let storeExists = false;
  try { storeExists = statSync(join(root, layout.requirementsDir)).isDirectory(); } catch { storeExists = false; }
  const paths = storeExists ? enumerateStore(root, layout) : [];
  for (const path of paths) {
    checkpoint(input.token, `before ${path}`);
    let bytes: Buffer;
    try { bytes = readFileSync(join(root, path)); } catch (e) {
      errors.push({ path, message: `${path}: the document cannot be read: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    const parsed = parseDocument(normaliseLineEndings(decodeUtf8(bytes)), path, prefix);
    errors.push(...parsed.errors);
    const ids: string[] = [];
    for (const r of parsed.records) {
      const tomb: Tombstone | undefined = tombstones.get(r.number);
      if (tomb !== undefined) {
        // REQ-TRACE-134: reuse rejected inside the parse itself, so every operation refuses it.
        errors.push({ path, message: `${path} (${r.id}): ${r.id} was retired on ${tomb.date}${tomb.title.length > 0 ? ` (last titled ${JSON.stringify(tomb.title)})` : ''} and cannot be claimed again; claim the next free identifier` });
        continue;
      }
      const first = claimed.get(r.number);
      if (first !== undefined) {
        // REQ-TRACE-023: the later claimant, in path order, is dropped.
        errors.push({ path, message: `${path} (${r.id}): ${r.id} is already declared by ${first}; this later declaration is dropped` });
        continue;
      }
      claimed.set(r.number, path);
      drafts.push(r);
      ids.push(r.id);
      const lowest = lowestByDocument.get(path);
      if (lowest === undefined || r.number < lowest) lowestByDocument.set(path, r.number);
    }
    documents.push({ path, hash: parsed.hash, kind: parsed.kind, ids });
  }
  // REQ-TRACE-289 (Part AJ2): the one digit-run-aware comparator the board sorts by as well — never two that agree by luck.
  drafts.sort((a, b) => compareReqIds(a.id, b.id));
  const records: RequirementRecord[] = drafts.map((d) => {
    const index = indexDocumentOf(d.sourcePath, layout.requirementsDir);
    const lowest = lowestByDocument.get(index);
    const r: { -readonly [K in keyof RequirementRecord]: RequirementRecord[K] } = { ...d, derivedFrom: [...d.derivedFrom], isEpic: d.number % 100 === 0 };
    if (lowest !== undefined && lowest !== d.number) r.epic = identifierOf(prefix, lowest);
    return r;
  });
  const aliases = buildLegacyAliases(records);
  const withFrontmatter = documents.filter((d) => d.kind !== 'no-frontmatter').length;
  const withIdentifier = documents.filter((d) => d.kind === 'requirements' || d.kind === 'invalid').length;
  const empty: StoreParse['empty'] | undefined = !storeExists ? 'no-directory' : withFrontmatter === 0 ? 'no-documents' : withIdentifier === 0 ? 'no-requirements' : undefined;
  const out: { -readonly [K in keyof StoreParseOutput]: StoreParseOutput[K] } = {
    root, layout: toSeamLayout(layout), records, fingerprint: fingerprintOf(records), errors,
    details: { documents, legacyAliases: Object.fromEntries(aliases), tombstoned: [...tombstones.keys()].sort((a, b) => a - b) },
  };
  if (empty !== undefined) out.empty = empty;
  return out;
}

/** Records keyed by number, for the passes that join on it. */
export function byNumber(parse: StoreParse): Map<number, RequirementRecord> {
  return new Map(parse.records.map((r) => [r.number, r]));
}
