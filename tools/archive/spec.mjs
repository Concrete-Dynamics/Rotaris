// The archive's fifth kind (R-092; `docs/README.md`, "The archive"; `docs/architecture/hardening.md` §6 row 6): the text
// of a withdrawn or superseded requirement, beyond its definition, is history, and it moves verbatim to
// `docs/archive/spec/<NN-domain>/<part>.md`. The specification is never rewritten (`AGENTS.md`), so what stays is fixed:
//
//   - the definition's first paragraph: the line `pnpm symbols` reads (`- **REQ-X-NNN** —`, `**REQ-X-NNN** —` or
//     `### REQ-X-NNN`) with its `*Withdrawn.*` marker, and the lines that continue that paragraph; the identifier stays
//     defined where it is, and the generated artifact is unchanged but for the `line` of a definition below a move;
//   - the directive's back-pointer blockquote (`> **Superseded by …`, `> **Narrowed by …`, `> **Extended by …`), which
//     is what tells a reader of the definition what governs (`docs/product/README.md`).
//
// What moves is every other line that belongs to the requirement: for a list item, the lines indented under it (its
// continuation paragraphs, sub-bullets, examples, blank lines between them); for a bold paragraph or a heading, the
// lines up to the next definition, heading or rule. One line stays under the definition paragraph in their place:
//
//   *(Text archived: [docs/archive/spec/…#req-x-nnn](…#req-x-nnn) — withdrawn)*      (or `— superseded by PD-…`)
//
// A requirement whose whole definition is its first paragraph moves nothing and gains no line.
//
// What qualifies is read from the generated artifact (`packages/kernel/src/generated/requirements.ts`), one source of
// truth: a symbol `withdrawn: true`, or a key of `SUPERSEDED_BY`. Narrowed and extended requirements still govern and
// stay whole. Without the artifact (a fixture, a tree `pnpm symbols` has not run in) the kind finds nothing.
//
// In the archive each requirement is one entry, under its own anchor `<a id="req-x-nnn"></a>` and the identifier as a
// heading, its lines dedented by the list item's indentation and otherwise verbatim (a relative path rewritten to reach
// the same file from the archive's folder, as every kind does). `pnpm symbols` never reads `docs/archive/`, so the
// archive defines no identifier (`tools/symbol-artifact/archive-not-read.test.ts`). Text added under an archived
// requirement later moves on the next run, to the end of its entry.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { CONTINUED, archiveOrder, archivePathOf } from '../record-parts.mjs';
import { BULLET, HEADING, SECTION } from '../symbol-artifact/definitions.mjs';
import { hasId, rebase, relativeLink, slashed, within } from './text.mjs';

/** The specification, and the artifact that says what in it is withdrawn or superseded, relative to the root. */
export const SPEC_DIR = 'docs/spec';
export const ARTIFACT = 'packages/kernel/src/generated/requirements.ts';

/** A heading of any level, a thematic break, a fence's opening or closing, the start of a block inside a list item. */
const ANY_HEADING = /^#{1,6}\s/;
const RULE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE = /^\s*(?:```|~~~)/;
const BLOCK_START = /^\s*(?:[-*+]\s|\d+[.)]\s|>|```|~~~|#{1,6}\s|\|)/;
/** The line a move leaves, and a directive's back-pointer blockquote's first line. */
export const ARCHIVED_LINE = /^\s*\*\(Text archived: /;
export const BACK_POINTER = /^\s*>\s*\*\*(?:Superseded|Narrowed|Extended) by\b/;

/**
 * What the artifact says: the identifiers withdrawn in place, the directive that superseded each superseded one, and
 * the file under `docs/spec/` that defines each of either. `undefined` when the artifact is absent.
 * @param {string} root
 * @returns {Map<string, { file: string, state: string }> | undefined} identifier → its file and `withdrawn` or
 *   `superseded by PD-…`
 */
export function qualifyingIds(root) {
  const path = join(root, ...ARTIFACT.split('/'));
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, 'utf8');
  /** @type {Map<string, string>} */
  const superseded = new Map();
  const block = /export const SUPERSEDED_BY = \{\r?\n([\s\S]*?)\r?\n\}/.exec(text)?.[1] ?? '';
  for (const m of block.matchAll(/^\s*'(REQ-[A-Z]+-\d+)': '(PD-[A-Z]+-\d+)',?\s*$/gm)) superseded.set(m[1], m[2]);
  /** @type {Map<string, { file: string, state: string }>} */
  const out = new Map();
  for (const m of text.matchAll(/^\s*'(REQ-[A-Z]+-\d+)': \{ id: '[^']*', domain: '[^']*', file: '([^']+)', line: \d+, withdrawn: (true|false) \}/gm)) {
    const pd = superseded.get(m[1]);
    if (m[3] === 'true') out.set(m[1], { file: m[2], state: 'withdrawn' });
    else if (pd !== undefined) out.set(m[1], { file: m[2], state: `superseded by ${pd}` });
  }
  return out;
}

/** The identifier a line defines, and the shape it uses, or `undefined`. */
export function definitionOf(/** @type {string} */ line) {
  const l = line.replace(/\r$/, '');
  const b = BULLET.exec(l);
  if (b) return { id: b[1], shape: /** @type {const} */ ('bullet') };
  const h = HEADING.exec(l);
  if (h) return { id: h[1], shape: /** @type {const} */ ('heading') };
  const s = SECTION.exec(l);
  if (s) return { id: s[1], shape: /** @type {const} */ ('section') };
  return undefined;
}

/**
 * The lines of a requirement whose definition stands at `at`: where its first paragraph ends, where what belongs to
 * it ends (trailing blank lines left out), and, of the lines between, which move and which stay.
 * @param {string[]} lines
 * @param {number} at the definition line's index
 * @returns {{ shape: 'bullet' | 'heading' | 'section', first: number, end: number, moving: number[],
 *   marker: number | undefined, kept: [number, number][] }} `first`: the index after the first paragraph; `kept`: each
 *   back-pointer blockquote, as `[start, end)`
 */
export function regionOf(lines, at) {
  const def = definitionOf(lines[at]);
  if (def === undefined) throw new Error(`line ${at + 1} is no definition`);
  const blank = (/** @type {number} */ i) => lines[i].trim() === '';
  let end = at + 1;
  let fenced = false;
  for (; end < lines.length; end++) {
    const line = lines[end];
    if (!fenced) {
      if (def.shape === 'bullet' ? line.trim() !== '' && !/^\s/.test(line) : definitionOf(line) || ANY_HEADING.test(line) || RULE.test(line)) break;
    }
    if (FENCE.test(line)) fenced = !fenced;
  }
  while (end > at + 1 && blank(end - 1)) end--;

  let first = at + 1;
  if (def.shape === 'section') {
    while (first < end && blank(first)) first++;
    if (first < end && !BLOCK_START.test(lines[first]) && !ARCHIVED_LINE.test(lines[first])) first++;
  }
  while (first < end && !blank(first) && !BLOCK_START.test(lines[first]) && !ARCHIVED_LINE.test(lines[first])) first++;

  /** @type {number[]} */
  const moving = [];
  /** @type {[number, number][]} */
  const kept = [];
  /** @type {number | undefined} */
  let marker;
  for (let i = first; i < end; i++) {
    if (marker === undefined && ARCHIVED_LINE.test(lines[i])) {
      marker = i;
      continue;
    }
    if (BACK_POINTER.test(lines[i])) {
      let j = i + 1;
      while (j < end && /^\s*>/.test(lines[j]) && !BACK_POINTER.test(lines[j])) j++;
      kept.push([i, j]);
      i = j - 1;
      continue;
    }
    moving.push(i);
  }
  return { shape: def.shape, first, end, moving, marker, kept };
}

/** The moved lines as one text: blank runs folded to one, the outer blanks dropped, dedented by their common indent. */
export function movedText(/** @type {string[]} */ lines, /** @type {number[]} */ moving) {
  /** @type {string[]} */
  const out = [];
  for (const i of moving) {
    const line = lines[i].replace(/\r$/, '');
    if (line.trim() === '' && (out.length === 0 || out.at(-1) === '')) continue;
    out.push(line.trim() === '' ? '' : line);
  }
  while (out.length > 0 && out.at(-1) === '') out.pop();
  const indent = Math.min(...out.filter((l) => l !== '').map((l) => /^ */.exec(l)?.[0].length ?? 0));
  return out.map((l) => l.slice(Number.isFinite(indent) ? indent : 0)).join('\n');
}

/** The requirements of one spec file that have text to move, in line order. */
function candidatesIn(/** @type {string[]} */ lines, /** @type {Map<string, { file: string, state: string }>} */ ids) {
  /** @type {{ id: string, state: string, at: number, region: ReturnType<typeof regionOf> }[]} */
  const out = [];
  const seen = new Set();
  lines.forEach((line, at) => {
    const def = definitionOf(line);
    if (def === undefined || seen.has(def.id)) return;
    seen.add(def.id);
    const q = ids.get(def.id);
    if (q === undefined) return;
    const region = regionOf(lines, at);
    if (region.moving.some((i) => lines[i].trim() !== '')) out.push({ id: def.id, state: q.state, at, region });
  });
  return out;
}

/** The spec files the qualifying identifiers stand in, absolute, in order. */
function filesOf(/** @type {string} */ root, /** @type {Map<string, { file: string, state: string }>} */ ids) {
  return [...new Set([...ids.values()].map((v) => v.file))].sort().map((f) => join(root, ...SPEC_DIR.split('/'), ...f.split('/')));
}

/**
 * Every requirement still holding text that qualifies, read from the disk: what `--check` fails on.
 * @param {string} root
 * @returns {{ id: string, file: string, line: number, state: string, lines: number }[]}
 */
export function qualifying(root) {
  const ids = qualifyingIds(root);
  if (ids === undefined) return [];
  return filesOf(root, ids).flatMap((file) => {
    if (!existsSync(file)) return [];
    const lines = readFileSync(file, 'utf8').split('\n');
    return candidatesIn(lines, ids).map((c) => ({
      id: c.id,
      file: slashed(root, file),
      line: c.at + 1,
      state: c.state,
      lines: c.region.moving.filter((i) => lines[i].trim() !== '').length,
    }));
  });
}

/** The archive's files for a spec file, in order: its own name, then its continuations. */
function chainOf(/** @type {string} */ live, /** @type {import('./text.mjs').Tree} */ tree) {
  const mirror = /** @type {string} */ (archivePathOf(live));
  const dir = dirname(mirror);
  const base = basename(mirror);
  return tree
    .list(dir)
    .filter((name) => name === base || CONTINUED.exec(name)?.[1] + '.md' === base)
    .sort(archiveOrder)
    .map((name) => join(dir, name));
}

/** The opening of an archive file: its heading and the sentence that says what it holds and who writes it. */
export function archiveHeader(/** @type {string} */ root, /** @type {string} */ live, /** @type {string} */ liveText, /** @type {string} */ file, /** @type {number} */ k) {
  const h1 = /^# (.*)$/m.exec(liveText)?.[1] ?? basename(live, '.md');
  const readme = join(root, 'docs', 'README.md');
  const first = join(dirname(file), basename(/** @type {string} */ (archivePathOf(live))));
  return [
    `# Archived — ${h1}${k > 1 ? `, continued (${k})` : ''}`,
    '',
    `The text of the withdrawn and superseded requirements of [\`${slashed(join(root, 'docs'), live)}\`](${relativeLink(file, live)}) ` +
      'beyond each definition, moved here verbatim under the requirement\'s own anchor by `pnpm archive:migrate` ' +
      '(`tools/archive/spec.mjs`). The definition line, its `*Withdrawn.*` marker and its directive back-pointer stay in ' +
      'the specification, which alone defines the identifier; this file defines none. Only the script writes here ' +
      `([the archive](${relativeLink(file, readme)}#the-archive)).` +
      (k > 1 ? ` Continues [the first file](${relativeLink(file, first)}).` : ''),
    '',
  ].join('\n');
}

/** The line a move leaves under the definition paragraph. */
export function archivedLine(/** @type {string} */ root, /** @type {string} */ live, /** @type {string} */ file, /** @type {string} */ id, /** @type {string} */ state, /** @type {string} */ indent) {
  const anchor = id.toLowerCase();
  return `${indent}*(Text archived: [${slashed(root, file)}#${anchor}](${relativeLink(live, file)}#${anchor}) — ${state})*`;
}

/**
 * Moves the qualifying text of every withdrawn or superseded requirement into the tree; returns what moved.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 * @param {{ lines: number, bytes: number }} budget
 * @returns {{ kind: 'spec', id: string, from: string, to: string }[]}
 */
export function planSpec(root, tree, budget) {
  const ids = qualifyingIds(root);
  if (ids === undefined) return [];
  /** @type {{ kind: 'spec', id: string, from: string, to: string }[]} */
  const moves = [];
  for (const live of filesOf(root, ids)) {
    if (!tree.exists(live)) continue;
    const text = tree.read(live);
    const lines = text.split('\n');
    const candidates = candidatesIn(lines, ids);
    if (candidates.length === 0) continue;
    /** @type {Map<number, { end: number, lines: string[] }>} */
    const replaced = new Map();
    for (const c of candidates) {
      const anchor = c.id.toLowerCase();
      const moved = movedText(lines, c.region.moving);
      const first = /** @type {string} */ (archivePathOf(live));
      // A requirement archived before: the new text joins the end of its entry, in the file that holds it.
      const holder = chainOf(live, tree).find((f) => hasId(tree.read(f), anchor));
      let file;
      if (holder !== undefined) {
        file = holder;
        const current = tree.read(holder);
        const start = current.indexOf(`<a id="${anchor}"></a>`);
        const next = current.indexOf('\n<a id="req-', start + 1);
        const cut = next < 0 ? current.length : next;
        const head = current.slice(0, cut).replace(/\s*$/, '');
        const tail = current.slice(cut).replace(/^\s*/, '');
        tree.write(holder, `${head}\n\n${rebase(moved, live, holder, tree)}\n${tail === '' ? '' : `\n${tail}`}`);
      } else {
        const chain = chainOf(live, tree);
        file = chain.at(-1) ?? first;
        let current = tree.exists(file) ? tree.read(file) : archiveHeader(root, live, text, file, 1);
        const entry = (/** @type {string} */ into) =>
          [`<a id="${anchor}"></a>`, '', `### ${c.id}`, '', `*${c.state[0].toUpperCase()}${c.state.slice(1)}; defined in ` +
            `[\`${slashed(join(root, 'docs'), live)}\`](${relativeLink(into, live)}), whose definition line stays.*`, '', rebase(moved, live, into, tree)].join('\n');
        const append = (/** @type {string} */ into, /** @type {string} */ b) => `${into.replace(/\s*$/, '')}\n\n${b}\n`;
        let next = append(current, entry(file));
        if (!within(next, budget) && /<a id="req-/.test(current)) {
          file = join(dirname(first), `${basename(first, '.md')}-continued-${chain.length + 1}.md`);
          current = archiveHeader(root, live, text, file, chain.length + 1);
          next = append(current, entry(file));
        }
        if (!within(next, budget)) {
          throw new Error(`${slashed(root, live)}: ${c.id}'s text alone passes the document budget in ${slashed(root, file)}; ` +
            'it is not cut in two, so split it by hand and record the debt (docs/README.md, "The document budget")');
        }
        tree.write(file, next);
      }
      moves.push({ kind: 'spec', id: c.id, from: slashed(root, live), to: slashed(root, file) });

      // The live lines: the definition paragraph, one archived line, the back-pointers as they stood.
      const r = c.region;
      const indent = r.shape === 'bullet' ? '  ' : '';
      const out = lines.slice(c.at, r.first);
      out.push(r.marker !== undefined ? lines[r.marker] : archivedLine(root, live, file, c.id, c.state, indent));
      for (const [s, e] of r.kept) {
        if (s > r.first && lines[s - 1].trim() === '') out.push('');
        out.push(...lines.slice(s, e));
      }
      replaced.set(c.at, { end: r.end, lines: out });
    }
    /** @type {string[]} */
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const r = replaced.get(i);
      if (r) {
        out.push(...r.lines);
        i = r.end - 1;
      } else out.push(lines[i]);
    }
    tree.write(live, out.join('\n'));
  }
  return moves;
}

