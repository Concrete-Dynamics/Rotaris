/**
 * The proofs' rendering of an artifact document's frontmatter from its store row, pinned against the engine's own
 * `renderFrontmatter` (PD-LIBRARY-003 (d), revision 2 (c)): a reader that drifted from the product would hold a saved document
 * to the wrong block.
 */
import { describe, expect, it } from 'vitest';
import { renderFrontmatter, type ArtifactRecord } from '@rotaris/engine';
// @ts-expect-error — the reader is plain ESM beside the scripts that use it.
import { frontmatterOfRow, leadingFrontmatter } from './artifact-frontmatter.mjs';

const base = {
  id: 'art_A1b2C3d4', slug: 'travel-plan', title: 'Travel "plan"\u2028two', kind: 'artifact', sourceTaskId: null, canonicalName: null, sourcePersona: null,
  status: 'final', summary: '', keyFindings: '', highlightPaths: [], snippets: [], editedFiles: [], createdFiles: [], commands: [], tags: [],
  supersedes: null, supersededBy: null, createdBy: '', consumedBy: [], timelineEventId: null, conversationId: null, importance: 'normal',
  createdAt: '2026-10-14T00:00:00.000Z', editedAt: null, bodyFile: 'art_A1b2C3d4.md',
} as unknown as ArtifactRecord;
const rowOf = (r: ArtifactRecord) => ({
  id: r.id, slug: r.slug, title: r.title, kind: r.kind, status: r.status, created_at: r.createdAt, edited_at: r.editedAt,
  source_task_id: r.sourceTaskId, canonical_name: r.canonicalName, source_persona: r.sourcePersona, created_by: r.createdBy,
  timeline_event_id: r.timelineEventId, conversation_id: r.conversationId, tags: JSON.stringify(r.tags), supersedes: r.supersedes, superseded_by: r.supersededBy,
});

describe('frontmatterOfRow equals the engine\'s renderFrontmatter (PD-LIBRARY-003)', () => {
  it('for a bare record, with its title escaped as the engine escapes it', () => {
    expect(frontmatterOfRow(rowOf(base))).toBe(renderFrontmatter(base));
  });

  it('for a record carrying every optional line, edited_at and tags included', () => {
    const full = { ...base, editedAt: '2026-10-14T01:00:00.000Z', sourceTaskId: 'T1', canonicalName: 'plan', sourcePersona: 'writer', createdBy: 'root', timelineEventId: 'ev_1', conversationId: 'conv_1', tags: ['a', 'b c'], supersedes: 'art_0', supersededBy: 'art_2' } as ArtifactRecord;
    expect(frontmatterOfRow(rowOf(full))).toBe(renderFrontmatter(full));
  });

  it('leadingFrontmatter takes the block alone, and nothing from a document that opens without one', () => {
    expect(leadingFrontmatter(`${renderFrontmatter(base)}# Title\n\ntext\n`)).toBe(renderFrontmatter(base));
    expect(leadingFrontmatter('# Title\n---\nx\n---\n')).toBe('');
  });
});
