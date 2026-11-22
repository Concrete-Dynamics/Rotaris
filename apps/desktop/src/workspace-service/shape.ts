import type { AnnotationSite, DeliveryColumn, DocumentPlace, ProcessReply, ProgressReport, ReqId, RequirementsShape, ServiceAsk, ShapeAcceptOutcome, ShapeExportOutcome, ShapeMeasurement, ShapeRecord, ShapeView, StoreParse, SurveyedRequirement, SurveyOutcome, VerificationReport } from '@rotaris/contracts';
import { SHAPE_EXPORT_FILE, SURVEY_MESSAGE_MAX, SURVEY_MESSAGES_MAX } from '@rotaris/contracts';
import { millis, type Clocks, type Millis } from '@rotaris/kernel';
import { activeShape, citeShape, detectWorkspace, measureShape, recordOf, shapeDelta, shapeDrift, shapeParse, statusWordFor, storeOf, survey, writeBack, writeShapeExport, writeShapeRecord, type SurveyMessage, type SurveySession, type SurveyStep, type WriteBackEdit, type WriteBackOutcome } from '@rotaris/workspace';
import { guardedRead, replaceDocumentSync, WORKSPACE_SCOPE_DIR } from '@rotaris/platform';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/**
 * PD-TRACE-002 (REQ-ADOPT-036 to REQ-ADOPT-052) — the surveyed shape's home in the workspace service, the one I/O owner (REQ-ADOPT-028). It reads the
 * workspace through the accepted shape for the board's pass (clause 4), answers the strip's read (a read: nothing
 * written, no model), runs the survey (clauses 2 and 3: the model is asked one step at a time through main and the run
 * host; every action it names is carried out here, by code that can only read), records an accepted preview, exports
 * the shape (clause 9) and makes the two surgical writes into a document (clauses 6 to 8).
 */
export const SURVEY_STEP_ASK_BOUND: Millis = millis(200_000);

export interface ShapePass {
  readonly origin: 'local' | 'repository';
  readonly shape: RequirementsShape;
  readonly record: ShapeRecord | undefined;
  readonly measurement: ShapeMeasurement;
  readonly sites: readonly AnnotationSite[];
  readonly parse: StoreParse;
  readonly report: VerificationReport;
}

export interface ShapeHost {
  /** The board's pass through the accepted shape, or why there is none. Reads only. */
  pass(generation: number): { readonly kind: 'none' } | { readonly kind: 'unreadable'; readonly origin: 'local' | 'repository'; readonly reason: string } | { readonly kind: 'read'; readonly pass: ShapePass };
  view(last: ShapePass | undefined, native: boolean, watching: boolean): ShapeView;
  survey(token: string | undefined, answer: string | undefined): Promise<SurveyOutcome>;
  accept(token: string): ShapeAcceptOutcome;
  record(): ShapeAcceptOutcome;
  exportShape(): ShapeExportOutcome;
  place(pass: ShapePass, id: ReqId): DocumentPlace | undefined;
  write(pass: ShapePass, id: ReqId, edit: WriteBackEdit, root?: string): WriteBackOutcome;
  statusWord(pass: ShapePass, id: ReqId, column: DeliveryColumn): string | undefined;
  /**
   * Clause 5: the requirements whose document states a status word the board has not yet taken — a word never seen for
   * that requirement, or one that changed since it was. A word the board already took is not taken again, so an
   * acceptance written in a run's worktree is not undone by the workspace's own copy still reading the old word.
   */
  declared(pass: ShapePass): readonly { readonly id: ReqId; readonly word: string; readonly delivery: DeliveryColumn | undefined }[];
  /** Remember the words now read, where any moved. */
  remember(pass: ShapePass): void;
  /** The directories and files whose change means the board is stale (clause 10). */
  watched(pass: ShapePass | undefined): readonly string[];
  readonly surveying: boolean;
}

export function createShapeHost(workspaceRoot: string, deps: { readonly ask: (request: ServiceAsk, bound: Millis) => Promise<ProcessReply>; readonly clocks: Clocks; readonly now: () => string; readonly log: (message: string, level?: 'info' | 'warn') => void; readonly onProgress?: (report: ProgressReport) => void }): ShapeHost {
  const { ask, clocks, now, log } = deps;
  /** One preview at a time: a second survey replaces it, an accept consumes it (clause 2). Held in memory only — nothing is recorded before the accept. */
  let pending: SurveySession | undefined;
  let surveying = false;

  const step = async (messages: readonly SurveyMessage[]): Promise<SurveyStep> => {
    // The conversation is bounded as it crosses: the oldest tool results go first, the opening and the latest turns stay.
    let sent = messages.map((m) => ({ role: m.role, text: m.text.length > SURVEY_MESSAGE_MAX ? `${m.text.slice(0, SURVEY_MESSAGE_MAX - 20)}\n… cut` : m.text }));
    if (sent.length > SURVEY_MESSAGES_MAX) sent = [sent[0]!, ...sent.slice(sent.length - (SURVEY_MESSAGES_MAX - 1))];
    let reply: ProcessReply;
    try { reply = await ask({ kind: 'survey.step', workspaceRoot, messages: sent }, SURVEY_STEP_ASK_BOUND); } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : String(e) }; }
    if (reply.kind === 'survey.stepped') return { ok: true, text: reply.text, model: reply.model };
    if (reply.kind === 'refused') return { ok: false, reason: [reply.headline, reply.detail].filter(Boolean).join(': ') };
    return { ok: false, reason: `unexpected reply ${reply.kind}` };
  };

  const seenPath = join(workspaceRoot, WORKSPACE_SCOPE_DIR, 'requirements-status-seen.json');
  let seen: Map<string, string> | undefined;
  const loadSeen = (): Map<string, string> => {
    if (seen !== undefined) return seen;
    const r = guardedRead(seenPath, (raw) => JSON.parse(raw) as unknown);
    const v = r.state === 'readable' && typeof r.value === 'object' && r.value !== null && !Array.isArray(r.value) ? (r.value as Record<string, unknown>) : {};
    seen = new Map(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
    return seen;
  };

  const find = (pass: ShapePass, id: ReqId): SurveyedRequirement | undefined => pass.measurement.requirements.find((r) => r.id === id);

  return {
    get surveying() { return surveying; },
    pass(generation) {
      const active = activeShape(workspaceRoot);
      if (active.state === 'none') return { kind: 'none' };
      if (active.state === 'unreadable') return { kind: 'unreadable', origin: active.origin, reason: active.reason };
      const measurement = measureShape(workspaceRoot, active.shape);
      const { sites } = citeShape(workspaceRoot, active.shape, new Set(measurement.requirements.map((r) => r.id)));
      const { parse, report } = shapeParse(workspaceRoot, active.shape, measurement, sites, generation);
      return { kind: 'read', pass: { origin: active.origin, shape: active.shape, record: active.record, measurement, sites, parse, report } };
    },
    view(last, native, watching) {
      const active = activeShape(workspaceRoot);
      if (active.state === 'none') return { state: 'none', detection: detectWorkspace(workspaceRoot), native };
      if (active.state === 'unreadable') return { state: 'unreadable', origin: active.origin, reason: active.reason, detection: detectWorkspace(workspaceRoot) };
      // The board's own pass is the measurement where it read this very shape; otherwise the shape is measured for the read.
      const measurement = last !== undefined && JSON.stringify(last.shape) === JSON.stringify(active.shape) ? last.measurement : measureShape(workspaceRoot, active.shape);
      return {
        state: 'accepted', origin: active.origin, shape: active.shape, count: measurement.requirements.length, watching,
        ...(active.record !== undefined ? { record: active.record, delta: shapeDelta(active.record, measurement) } : {}),
        drift: shapeDrift(active.record, measurement),
      };
    },
    async survey(token, answer) {
      if (surveying) return { ok: false, reason: 'A survey is already in flight in this workspace; it continues.', progress: [] };
      const continuing = token !== undefined || answer !== undefined;
      if (continuing && (pending === undefined || pending.token !== token)) return { ok: false, reason: 'That preview is no longer held; survey the repository again.', progress: [] };
      surveying = true;
      const started = clocks.monotonic.now();
      try {
        const r = await survey(workspaceRoot, { step, elapsed: () => Number(clocks.monotonic.now()) - Number(started), token: () => randomUUID(), log: (m) => log(m), ...(deps.onProgress === undefined ? {} : { progress: deps.onProgress }) }, continuing ? { session: pending!, answer: answer ?? '' } : undefined);
        if (!r.ok) { log(`survey (${workspaceRoot}): refused${r.field === undefined ? '' : ` at ${r.field}`}: ${r.reason}`, 'warn'); return r; }
        pending = r.session;
        log(`survey (${workspaceRoot}): previewed ${r.preview.count} requirement(s) from ${r.preview.stores.map((s) => s.dir).join(', ')} after ${r.preview.rounds} repair round(s) on ${r.preview.model}; nothing recorded`);
        return { ok: true, preview: r.preview, progress: r.progress };
      } finally {
        surveying = false;
      }
    },
    accept(token) {
      if (pending === undefined || pending.token !== token) return { ok: false, reason: 'That preview is no longer held; survey the repository again. Nothing was recorded.' };
      // The shape is executed again at the accept: the record holds what the workspace reads NOW, not what it read at the preview.
      const measurement = measureShape(workspaceRoot, pending.shape);
      if (measurement.requirements.length === 0) return { ok: false, reason: 'The previewed shape no longer extracts a requirement from this workspace. Nothing was recorded.' };
      const record = recordOf(pending.shape, measurement, 'survey', now());
      const w = writeShapeRecord(workspaceRoot, record);
      if (!w.ok) return { ok: false, reason: `The shape could not be recorded: ${w.reason}` };
      pending = undefined;
      log(`survey (${workspaceRoot}): accepted — ${record.requirements.length} requirement(s) in ${record.documents.length} document(s) recorded`);
      return { ok: true, record };
    },
    record() {
      const active = activeShape(workspaceRoot);
      if (active.state !== 'accepted') return { ok: false, reason: active.state === 'none' ? 'There is no accepted shape to record against; survey the repository first.' : `The shape cannot be used: ${active.reason}` };
      const measurement = measureShape(workspaceRoot, active.shape);
      const record = recordOf(active.shape, measurement, active.origin === 'repository' && active.record === undefined ? 'import' : 'record', now());
      const w = writeShapeRecord(workspaceRoot, record);
      if (!w.ok) return { ok: false, reason: `The shape could not be recorded: ${w.reason}` };
      log(`survey (${workspaceRoot}): recorded the present state — ${record.requirements.length} requirement(s)`);
      return { ok: true, record };
    },
    exportShape() {
      const active = activeShape(workspaceRoot);
      if (active.state !== 'accepted') return { ok: false, reason: active.state === 'none' ? 'There is no accepted shape to export; survey the repository first.' : `The shape cannot be used: ${active.reason}` };
      const w = writeShapeExport(workspaceRoot, active.shape);
      if (!w.ok) return { ok: false, reason: `${SHAPE_EXPORT_FILE} could not be written: ${w.reason}` };
      log(`survey (${workspaceRoot}): exported the shape to ${SHAPE_EXPORT_FILE} (${w.replaced ? 'replaced' : 'written'})`);
      return { ok: true, path: SHAPE_EXPORT_FILE, written: w.replaced ? 'replaced' : 'written' };
    },
    place(pass, id) {
      const r = find(pass, id);
      if (r === undefined) return undefined;
      return { document: r.document, line: r.line, endLine: r.endLine, criteria: r.criteria, ...(r.status !== undefined ? { status: { word: r.status.word, ...(r.status.delivery !== undefined ? { delivery: r.status.delivery } : {}), ...(r.status.lifecycle !== undefined ? { lifecycle: r.status.lifecycle } : {}) } } : {}) };
    },
    statusWord(pass, id, column) {
      const r = find(pass, id);
      return r === undefined || r.status === undefined ? undefined : statusWordFor(storeOf(pass.shape, r.document), column);
    },
    write(pass, id, edit, root) {
      const r = find(pass, id);
      if (r === undefined) return { ok: false, reason: `${id} is not read through the surveyed shape; nothing was written.` };
      // In the workspace itself the write is guarded by the hash the board last read; in a run's worktree the document is that tree's own.
      const expected = root === undefined ? pass.measurement.documents.find((d) => d.path === r.document)?.contentHash : undefined;
      return writeBack(root ?? workspaceRoot, pass.shape, id, edit, expected);
    },
    declared(pass) {
      const was = loadSeen();
      return pass.measurement.requirements.filter((r) => r.status !== undefined && was.get(r.id) !== r.status.word).map((r) => ({ id: r.id, word: r.status!.word, delivery: r.status!.delivery }));
    },
    remember(pass) {
      const was = loadSeen();
      const next = new Map(pass.measurement.requirements.filter((r) => r.status !== undefined).map((r) => [r.id, r.status!.word]));
      if (next.size === was.size && [...next].every(([id, word]) => was.get(id) === word)) return;
      seen = next;
      const w = replaceDocumentSync(seenPath, `${JSON.stringify(Object.fromEntries(next))}\n`, { createParent: true });
      if (!w.ok) log(`requirements: the status words read could not be remembered (${w.error.headline}); they are taken again on the next pass`, 'warn');
    },
    watched(pass) {
      const out = new Set<string>([SHAPE_EXPORT_FILE, 'rotaris-traceability.json']);
      for (const s of pass?.shape.stores ?? []) out.add(s.dir);
      return [...out];
    },
  };
}
