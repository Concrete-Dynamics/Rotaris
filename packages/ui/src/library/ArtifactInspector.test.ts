import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Markdown } from '../markdown/Markdown.js';
import { ArtifactInspector, inspectorDocument, previewSource, savedDocument, type ArtifactLoaded } from './ArtifactInspector.js';

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

/**
 * ADR-0051 decision 4: the Preview's links request an external open through the opener the mount hands in; `Markdown` draws
 * a link disabled only when there is none. Both renderer mounts pass the window's `openLink`
 * (`apps/desktop/src/renderer/artifact-inspector-links-wiring.test.ts`); this pins that the inspector forwards it.
 */
describe('the artifact inspector\'s Preview links (ADR-0051 decision 4)', () => {
  const doc = '# Notes\n\nSee [the reference](https://example.com/reference) for more.\n';
  const preloaded: ArtifactLoaded = { id: 'art_abcdefgh', slug: 'notes', title: 'Notes', artifactKind: 'agent_published', status: 'published', producer: 'planner-1', persona: 'planner', edited: false, body: doc, fallback: false };
  const never = () => new Promise<never>(() => undefined);
  const link = (onOpenLink?: (href: string) => void): string => {
    const html = renderToStaticMarkup(createElement(ArtifactInspector, { id: preloaded.id, raised: 0, onLoad: never, onSave: never, onClose: () => undefined, preloaded, onOpenLink }));
    return /<button[^>]*data-href="https:\/\/example\.com\/reference"[^>]*>/.exec(html.slice(html.indexOf('data-testid="artifact-preview"')))?.[0] ?? '';
  };

  it('is an enabled control when the mount hands in an opener', () => {
    expect(link(() => undefined)).not.toBe('');
    expect(link(() => undefined)).not.toMatch(/\bdisabled\b/);
  });

  it('is drawn disabled, its target as its title, only when there is no opener', () => {
    expect(link()).toMatch(/\bdisabled\b/);
    expect(link()).toContain('title="https://example.com/reference"');
  });
});

/**
 * PD-LIBRARY-003 revision 2 (f), OQ-272 ruled 2026-10-13 under R-072: the Markdown tab shows the document's leading
 * frontmatter read-only above the editor, the editor holds the text below it, and Save sends the block as loaded followed by
 * the edited text. Before it the editor held the whole document, so a person could type inside the record's block, and the
 * next re-render removed what they typed there.
 */
describe('PD-LIBRARY-003 revision 2 — the Markdown tab shows the frontmatter read-only', () => {
  const block = '---\nid: "art_12345678"\nslug: "the-plan"\nkind: "agent_published"\n---\n';
  const below = '\n# The plan\n\nThe body.\n';
  const preloaded: ArtifactLoaded = { id: 'art_12345678', slug: 'the-plan', title: 'The plan', artifactKind: 'agent_published', status: 'published', producer: 'planner-1', persona: 'planner', edited: false, body: `${block}${below}`, fallback: false };
  const never = () => new Promise<never>(() => undefined);
  const markdownTab = (artifact: ArtifactLoaded) => renderToStaticMarkup(createElement(ArtifactInspector, { id: artifact.id, raised: 0, onLoad: never, onSave: never, onClose: () => undefined, preloaded: artifact, initialTab: 'markdown' }));
  const editorOf = (html: string) => /<textarea[^>]*data-testid="artifact-editor"[^>]*>([\s\S]*?)<\/textarea>/.exec(html);

  it('the block renders read-only, labelled, and outside the editor; the editor\'s value excludes it', () => {
    const html = markdownTab(preloaded);
    const region = /<pre([^>]*)data-testid="artifact-frontmatter"[^>]*>([\s\S]*?)<\/pre>/.exec(html);
    expect(region).not.toBeNull();
    expect(region![0]).toContain('aria-label="Record fields (read-only)"');
    expect(region![0]).not.toMatch(/contenteditable/i);
    expect(region![2]).toContain('slug: &quot;the-plan&quot;');
    const editor = editorOf(html);
    expect(editor).not.toBeNull();
    expect(editor![1]).not.toContain('slug:');
    expect(editor![1]).toContain('# The plan');
    expect(html.indexOf('data-testid="artifact-frontmatter"')).toBeLessThan(html.indexOf('data-testid="artifact-editor"'));
  });

  it('a document is split into its block and the text below; Save sends the block followed by the edited text', () => {
    const doc = inspectorDocument(preloaded.body);
    expect(doc).toEqual({ frontmatter: block, text: below });
    expect(savedDocument(doc.frontmatter, `${below}A line typed by hand.\n`)).toBe(`${block}${below}A line typed by hand.\n`);
  });

  it('REQ-LIBRARY-135\'s dirty state compares the text below the block, which the block never enters', () => {
    // The dialog reads `data-dirty` from the editor's text against the saved text, both below the block: a loaded document is
    // not dirty, and the block's own text never reaches the comparison.
    expect(markdownTab(preloaded)).toContain('data-dirty="no"');
    const loaded = inspectorDocument(preloaded.body);
    expect(loaded.text).not.toContain('slug:');
  });

  it('a document with no valid block (none, or one an edit broke) is edited whole, with no read-only region', () => {
    const broken = '---\nid: "x"\nthis line is no key-value line\n---\n# Mine\n';
    for (const body of ['# mine\n', broken]) {
      expect(inspectorDocument(body)).toEqual({ frontmatter: null, text: body });
      expect(savedDocument(null, body)).toBe(body);
      const html = markdownTab({ ...preloaded, body });
      expect(html).not.toContain('data-testid="artifact-frontmatter"');
      expect(editorOf(html)?.[1]).toContain('# ');
    }
  });

  it('the Preview renders the text below the block', () => {
    const html = renderToStaticMarkup(createElement(ArtifactInspector, { id: preloaded.id, raised: 0, onLoad: never, onSave: never, onClose: () => undefined, preloaded }));
    expect(html).not.toContain('data-testid="artifact-frontmatter"');
    const preview = html.slice(html.indexOf('data-testid="artifact-preview"'));
    expect(preview).toContain('The body.');
    expect(preview).not.toContain('slug:');
  });
});
