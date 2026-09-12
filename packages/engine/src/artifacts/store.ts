import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { toIsoUtc, type SessionId, type WallClock } from '@rotaris/kernel';
import { isArtifactStatus, kebabSlug, normaliseArtifactTags, type ArtifactSection } from '@rotaris/contracts';
import type { ArtifactInsert, ArtifactRow, StoreDal } from '@rotaris/store';
import { bodyFileName, deriveImportance, firstLineSummary, mintArtifactId, toArtifactRecord, uniqueSlug, type ArtifactRecord, type EditedFile, type HighlightPath, type RanCommand, type Snippet } from './record.js';
import { renderCommand, renderSidecar } from './sidecar.js';

/** PD-LIBRARY-001: the column's serialised form, snake-cased like every other list stored here. */
function commandRows(commands: readonly RanCommand[]): readonly { command: string; exit_code: number | null }[] {
  return commands.map((c) => ({ command: c.command, exit_code: c.exitCode }));
}

/**
 * REQ-LIBRARY-087 / REQ-ORCH-149 — the session artifact store. One row per artifact in the workspace's
 * durable store, its declared index maintained inside the same transaction (schema v12's note says why that
 * is the whole of "written together as one indivisible step" on rows), and the artifact's Markdown document
 * on disk beside the session's other files (REQ-SESSION-002) — never in a column, because a body may be
 * arbitrarily large and the document exists so a person or another tool can read the artifact without this
 * application.
 *
 * The store is session-scoped and outlives loop iterations (REQ-ORCH-149, REQ-LIBRARY-087): it holds no
 * state of its own, so every read is the stored state and two surfaces cannot disagree (REQ-LIBRARY-164's
 * discipline applied to this store). Mutations are serialised by the one instance (REQ-LIBRARY-158).
 */
export interface ArtifactFileIo {
  read(file: string): string;
  write(file: string, content: string): void;
  remove(file: string): void;
}

export interface ArtifactStoreDeps {
  readonly dal: StoreDal;
  readonly sessionId: SessionId;
  /** Where the session's files live (REQ-SESSION-002), resolved at each call so a moved store is followed. */
  readonly directory: () => string;
  readonly wall: WallClock;
  readonly warn: (message: string) => void;
  /**
   * REQ-LIBRARY-092's `artifact_published` diagnostic entry; the returned id is linked back onto the record.
   * Absent where no writer is available (a session read outside a run), in which case nothing is recorded.
   */
  readonly timeline?: ((name: string, message: string, metadata: Record<string, unknown>) => { ordinal: number; id: string } | null) | undefined;
  /** Verification and tests: a failure injected between the row and its document (REQ-LIBRARY-087's indivisibility). */
  readonly io?: Partial<ArtifactFileIo> | undefined;
}

export interface PublishInput {
  readonly slug: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly supersedes?: string | null | undefined;
  /** REQ-LIBRARY-093: the publishing agent's CANONICAL instance name, never its persona. */
  readonly createdBy: string;
  readonly persona: string;
  readonly conversationId?: string | null | undefined;
}

export interface ChildReportInput {
  readonly taskId: string;
  readonly canonicalName: string;
  readonly persona: string;
  readonly status: string;
  readonly summary: string;
  readonly keyFindings: readonly string[];
  readonly editedFiles: readonly (string | EditedFile)[];
  readonly createdFiles: readonly string[];
  /** PD-LIBRARY-001: the commands the child ran, in the order it ran them. */
  readonly commands: readonly RanCommand[];
  readonly highlightPaths: readonly HighlightPath[];
  readonly snippets: readonly Snippet[];
  readonly tags: readonly string[];
  readonly conversationId?: string | null | undefined;
}

export interface ListQuery {
  readonly kind?: string | undefined;
  readonly persona?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly limit?: number | undefined;
  readonly includeSuperseded?: boolean | undefined;
}

export type ArtifactFailure = { readonly code: 'not-found' | 'invalid-tags' | 'self-supersede' | 'write' | 'body'; readonly reason: string };
type Res<T> = { ok: true; value: T } | { ok: false; error: ArtifactFailure };
const ok = <T>(value: T): Res<T> => ({ ok: true, value });
const err = <T>(code: ArtifactFailure['code'], reason: string): Res<T> => ({ ok: false, error: { code, reason } });

/** REQ-LIBRARY-100's default and range for `limit`. */
export const LIST_LIMIT_DEFAULT = 20;
export const LIST_LIMIT_MAX = 200;

export class ArtifactStore {
  constructor(private readonly deps: ArtifactStoreDeps) {}

  private get dal(): StoreDal { return this.deps.dal; }
  private get sessionId(): SessionId { return this.deps.sessionId; }
  private now(): string { return toIsoUtc(this.deps.wall.instant()); }

  private readFile(file: string): string {
    if (this.deps.io?.read) return this.deps.io.read(file);
    return readFileSync(join(this.deps.directory(), file), 'utf8');
  }
  private writeFile(file: string, content: string): void {
    if (this.deps.io?.write) { this.deps.io.write(file, content); return; }
    const directory = this.deps.directory();
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, file), content, 'utf8');
  }
  private removeFile(file: string): void {
    try {
      if (this.deps.io?.remove) { this.deps.io.remove(file); return; }
      rmSync(join(this.deps.directory(), file), { force: true });
    } catch { /* REQ-LIBRARY-089's "no partial state": a document left behind by a rolled-back insert is unreferenced. */ }
  }

  /**
   * REQ-LIBRARY-091 — hydration tolerates everything the requirement lists and NEVER raises: no artifacts at
   * all (zero); an index that cannot be read (warning, zero); an index entry whose record cannot be found
   * (warning, skipped — on rows, a row that decodes to nothing); a record that fails validation (skipped).
   * An unreadable DOCUMENT is deliberately not one of these: it leaves the record usable and is reported by
   * the surface that wanted the body (REQ-LIBRARY-134), which is what `body()` below does.
   */
  hydrate(): { readonly records: readonly ArtifactRecord[]; readonly warnings: readonly string[] } {
    const warnings: string[] = [];
    let rows: ArtifactRow[];
    try {
      rows = this.dal.artifactsOf(this.sessionId);
    } catch (cause) {
      const message = `The session's artifact index could not be read; no artifacts are listed. (${String(cause instanceof Error ? cause.message : cause)})`;
      this.deps.warn(message);
      return { records: [], warnings: [message] };
    }
    const records: ArtifactRecord[] = [];
    for (const row of rows) {
      const record = toArtifactRecord(row);
      if (!record) {
        const message = `An artifact record failed validation and was skipped: ${row.id || '(no id)'}${isArtifactStatus(row.status) ? '' : ` (status '${row.status}' is outside the set REQ-LIBRARY-088 forms)`}.`;
        this.deps.warn(message);
        warnings.push(message);
        continue;
      }
      records.push(record);
    }
    return { records, warnings };
  }

  /**
   * REQ-LIBRARY-096 — superseded hidden by default, ALL supplied tags required, ascending by creation time
   * (the index's own order). `limit` is REQ-LIBRARY-100's, clamped to 1..200 rather than refused.
   */
  list(query: ListQuery = {}): readonly ArtifactRecord[] {
    const wanted = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => t !== '');
    const limit = Math.min(LIST_LIMIT_MAX, Math.max(1, Math.trunc(query.limit ?? LIST_LIMIT_DEFAULT)));
    const out = this.hydrate().records.filter((r) => {
      if (!query.includeSuperseded && r.supersededBy !== null) return false;
      if (query.kind !== undefined && query.kind !== '' && r.kind !== query.kind) return false;
      if (query.persona !== undefined && query.persona !== '' && r.sourcePersona !== query.persona) return false;
      return wanted.every((t) => r.tags.includes(t));
    });
    return out.slice(0, limit);
  }

  /** REQ-LIBRARY-088: the kebab base, then `-2`, `-3` against exactly the slugs this session already holds. */
  private freeSlug(raw: string): string {
    const base = kebabSlug(raw);
    return uniqueSlug(base, new Set(this.dal.slugsLike(this.sessionId, base)));
  }

  /** REQ-LIBRARY-096: lookup by id or slug. */
  lookup(ref: string): ArtifactRecord | null {
    const row = this.dal.artifactByRef(this.sessionId, ref);
    return row ? toArtifactRecord(row) : null;
  }

  /**
   * REQ-LIBRARY-091 / REQ-LIBRARY-134: a document that cannot be read leaves the record usable and is
   * reported HERE, by the surface that wanted it. An empty stored body falls back to the rendered form of
   * the record, which is the same rendering the document was created from.
   */
  body(ref: string): Res<{ readonly text: string; readonly fallback: boolean }> {
    const record = this.lookup(ref);
    if (!record) return err('not-found', `Unknown artifact: '${ref}'`);
    let text: string;
    try {
      text = this.readFile(record.bodyFile);
    } catch (cause) {
      // The REASON only: `REQ-LIBRARY-134` fixes the wording `Could not load artifact: <err>` at the SURFACE,
      // and the proof's first run found this message carrying that prefix too, so the inspector showed it twice.
      return err('body', String(cause instanceof Error ? cause.message : cause));
    }
    if (text.trim() === '') return ok({ text: renderSidecar(record), fallback: true });
    return ok({ text, fallback: false });
  }

  /**
   * REQ-LIBRARY-093 / REQ-LIBRARY-101 — the agent publish. Tags are validated FIRST (REQ-LIBRARY-089: a
   * publish carrying any other tag is refused whole, no record, no file, no partial state), the slug is made
   * unique within the session, and the row and its document are written in one transaction whose failure
   * leaves neither.
   */
  publish(input: PublishInput): Res<ArtifactRecord> {
    const tags = normaliseArtifactTags(input.tags);
    if (!tags.ok) return err('invalid-tags', tags.error);
    let target: ArtifactRecord | null = null;
    if (input.supersedes !== undefined && input.supersedes !== null && input.supersedes !== '') {
      target = this.lookup(input.supersedes);
      if (!target) return err('not-found', `Unknown artifact: '${input.supersedes}'`);
    }
    const id = mintArtifactId();
    const slug = this.freeSlug(input.slug === '' ? input.title : input.slug);
    const createdAt = this.now();
    const record: ArtifactRecord = {
      id, slug, title: input.title === '' ? slug : input.title, kind: 'agent_published',
      sourceTaskId: null, canonicalName: input.createdBy, sourcePersona: input.persona,
      // REQ-LIBRARY-093: `status` is `published`; `key_findings` is the body; `summary` is its first line, capped at 280.
      status: 'published', summary: firstLineSummary(input.body), keyFindings: input.body,
      highlightPaths: [], snippets: [], editedFiles: [], createdFiles: [], commands: [], tags: tags.tags,
      supersedes: target?.id ?? null, supersededBy: null,
      createdBy: input.createdBy, consumedBy: [],
      timelineEventId: null, conversationId: input.conversationId ?? null,
      importance: deriveImportance('agent_published', 'published'),
      createdAt, editedAt: null, bodyFile: bodyFileName(id),
    };
    const written = this.insert(record, target);
    if (!written.ok) return written;
    // REQ-LIBRARY-095: the reverse link and the target's re-rendered document, after the new record exists.
    if (target) this.rerender(target.id);
    return ok(record);
  }

  /** The one write path: the row, its index entry and the document, indivisible (REQ-LIBRARY-087). */
  private insert(record: ArtifactRecord, supersedeTarget: ArtifactRecord | null): Res<ArtifactRecord> {
    const row = toRow(this.sessionId, record);
    try {
      this.dal.transaction(() => {
        this.dal.insertArtifact(row);
        if (supersedeTarget) this.dal.linkSupersession(this.sessionId, record.id, supersedeTarget.id);
        // Last inside the transaction: a document that cannot be written rolls the row back, so no reader
        // ever finds a record whose document was never created (REQ-LIBRARY-089's "no partial state").
        this.writeFile(record.bodyFile, renderSidecar(record));
      });
    } catch (cause) {
      this.removeFile(record.bodyFile);
      return err('write', `The artifact could not be stored: ${String(cause instanceof Error ? cause.message : cause)}`);
    }
    return ok(record);
  }

  /** REQ-LIBRARY-095: both sidecars are re-rendered when a supersession links them. */
  private rerender(id: string): void {
    const record = this.lookup(id);
    if (!record) return;
    try { this.writeFile(record.bodyFile, renderSidecar(record)); }
    catch (cause) { this.deps.warn(`The document of artifact ${id} could not be re-rendered: ${String(cause instanceof Error ? cause.message : cause)}`); }
  }

  /**
   * REQ-LIBRARY-094 / REQ-LIBRARY-133 — body editing overwrites only the Markdown document and stamps
   * `edited_at`; everything else on the record is immutable through every editing surface, which is a
   * property of the statements the DAL declares and not of this method's discipline.
   */
  editBody(ref: string, body: string): Res<{ readonly id: string; readonly editedAt: string }> {
    const record = this.lookup(ref);
    if (!record) return err('not-found', `Unknown artifact: '${ref}'`);
    const editedAt = this.now();
    try {
      this.dal.transaction(() => {
        this.dal.touchArtifactEdited(this.sessionId, record.id, editedAt);
        this.writeFile(record.bodyFile, body);
      });
    } catch (cause) {
      return err('write', String(cause instanceof Error ? cause.message : cause));
    }
    return ok({ id: record.id, editedAt });
  }

  /** REQ-LIBRARY-095: link both directions, re-render both documents, refuse self-supersession and unknown ids. */
  supersede(newerRef: string, olderRef: string): Res<{ readonly newer: string; readonly older: string }> {
    const newer = this.lookup(newerRef);
    if (!newer) return err('not-found', `Unknown artifact: '${newerRef}'`);
    const older = this.lookup(olderRef);
    if (!older) return err('not-found', `Unknown artifact: '${olderRef}'`);
    if (newer.id === older.id) return err('self-supersede', 'An artifact cannot supersede itself');
    try { this.dal.transaction(() => { this.dal.linkSupersession(this.sessionId, newer.id, older.id); }); }
    catch (cause) { return err('write', String(cause instanceof Error ? cause.message : cause)); }
    this.rerender(newer.id);
    this.rerender(older.id);
    return ok({ newer: newer.id, older: older.id });
  }

  /**
   * REQ-LIBRARY-096 / REQ-LIBRARY-099 — the actor is appended at most once and persists.
   *
   * Decision where two requirements differ: REQ-LIBRARY-099 says "the reading persona", REQ-LIBRARY-096 says
   * "the actor". The CANONICAL INSTANCE NAME is recorded, because REQ-LIBRARY-093's reason for `created_by`
   * — two instances sharing a persona must stay distinguishable in every artifact listing — applies with
   * equal force to who consumed one, and the persona is recoverable from the name where the reverse is not.
   * Raised as an open question rather than settled here.
   */
  markConsumed(ref: string, actor: string): void {
    const record = this.lookup(ref);
    if (!record || actor === '') return;
    if (record.consumedBy.includes(actor)) return;
    try { this.dal.transaction(() => { this.dal.setArtifactConsumers(this.sessionId, record.id, [...record.consumedBy, actor]); }); }
    catch (cause) { this.deps.warn(`The consumer of artifact ${record.id} could not be recorded: ${String(cause instanceof Error ? cause.message : cause)}`); }
  }

  /**
   * REQ-LIBRARY-092 — materialising a child report is idempotent keyed on the task id, falling back to the
   * canonical agent name: a re-materialisation UPDATES IN PLACE, preserving id, slug, title, creation time,
   * supersession links, consumers and the edit timestamp, instead of duplicating. The columns it may move
   * are exactly those in the DAL's `rematerialiseArtifact` statement.
   *
   * The `artifact_published` timeline entry is recorded on the FIRST materialisation only, and its id is
   * linked back onto the record. A decision where the requirement is silent: it makes the entry the record
   * of the artifact coming into existence and makes re-materialisation "update in place instead of
   * duplicating", so a second entry for the same artifact would report an event that did not happen.
   */
  materialiseChildReport(input: ChildReportInput): Res<{ readonly record: ArtifactRecord; readonly created: boolean }> {
    const existingRow = this.dal.artifactByTask(this.sessionId, input.taskId) ?? this.dal.artifactByCanonical(this.sessionId, input.canonicalName);
    const status = isArtifactStatus(input.status) ? input.status : 'failed';
    const tags = normaliseArtifactTags(input.tags);
    // A report's tags were already narrowed to the six by the summarising pass; anything else is dropped here
    // rather than refusing a materialisation, because REQ-LIBRARY-092 requires EVERY terminal report to land.
    const acceptedTags = tags.ok ? tags.tags : [];
    const keyFindings = input.keyFindings.filter((k) => k.trim() !== '').map((k) => `- ${k}`).join('\n');
    const editedFiles = input.editedFiles.map((e) => (typeof e === 'string' ? { path: e, changeType: '' } : e));
    if (existingRow) {
      const previous = toArtifactRecord(existingRow);
      const importance = deriveImportance('child_report', status);
      try {
        this.dal.transaction(() => {
          this.dal.rematerialiseArtifact({
            session_id: this.sessionId, id: existingRow.id, status, summary: input.summary, key_findings: keyFindings,
            highlight_paths: JSON.stringify(input.highlightPaths), snippets: JSON.stringify(input.snippets),
            edited_files: JSON.stringify(editedFiles.map((e) => ({ path: e.path, change_type: e.changeType }))),
            created_files: JSON.stringify(input.createdFiles), commands: JSON.stringify(commandRows(input.commands)), tags: JSON.stringify(acceptedTags),
            source_persona: input.persona, canonical_name: input.canonicalName, created_by: input.canonicalName, importance,
            timeline_event_id: null, conversation_id: input.conversationId ?? null,
          });
        });
      } catch (cause) {
        return err('write', `The child report could not be re-materialised: ${String(cause instanceof Error ? cause.message : cause)}`);
      }
      const updated = this.lookup(existingRow.id);
      if (updated) this.rerender(updated.id);
      return ok({ record: updated ?? previous!, created: false });
    }
    const id = mintArtifactId();
    const createdAt = this.now();
    const record: ArtifactRecord = {
      id, slug: this.freeSlug(input.canonicalName),
      title: `${input.canonicalName} report`, kind: 'child_report',
      sourceTaskId: input.taskId, canonicalName: input.canonicalName, sourcePersona: input.persona,
      status, summary: input.summary, keyFindings,
      highlightPaths: input.highlightPaths, snippets: input.snippets, editedFiles, createdFiles: input.createdFiles, commands: input.commands,
      tags: acceptedTags, supersedes: null, supersededBy: null,
      createdBy: input.canonicalName, consumedBy: [], timelineEventId: null,
      conversationId: input.conversationId ?? null, importance: deriveImportance('child_report', status),
      createdAt, editedAt: null, bodyFile: bodyFileName(id),
    };
    const written = this.insert(record, null);
    if (!written.ok) return written;
    const entry = this.deps.timeline?.('artifact_published', `Artifact ${record.id} (${record.slug}) was published from ${input.canonicalName}'s report.`, { artifact_id: record.id, slug: record.slug, task_id: input.taskId, kind: record.kind, status: record.status }) ?? null;
    if (entry) {
      try { this.dal.transaction(() => { this.dal.setArtifactTimelineEvent(this.sessionId, record.id, entry.id); }); }
      catch (cause) { this.deps.warn(`The timeline link for artifact ${record.id} could not be recorded: ${String(cause instanceof Error ? cause.message : cause)}`); }
      this.rerender(record.id);
    }
    return ok({ record: this.lookup(record.id) ?? record, created: true });
  }

  /** REQ-LIBRARY-099's section filter, read from the record's own fields; the document is never parsed. */
  sections(record: ArtifactRecord, wanted: readonly ArtifactSection[]): string {
    const parts: string[] = [];
    for (const section of wanted) {
      if (section === 'summary' && record.summary !== '') parts.push(`## Summary\n\n${record.summary}`);
      if (section === 'key_findings' && record.keyFindings !== '') parts.push(`## Key Findings\n\n${record.keyFindings}`);
      if (section === 'snippets' && record.snippets.length > 0) parts.push(`## Snippets\n\n${record.snippets.map((s) => `- \`${s.path}\``).join('\n')}`);
      if (section === 'highlights' && record.highlightPaths.length > 0) parts.push(`## Highlight Paths\n\n${record.highlightPaths.map((h) => (h.reason === '' ? `- \`${h.path}\`` : `- \`${h.path}\` — ${h.reason}`)).join('\n')}`);
      // PD-LIBRARY-001: the same rendering the document carries, so the filtered view and the body can never
      // disagree about which command failed — REQ-LIBRARY-099 reads the record's columns and never the document.
      if (section === 'commands' && record.commands.length > 0) parts.push(`## Commands\n\n${record.commands.map(renderCommand).join('\n')}`);
      if (section === 'files' && (record.editedFiles.length > 0 || record.createdFiles.length > 0)) {
        const lines = [...record.editedFiles.map((e) => (e.changeType === '' ? `- \`${e.path}\`` : `- \`${e.path}\` (${e.changeType})`)), ...record.createdFiles.map((p) => `- \`${p}\` (created)`)];
        parts.push(`## Files\n\n${lines.join('\n')}`);
      }
    }
    return parts.join('\n\n');
  }
}

function toRow(sessionId: SessionId, record: ArtifactRecord): ArtifactInsert {
  return {
    session_id: sessionId, id: record.id, slug: record.slug, title: record.title, kind: record.kind,
    source_task_id: record.sourceTaskId, canonical_name: record.canonicalName, source_persona: record.sourcePersona,
    status: record.status, summary: record.summary, key_findings: record.keyFindings,
    highlight_paths: JSON.stringify(record.highlightPaths),
    snippets: JSON.stringify(record.snippets),
    edited_files: JSON.stringify(record.editedFiles.map((e) => ({ path: e.path, change_type: e.changeType }))),
    created_files: JSON.stringify(record.createdFiles),
    commands: JSON.stringify(commandRows(record.commands)),
    tags: JSON.stringify(record.tags), supersedes: record.supersedes, superseded_by: record.supersededBy,
    created_by: record.createdBy, consumed_by: JSON.stringify(record.consumedBy),
    timeline_event_id: record.timelineEventId, conversation_id: record.conversationId,
    importance: record.importance, created_at: record.createdAt, edited_at: record.editedAt, body_file: record.bodyFile,
  };
}
