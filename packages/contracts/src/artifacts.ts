import { z } from 'zod';
import { REPORT_STATUSES } from './children.js';

/**
 * The session artifact store's vocabularies and its wire shape (Part Y).
 *
 * `REQ-LIBRARY-089` is the product's single definition of the tag vocabulary, its normalisation, its
 * duplicate collapsing and its refusal — so the six values live HERE once and every surface cites this
 * identifier rather than holding a second copy (the child-report summariser's inline list in
 * `children/report.ts` is the same six and now reads them from here).
 *
 * `status` is NOT a vocabulary of this domain. `REQ-LIBRARY-088` forms it in exactly one way: every member
 * of `REQ-ORCH-112`'s child-report vocabulary — whose single definition is `REPORT_STATUSES` — together
 * with `published`, which only an agent publish produces (`REQ-LIBRARY-093`). It is therefore spelled as a
 * derivation and never as a literal list: when `REQ-ORCH-112`'s set widens, this one widens with it and no
 * edit here is needed.
 */
export const ARTIFACT_TAGS = ['research', 'planning', 'implementation', 'review', 'verification', 'errors'] as const;
export type ArtifactTag = (typeof ARTIFACT_TAGS)[number];

/** REQ-LIBRARY-088: REQ-ORCH-112's vocabulary plus `published`, derived and never restated. */
export const ARTIFACT_STATUSES = [...REPORT_STATUSES, 'published'] as const;
export type ArtifactStatus = (typeof ARTIFACT_STATUSES)[number];
export function isArtifactStatus(s: string): s is ArtifactStatus {
  return (ARTIFACT_STATUSES as readonly string[]).includes(s);
}
/** REQ-LIBRARY-136: "ready" is exactly `succeeded` or `published`; every other member is the unsuccessful group of REQ-LIBRARY-097. */
export function isReadyArtifactStatus(s: string): boolean {
  return s === 'succeeded' || s === 'published';
}

/** REQ-LIBRARY-088's three kinds. */
export const ARTIFACT_KINDS = ['child_report', 'agent_published', 'system'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** REQ-LIBRARY-099's section filter, widened by PD-LIBRARY-001 with `commands`. */
export const ARTIFACT_SECTIONS = ['summary', 'key_findings', 'snippets', 'highlights', 'commands', 'files'] as const;
export type ArtifactSection = (typeof ARTIFACT_SECTIONS)[number];

/**
 * REQ-LIBRARY-089: normalise, collapse duplicates, refuse whole. Surrounding whitespace is stripped and the
 * remainder compared case-insensitively; a tag that does not match after that is rejected AND NAMED AS THE
 * USER SUPPLIED IT; a duplicate is collapsed rather than refused; accepted tags are stored normalised, in
 * the order of first occurrence.
 */
export function normaliseArtifactTags(supplied: readonly string[]): { ok: true; tags: ArtifactTag[] } | { ok: false; error: string } {
  const accepted: ArtifactTag[] = [];
  const rejected: string[] = [];
  for (const raw of supplied) {
    const folded = raw.trim().toLowerCase();
    const match = ARTIFACT_TAGS.find((t) => t === folded);
    if (!match) { if (!rejected.includes(raw)) rejected.push(raw); continue; }
    if (!accepted.includes(match)) accepted.push(match);
  }
  if (rejected.length > 0) return { ok: false, error: `Invalid tag(s): ${rejected.join(', ')}. Valid tags are: ${ARTIFACT_TAGS.join(', ')}` };
  return { ok: true, tags: accepted };
}

/**
 * REQ-LIBRARY-088: `slug` is kebab-case, at most 64 characters. Uniquification (`-2`, `-3`, …) belongs to
 * the store, which is the only place that knows what a session already holds.
 */
export const SLUG_MAX = 64;
export function kebabSlug(raw: string): string {
  const cleaned = raw.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (cleaned === '' ? 'artifact' : cleaned).slice(0, SLUG_MAX).replace(/-+$/g, '') || 'artifact';
}

/** REQ-LIBRARY-136: what a Library row exposes; the tab reads nothing else. */
export const ArtifactRowSchema = z.object({
  id: z.string(), slug: z.string(), title: z.string(), kind: z.string(), status: z.string(),
  persona: z.string(), producer: z.string(), summary: z.string(),
  createdAt: z.string(), createdLabel: z.string(), edited: z.boolean(),
  tags: z.array(z.string()), importance: z.string(), supersededBy: z.string().nullable(),
});
export type ArtifactRowPayload = z.infer<typeof ArtifactRowSchema>;

/** REQ-LIBRARY-091: hydration never raises — what it could not read is reported beside what it could. */
export const ArtifactsStateSchema = z.object({
  sessionId: z.string().nullable(),
  artifacts: z.array(ArtifactRowSchema),
  warnings: z.array(z.string()),
});
export type ArtifactsStatePayload = z.infer<typeof ArtifactsStateSchema>;

/**
 * PD-LIBRARY-003 (OQ-210, ruled 2026-10-07 under R-072): an artifact's document opens with a frontmatter block, and a
 * re-render of a document a person edited rewrites that block alone. A block is one whose first line is `---`, which
 * closes at the next `---` line, and in which every line between is a `key: value` line; anything else (a `---` rule
 * followed by prose, a document with no closing line) is no block, and the whole text is `rest`. `frontmatter` keeps
 * both fence lines and the closing line's own line break, so `frontmatter + rest` is the text exactly.
 *
 * Here and not in the engine because two processes read it: the store's re-render and the handoff (engine) and the
 * inspector's Preview (ui), which renders the document from below the block.
 */
// Only `\n` ends a line here: the value is `[^\n]*`, never `.`, which stops at U+2028 and U+2029 and made a block holding
// either raw no block (docs/defects/fixed/a-title-holding-a-unicode-line-separator-writes-a-frontmatter-the-splitter-does-not-read.md).
const FRONTMATTER_LINE = /^[A-Za-z0-9_][A-Za-z0-9_.-]*:(?:[ \t][^\n]*)?$/;
export function splitFrontmatter(text: string): { readonly frontmatter: string | null; readonly rest: string } {
  const first = /^---[ \t]*\r?\n/.exec(text);
  if (!first) return { frontmatter: null, rest: text };
  let at = first[0].length;
  while (at <= text.length) {
    const end = text.indexOf('\n', at);
    const raw = end === -1 ? text.slice(at) : text.slice(at, end);
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const next = end === -1 ? text.length : end + 1;
    if (/^---[ \t]*$/.test(line)) return { frontmatter: text.slice(0, next), rest: text.slice(next) };
    if (!FRONTMATTER_LINE.test(line) || end === -1) return { frontmatter: null, rest: text };
    at = next;
  }
  return { frontmatter: null, rest: text };
}

/**
 * PD-LIBRARY-003 clause (b): the blank lines before a text's first line and after its last are dropped, and nothing
 * else — a first line's indentation is part of what was submitted (REQ-LIBRARY-093's "unchanged").
 */
export function trimBlankLines(text: string): string {
  return text.replace(/^(?:[ \t]*\r?\n)+/, '').replace(/(?:\r?\n[ \t]*)+$/, '');
}
