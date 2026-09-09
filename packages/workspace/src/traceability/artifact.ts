import type { Lifecycle, ReqKind, RequirementRecord } from '@rotaris/contracts';
import { normaliseLineEndings } from './hashes.js';
import { symbolName } from './identifiers.js';

/**
 * The generated requirement-symbol artifact (REQ-TRACE-051 to REQ-TRACE-065; §Generated artifact): a TypeScript
 * module, since ADR-0040 #4 fixed the implementation language, in the fixed order the format section states —
 * the header, the two suppression directives, the fingerprint line, the import of what the hand-written
 * declarations module defines, one integer enumeration, the deprecated set, the metadata map. Deterministic (059),
 * idempotent (060), LF with a trailing newline.
 *
 * Readings recorded in ADR-0040's Part AJ note: "each member followed by a documentation string" is read as "each
 * member carries one", since a TypeScript doc comment precedes its member; the deprecated marker doubles as the
 * language's deprecation marker (`@deprecated`, REQ-TRACE-181 (1)); the declarations module's specifier is fixed
 * here and its home is wave 2's consumer-integration question.
 */
export const DECLARATIONS_MODULE = 'rotaris-traceability';
export const ENUM_NAME = 'Requirement';
export const DEPRECATED_SET_NAME = 'DEPRECATED_REQUIREMENTS';
export const METADATA_MAP_NAME = 'REQUIREMENT_METADATA';
export const FINGERPRINT_LABEL = 'rotaris-traceability-fingerprint';
export const REGENERATE_ACTION = 'the requirements view’s "Regenerate requirement symbols" action (REQ-TRACE-509)';

/** REQ-TRACE-054: one marker per lifecycle, constant, distinct, the deprecated one the longest. */
export const STATUS_MARKERS: Readonly<Record<Lifecycle, string>> = {
  draft: '[draft: not yet approved; nothing is enforced]',
  approved: '[approved: trace and coverage obligations apply as declared]',
  deprecated: '[deprecated: no new references may be added to this requirement]',
};

const LIFECYCLE_MEMBER: Readonly<Record<Lifecycle, string>> = { draft: 'Draft', approved: 'Approved', deprecated: 'Deprecated' };

/** REQ-TRACE-055: a title cannot terminate the documentation string — the two rewrites the requirement names, plus the comment terminator TypeScript has. */
export function sanitiseTitle(title: string): string {
  return title.replace(/"""/g, "'''").replace(/\\/g, '/').replace(/\*\//g, '* /').replace(/\r?\n/g, ' ');
}

export type ArtifactRecord = Pick<RequirementRecord, 'id' | 'number' | 'status' | 'title' | 'sourcePath' | 'traceRequired' | 'testRequired' | 'contentHash' | 'kind' | 'derivedFrom'>;

function derivedNumbers(derivedFrom: readonly string[]): number[] {
  return derivedFrom.map((d) => Number(d.slice(d.indexOf('-') + 1))).filter((n) => Number.isInteger(n));
}

/** REQ-TRACE-051..059: the module text. `records` in any order; the output is ascending by number. */
export function renderArtifact(records: readonly ArtifactRecord[], storeDir: string, fingerprint: string): string {
  const sorted = [...records].sort((a, b) => a.number - b.number);
  const lines: string[] = [
    '/**',
    ' * GENERATED requirement-symbol artifact. Do not edit by hand: every regeneration replaces this file whole.',
    ` * Compiled from the requirement store at \`${storeDir}\` by the Rotaris traceability toolchain.`,
    ` * Regenerate with ${REGENERATE_ACTION}.`,
    ' */',
    '/* eslint-disable */',
    '// prettier-ignore',
    `// ${FINGERPRINT_LABEL}: ${fingerprint}`,
    `import { Lifecycle, RequirementMeta } from '${DECLARATIONS_MODULE}';`,
    '',
    `export enum ${ENUM_NAME} {`,
  ];
  for (const r of sorted) {
    const doc = `${STATUS_MARKERS[r.status]} ${sanitiseTitle(r.title)} - ${r.sourcePath}`;
    lines.push(`  /** ${r.status === 'deprecated' ? '@deprecated ' : ''}${doc} */`);
    lines.push(`  ${symbolName(r.id)} = ${r.number},`);
    lines.push('');
  }
  lines.push('}', '');
  const deprecated = sorted.filter((r) => r.status === 'deprecated');
  if (deprecated.length === 0) lines.push(`export const ${DEPRECATED_SET_NAME}: ReadonlySet<${ENUM_NAME}> = new Set<${ENUM_NAME}>([]);`);
  else {
    lines.push(`export const ${DEPRECATED_SET_NAME}: ReadonlySet<${ENUM_NAME}> = new Set<${ENUM_NAME}>([`);
    for (const r of deprecated) lines.push(`  ${ENUM_NAME}.${symbolName(r.id)},`);
    lines.push(']);');
  }
  lines.push('', `export const ${METADATA_MAP_NAME}: ReadonlyMap<number, RequirementMeta> = new Map<number, RequirementMeta>([`);
  for (const r of sorted) {
    // REQ-TRACE-057's positional order; strings as JSON so they round-trip exactly; the derived-from tuple as numbers (019).
    lines.push(`  [${r.number}, new RequirementMeta(${JSON.stringify(r.id)}, ${r.number}, Lifecycle.${LIFECYCLE_MEMBER[r.status]}, ${JSON.stringify(r.title)}, ${JSON.stringify(r.sourcePath)}, ${r.traceRequired}, ${r.testRequired}, ${JSON.stringify(r.contentHash)}, ${JSON.stringify(r.kind)}, [${derivedNumbers(r.derivedFrom).join(', ')}])],`);
  }
  lines.push(']);', '');
  return lines.join('\n');
}

/** REQ-TRACE-060/062: the on-disk text normalised (line endings) for the equality the staleness check makes. */
export function normaliseArtifactText(onDisk: string): string {
  return normaliseLineEndings(onDisk);
}

export function isArtifactUpToDate(onDisk: string | null, fresh: string): boolean {
  return onDisk !== null && normaliseArtifactText(onDisk) === fresh;
}

/** What REQ-TRACE-138 and REQ-TRACE-157 recover from an artifact: the previous generation's record of what existed. */
export interface RecoveredEntry {
  readonly id: string; readonly number: number; readonly status: Lifecycle; readonly title: string; readonly sourcePath: string;
  readonly traceRequired: boolean; readonly testRequired: boolean; readonly contentHash: string; readonly kind: ReqKind; readonly derivedFrom: readonly number[];
}

const ENTRY_OPEN = /^\s*\[(\d+), new RequirementMeta\(/;
const MEMBER_TO_LIFECYCLE: Readonly<Record<string, Lifecycle>> = { Draft: 'draft', Approved: 'approved', Deprecated: 'deprecated' };

/** A small argument scanner: a JSON string literal starting at `at`; returns the value and the index past it. */
function readJsonString(text: string, at: number): { value: string; next: number } | null {
  if (text[at] !== '"') return null;
  let i = at + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '"') {
      try { return { value: JSON.parse(text.slice(at, i + 1)) as string, next: i + 1 }; } catch { return null; }
    }
    i += 1;
  }
  return null;
}

function skipSeparator(text: string, at: number): number {
  let i = at;
  while (i < text.length && (text[i] === ',' || text[i] === ' ' || text[i] === '\t')) i += 1;
  return i;
}

/** Interpret one metadata entry line; null when it cannot be interpreted (138: passed over, the rest still recovered). */
export function recoverEntry(line: string): RecoveredEntry | null {
  const open = ENTRY_OPEN.exec(line);
  if (!open) return null;
  let i = open[0].length;
  const id = readJsonString(line, i);
  if (!id) return null;
  i = skipSeparator(line, id.next);
  const num = /^(\d+)/.exec(line.slice(i));
  if (!num) return null;
  i = skipSeparator(line, i + num[0].length);
  const life = /^Lifecycle\.(\w+)/.exec(line.slice(i));
  if (!life) return null;
  const status = MEMBER_TO_LIFECYCLE[life[1]!];
  if (status === undefined) return null;
  i = skipSeparator(line, i + life[0].length);
  const title = readJsonString(line, i);
  if (!title) return null;
  i = skipSeparator(line, title.next);
  const sourcePath = readJsonString(line, i);
  if (!sourcePath) return null;
  i = skipSeparator(line, sourcePath.next);
  const flags = /^(true|false), (true|false)/.exec(line.slice(i));
  if (!flags) return null;
  i = skipSeparator(line, i + flags[0].length);
  const hash = readJsonString(line, i);
  if (!hash || !/^[0-9a-f]{16}$/.test(hash.value)) return null;
  i = skipSeparator(line, hash.next);
  const kind = readJsonString(line, i);
  if (!kind || (kind.value !== 'product' && kind.value !== 'technical')) return null;
  i = skipSeparator(line, kind.next);
  const tuple = /^\[([\d, ]*)\]\)\],?\s*$/.exec(line.slice(i));
  if (!tuple) return null;
  const number = Number(num[1]);
  if (number !== Number(open[1])) return null;
  return {
    id: id.value, number, status, title: title.value, sourcePath: sourcePath.value, traceRequired: flags[1] === 'true', testRequired: flags[2] === 'true', contentHash: hash.value, kind: kind.value,
    derivedFrom: tuple[1]!.split(',').map((t) => t.trim()).filter((t) => t.length > 0).map(Number),
  };
}

/** REQ-TRACE-138/157: every well-formed entry of an artifact's text; an unreadable artifact (null) yields none. */
export function recoverEntries(text: string | null): RecoveredEntry[] {
  if (text === null) return [];
  const out: RecoveredEntry[] = [];
  for (const line of normaliseLineEndings(text).split('\n')) {
    const e = recoverEntry(line);
    if (e !== null) out.push(e);
  }
  return out;
}

/** The fingerprint line's value, when present. */
export function recoverFingerprint(text: string | null): string | null {
  if (text === null) return null;
  const m = new RegExp(`^// ${FINGERPRINT_LABEL}: ([0-9a-f]{64})$`, 'm').exec(normaliseLineEndings(text));
  return m ? m[1]! : null;
}
