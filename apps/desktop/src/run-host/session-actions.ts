import type { ProcessReply, ServiceAsk, SessionFilesPayload } from '@rotaris/contracts';
import { asSessionId, type Clocks, type Millis } from '@rotaris/kernel';
import type { StoreDal } from '@rotaris/store';
import { batchDocument, readRecords, readTrajectory, trajectoryWarnings, writeExport, type JsonValue, type Sessions } from '@rotaris/engine';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REFS_ASK_BOUND } from './checkpoints.js';

/**
 * Part U — the run host's side of the session browser's actions (REQ-SESSION-182): the explicit repair, the
 * delete in REQ-SESSION-166's order, the two exports and the per-session files. The rows and the lock are this
 * process's (ADR-0005, ADR-0058), Git is reached only through main's relay to the workspace service (ADR-0002
 * c.4) — the delete's ref cleanup is the `checkpoint.deleteNamespace` ask — and the exported file is written
 * HERE, from the one open connection, to the destination main's save dialog chose.
 */
export interface SessionActionDeps {
  readonly sessions: Sessions;
  readonly clocks: Clocks;
  readonly ask: (request: ServiceAsk, boundMs: Millis) => Promise<ProcessReply>;
  readonly log: (message: string, level?: 'info' | 'warn') => void;
}

/** REQ-SESSION-142's log file name, as the run host's appender writes it (`fileAppender` in tools.ts). */
export const SESSION_LOG_FILE = 'session.log';
export const SESSION_SUMMARY_FILE = 'summary.md';
/**
 * Part Y: the artifact bodies are FLAT — `artifact-<id>.md` beside `summary.md` — not a subdirectory.
 * The falsified reason, kept beside its replacement: Part U wrote `SESSION_ARTIFACTS_DIR = 'artifacts'` when
 * no artifact existed, so "reveal the session's files" would have found nothing to reveal for a session that
 * had published one — REQ-SESSION-002 closes that place to three kinds of file and says nothing that makes a
 * subdirectory one of them, and the flat naming is what Part Y wrote (ADR-0003's note).
 */
export const SESSION_ARTIFACT_PREFIX = 'artifact-';

export function repairSessions(deps: SessionActionDeps, dal: StoreDal, workspaceRoot: string, sessionId: string | undefined): ProcessReply {
  const report = deps.sessions.repair(dal, workspaceRoot, sessionId === undefined ? { all: true } : { sessionId });
  for (const r of report.repaired) deps.log(`session ${r.sessionId} repaired: was '${r.from}', now interrupted — ${r.reason} (REQ-SESSION-060)`, 'warn');
  if (report.nothingStale) deps.log(`session repair (${sessionId ?? 'all'}): nothing was stale${report.skipped.length > 0 ? `; ${report.skipped.map((s) => `${s.sessionId}: ${s.reason}`).join('; ')}` : ''}`);
  return { kind: 'session.repaired', report };
}

/**
 * REQ-SESSION-166 / REQ-GIT-069: (1) the state, for the tree and the refusal; (2) the refs, best-effort, through the
 * service of the workspace root — a failure logs the leftover `refs/rotaris/checkpoints/<sid>/` and continues (REQ-GIT-151);
 * (3) the one transaction and the files. A missing session is a no-op success.
 */
export async function deleteSession(deps: SessionActionDeps, dal: StoreDal, workspaceRoot: string, rawId: string): Promise<ProcessReply> {
  const t0 = deps.clocks.monotonic.now();
  const sessionId = asSessionId(rawId);
  const prepared = deps.sessions.prepareDelete(dal, workspaceRoot, sessionId);
  if (prepared.kind === 'missing') {
    deps.log(`session ${rawId}: nothing to delete (no such session in this workspace)`);
    return { kind: 'session.deleted', sessionId: rawId, existed: false, refsDeleted: 0, refsLeft: null, filesRemoved: false, unreadable: false, elapsedMs: deps.clocks.monotonic.now() - t0 };
  }
  if (prepared.kind === 'live') return { kind: 'refused', code: 'session.live', headline: prepared.reason };
  let refsDeleted = 0;
  let refsLeft: string | null = null;
  const namespace = `refs/rotaris/checkpoints/${rawId}/`;
  if (!existsSync(prepared.treeRoot)) {
    refsLeft = `${namespace} in ${prepared.treeRoot} (the tree is not there)`;
    deps.log(`session ${rawId}: its tree ${prepared.treeRoot} no longer exists; any refs under ${namespace} stay where the repository went (REQ-GIT-151)`, 'warn');
  } else {
    const answer = await deps.ask({ kind: 'checkpoint.deleteNamespace', workspaceRoot, treeRoot: prepared.treeRoot, sessionId: rawId }, REFS_ASK_BOUND).catch((e: Error) => ({ kind: 'refused' as const, code: 'ask', headline: e.message }));
    if (answer.kind === 'checkpoint.namespaceDeleted') {
      refsDeleted = answer.deleted;
      if (answer.detail !== undefined) { refsLeft = `${namespace} in ${prepared.treeRoot}: ${answer.detail}`; deps.log(`session ${rawId}: refs remain under ${namespace} in ${prepared.treeRoot} — ${answer.detail} (REQ-GIT-069, best-effort)`, 'warn'); }
    } else {
      refsLeft = `${namespace} in ${prepared.treeRoot}: ${answer.kind === 'refused' ? answer.headline : answer.kind}`;
      deps.log(`session ${rawId}: refs remain under ${namespace} in ${prepared.treeRoot} — ${answer.kind === 'refused' ? answer.headline : answer.kind} (REQ-GIT-069, best-effort)`, 'warn');
    }
  }
  const done = deps.sessions.completeDelete(dal, sessionId);
  if (done.filesDetail !== null) deps.log(`session ${rawId}: ${done.filesDetail} (REQ-SESSION-166: ignored)`, 'warn');
  const elapsedMs = deps.clocks.monotonic.now() - t0;
  deps.log(`session ${rawId} deleted${prepared.unreadable !== null ? ' (its stored state was unreadable)' : ''}: ${prepared.checkpoints} checkpoint row(s) with the record, ${refsDeleted} ref(s) deleted, files ${done.filesRemoved ? 'removed' : 'absent'}; ${elapsedMs.toFixed(0)} ms`);
  return { kind: 'session.deleted', sessionId: rawId, existed: done.existed, refsDeleted, refsLeft, filesRemoved: done.filesRemoved, unreadable: prepared.unreadable !== null, elapsedMs };
}

/** REQ-SESSION-199: the four records to the chosen file; the session need not be readable, loaded or ended. */
export async function exportRecords(deps: SessionActionDeps, dal: StoreDal, workspaceRoot: string, rawId: string, destination: string): Promise<ProcessReply> {
  const t0 = deps.clocks.monotonic.now();
  const row = dal.getSession(asSessionId(rawId));
  if (!row || row.workspace_root !== workspaceRoot) return { kind: 'refused', code: 'session.no-session', headline: `No session exists under id ${rawId} in this workspace.` };
  const read = readRecords(dal, asSessionId(rawId), deps.clocks.wall);
  if (!read) return { kind: 'refused', code: 'session.no-session', headline: `No session exists under id ${rawId} in this workspace.` };
  const written = await writeExport(destination, read.document, deps.clocks.timers);
  if (!written.ok) return { kind: 'refused', code: `export.${written.error.code}`, headline: `The export could not be written to ${destination}`, detail: [written.error.headline, written.error.detail].filter(Boolean).join(': ') };
  const warnings: string[] = [];
  if (read.counts.audit_dropped > 0) warnings.push(`The permission audit is capped: ${read.counts.audit_dropped} earlier entr${read.counts.audit_dropped === 1 ? 'y' : 'ies'} were dropped, and the file says so.`);
  if (read.counts.issues_dropped > 0) warnings.push(`The issues record is capped: ${read.counts.issues_dropped} earlier entr${read.counts.issues_dropped === 1 ? 'y' : 'ies'} were dropped, and the file says so.`);
  const elapsedMs = deps.clocks.monotonic.now() - t0;
  deps.log(`session ${rawId} records exported to ${destination}: ${read.counts.timeline} timeline, ${read.counts.issues} issue(s), ${read.counts.permission_audit} audit entr${read.counts.permission_audit === 1 ? 'y' : 'ies'} (${read.counts.audit_dropped} dropped); ${written.value.bytes} bytes in ${written.value.attempts} attempt(s), ${elapsedMs.toFixed(0)} ms`);
  return { kind: 'session.exported', destination, bytes: written.value.bytes, documents: 1, warnings, elapsedMs };
}

/** REQ-SESSION-189 / REQ-EVENTS-144: one document, or the batch wrapper in selection order; the two disclosures as warnings. */
export async function exportTrajectories(deps: SessionActionDeps, dal: StoreDal, workspaceRoot: string, rawIds: readonly string[], destination: string): Promise<ProcessReply> {
  const t0 = deps.clocks.monotonic.now();
  const documents: JsonValue[] = [];
  const warnings: string[] = [];
  for (const rawId of rawIds) {
    const row = dal.getSession(asSessionId(rawId));
    if (!row || row.workspace_root !== workspaceRoot) return { kind: 'refused', code: 'session.no-session', headline: `No session exists under id ${rawId} in this workspace.` };
    const t = readTrajectory(dal, asSessionId(rawId));
    if (!t) return { kind: 'refused', code: 'session.no-session', headline: `No session exists under id ${rawId} in this workspace.` };
    documents.push(t.document);
    warnings.push(...trajectoryWarnings(rawId, t));
  }
  const document = documents.length === 1 ? documents[0]! : batchDocument(documents);
  const written = await writeExport(destination, document, deps.clocks.timers);
  if (!written.ok) return { kind: 'refused', code: `export.${written.error.code}`, headline: `The export could not be written to ${destination}`, detail: [written.error.headline, written.error.detail].filter(Boolean).join(': ') };
  const elapsedMs = deps.clocks.monotonic.now() - t0;
  deps.log(`trajectory export to ${destination}: ${documents.length} document(s) [${rawIds.join(', ')}]; ${written.value.bytes} bytes in ${written.value.attempts} attempt(s), ${elapsedMs.toFixed(0)} ms${warnings.length > 0 ? `; ${warnings.length} warning(s)` : ''}`);
  return { kind: 'session.exported', destination, bytes: written.value.bytes, documents: documents.length, warnings, elapsedMs };
}

/** REQ-SESSION-002/191: which of the closed set of per-session files exist; the reveal and the open report the rest. */
export function sessionFiles(deps: SessionActionDeps, dal: StoreDal, workspaceRoot: string, rawId: string): ProcessReply {
  const row = dal.getSession(asSessionId(rawId));
  if (!row || row.workspace_root !== workspaceRoot) return { kind: 'refused', code: 'session.no-session', headline: `No session exists under id ${rawId} in this workspace.` };
  const directory = deps.sessions.filesDir(dal, asSessionId(rawId));
  const present = (name: string) => (existsSync(join(directory, name)) ? join(directory, name) : null);
  // REQ-SESSION-002: `artifacts` names ONE of the artifact bodies that exist, so the reveal has something to point at.
  let artifacts: string | null = null;
  try {
    const first = existsSync(directory) ? readdirSync(directory).filter((n) => n.startsWith(SESSION_ARTIFACT_PREFIX) && n.endsWith('.md')).sort()[0] : undefined;
    artifacts = first === undefined ? null : join(directory, first);
  } catch { artifacts = null; }
  const files: SessionFilesPayload = { directory, log: present(SESSION_LOG_FILE), summary: present(SESSION_SUMMARY_FILE), artifacts };
  return { kind: 'session.files', files };
}
