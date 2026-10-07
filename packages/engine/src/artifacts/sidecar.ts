import { trimBlankLines } from '@rotaris/contracts';
import type { ArtifactRecord, RanCommand } from './record.js';

/**
 * REQ-LIBRARY-090 — the artifact's Markdown document, which is what REQ-LIBRARY-087 keeps on disk so that
 * "a person or another tool can read the artifact without this application".
 *
 * The form is fixed: YAML frontmatter carrying `id`, `slug`, `title` (JSON-quoted), `kind`, `status`, the
 * record's timestamps, and — ONLY when the record has them — its source ids, its tags and its supersession
 * links; then `# <title>`; then Summary, Key Findings, Highlight Paths, Snippets, Commands (PD-LIBRARY-001,
 * which places it immediately before Edited Files and moves nothing else), Edited Files, Created
 * Files, in that order, each omitted ENTIRELY when empty (no heading, no placeholder), so a reader never has
 * to tell an empty section from an absent one. A record carrying only a body renders as frontmatter, title
 * and its Key Findings, and one carrying nothing renders as frontmatter and title alone.
 *
 * **What the body is, and why.** REQ-LIBRARY-087 fixes the on-disk document as *this* rendering and forbids
 * the record holding the body inside itself; REQ-LIBRARY-093 says a publish's `body_markdown` is the
 * submitted body unchanged and its `key_findings` is that same body. Those cannot both be literally true of
 * one stored thing without a second storage location, which neither REQ-LIBRARY-087 nor REQ-SESSION-002
 * provides. The decision taken here: **the document is the record's `body_markdown`**, and the submitted
 * body survives unchanged inside it as the Key Findings section (and unchanged in the `key_findings`
 * column). REQ-LIBRARY-099's section filter therefore reads the record's columns and never parses the
 * document, REQ-LIBRARY-094's edit overwrites the document and nothing else, and REQ-LIBRARY-134's fallback
 * for an empty stored body is this same rendering. ~~The tension is the owner's, raised as OQ-210 (2026-10-06):
 * Part U said it raised it and no entry was written until acceptance finding F16 found the claim unbacked.~~
 * **Ruled 2026-10-07 under the owner's delegation (R-072, OQ-210) and minted as PD-LIBRARY-003**, which keeps this
 * reading and adds three things. The Key Findings section drops only the blank lines before the body's first line and
 * after its last, so a first line's indentation survives (this was `.trim()`). A re-render of a document a person
 * edited rewrites its leading frontmatter alone (`renderFrontmatter`, the store's `rerender`), so the edit survives a
 * supersession and a re-materialisation. And the follow-up handoff and the inspector's Preview read an edited document
 * from below that frontmatter (`splitFrontmatter`, `@rotaris/contracts`).
 *
 * A second decision where the requirement is silent: `edited_at` is written only when the record has one.
 * The requirement names "the record's timestamps" and lists the optional members without it, but `edited_at`
 * is null until a person edits the body (REQ-LIBRARY-088), and a key whose value is the absence of a
 * timestamp is not a timestamp the record has. `created_at` is always present.
 */
function yamlScalar(value: string): string {
  // JSON quoting is what REQ-LIBRARY-090 names for the title, and it is a valid YAML double-quoted scalar for
  // every other string too, so one rule covers the whole block and no value can break the frontmatter. JSON leaves U+2028
  // and U+2029 raw, and a reader that takes either for a line break (YAML 1.1 does, as `.` in a pattern does) would split
  // the line, so both are written as their escapes, which every YAML double-quoted scalar reads back as the character
  // (docs/defects/fixed/a-title-holding-a-unicode-line-separator-writes-a-frontmatter-the-splitter-does-not-read.md).
  return JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** A body may itself contain a fence; the opening run grows past the longest run inside so the block still closes. */
function fence(code: string): string {
  let longest = 2;
  for (const m of code.matchAll(/`{3,}/g)) longest = Math.max(longest, m[0].length);
  return '`'.repeat(Math.max(3, longest + 1));
}

/**
 * PD-LIBRARY-001: one command, with its exit status IN WORDS. A bare number is read correctly only by
 * someone who already knows that zero means success, and the whole reason this section exists is that
 * nobody could see which of a child's commands had failed. The backtick span is the design language's
 * mono face, which carries "this is a command" without needing a label. Two characters cannot survive
 * inside a span and are replaced rather than dropped: a newline (PowerShell has accepted a multi-line
 * command since ADR-0020's amendment) becomes the two characters backslash-n, and a backtick becomes
 * U+2035 so that nothing in a command can close the span early.
 */
export function renderCommand(c: RanCommand): string {
  const command = c.command.replace(/\r?\n/g, '\\n').replace(/`/g, '\u2035');
  const span = `- \`${command}\``;
  if (c.exitCode === null) return `${span} — exit status not recorded`;
  return c.exitCode === 0 ? span : `${span} — **failed, exit ${c.exitCode}**`;
}

/**
 * PD-LIBRARY-003 (d): the document's leading frontmatter block alone, both fences and the closing line break included, so
 * a re-render of an edited document can replace that block and keep everything after it as the person saved it.
 */
export function renderFrontmatter(record: ArtifactRecord): string {
  const front: string[] = [
    `id: ${yamlScalar(record.id)}`,
    `slug: ${yamlScalar(record.slug)}`,
    `title: ${yamlScalar(record.title)}`,
    `kind: ${yamlScalar(record.kind)}`,
    `status: ${yamlScalar(record.status)}`,
    `created_at: ${yamlScalar(record.createdAt)}`,
  ];
  if (record.editedAt !== null) front.push(`edited_at: ${yamlScalar(record.editedAt)}`);
  if (record.sourceTaskId !== null) front.push(`source_task_id: ${yamlScalar(record.sourceTaskId)}`);
  if (record.canonicalName !== null) front.push(`canonical_name: ${yamlScalar(record.canonicalName)}`);
  if (record.sourcePersona !== null) front.push(`source_persona: ${yamlScalar(record.sourcePersona)}`);
  if (record.createdBy !== '') front.push(`created_by: ${yamlScalar(record.createdBy)}`);
  if (record.timelineEventId !== null) front.push(`timeline_event_id: ${yamlScalar(record.timelineEventId)}`);
  if (record.conversationId !== null) front.push(`conversation_id: ${yamlScalar(record.conversationId)}`);
  if (record.tags.length > 0) front.push(`tags: [${record.tags.map(yamlScalar).join(', ')}]`);
  if (record.supersedes !== null) front.push(`supersedes: ${yamlScalar(record.supersedes)}`);
  if (record.supersededBy !== null) front.push(`superseded_by: ${yamlScalar(record.supersededBy)}`);
  return `${['---', ...front, '---'].join('\n')}\n`;
}

export function renderSidecar(record: ArtifactRecord): string {
  const out: string[] = [renderFrontmatter(record), `# ${record.title}`];
  const section = (heading: string, lines: readonly string[]) => {
    if (lines.length === 0) return;
    out.push('', `## ${heading}`, '', ...lines);
  };
  if (record.summary.trim() !== '') section('Summary', [record.summary.trim()]);
  // PD-LIBRARY-003 (b): the submitted body unchanged (REQ-LIBRARY-093) but for the blank lines around it.
  if (record.keyFindings.trim() !== '') section('Key Findings', [trimBlankLines(record.keyFindings)]);
  section('Highlight Paths', record.highlightPaths.map((h) => (h.reason === '' ? `- \`${h.path}\`` : `- \`${h.path}\` — ${h.reason}`)));
  section('Snippets', record.snippets.flatMap((s) => { const f = fence(s.code); return [`- \`${s.path}\``, '', `${f}${s.language}`, s.code, f]; }));
  section('Commands', record.commands.map(renderCommand));
  section('Edited Files', record.editedFiles.map((e) => (e.changeType === '' ? `- \`${e.path}\`` : `- \`${e.path}\` (${e.changeType})`)));
  section('Created Files', record.createdFiles.map((p) => `- \`${p}\``));
  return `${out.join('\n')}\n`;
}

/** REQ-LIBRARY-090's section order, as one list, so a reader (and the proof) can assert it without restating it. */
export const SIDECAR_SECTIONS = ['Summary', 'Key Findings', 'Highlight Paths', 'Snippets', 'Commands', 'Edited Files', 'Created Files'] as const;
