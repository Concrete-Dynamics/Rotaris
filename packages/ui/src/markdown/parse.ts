/**
 * ADR-0051, alternative B, first execution: **parse to a tree**. No markup string is ever produced and
 * nothing is injected; the renderer emits only the element types this tree names, which is how
 * `REQ-CHAT-056`'s treatments become a closed list rather than a sanitiser's allow-list.
 *
 * ADR-0051's open question — "no requirement fixes which Markdown dialect is rendered" — **is closed by the
 * specification itself**, and the record is updated in place: `REQ-CHAT-056` now says "The dialect is fixed,
 * and is fixed here" and enumerates it. Beyond the five treatments (fenced code, bold, italic, inline code,
 * links) it requires headings, block quotes, ordered and unordered lists, task lists, tables, thematic breaks
 * and strikethrough; a bare URL is a link on the same terms as an authored one; **raw HTML is shown as the
 * text it is** and never rendered as markup; and **no image is ever loaded** — an image reference renders as
 * its alternative text carrying an activatable reference. That is exactly the grammar below.
 *
 * Parsing is synchronous, issues no I/O, depends on no locale, and is **tolerant by construction rather than
 * by a catch** (`REQ-CHAT-075`, `REQ-CHAT-076`, `REQ-NOTIFY-243`): an unterminated fence, an unclosed
 * emphasis run and a half-written link each render as readable text and resolve to the correct final
 * rendering when the remainder arrives.
 */
export type Align = 'left' | 'right' | 'center' | null;

export type Span =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'code'; readonly text: string }
  | { readonly kind: 'strong'; readonly spans: readonly Span[] }
  | { readonly kind: 'em'; readonly spans: readonly Span[] }
  | { readonly kind: 'strike'; readonly spans: readonly Span[] }
  | { readonly kind: 'link'; readonly href: string; readonly spans: readonly Span[] }
  /** REQ-CHAT-056: the alternative text, carrying an activatable reference. The image is never fetched. */
  | { readonly kind: 'image'; readonly alt: string; readonly href: string };

export interface ListItem {
  readonly blocks: readonly Block[];
  /** REQ-CHAT-056's task lists: null for an ordinary item, false/true for an unchecked/checked box. */
  readonly task: boolean | null;
}

export type Block =
  | { readonly kind: 'paragraph'; readonly spans: readonly Span[] }
  | { readonly kind: 'heading'; readonly level: number; readonly spans: readonly Span[] }
  | { readonly kind: 'code'; readonly language: string; readonly text: string; readonly closed: boolean }
  | { readonly kind: 'quote'; readonly blocks: readonly Block[] }
  | { readonly kind: 'list'; readonly ordered: boolean; readonly start: number; readonly items: readonly ListItem[] }
  | { readonly kind: 'table'; readonly header: readonly (readonly Span[])[]; readonly align: readonly Align[]; readonly rows: readonly (readonly (readonly Span[])[])[] }
  | { readonly kind: 'break' };

export interface Document {
  readonly blocks: readonly Block[];
  /** The source characters this tree was parsed from — the figure REQ-UIBENCH-086 bounds the cache by. */
  readonly sourceLength: number;
}

const THEMATIC = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
// Each pattern below meets a character class once: a run of blanks is taken by one quantifier and what follows it starts
// on a non-blank, so no line makes the matcher try the same run two ways (CodeQL js/polynomial-redos). A group that
// matched nothing is read as the empty string where it is used.
const ATX_OPEN = /^ {0,3}(#{1,6})[ \t]+/;
const blank = (ch: string | undefined): boolean => ch === ' ' || ch === '\t';
/** An ATX heading's level and text: the closing run of `#` and the blanks around it are not part of the text. */
function atxOf(line: string): { level: number; text: string } | null {
  const open = ATX_OPEN.exec(line);
  if (!open) return null;
  let end = line.length;
  while (end > open[0].length && blank(line[end - 1])) end -= 1;
  while (end > open[0].length && line[end - 1] === '#') end -= 1;
  while (end > open[0].length && blank(line[end - 1])) end -= 1;
  return { level: open[1]!.length, text: line.slice(open[0].length, end) };
}
const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\t ][^`]*)?$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const BULLET = /^([ \t]*)([-*+])[ \t]+(\S.*)?$/;
const ORDERED = /^([ \t]*)(\d{1,9})[.)][ \t]+(\S.*)?$/;
const TASK = /^\[([ xX])\][ \t]+(\S.*)?$/;
const DELIMITER_CELL = /^:?-+:?$/;
/** A table's delimiter row: cells of dashes, a colon allowed at either end, between optional outer pipes. */
function isDelimiterRow(line: string): boolean {
  let at = 0;
  while (at < 3 && line[at] === ' ') at += 1;
  const cells = line.slice(at).split('|');
  if (cells.length > 1 && cells[0] === '') cells.shift();
  for (let c = 0; c < cells.length; c += 1) {
    const cell = cells[c]!;
    let from = 0;
    let to = cell.length;
    while (from < to && blank(cell[from])) from += 1;
    while (to > from && blank(cell[to - 1])) to -= 1;
    cells[c] = cell.slice(from, to);
  }
  if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
  return cells.every((cell) => DELIMITER_CELL.test(cell));
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (ch === '\\' && trimmed[i + 1] === '|') { current += '|'; i += 1; continue; }
    if (ch === '|') { cells.push(current); current = ''; continue; }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(':');
  const right = cell.endsWith(':');
  return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
}

/** REQ-CHAT-056: blocks first, then inline. Every branch consumes at least one line, so parsing terminates. */
export function parseMarkdown(source: string): Document {
  const lines = source.split(/\r?\n/);
  return { blocks: parseBlocks(lines), sourceLength: source.length };
}

function parseBlocks(lines: readonly string[]): Block[] {
  const blocks: Block[] = [];
  let i = 0;
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', spans: parseSpans(paragraph.join('\n')) });
    paragraph.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') { flush(); i += 1; continue; }
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const marker = fence[1]!;
      const body: string[] = [];
      let closed = false;
      i += 1;
      while (i < lines.length) {
        const candidate = lines[i]!;
        if (candidate.trim().startsWith(marker[0]!.repeat(marker.length)) && candidate.trim().replace(/[`~]/g, '') === '') { closed = true; i += 1; break; }
        body.push(candidate);
        i += 1;
      }
      // REQ-CHAT-056 / REQ-NOTIFY-243: an unterminated fence is readable text now and the right block later.
      blocks.push({ kind: 'code', language: (fence[2] ?? '').trim(), text: body.join('\n'), closed });
      continue;
    }
    if (THEMATIC.test(line)) { flush(); blocks.push({ kind: 'break' }); i += 1; continue; }
    const atx = atxOf(line);
    if (atx) { flush(); blocks.push({ kind: 'heading', level: atx.level, spans: parseSpans(atx.text) }); i += 1; continue; }
    const quote = QUOTE.exec(line);
    if (quote) {
      flush();
      const inner: string[] = [];
      while (i < lines.length) {
        const m = QUOTE.exec(lines[i]!);
        if (!m) break;
        inner.push(m[1] ?? '');
        i += 1;
      }
      blocks.push({ kind: 'quote', blocks: parseBlocks(inner) });
      continue;
    }
    if (BULLET.test(line) || ORDERED.test(line)) {
      flush();
      const ordered = !BULLET.test(line);
      const start = ordered ? Number(ORDERED.exec(line)![2]) : 1;
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = ordered ? ORDERED.exec(lines[i]!) : BULLET.exec(lines[i]!);
        if (!m) break;
        const content: string[] = [m[3] ?? ''];
        i += 1;
        // A continuation line is one indented under the marker; a blank line inside the list is kept.
        while (i < lines.length && /^[ \t]+\S/.test(lines[i]!) && !BULLET.test(lines[i]!) && !ORDERED.test(lines[i]!)) { content.push(lines[i]!.trim()); i += 1; }
        const task = TASK.exec(content[0] ?? '');
        if (task) content[0] = task[2] ?? '';
        items.push({ blocks: parseBlocks(content), task: task ? task[1]!.toLowerCase() === 'x' : null });
      }
      blocks.push({ kind: 'list', ordered, start, items });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isDelimiterRow(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      flush();
      const header = splitRow(line).map(parseSpans);
      const align = splitRow(lines[i + 1]!).map(alignOf);
      i += 2;
      const rows: (readonly Span[])[][] = [];
      while (i < lines.length && lines[i]!.trim() !== '' && lines[i]!.includes('|')) {
        rows.push(splitRow(lines[i]!).map(parseSpans));
        i += 1;
      }
      blocks.push({ kind: 'table', header, align, rows });
      continue;
    }
    paragraph.push(line);
    i += 1;
  }
  flush();
  return blocks;
}

/**
 * A code span at the start of `rest`: a run of backticks, then the nearest later run of the same length. Where the whole
 * opening run finds no closer a shorter opening is tried, as the pattern this replaces did by backtracking.
 */
function codeSpanAt(rest: string): { length: number; text: string } | null {
  let run = 0;
  while (rest[run] === '`') run += 1;
  for (let ticks = run; ticks >= 1; ticks -= 1) {
    const close = rest.indexOf('`'.repeat(ticks), ticks);
    if (close !== -1) return { length: close + ticks, text: rest.slice(ticks, close) };
  }
  return null;
}

/**
 * Inline parsing. Every unmatched delimiter falls through to text, which is what makes partial input a
 * first-class case rather than an error path (ADR-0051; REQ-NOTIFY-243).
 */
export function parseSpans(source: string): Span[] {
  const out: Span[] = [];
  let text = '';
  const push = (span: Span) => { if (text !== '') { out.push({ kind: 'text', text }); text = ''; } out.push(span); };
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    const code = codeSpanAt(rest);
    if (code) { push({ kind: 'code', text: code.text.replace(/^ (.*) $/, '$1') }); i += code.length; continue; }
    // REQ-CHAT-056: an image reference renders as its alternative text carrying an activatable reference.
    const image = /^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"[^"]*")?\)/.exec(rest);
    if (image) { push({ kind: 'image', alt: image[1] ?? '', href: image[2] ?? '' }); i += image[0].length; continue; }
    const link = /^\[([^\]]*)\]\(([^\s)]*)(?:\s+"[^"]*")?\)/.exec(rest);
    if (link) { push({ kind: 'link', href: link[2] ?? '', spans: parseSpans(link[1] ?? '') }); i += link[0].length; continue; }
    const strong = /^(\*\*|__)([\s\S]+?)\1/.exec(rest);
    if (strong) { push({ kind: 'strong', spans: parseSpans(strong[2] ?? '') }); i += strong[0].length; continue; }
    const strike = /^~~([\s\S]+?)~~/.exec(rest);
    if (strike) { push({ kind: 'strike', spans: parseSpans(strike[1] ?? '') }); i += strike[0].length; continue; }
    const em = /^(\*|_)([^\s*_][\s\S]*?)\1/.exec(rest);
    if (em) { push({ kind: 'em', spans: parseSpans(em[2] ?? '') }); i += em[0].length; continue; }
    text += source[i];
    i += 1;
  }
  if (text !== '') out.push({ kind: 'text', text });
  return linkifyBare(out);
}

/**
 * REQ-CHAT-076 / ADR-0051: bare URLs are linkified as a **post-parse transform applied to text nodes only**,
 * so it can never turn part of a code span — or of an already-authored link — into a link. Trailing
 * punctuation is excluded from the target, and a closing parenthesis is kept only when it balances one
 * inside the URL.
 */
const BARE_URL = /https?:\/\/[^\s<>]+/g;

export function trimUrlTail(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (last === undefined) break;
    if ('.,;:!?\'"'.includes(last)) { out = out.slice(0, -1); continue; }
    if (last === ')') {
      const opens = (out.match(/\(/g) ?? []).length;
      const closes = (out.match(/\)/g) ?? []).length;
      if (closes > opens) { out = out.slice(0, -1); continue; }
    }
    break;
  }
  return out;
}

/**
 * Exported for Part AA: `REQ-CHAT-076` makes a bare `http(s)` URL activatable in **any** row's text, not only
 * in one that renders Markdown, and a row that renders no Markdown still needs this transform. Exporting it
 * keeps ONE definition of what a bare URL is and of where its trailing punctuation ends.
 */
export function linkifyBare(spans: readonly Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    if (span.kind !== 'text') { out.push(span); continue; }
    let index = 0;
    for (const match of span.text.matchAll(BARE_URL)) {
      const at = match.index;
      const raw = match[0];
      const href = trimUrlTail(raw);
      if (href === '') continue;
      if (at > index) out.push({ kind: 'text', text: span.text.slice(index, at) });
      out.push({ kind: 'link', href, spans: [{ kind: 'text', text: href }] });
      index = at + href.length;
    }
    if (index < span.text.length) out.push({ kind: 'text', text: span.text.slice(index) });
  }
  return out;
}
