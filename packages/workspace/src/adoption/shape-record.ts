import { join } from 'node:path';
import { SHAPE_EXPORT_FILE, SHAPE_RECORD_FILE, type AdoptionDelta, type RequirementsShape, type ShapeDrift, type ShapeMeasurement, type ShapeRecord } from '@rotaris/contracts';
import { guardedRead, replaceDocumentSync, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { deltaOf } from './record.js';
import { driftOf, validateShape } from './shape.js';

/**
 * Where an accepted shape lives (PD-TRACE-002 clause 9; REQ-ADOPT-041, REQ-ADOPT-042, REQ-ADOPT-052): the per-clone record in the workspace scope directory, and the
 * committable file at the repository root that Export to repository writes. A workspace holding the repository file
 * reads its shape from it, validated on every read, and needs no survey; the local record then still carries what was
 * extracted when it was last recorded, which the comparison on opening and the drift statement are read against.
 * Either file is one a person can edit, so every field is checked as a model's would be (REQ-ADOPT-025).
 */
export function shapeRecordPath(root: string): string {
  return join(root, WORKSPACE_SCOPE_DIR, SHAPE_RECORD_FILE);
}
export function shapeExportPath(root: string): string {
  return join(root, SHAPE_EXPORT_FILE);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const HEX16 = /^[0-9a-f]{16}$/;
const HEX32 = /^[0-9a-f]{32}$/;

export type ShapeRecordRead = { readonly state: 'absent' } | { readonly state: 'readable'; readonly record: ShapeRecord } | { readonly state: 'unreadable'; readonly reason: string };

export function readShapeRecord(root: string): ShapeRecordRead {
  const read = guardedRead(shapeRecordPath(root), (raw) => JSON.parse(raw) as unknown);
  if (read.state === 'absent') return { state: 'absent' };
  if (read.state === 'unreadable') return { state: 'unreadable', reason: read.reason };
  const doc = read.value;
  const bad = (reason: string): ShapeRecordRead => ({ state: 'unreadable', reason });
  if (!isObject(doc)) return bad('the record is not a JSON object');
  if (doc['version'] !== 1) return bad(`unknown record version ${JSON.stringify(doc['version'])}`);
  if (typeof doc['acceptedAt'] !== 'string' || (doc['how'] !== 'survey' && doc['how'] !== 'record' && doc['how'] !== 'import')) return bad('acceptedAt or how is missing');
  const shape = validateShape(doc['shape'], root);
  if (!shape.ok) return bad(`the recorded shape no longer validates (${shape.field}): ${shape.reason}`);
  const documents = doc['documents'];
  const requirements = doc['requirements'];
  if (!Array.isArray(documents) || !documents.every((d) => isObject(d) && typeof d['path'] === 'string' && typeof d['contentHash'] === 'string' && HEX16.test(d['contentHash']) && Array.isArray(d['identifiers']) && d['identifiers'].every((i) => typeof i === 'string'))) return bad('the documents list is malformed');
  if (!Array.isArray(requirements) || !requirements.every((r) => isObject(r) && typeof r['id'] === 'string' && typeof r['document'] === 'string' && typeof r['canonicalHash'] === 'string' && HEX32.test(r['canonicalHash']))) return bad('the requirements list is malformed');
  const b = doc['baseline'];
  const baseline = isObject(b) && ['mentioned', 'empty', 'duplicates', 'malformed'].every((k) => typeof b[k] === 'number' && Number.isInteger(b[k]) && b[k] >= 0) ? { mentioned: b['mentioned'] as number, empty: b['empty'] as number, duplicates: b['duplicates'] as number, malformed: b['malformed'] as number } : { mentioned: 0, empty: 0, duplicates: 0, malformed: 0 };
  return { state: 'readable', record: { version: 1, acceptedAt: doc['acceptedAt'], how: doc['how'], shape: shape.value, documents: documents as ShapeRecord['documents'], requirements: requirements as ShapeRecord['requirements'], baseline } };
}

export function recordOf(shape: RequirementsShape, m: ShapeMeasurement, how: ShapeRecord['how'], at: string): ShapeRecord {
  return {
    version: 1, acceptedAt: at, how, shape,
    documents: m.documents,
    requirements: m.requirements.map((r) => ({ id: r.id, document: r.document, canonicalHash: r.canonicalHash })),
    baseline: { mentioned: m.mentionedCount, empty: m.emptyCount, duplicates: m.duplicates.length, malformed: m.malformed.length },
  };
}

/** REQ-ADOPT-021: replaced atomically, the scope directory created where it is missing. */
export function writeShapeRecord(root: string, record: ShapeRecord): { ok: true } | { ok: false; reason: string } {
  const r = replaceDocumentSync(shapeRecordPath(root), `${JSON.stringify(record, null, 2)}\n`, { createParent: true });
  return r.ok ? { ok: true } : { ok: false, reason: r.error.headline };
}

export type ShapeExportRead = { readonly state: 'absent' } | { readonly state: 'readable'; readonly shape: RequirementsShape } | { readonly state: 'unreadable'; readonly reason: string };

/** Clause 9: the repository's own file, validated on every read. */
export function readShapeExport(root: string): ShapeExportRead {
  const read = guardedRead(shapeExportPath(root), (raw) => JSON.parse(raw) as unknown);
  if (read.state === 'absent') return { state: 'absent' };
  if (read.state === 'unreadable') return { state: 'unreadable', reason: read.reason };
  const shape = validateShape(read.value, root);
  return shape.ok ? { state: 'readable', shape: shape.value } : { state: 'unreadable', reason: `${SHAPE_EXPORT_FILE} does not validate (${shape.field}): ${shape.reason}` };
}

/** Clause 9: Export to repository. The file holds the shape and nothing of this clone's record. */
export function writeShapeExport(root: string, shape: RequirementsShape): { ok: true; replaced: boolean } | { ok: false; reason: string } {
  const before = guardedRead(shapeExportPath(root), (raw) => raw);
  const r = replaceDocumentSync(shapeExportPath(root), `${JSON.stringify(shape, null, 2)}\n`, { createParent: false });
  return r.ok ? { ok: true, replaced: before.state !== 'absent' } : { ok: false, reason: r.error.headline };
}

export type ActiveShape =
  | { readonly state: 'none' }
  | { readonly state: 'accepted'; readonly origin: 'local' | 'repository'; readonly shape: RequirementsShape; readonly record?: ShapeRecord }
  | { readonly state: 'unreadable'; readonly origin: 'local' | 'repository'; readonly reason: string };

/** The shape a workspace is read through: the repository's file where there is one, the local record otherwise. */
export function activeShape(root: string): ActiveShape {
  const exported = readShapeExport(root);
  const local = readShapeRecord(root);
  if (exported.state === 'unreadable') return { state: 'unreadable', origin: 'repository', reason: exported.reason };
  if (exported.state === 'readable') {
    // The local record is this clone's baseline only while it was taken through the same shape.
    const same = local.state === 'readable' && JSON.stringify(local.record.shape) === JSON.stringify(exported.shape);
    return { state: 'accepted', origin: 'repository', shape: exported.shape, ...(same ? { record: local.record } : {}) };
  }
  if (local.state === 'unreadable') return { state: 'unreadable', origin: 'local', reason: local.reason };
  if (local.state === 'readable') return { state: 'accepted', origin: 'local', shape: local.record.shape, record: local.record };
  return { state: 'none' };
}

/** REQ-ADOPT-023 over a shape's record: new first. */
export function shapeDelta(record: ShapeRecord, m: ShapeMeasurement): AdoptionDelta {
  return deltaOf(record, { documents: m.documents, requirements: m.requirements });
}

/**
 * Clause 11: drift is what fits the shape LESS than when it was accepted — a store's own index and its cross-references
 * to requirements kept elsewhere were there on the day and are not drift. With no record there is no day to compare
 * against, and nothing is stated.
 */
export function shapeDrift(record: ShapeRecord | undefined, m: ShapeMeasurement): ShapeDrift {
  const now = driftOf(m);
  if (record === undefined) return { mentionedOnly: [], mentionedCount: 0, emptyDocuments: [], emptyCount: 0, duplicates: 0, malformed: 0 };
  const more = (a: number, b: number): number => Math.max(0, a - b);
  const mentionedCount = more(now.mentionedCount, record.baseline.mentioned);
  const emptyCount = more(now.emptyCount, record.baseline.empty);
  const recorded = new Set(record.documents.map((d) => d.path));
  return {
    mentionedCount, mentionedOnly: mentionedCount === 0 ? [] : now.mentionedOnly,
    // A document that defined requirements when the shape was accepted and defines none now is named first.
    emptyCount, emptyDocuments: emptyCount === 0 ? [] : [...now.emptyDocuments].sort((a, b) => Number(recorded.has(b)) - Number(recorded.has(a))),
    duplicates: more(now.duplicates, record.baseline.duplicates), malformed: more(now.malformed, record.baseline.malformed),
  };
}

export function hasDrift(d: ShapeDrift): boolean {
  return d.mentionedCount + d.emptyCount + d.duplicates + d.malformed > 0;
}
