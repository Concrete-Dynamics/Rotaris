import { join } from 'node:path';
import type { AdoptionAdapter, AdoptionOutcome, AdoptionRecord, DetectionResult, ProgressReport } from '@rotaris/contracts';
import { exclusiveCreate } from '@rotaris/platform';
import { LAYOUT_CONFIG_FILE } from '../traceability/layout.js';
import { reportItem, reportPhase, type ProgressHost } from '../traceability/progress.js';
import { composeAdapter, executeAdapter } from './adapter.js';
import { detectWorkspace } from './detect.js';
import { readAdoptionRecord, writeAdoptionRecord } from './record.js';

/**
 * An adoption run and a recording (REQ-ADOPT-011 to REQ-ADOPT-021, REQ-ADOPT-026 to REQ-ADOPT-030; PD-TRACE-001) — the
 * one place the assistant writes, and only on the user's press. A run detects, asks for ONE interpretation, composes
 * and validates the adapter, executes it, and only then writes: the record always, the layout file only by the user's
 * choice and only where none exists (REQ-ADOPT-019). A recording executes the adapter the record already holds,
 * consulting no model (REQ-ADOPT-020). Every failure is a refusal with its reason; nothing here raises.
 *
 * Progress goes through the board's protocol and its existing words (REQ-ADOPT-026): `reading` for the detection and
 * the extraction, `adopting` for the interpretation, `recording` for the writes. The reports are collected and returned
 * with the outcome; the relay answers once, so no surface sees them before the reply.
 */
export type Interpretation = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string };

export interface AdoptionDeps {
  /** One bounded model request over the detection result (REQ-ADOPT-012); the workspace service asks main for it. */
  readonly interpret: (detection: DetectionResult) => Promise<Interpretation>;
  readonly now: () => string;
  readonly log?: (message: string) => void;
}

export interface AdoptRequest { readonly mode: 'run' | 'record'; readonly writeLayout: boolean }

const inFlight = new Set<string>();

/** REQ-ADOPT-030: one run or recording per workspace at a time. */
export function adoptionInFlight(root: string): boolean {
  return inFlight.has(root);
}

export async function adopt(root: string, request: AdoptRequest, deps: AdoptionDeps): Promise<AdoptionOutcome> {
  const progress: ProgressReport[] = [];
  const host: ProgressHost = { sink: (r) => progress.push(r) };
  if (inFlight.has(root)) return { ok: false, reason: 'An adoption run is already in flight in this workspace; it continues.', progress };
  inFlight.add(root);
  try {
    return await adoptOnce(root, request, deps, host, progress);
  } catch (e) {
    // Never raised out of the workspace service (REQ-ADOPT-015): an unforeseen failure is a refusal like any other.
    return { ok: false, reason: `The adoption run failed: ${e instanceof Error ? e.message : String(e)}`, progress };
  } finally {
    inFlight.delete(root);
  }
}

async function adoptOnce(root: string, request: AdoptRequest, deps: AdoptionDeps, host: ProgressHost, progress: ProgressReport[]): Promise<AdoptionOutcome> {
  let adapter: AdoptionAdapter;
  if (request.mode === 'record') {
    const read = readAdoptionRecord(root);
    if (read.state !== 'readable') return { ok: false, reason: read.state === 'absent' ? 'There is no adoption record to bring up to date; run the adoption first.' : `The adoption record cannot be used: ${read.reason}`, progress };
    adapter = read.record.adapter;
  } else {
    reportPhase(host, 'reading', 0);
    const detection = detectWorkspace(root);
    if (detection.candidates.length === 0) return { ok: false, field: 'candidate', reason: `No candidate requirements store was found: ${detection.undecided.map((u) => u.detail).join('; ')}`, progress };
    reportPhase(host, 'adopting', 0);
    const answer = await deps.interpret(detection);
    if (!answer.ok) return { ok: false, field: 'answer', reason: answer.reason, progress };
    const composed = composeAdapter(answer.text, detection, root);
    if (!composed.ok) {
      deps.log?.(`adoption (${root}): the interpretation was refused at ${composed.field}: ${composed.reason}`);
      return { ok: false, field: composed.field, reason: `The model's interpretation was refused (${composed.field}): ${composed.reason}. Nothing was written.`, progress };
    }
    adapter = composed.value;
  }
  reportPhase(host, 'reading', 0);
  const executed = executeAdapter(root, adapter);
  if (!executed.ok) return { ok: false, field: executed.field, reason: `The adapter could not run (${executed.field}): ${executed.reason}. Nothing was written.`, progress };
  if (executed.value.requirements.length === 0) return { ok: false, field: 'definition_pattern', reason: `The adapter extracted no ${adapter.idPrefix} identifier from ${adapter.storeDir}${executed.value.problems.length > 0 ? ` (${executed.value.problems.join('; ')})` : ''}. Nothing was written.`, progress };

  const record: AdoptionRecord = { version: 1, recordedAt: deps.now(), how: request.mode, adapter, documents: executed.value.documents, requirements: executed.value.requirements };
  const writes = request.writeLayout && request.mode === 'run' ? 2 : 1;
  reportPhase(host, 'recording', writes);
  let layoutFile: 'written' | 'kept' | 'not-asked' = 'not-asked';
  if (request.writeLayout && request.mode === 'run') {
    // REQ-ADOPT-019: created exclusively — an existing layout file is the user's and is never overwritten.
    const created = exclusiveCreate(join(root, LAYOUT_CONFIG_FILE), `${JSON.stringify({ layout: adapter.layout }, null, 2)}\n`);
    if (!created.ok) return { ok: false, field: 'layout', reason: `${LAYOUT_CONFIG_FILE} could not be written: ${created.error.headline}. Nothing was written.`, progress };
    layoutFile = created.value.minted ? 'written' : 'kept';
    reportItem(host, 'recording', LAYOUT_CONFIG_FILE, 1, writes, layoutFile);
  }
  const written = writeAdoptionRecord(root, record);
  if (!written.ok) return { ok: false, field: 'record', reason: `The adoption record could not be written: ${written.reason}`, progress };
  reportItem(host, 'recording', 'requirements-adoption.json', writes, writes);
  deps.log?.(`adoption (${root}): ${request.mode} recorded ${record.requirements.length} ${adapter.idPrefix} identifier(s) in ${record.documents.length} document(s) from ${adapter.storeDir}; layout file ${layoutFile}`);
  return { ok: true, record, layoutFile, progress };
}
