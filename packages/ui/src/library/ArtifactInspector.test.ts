import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Markdown } from '../markdown/Markdown.js';
import { ArtifactInspector, previewSource, type ArtifactLoaded } from './ArtifactInspector.js';

/**
 * PD-LIBRARY-003 (f), OQ-210's ruling (R-072): the inspector's Preview renders an artifact's document from below its
 * frontmatter; the Markdown tab keeps the whole document (it is given `text`, never this).
 */
describe('PD-LIBRARY-003 — the artifact inspector\'s Preview starts below the frontmatter', () => {
  const doc = '---\nid: "art_12345678"\nslug: "the-plan"\nkind: "agent_published"\n---\n\n# The plan\n\n## Key Findings\n\nThe body.\n';

  it('the source the Preview renders holds no frontmatter line, and opens at the title', () => {
    const source = previewSource(doc);
    expect(source).toBe('\n# The plan\n\n## Key Findings\n\nThe body.\n');
    const html = renderToStaticMarkup(createElement(Markdown, { source, testId: 'artifact-preview' }));
    expect(html).not.toContain('art_12345678');
    expect(html).not.toContain('<hr');
    expect(html).toContain('The plan');
  });

  it('the inspector itself hands its Preview the source below the frontmatter', () => {
    // The case above pins `previewSource`; this one pins that the component passes it to <Markdown>, so a rewiring of the
    // Preview to `text` fails beside the unit (fin28's reviewers).
    const preloaded: ArtifactLoaded = { id: 'art_12345678', slug: 'the-plan', title: 'The plan', artifactKind: 'agent_published', status: 'published', producer: 'planner-1', persona: 'planner', edited: false, body: doc, fallback: false };
    const never = () => new Promise<never>(() => undefined);
    const html = renderToStaticMarkup(createElement(ArtifactInspector, { id: preloaded.id, raised: 0, onLoad: never, onSave: never, onClose: () => undefined, preloaded }));
    const preview = html.slice(html.indexOf('data-testid="artifact-preview"'));
    expect(preview).toContain('The plan');
    expect(preview).toContain('The body.');
    expect(preview).not.toContain('slug:');
    expect(preview).not.toContain('<hr');
    // The header's metadata line, not the Preview, carries the id.
    expect(html).toContain('art_12345678 · agent_published · published · by planner-1');
  });

  it('a document with no frontmatter block (a person deleted it, or a `---` rule opens prose) is previewed whole', () => {
    expect(previewSource('# mine\n')).toBe('# mine\n');
    const prose = '---\nA rule, then prose.\n---\n';
    expect(previewSource(prose)).toBe(prose);
  });
});
