import { join } from 'node:path';
import { ADOPTION_RECORD_FILE, compareReqIds, type AdoptionDelta, type AdoptionRecord, type AdoptionView } from '@rotaris/contracts';
import { guardedRead, replaceDocumentSync, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { executeAdapter, revalidateAdapter, type Execution } from './adapter.js';
import { detectWorkspace } from './detect.js';

/**
 * The adoption record and the comparison on opening (REQ-ADOPT-018 to REQ-ADOPT-025, PD-TRACE-001). The record lives in
 * the workspace scope directory (`.rotaris/`), never in the user's project files: the store it was taken from, the
 * identifier family, the adapter that extracted it, each document's content hash (REQ-TRACE-036) and each identifier's
 * canonical hash (REQ-TRACE-037). The comparison executes the recorded adapter against the store as it now stands and
 * names what is new, changed and removed — and is a READ: it writes nothing and consults no model (REQ-ADOPT-022,
 * REQ-TRACE-341). A record that cannot be read is reported as such and never repaired here (REQ-ADOPT-025).
 */
export function adoptionRecordPath(root: string): string {
  return join(root, WORKSPACE_SCOPE_DIR, ADOPTION_RECORD_FILE);
}

const HEX16 = /^[0-9a-f]{16}$/;
const HEX32 = /^[0-9a-f]{32}$/;

export type RecordRead = { readonly state: 'absent' } | { readonly state: 'readable'; readonly record: AdoptionRecord } | { readonly state: 'unreadable'; readonly reason: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read and check the record by hand — the record is a file a person can edit, so every field is checked as a model's would be. */
export function readAdoptionRecord(root: string): RecordRead {
  const read = guardedRead(adoptionRecordPath(root), (raw) => JSON.parse(raw) as unknown);
  if (read.state === 'absent') return { state: 'absent' };
  if (read.state === 'unreadable') return { state: 'unreadable', reason: read.reason };
  const doc = read.value;
  const bad = (reason: string): RecordRead => ({ state: 'unreadable', reason });
  if (!isObject(doc)) return bad('the record is not a JSON object');
  if (doc['version'] !== 1) return bad(`unknown record version ${JSON.stringify(doc['version'])}`);
  if (typeof doc['recordedAt'] !== 'string' || (doc['how'] !== 'run' && doc['how'] !== 'record')) return bad('recordedAt or how is missing');
  const adapter = revalidateAdapter(doc['adapter'], root);
  if (!adapter.ok) return bad(`the recorded adapter no longer validates (${adapter.field}): ${adapter.reason}`);
  const documents = doc['documents'];
  const requirements = doc['requirements'];
  if (!Array.isArray(documents) || !documents.every((d) => isObject(d) && typeof d['path'] === 'string' && typeof d['contentHash'] === 'string' && HEX16.test(d['contentHash']) && Array.isArray(d['identifiers']) && d['identifiers'].every((i) => typeof i === 'string'))) return bad('the documents list is malformed');
  if (!Array.isArray(requirements) || !requirements.every((r) => isObject(r) && typeof r['id'] === 'string' && typeof r['document'] === 'string' && typeof r['canonicalHash'] === 'string' && HEX32.test(r['canonicalHash']))) return bad('the requirements list is malformed');
  return { state: 'readable', record: { version: 1, recordedAt: doc['recordedAt'], how: doc['how'], adapter: adapter.value, documents: documents as AdoptionRecord['documents'], requirements: requirements as AdoptionRecord['requirements'] } };
}

/** REQ-ADOPT-021: replaced atomically, the scope directory created where it is missing. */
export function writeAdoptionRecord(root: string, record: AdoptionRecord): { ok: true } | { ok: false; reason: string } {
  const r = replaceDocumentSync(adoptionRecordPath(root), `${JSON.stringify(record, null, 2)}\n`, { createParent: true });
  return r.ok ? { ok: true } : { ok: false, reason: r.error.headline };
}

/** REQ-ADOPT-023: by identifier in identifier order, documents by path; new first is the reader's order of the fields. */
export function deltaOf(record: Pick<AdoptionRecord, 'documents' | 'requirements'>, now: Pick<Execution, 'documents' | 'requirements'>): AdoptionDelta {
  const was = new Map(record.requirements.map((r) => [r.id, r.canonicalHash]));
  const is = new Map(now.requirements.map((r) => [r.id, r.canonicalHash]));
  const docsWas = new Map(record.documents.map((d) => [d.path, d.contentHash]));
  const docsIs = new Map(now.documents.map((d) => [d.path, d.contentHash]));
  const byPath = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  return {
    newIds: [...is.keys()].filter((id) => !was.has(id)).sort(compareReqIds),
    changedIds: [...is.entries()].filter(([id, h]) => was.has(id) && was.get(id) !== h).map(([id]) => id).sort(compareReqIds),
    removedIds: [...was.keys()].filter((id) => !is.has(id)).sort(compareReqIds),
    documentsAdded: [...docsIs.keys()].filter((p) => !docsWas.has(p)).sort(byPath),
    documentsChanged: [...docsIs.entries()].filter(([p, h]) => docsWas.has(p) && docsWas.get(p) !== h).map(([p]) => p).sort(byPath),
    documentsRemoved: [...docsWas.keys()].filter((p) => !docsIs.has(p)).sort(byPath),
  };
}

/** REQ-ADOPT-022 to REQ-ADOPT-025: the comparison on opening. Reads only. */
export function compareAdoption(root: string): AdoptionView {
  const read = readAdoptionRecord(root);
  if (read.state === 'absent') return { state: 'not-adopted', detection: detectWorkspace(root) };
  if (read.state === 'unreadable') return { state: 'unreadable', reason: read.reason, detection: detectWorkspace(root) };
  const now = executeAdapter(root, read.record.adapter);
  if (!now.ok) return { state: 'unreadable', reason: `the recorded adapter cannot run (${now.field}): ${now.reason}`, detection: detectWorkspace(root) };
  return { state: 'adopted', record: read.record, delta: deltaOf(read.record, now.value), current: now.value.requirements.length, skippedLines: now.value.skippedLines };
}
