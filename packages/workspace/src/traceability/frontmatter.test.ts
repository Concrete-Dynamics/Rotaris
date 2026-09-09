import { describe, expect, it } from 'vitest';
import { fieldValue, readFrontmatter, stripOuterQuotes } from './frontmatter.js';

/** ADR-0040 #2: the hand-written reader against REQ-TRACE-008 to REQ-TRACE-011, and nothing YAML would do. */
const lines = (text: string) => text.split('\n');

describe('the frontmatter reader', () => {
  it('REQ-TRACE-008: recognised only when line 1 strips to exactly ---, closed by the next such line', () => {
    expect(readFrontmatter(lines('---\nreq-id: REQ-1\n---\nbody'))).toEqual({ fields: [{ key: 'req-id', value: 'REQ-1' }], bodyStart: 3 });
    expect(readFrontmatter(lines('  ---  \na: 1\n ---\n'))).toEqual({ fields: [{ key: 'a', value: '1' }], bodyStart: 3 });
    expect(readFrontmatter(lines('\n---\na: 1\n---\n'))).toBeNull();
    expect(readFrontmatter(lines('----\na: 1\n---\n'))).toBeNull();
    expect(readFrontmatter([])).toBeNull();
  });
  it('REQ-TRACE-009: an unterminated block is no frontmatter at all', () => {
    expect(readFrontmatter(lines('---\nreq-id: REQ-1\ntitle: x\n\n# heading'))).toBeNull();
  });
  it('REQ-TRACE-010: a field line opens with a letter and carries a colon; any other line continues the field above, joined by one space', () => {
    const fm = readFrontmatter(lines('---\ntitle: a value\n  written across\n\tthree lines\n1bad: not a field\n_x: nor this\nkey_2-b: ok\n---\n'))!;
    expect(fm.fields).toEqual([
      { key: 'title', value: 'a value written across three lines 1bad: not a field _x: nor this' },
      { key: 'key_2-b', value: 'ok' },
    ]);
  });
  it('REQ-TRACE-011: everything after the FIRST colon, stripped, one matching outer quote pair removed, nothing else processed', () => {
    const fm = readFrontmatter(lines('---\nsource: C:\\docs\\a:b.md\ntitle: "quoted: value"\nlegacy-id: \'single\'\nodd: "mismatched\'\nescaped: "a \\"b\\" c"\nshort: "\n---\n'))!;
    expect(fieldValue(fm, 'source')).toBe('C:\\docs\\a:b.md');
    expect(fieldValue(fm, 'title')).toBe('quoted: value');
    expect(fieldValue(fm, 'legacy-id')).toBe('single');
    expect(fieldValue(fm, 'odd')).toBe('"mismatched\'');
    expect(fieldValue(fm, 'escaped')).toBe('a \\"b\\" c');
    expect(fieldValue(fm, 'short')).toBe('"');
    expect(stripOuterQuotes('""')).toBe('');
  });
  it('a continuation before any field opened belongs to nothing, and a blank continuation adds no text', () => {
    const fm = readFrontmatter(lines('---\n  stray\ntitle: a\n\n  b\n---\n'))!;
    expect(fm.fields).toEqual([{ key: 'title', value: 'a b' }]);
  });
  it('REQ-TRACE-014: an unknown key is carried through untouched', () => {
    const fm = readFrontmatter(lines('---\nreq-id: REQ-1\nowner: someone\n---\n'))!;
    expect(fieldValue(fm, 'owner')).toBe('someone');
  });
});
