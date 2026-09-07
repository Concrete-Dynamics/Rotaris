import { describe, expect, it } from 'vitest';
import { parseMarkdown, parseSpans, trimUrlTail, type Block, type Span } from './parse.js';
import { MarkdownCache, PARSE_CACHE_CHARS, PARSE_CACHE_ENTRIES } from './cache.js';

/**
 * ADR-0051's first execution, measured: the subset `REQ-CHAT-056` now enumerates, the tolerance
 * `REQ-CHAT-075`/`REQ-NOTIFY-243` require of partial input, the bare-URL rule of `REQ-CHAT-076`, and the
 * cache's observable capacity and running totals (`REQ-UIBENCH-063`, `REQ-UIBENCH-086`).
 */
const kinds = (blocks: readonly Block[]) => blocks.map((b) => b.kind);
const spanKinds = (spans: readonly Span[]) => spans.map((s) => s.kind);

describe('ui/markdown — the parser (ADR-0051, REQ-CHAT-056)', () => {
  it('renders the five named treatments: fenced code, bold, italic, inline code and links', () => {
    const doc = parseMarkdown('**b** and *i* and `c` and [t](https://x.test/a)\n\n```ts\ncode\n```');
    expect(kinds(doc.blocks)).toEqual(['paragraph', 'code']);
    const p = doc.blocks[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(spanKinds(p.spans)).toEqual(['strong', 'text', 'em', 'text', 'code', 'text', 'link']);
    const code = doc.blocks[1] as Extract<Block, { kind: 'code' }>;
    expect({ language: code.language, text: code.text, closed: code.closed }).toEqual({ language: 'ts', text: 'code', closed: true });
  });

  it('renders the rest of the fixed dialect: headings, quotes, lists, task lists, tables, rules and strikethrough', () => {
    const doc = parseMarkdown([
      '# Title', '', '> quoted', '', '- one', '- [x] done', '- [ ] todo', '', '1. first', '', '| a | b |', '| --- | ---: |', '| 1 | 2 |', '', '---', '', '~~gone~~',
    ].join('\n'));
    expect(kinds(doc.blocks)).toEqual(['heading', 'quote', 'list', 'list', 'table', 'break', 'paragraph']);
    const list = doc.blocks[2] as Extract<Block, { kind: 'list' }>;
    expect(list.items.map((i) => i.task)).toEqual([null, true, false]);
    const ordered = doc.blocks[3] as Extract<Block, { kind: 'list' }>;
    expect({ ordered: ordered.ordered, start: ordered.start }).toEqual({ ordered: true, start: 1 });
    const table = doc.blocks[4] as Extract<Block, { kind: 'table' }>;
    expect(table.align).toEqual([null, 'right']);
    expect(table.rows).toHaveLength(1);
    const last = doc.blocks[6] as Extract<Block, { kind: 'paragraph' }>;
    expect(spanKinds(last.spans)).toEqual(['strike']);
  });

  it('REQ-CHAT-056: raw HTML is TEXT and never markup, and an image reference renders as its alternative text with a reference', () => {
    const doc = parseMarkdown('<script>alert(1)</script> and ![alt text](https://x.test/i.png)');
    const p = doc.blocks[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(p.spans[0]).toEqual({ kind: 'text', text: '<script>alert(1)</script> and ' });
    expect(p.spans[1]).toEqual({ kind: 'image', alt: 'alt text', href: 'https://x.test/i.png' });
    // No node type in this tree can carry markup, so nothing downstream can be asked to render any.
    expect(spanKinds(p.spans).includes('text')).toBe(true);
  });

  it('REQ-NOTIFY-243 / REQ-CHAT-056: partial input renders as readable text and resolves to the right rendering when the rest arrives', () => {
    const partial = parseMarkdown('```ts\nhalf written');
    const code = partial.blocks[0] as Extract<Block, { kind: 'code' }>;
    expect({ closed: code.closed, text: code.text }).toEqual({ closed: false, text: 'half written' });
    const unclosed = parseMarkdown('**bold that never');
    const p = unclosed.blocks[0] as Extract<Block, { kind: 'paragraph' }>;
    expect(spanKinds(p.spans)).toEqual(['text']);
    const halfLink = parseSpans('[label](https://x.test');
    expect(spanKinds(halfLink)).toEqual(['text', 'link']);
    const finished = parseMarkdown('```ts\nhalf written\nnow closed\n```');
    expect((finished.blocks[0] as Extract<Block, { kind: 'code' }>).closed).toBe(true);
  });

  it('REQ-CHAT-076 / ADR-0051: bare URLs are linkified on TEXT NODES ONLY, with trailing punctuation excluded', () => {
    expect(trimUrlTail('https://x.test/a.')).toBe('https://x.test/a');
    expect(trimUrlTail('https://x.test/a),')).toBe('https://x.test/a');
    expect(trimUrlTail('https://x.test/a_(b)')).toBe('https://x.test/a_(b)');
    const spans = parseSpans('see https://x.test/a. done');
    expect(spanKinds(spans)).toEqual(['text', 'link', 'text']);
    expect((spans[1] as Extract<Span, { kind: 'link' }>).href).toBe('https://x.test/a');
    // A URL inside a code span is NOT a link: the transform never reaches a code node.
    expect(spanKinds(parseSpans('`https://x.test/a`'))).toEqual(['code']);
    // Nor does it re-linkify an authored link's target.
    const authored = parseSpans('[t](https://x.test/a)');
    expect(spanKinds(authored)).toEqual(['link']);
    expect(spanKinds((authored[0] as Extract<Span, { kind: 'link' }>).spans)).toEqual(['text']);
  });

  it('parsing is deterministic and depends on no locale: the same source yields the same tree twice', () => {
    const source = '# H\n\n- a\n- b\n\n| x | y |\n| --- | --- |\n| 1 | 2 |\n';
    expect(JSON.stringify(parseMarkdown(source))).toBe(JSON.stringify(parseMarkdown(source)));
  });
});

describe('ui/markdown — the parse cache (REQ-UIBENCH-063, REQ-UIBENCH-086)', () => {
  it('has the observable capacity the requirements state', () => {
    expect(PARSE_CACHE_ENTRIES).toBe(256);
    expect(PARSE_CACHE_CHARS).toBe(2_000_000);
  });

  it('counts hits and misses as running totals that never decrease, and reports occupancy in entries and SOURCE characters', () => {
    const cache = new MarkdownCache();
    cache.parse('one');
    cache.parse('one');
    cache.parse('two');
    expect(cache.stats()).toEqual({ entries: 2, chars: 6, hits: 1, misses: 2 });
    // A live row reads without inserting; the totals still move (ADR-0051's rule).
    cache.peek('three');
    expect(cache.stats()).toEqual({ entries: 2, chars: 6, hits: 1, misses: 3 });
    cache.peek('one');
    expect(cache.stats()).toEqual({ entries: 2, chars: 6, hits: 2, misses: 3 });
  });

  it('evicts least-recently-used when either bound is reached, and keeps both bounds', () => {
    const cache = new MarkdownCache(2, 100);
    cache.parse('a');
    cache.parse('b');
    cache.parse('a'); // a is now the most recent
    cache.parse('c'); // evicts b
    expect(cache.stats().entries).toBe(2);
    expect(cache.parse('a')).toBeDefined();
    expect(cache.stats().hits).toBe(2);
    const chars = new MarkdownCache(100, 10);
    chars.parse('x'.repeat(6));
    chars.parse('y'.repeat(6));
    expect(chars.stats().entries).toBe(1);
    expect(chars.stats().chars).toBe(6);
    // A source larger than the whole bound is parsed and returned without emptying the working set.
    chars.parse('z'.repeat(50));
    expect(chars.stats().entries).toBe(1);
    expect(chars.stats().chars).toBe(6);
  });
});
