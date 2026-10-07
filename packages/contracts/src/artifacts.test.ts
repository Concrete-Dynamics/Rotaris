import { describe, expect, it } from 'vitest';
import { splitFrontmatter, trimBlankLines } from './artifacts.js';

/** PD-LIBRARY-003 (OQ-210): what a frontmatter block is, so the store, the handoff and the Preview cut at one place. */
describe('PD-LIBRARY-003 — splitFrontmatter', () => {
  it('splits a leading block of `key: value` lines closed by `---`, keeping both fences and the line break with the block', () => {
    const text = '---\nid: "art_1"\ntags: ["a", "b"]\nedited_at: "x"\n---\n\n# Title\n';
    expect(splitFrontmatter(text)).toEqual({ frontmatter: '---\nid: "art_1"\ntags: ["a", "b"]\nedited_at: "x"\n---\n', rest: '\n# Title\n' });
  });

  it('reads CRLF line endings as well', () => {
    const text = '---\r\nid: "a"\r\n---\r\nbody\r\n';
    expect(splitFrontmatter(text)).toEqual({ frontmatter: '---\r\nid: "a"\r\n---\r\n', rest: 'body\r\n' });
  });

  it('is no block when a line between the fences is not `key: value`, when it never closes, or when the text does not open with `---`', () => {
    for (const text of ['---\nThis is prose, not a key.\n---\nmore', '---\nid: "a"\nno closing line', '# Title\n---\nid: "a"\n---\n', ' ---\nid: "a"\n---\n', '---']) {
      expect(splitFrontmatter(text)).toEqual({ frontmatter: null, rest: text });
    }
  });

  it('a value holding U+2028 or U+2029 is still a `key: value` line, since only `\\n` ends a line here', () => {
    // docs/defects/fixed/a-title-holding-a-unicode-line-separator-writes-a-frontmatter-the-splitter-does-not-read.md: the
    // line pattern's `.` matched neither, so a block the product had written with a raw separator in it was no block.
    const text = '---\nid: "a"\ntitle: "Line\u2028and\u2029paragraph"\n---\n\n# Title\n';
    expect(splitFrontmatter(text)).toEqual({ frontmatter: '---\nid: "a"\ntitle: "Line\u2028and\u2029paragraph"\n---\n', rest: '\n# Title\n' });
  });

  it('a block closed at the very end of the text leaves an empty rest', () => {
    expect(splitFrontmatter('---\nid: "a"\n---')).toEqual({ frontmatter: '---\nid: "a"\n---', rest: '' });
  });
});

describe('PD-LIBRARY-003 — trimBlankLines', () => {
  it('drops blank lines around the text and keeps the first line\'s indentation', () => {
    expect(trimBlankLines('\n  \n    indented\nlast\n\n  \n')).toBe('    indented\nlast');
    expect(trimBlankLines('plain')).toBe('plain');
  });
});
