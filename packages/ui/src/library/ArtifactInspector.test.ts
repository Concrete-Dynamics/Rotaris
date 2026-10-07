import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Markdown } from '../markdown/Markdown.js';
import { previewSource } from './ArtifactInspector.js';

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

  it('a document with no frontmatter block (a person deleted it, or a `---` rule opens prose) is previewed whole', () => {
    expect(previewSource('# mine\n')).toBe('# mine\n');
    const prose = '---\nA rule, then prose.\n---\n';
    expect(previewSource(prose)).toBe(prose);
  });
});
