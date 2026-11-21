import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DeliveryColumn, ReqId, RequirementsShape, ShapeStore, SurveyedRequirement } from '@rotaris/contracts';
import { replaceDocumentSync } from '@rotaris/platform';
import { contentHash, decodeUtf8, normaliseLineEndings } from '../traceability/hashes.js';
import { CRITERION, measureShape } from './shape.js';

/**
 * Write-back into a surveyed document (PD-TRACE-002 clauses 6 to 8; REQ-ADOPT-046, REQ-ADOPT-047, REQ-ADOPT-050): the two writes the board makes into a document
 * it did not create, and no other — the status word of the project's own vocabulary, and the tick of one acceptance
 * criterion. A write is surgical: it changes that token on that line, and keeps the file's line endings and every
 * other byte. It is made only against the content the caller last read: the document is read again, the requirement
 * found again through the shape, and where the file's hash is no longer the one named the write is refused with the
 * reason and nothing is merged. `root` is the tree written into — the workspace, or the worktree of the run whose
 * work earned the write (clause 8).
 */
export interface WriteBackEdit {
  /** The status word to write, already chosen from the shape's own words. */
  readonly status?: string;
  /** Criteria to set, each named by its position among the requirement's criteria AND its text, so a list that moved is refused rather than mis-ticked. */
  readonly ticks?: readonly { readonly index: number; readonly text: string; readonly checked: boolean }[];
}
export type WriteBackOutcome =
  | { readonly ok: true; readonly document: string; readonly changed: boolean; readonly lines: readonly number[]; readonly contentHash: string }
  | { readonly ok: false; readonly reason: string };

/** The word a delivery state is written as, or undefined where the shape's vocabulary has none for it (then nothing is written). */
export function statusWordFor(store: ShapeStore | undefined, column: DeliveryColumn): string | undefined {
  return store?.status?.words.find((w) => w.delivery === column)?.word;
}

export function storeOf(shape: RequirementsShape, document: string): ShapeStore | undefined {
  return shape.stores.find((s) => document === s.dir || document.startsWith(`${s.dir}/`));
}

/**
 * Apply an edit to requirement `id` in `root`. `expected` is the document's content hash as the caller last read it;
 * omitted, the document is taken as it stands in `root` (a run's worktree, whose document the run itself may have
 * changed — the requirement is still found through the shape, and a criterion still has to carry its text).
 */
export function writeBack(root: string, shape: RequirementsShape, id: ReqId, edit: WriteBackEdit, expected?: string): WriteBackOutcome {
  const measured = measureShape(root, shape);
  const req: SurveyedRequirement | undefined = measured.requirements.find((r) => r.id === id);
  if (req === undefined) return { ok: false, reason: `${id} is no longer found in its document through the surveyed shape; nothing was written.` };
  const path = join(root, req.document);
  let raw: string;
  try { raw = decodeUtf8(readFileSync(path)); } catch (e) { return { ok: false, reason: `${req.document} could not be read (${e instanceof Error ? e.message : String(e)}); nothing was written.` }; }
  const hash = contentHash(normaliseLineEndings(raw));
  if (expected !== undefined && hash !== expected) return { ok: false, reason: `${req.document} changed since the board last read it; nothing was written. Re-evaluate and try again.` };
  // Split on LF only: a CR stays at the end of its line and is written back untouched.
  const lines = raw.split('\n');
  const touched: number[] = [];
  const setLine = (line: number, next: string): void => { if (lines[line - 1] !== next) { lines[line - 1] = next; touched.push(line); } };

  if (edit.status !== undefined) {
    if (/[\r\n]/.test(edit.status) || edit.status === '') return { ok: false, reason: 'A status word is one line; nothing was written.' };
    if (req.status === undefined) return { ok: false, reason: `${id} states no status in ${req.document}, so there is no place to write one; nothing was written.` };
    const line = lines[req.status.line - 1] ?? '';
    if (line.slice(req.status.start, req.status.end) !== req.status.word) return { ok: false, reason: `The status of ${id} is no longer where it was read in ${req.document}; nothing was written.` };
    setLine(req.status.line, `${line.slice(0, req.status.start)}${edit.status}${line.slice(req.status.end)}`);
  }
  for (const t of edit.ticks ?? []) {
    const c = req.criteria[t.index];
    if (c === undefined || c.text !== t.text.trim()) return { ok: false, reason: `Criterion ${t.index + 1} of ${id} no longer reads ${JSON.stringify(t.text)} in ${req.document}; nothing was written.` };
    const line = lines[c.line - 1] ?? '';
    const cr = line.endsWith('\r') ? '\r' : '';
    const m = CRITERION.exec(cr === '' ? line : line.slice(0, -1));
    if (m === null) return { ok: false, reason: `Criterion ${t.index + 1} of ${id} is no longer a check box in ${req.document}; nothing was written.` };
    // An upper-case mark that is already a tick is left as its author wrote it.
    const mark = t.checked ? (m[2] === ' ' ? 'x' : m[2]!) : ' ';
    setLine(c.line, `${m[1]!}${mark}${m[3]!}${m[4]!}${cr}`);
  }
  if (touched.length === 0) return { ok: true, document: req.document, changed: false, lines: [], contentHash: hash };
  const next = lines.join('\n');
  const w = replaceDocumentSync(path, next, {});
  if (!w.ok) return { ok: false, reason: `${req.document} could not be written: ${w.error.headline}. Nothing was changed.` };
  return { ok: true, document: req.document, changed: true, lines: touched.sort((a, b) => a - b), contentHash: contentHash(normaliseLineEndings(next)) };
}
