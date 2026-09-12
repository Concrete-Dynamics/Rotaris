import { randomBytes } from 'node:crypto';
import { isArtifactStatus, kebabSlug, SLUG_MAX, type ArtifactKind, type ArtifactStatus } from '@rotaris/contracts';
import type { ArtifactRow } from '@rotaris/store';

/**
 * REQ-LIBRARY-088's record, as the engine holds it: the row's serialised columns decoded once, on the way
 * out of the store, so no surface above parses JSON out of a column. `importance` is DERIVED here and
 * nowhere else — a caller cannot supply one, because the requirement states it as a function of the record
 * (`high` exactly when the record is a child report whose status is not `succeeded`).
 */
export interface HighlightPath {
  readonly path: string;
  readonly reason: string;
}
export interface Snippet {
  readonly path: string;
  readonly language: string;
  readonly code: string;
}
export interface EditedFile {
  readonly path: string;
  readonly changeType: string;
}
/**
 * PD-LIBRARY-001: one command the child ran. `exitCode` is null where the observation carried none —
 * REQ-TOOLS-100 drops a null-valued key from the diagnostic block, so a background start or a rejected
 * request simply has no exit code, and null is that absence rather than a stand-in for zero.
 */
export interface RanCommand {
  readonly command: string;
  readonly exitCode: number | null;
}

export interface ArtifactRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly kind: ArtifactKind;
  readonly sourceTaskId: string | null;
  readonly canonicalName: string | null;
  readonly sourcePersona: string | null;
  readonly status: ArtifactStatus;
  readonly summary: string;
  readonly keyFindings: string;
  readonly highlightPaths: readonly HighlightPath[];
  readonly snippets: readonly Snippet[];
  readonly editedFiles: readonly EditedFile[];
  readonly createdFiles: readonly string[];
  /** PD-LIBRARY-001: the commands the child ran, in the order it ran them. Empty for any other kind. */
  readonly commands: readonly RanCommand[];
  readonly tags: readonly string[];
  readonly supersedes: string | null;
  readonly supersededBy: string | null;
  readonly createdBy: string;
  readonly consumedBy: readonly string[];
  readonly timelineEventId: string | null;
  readonly conversationId: string | null;
  readonly importance: 'high' | 'normal';
  readonly createdAt: string;
  readonly editedAt: string | null;
  /** The NAME of the Markdown document beside the session's other files; the body itself is never on the record. */
  readonly bodyFile: string;
}

/** REQ-LIBRARY-088: `art_` followed by 8 base62 characters. */
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function mintArtifactId(): string {
  const bytes = randomBytes(8);
  let out = '';
  for (const b of bytes) out += BASE62[b % 62];
  return `art_${out}`;
}

/** REQ-SESSION-002: flat beside `summary.md`, one file per artifact. The naming decision is recorded on ADR-0003. */
export function bodyFileName(id: string): string {
  return `artifact-${id}.md`;
}

/**
 * REQ-LIBRARY-088: `high` when the record is a child report whose status is anything other than `succeeded`,
 * `normal` in every other case. An agent publish is `published`, which is not a child report, so it is normal.
 */
export function deriveImportance(kind: string, status: string): 'high' | 'normal' {
  return kind === 'child_report' && status !== 'succeeded' ? 'high' : 'normal';
}

/**
 * REQ-LIBRARY-088: `slug` is kebab-case, at most 64 characters, made unique within the session by appending
 * `-2`, `-3`, and so on. The suffix is applied to a base trimmed so the whole still fits in 64.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  const root = kebabSlug(base);
  if (!taken.has(root)) return root;
  for (let n = 2; n < 10_000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Unreachable in practice; a session holding ten thousand collisions of one slug gets a minted one rather than a failure.
  return `${root.slice(0, SLUG_MAX - 9)}-${mintArtifactId().slice(4)}`;
}

function parseList<T>(raw: string, map: (v: unknown) => T | null): T[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out: T[] = [];
  for (const entry of parsed) { const v = map(entry); if (v !== null) out.push(v); }
  return out;
}

const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asHighlight = (v: unknown): HighlightPath | null => {
  if (typeof v === 'string') return { path: v, reason: '' };
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o['path'] === 'string' ? { path: o['path'], reason: typeof o['reason'] === 'string' ? o['reason'] : '' } : null;
};
const asSnippet = (v: unknown): Snippet | null => {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o['path'] !== 'string') return null;
  return { path: o['path'], language: typeof o['language'] === 'string' ? o['language'] : '', code: typeof o['code'] === 'string' ? o['code'] : '' };
};
const asEditedFile = (v: unknown): EditedFile | null => {
  // A child report's `edited_files` is a list of paths (REQ-ORCH-112's field set); the sidecar's form carries a
  // change type beside each (REQ-LIBRARY-090), so a bare path reads as one whose change type was not recorded.
  if (typeof v === 'string') return { path: v, changeType: '' };
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  return typeof o['path'] === 'string' ? { path: o['path'], changeType: typeof o['change_type'] === 'string' ? o['change_type'] : '' } : null;
};
const asRanCommand = (v: unknown): RanCommand | null => {
  // PD-LIBRARY-001. A bare string reads as a command whose exit status was not recorded, on the same terms
  // `asEditedFile` reads a bare path — the two fields come from one sentence of REQ-ORCH-108's schema.
  if (typeof v === 'string') return v === '' ? null : { command: v, exitCode: null };
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o['command'] !== 'string' || o['command'] === '') return null;
  return { command: o['command'], exitCode: typeof o['exit_code'] === 'number' ? o['exit_code'] : null };
};

/**
 * REQ-LIBRARY-091: a record that fails validation is SKIPPED by hydration, never repaired into existence, so
 * this returns null rather than raising or substituting a default. What is validated is exactly what the
 * requirement makes a record: an id, a slug, a kind and a status inside the closed set REQ-LIBRARY-088 forms.
 */
export function toArtifactRecord(row: ArtifactRow): ArtifactRecord | null {
  if (row.id === '' || row.slug === '' || row.body_file === '') return null;
  if (!isArtifactStatus(row.status)) return null;
  if (row.kind !== 'child_report' && row.kind !== 'agent_published' && row.kind !== 'system') return null;
  return {
    id: row.id, slug: row.slug, title: row.title, kind: row.kind,
    sourceTaskId: row.source_task_id, canonicalName: row.canonical_name, sourcePersona: row.source_persona,
    status: row.status, summary: row.summary, keyFindings: row.key_findings,
    highlightPaths: parseList(row.highlight_paths, asHighlight),
    snippets: parseList(row.snippets, asSnippet),
    editedFiles: parseList(row.edited_files, asEditedFile),
    createdFiles: parseList(row.created_files, asString),
    commands: parseList(row.commands, asRanCommand),
    tags: parseList(row.tags, asString),
    supersedes: row.supersedes, supersededBy: row.superseded_by,
    createdBy: row.created_by, consumedBy: parseList(row.consumed_by, asString),
    timelineEventId: row.timeline_event_id, conversationId: row.conversation_id,
    importance: row.importance === 'high' ? 'high' : 'normal',
    createdAt: row.created_at, editedAt: row.edited_at, bodyFile: row.body_file,
  };
}

/** REQ-LIBRARY-093: the summary of a publish is the body's first line, truncated to at most 280 characters. */
export const PUBLISH_SUMMARY_CAP = 280;
export function firstLineSummary(body: string): string {
  const first = body.split('\n', 1)[0] ?? '';
  const trimmed = first.trim();
  return trimmed.length > PUBLISH_SUMMARY_CAP ? trimmed.slice(0, PUBLISH_SUMMARY_CAP) : trimmed;
}
