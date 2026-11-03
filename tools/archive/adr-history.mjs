// @ts-nocheck — a typecheck exception (tools/typecheck-exceptions.json, R-091): its types are owed, and the list only shrinks.
// The archive's third kind (R-092; `docs/README.md`, "The archive"; `docs/architecture/hardening.md` §6 row 4): the
// passages of an Architecture Decision Record that are history rather than decision move to
// `docs/archive/architecture/adr/<nnnn>-history.md`, each under its own anchor, and the record keeps one line where
// each stood: `*History: [the correction of 2026-…](…/<nnnn>-history.md#correction-2026-…).*`.
//
// What is history, as code (`passagesOf`), and what is not:
//
//   revision   a `- **Revised…**` bullet of the record's header (before its first `## ` heading) keeps its first
//              sentence, the date and what the revision carried; the sentences that explain it move.
//   correction a paragraph or a blockquote that opens a line with a correction mark and its date (`*Corrected
//              2026-…`, `**Corrected 2026-…`, `> **Correction, 2026-…`) moves whole, when it holds the falsified
//              reason alone: its replacement is the paragraph after it ("The replacement: …"), or it says which
//              section below now carries the reading. The line left in its place is the one sentence the record's
//              rule keeps ("keep a falsified reason beside its replacement", AGENTS.md), beside the replacement that
//              stays, and the link reaches the whole of it. A correction that states its replacement inside itself
//              ("… is kept here beside its replacement: the settle is now …", "The implemented order is now …") is
//              the record's current reading and stays: moving it would leave the falsified claim above it alone.
//   struck     a struck passage that is whole sentences (it opens a paragraph, a list item or a sentence, ends with
//              its own sentence's punctuation, and runs forty characters or more) and is followed at once by its
//              dated replacement (`*Falsified 2026-…`, `*Corrected 2026-…`, `*Replaced 2026-…`) moves; the
//              replacement stays where it is.
//
// What stays, whatever its form: everything under a Decision or Consequences heading (`## Decision`,
// `## Consequences accepted`, the parts named so), since a correction there is the decision as it now reads; a
// correction written inside a sentence or a list item, which cannot leave without its neighbours; a struck word or
// phrase inside a sentence; and any passage holding an anchor another link may reach. The Status, Date, Decision,
// Consequences and the current reasons are never moved.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CONTINUED, archiveOrder } from '../record-parts.mjs';
import { withoutCode } from '../check-record-links.mjs';
import { dateIn, firstSentenceEnd, hasId, rebase, relativeLink, slashed, within } from './text.mjs';

/** Where the records live, and where their history goes, relative to the repository root. */
export const ADR_DIR = 'docs/architecture/adr';
export const HISTORY_DIR = 'docs/archive/architecture/adr';

/** A section whose text is the decision as it now reads: nothing under it moves. */
export const DECISION_SECTION = /^(?:\d+\.\s*)?(?:Decision|Consequences)\b/i;

const CORRECTION_START = /^(> )?\*{1,3}Correct(?:ed|ion)\b/;
/** The paragraph after a correction that carries its replacement: the correction itself is then the falsified reason alone. */
const REPLACEMENT_FOLLOWS = /^(?:> )?\*{0,2}The replacement\b/;
/** A correction that says where the reading that replaced it now stands, so that it holds no current reading itself. */
const REPLACED_ELSEWHERE = /\bdoes now is the section\b|\bthe section\b[^.]{0,120}\bbelow is what\b/i;
const REPLACEMENT_MARK = /^\s*(?:—\s*)?\*{0,3}\s*\(?\*{0,2}(?:Falsified|Corrected|Replaced|Reported back|Repaired|Superseded|Built)\b[^.]{0,60}?20\d\d-\d\d-\d\d/i;

/** What a passage is called in its History line and its anchor. */
const NAMES = { revision: 'the revision', correction: 'the correction', struck: 'the struck text' };

/**
 * @typedef {{ kind: 'revision' | 'correction' | 'struck', date: string | undefined, start: number, end: number,
 *   moved: string, quote: boolean, section: string, line: number }} Passage
 *   `start`/`end` are offsets in the file's text of what the History line replaces; `moved` is the text the history
 *   file receives; `quote` says the line stands in a blockquote.
 */

/** The `## ` section each line of a text stands under (a part's own opening heading for its first lines). */
function sectionsOf(/** @type {string[]} */ lines) {
  /** @type {string[]} */
  const out = [];
  let section = '';
  let fence = false;
  for (const line of lines) {
    if (/^ {0,3}(```|~~~)/.test(line)) fence = !fence;
    if (!fence && /^## /.test(line)) section = line.slice(3).trim();
    out.push(section);
  }
  return out;
}

/** Offsets of each line's start. */
function lineStarts(/** @type {string[]} */ lines) {
  const starts = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }
  return starts;
}

const holdsAnchor = (/** @type {string} */ text) => /\s(?:id|name)="[^"]+"|\{#[^}\s]+\}/.test(text);

/**
 * The history passages of one record file (see the header). Overlapping finds are resolved in the order revision,
 * correction, struck: a struck passage inside a correction moves with it.
 * @param {string} text
 * @param {{ index: boolean }} where `index` for the record's own file, whose header holds the revision bullets
 * @returns {Passage[]}
 */
export function passagesOf(text, where) {
  const lines = text.split('\n');
  const starts = lineStarts(lines);
  const sections = sectionsOf(lines);
  const firstHeading = lines.findIndex((l) => /^## /.test(l));
  const fenced = withoutCode(text);
  /** @type {Passage[]} */
  const found = [];

  // revision bullets, in the header
  if (where.index) {
    const header = firstHeading < 0 ? lines.length : firstHeading;
    for (let i = 0; i < header; i++) {
      if (!/^- \*\*Revised\b/.test(lines[i])) continue;
      let j = i + 1;
      while (j < header && /^ {2,}\S/.test(lines[j])) j++;
      const bullet = lines.slice(i, j).join('\n');
      const cut = firstSentenceEnd(bullet);
      if (cut < 0) continue;
      const rest = bullet.slice(cut).trim();
      if (rest === '' || /^\*History: \[[^\]]*\]\([^)]*\)\.\*$/.test(rest)) continue;
      found.push({
        kind: 'revision',
        date: dateIn(bullet.slice(0, cut)) ?? dateIn(bullet),
        start: starts[i] + cut,
        end: starts[i] + bullet.length,
        moved: rest.replace(/\n {2,}/g, '\n'),
        quote: false,
        section: 'the header',
        line: i + 1,
      });
    }
  }

  // correction paragraphs and blockquotes
  for (let i = 0; i < lines.length; i++) {
    const m = CORRECTION_START.exec(lines[i]);
    if (!m || (i > 0 && lines[i - 1].trim() !== '' && !/^#/.test(lines[i - 1]))) continue;
    if (fenced.slice(starts[i], starts[i] + lines[i].length).trim() === '') continue; // inside fenced code
    const date = dateIn(lines[i].slice(0, 90));
    if (date === undefined || DECISION_SECTION.test(sections[i])) continue;
    const quote = m[1] !== undefined;
    let j = i + 1;
    if (quote) while (j < lines.length && /^>/.test(lines[j])) j++;
    else while (j < lines.length && lines[j].trim() !== '' && !/^(?:#|> )/.test(lines[j])) j++;
    const moved = lines.slice(i, j).join('\n');
    if (holdsAnchor(moved)) continue;
    let k = j;
    while (k < lines.length && lines[k].trim() === '') k++;
    if (!REPLACED_ELSEWHERE.test(moved) && !REPLACEMENT_FOLLOWS.test(lines[k] ?? '')) continue;
    found.push({ kind: 'correction', date, start: starts[i], end: starts[i] + moved.length, moved, quote, section: sections[i], line: i + 1 });
    i = j - 1;
  }

  // whole struck sentences followed by their dated replacement
  for (const s of fenced.matchAll(/~~((?:(?!~~)(?!\n[ \t]*\n)[\s\S])+?)~~/g)) {
    const start = s.index ?? 0;
    const end = start + s[0].length;
    const inner = text.slice(start + 2, end - 2);
    if (inner.trim().length < 40 || !/[.!?:][*"”’)]*$/.test(inner.trim())) continue;
    const paragraph = Math.max(text.lastIndexOf('\n\n', start), -1) + 1;
    const before = text.slice(paragraph, start);
    const opens = /^\s*(?:> )?(?:- |\d+\. )?$/.test(before) || /[.!?:][*"”’)]*\s+$/.test(before);
    if (!opens || !REPLACEMENT_MARK.test(text.slice(end, end + 160))) continue;
    const line = text.slice(0, start).split('\n').length - 1;
    if (DECISION_SECTION.test(sections[line]) || holdsAnchor(inner)) continue;
    if (found.some((p) => p.start <= start && end <= p.end)) continue;
    const date = dateIn(REPLACEMENT_MARK.exec(text.slice(end, end + 160))?.[0] ?? '');
    found.push({ kind: 'struck', date, start, end, moved: text.slice(start, end), quote: false, section: sections[line], line: line + 1 });
  }
  return found.sort((a, b) => a.start - b.start);
}

/** The line a passage leaves in the record. */
export function historyLine(/** @type {Passage} */ p, /** @type {string} */ link) {
  return `${p.quote ? '> ' : p.kind === 'revision' ? ' ' : ''}*History: [${NAMES[p.kind]} of ${p.date ?? 'an undated day'}](${link}).*`;
}

// ---------------------------------------------------------------- the files

/**
 * The records, by number: each record's own file and its parts, in order.
 * @param {string} root
 * @returns {{ number: string, index: string, files: string[] }[]}
 */
export function recordsOf(root) {
  const dir = join(root, ...ADR_DIR.split('/'));
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).sort();
  return names
    .filter((n) => /^\d{4}-.*\.md$/.test(n))
    .map((n) => {
      const index = join(dir, n);
      const parts = join(dir, n.replace(/\.md$/, ''));
      const files = existsSync(parts) && statSync(parts).isDirectory()
        ? readdirSync(parts).filter((p) => p.endsWith('.md')).sort().map((p) => join(parts, p))
        : [];
      return { number: n.slice(0, 4), index, files: [index, ...files] };
    });
}

/** The history files of one record, in order: `<nnnn>-history.md`, then its continuations. */
function chainOf(/** @type {string} */ first, /** @type {import('./text.mjs').Tree} */ tree) {
  const base = basename(first);
  return tree
    .list(dirname(first))
    .filter((name) => name === base || CONTINUED.exec(name)?.[1] + '.md' === base)
    .sort(archiveOrder)
    .map((name) => join(dirname(first), name));
}

/** The opening of a record's history file. */
export function historyHeader(/** @type {string} */ number, /** @type {string} */ index, /** @type {string} */ file, /** @type {string} */ root, /** @type {number} */ k) {
  const first = join(dirname(file), `${number}-history.md`);
  return [
    `# ADR-${number} — history${k > 1 ? `, continued (${k})` : ''}`,
    '',
    `The passages of [ADR-${number}](${relativeLink(file, index)}) that are history rather than decision — the ` +
      'explanations of its revisions, its corrections and its struck text — each moved here verbatim, under its own ' +
      'anchor, by `pnpm archive:migrate` (`tools/archive/adr-history.mjs`); the record keeps one line for each, where ' +
      `it stood. Only the script writes here ([the archive](${relativeLink(file, join(root, 'docs', 'README.md'))}#the-archive)).` +
      (k > 1 ? ` Continues [the first file](${relativeLink(file, first)}).` : ''),
    '',
  ].join('\n');
}

// ---------------------------------------------------------------- the run

/**
 * Every history passage still in a record, with its file.
 * @param {string} root
 * @param {{ read: (p: string) => string }} tree
 */
export function qualifying(root, tree) {
  return recordsOf(root).flatMap((r) =>
    r.files.flatMap((file) => passagesOf(tree.read(file), { index: file === r.index }).map((p) => ({ ...p, file: slashed(root, file) }))),
  );
}

/**
 * Move every history passage of every record into the tree; returns what moved.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 * @param {{ lines: number, bytes: number }} budget
 * @returns {{ kind: 'adr-history', id: string, from: string, to: string, line: number, passage: string }[]}
 */
export function planAdrHistory(root, tree, budget) {
  /** @type {ReturnType<typeof planAdrHistory>} */
  const moves = [];
  for (const record of recordsOf(root)) {
    const first = join(root, ...HISTORY_DIR.split('/'), `${record.number}-history.md`);
    for (const file of record.files) {
      const text = tree.read(file);
      const passages = passagesOf(text, { index: file === record.index });
      if (passages.length === 0) continue;
      /** @type {[number, number, string][]} */
      const edits = [];
      for (const p of passages) {
        const chain = chainOf(first, tree);
        let into = chain.at(-1) ?? first;
        let current = tree.exists(into) ? tree.read(into) : historyHeader(record.number, record.index, into, root, 1);
        const taken = (/** @type {string} */ id) => chain.some((f) => hasId(tree.read(f), id)) || hasId(current, id);
        const base = `${p.kind}-${p.date ?? 'undated'}`;
        let k = 1;
        while (taken(k === 1 ? base : `${base}-${k}`)) k++;
        const id = k === 1 ? base : `${base}-${k}`;
        const where = `[${slashed(join(root, 'docs'), file).replace(/^architecture\/adr\//, '')}](${'{LINK}'})`;
        const entry = (/** @type {string} */ target) =>
          [
            `<a id="${id}"></a>`,
            '',
            `**${NAMES[p.kind][0].toUpperCase()}${NAMES[p.kind].slice(1)} of ${p.date ?? 'an undated day'}**, from ` +
              `${where.replace('{LINK}', relativeLink(target, file))}${p.section ? `, ${p.section === 'the header' ? 'the header' : `“${p.section}”`}` : ''}:`,
            '',
            rebase(p.moved, file, target, tree),
          ].join('\n');
        const append = (/** @type {string} */ to, /** @type {string} */ b) => `${to.replace(/\s*$/, '')}\n\n${b}\n`;
        let next = append(current, entry(into));
        if (!within(next, budget) && current.includes('<a id="')) {
          into = join(dirname(first), `${record.number}-history-continued-${chain.length + 1}.md`);
          current = historyHeader(record.number, record.index, into, root, chain.length + 1);
          next = append(current, entry(into));
        }
        if (!within(next, budget)) {
          throw new Error(`${slashed(root, file)}:${p.line}: a ${p.kind} passage alone passes the document budget in ` +
            `${slashed(root, into)}; split it by hand and record the debt (docs/README.md, "The document budget")`);
        }
        tree.write(into, next);
        edits.push([p.start, p.end, historyLine(p, `${relativeLink(file, into)}#${id}`)]);
        moves.push({ kind: 'adr-history', id: `ADR-${record.number} ${p.kind} ${p.date ?? 'undated'}`, from: slashed(root, file), to: `${slashed(root, into)}#${id}`, line: p.line, passage: p.moved });
      }
      let out = text;
      for (const [start, end, line] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + line + out.slice(end);
      tree.write(file, out);
    }
  }
  return moves;
}
