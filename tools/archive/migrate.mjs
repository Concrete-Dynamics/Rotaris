#!/usr/bin/env node
// The record's archive (`docs/README.md`, "The archive"; R-092, `docs/architecture/hardening.md` §6). A ruled, closed,
// resolved or withdrawn open question is history, and it stood beside the open ones: 69 parts and 311 entries on
// 2026-11-01, most of them settled, loaded by every agent that opened a part to read one live question. This script
// moves each settled entry out of its live part into the archive, which mirrors the record's paths
// (`docs/archive/architecture/open-questions/<the same part name>.md`), and leaves one index line in its place.
//
// What it does, in order, all of it a function of the tree as it stands:
//
//   1. Reads each question's state from the live parts and the archived ones (`questionStates`, the claims gate's own
//      rule: one source of truth). An entry qualifies when its question is settled; a deferred one stays live.
//   2. Moves each qualifying entry, its anchors above it included, whole and in the order its part held it, to the end
//      of its part's archive file, under its own `oq-<n>` anchor (written above it when it had none, so the index
//      line has somewhere to land). The text is the entry's own; only a relative path in it, a link's target or a
//      `../`-path in inline code, is rewritten to reach the same file from the archive's folder. A file that would
//      pass the document budget is continued in `<part>-continued-<k>.md`.
//   3. Leaves one index line where the entry stood: `- OQ-<n> — <title>; <state> <date>; [archived](…#oq-<n>)`.
//   4. Rewrites the part's "Holds …" sentence and its row in the index table to say what stays and what is archived.
//   5. Repoints every link to an anchor that left a live file for its archive: Markdown links in the record (the set
//      `recordFiles` reads: `docs/**`, the archive included, `AGENTS.md`, `CONTEXT-MAP.md`, the root `README.md`,
//      `packages/**/CONTEXT.md`) and `docs/….md#anchor` paths written in the code (`codeFiles`: `apps/`, `packages/`,
//      `tools/`). This step reads the anchors as they stand, not the moves of this run, so a link another branch adds to
//      an old anchor is repointed by the next run.
//
// It is idempotent (a second run changes nothing) and deterministic (the same tree gives the same output), so a landing
// re-runs it after its rebase instead of merging moved text by hand, as `pnpm proofs:index` regenerates the proof index.
//
//   pnpm archive:migrate              move, write and print what moved
//   pnpm archive:migrate --dry-run    print what would move and which files would change; write nothing
//   node tools/archive/migrate.mjs --check
//                                     fail when an entry that qualifies is still live (in `pnpm lint`)
//
// Nothing in the archive is edited by hand after it moves; only this script writes there. Reads and writes the tree;
// costs no subprocess. The pure parts are exported for the test beside this file.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_BYTES, MAX_LINES, sizeOf } from '../check-doc-budget.mjs';
import { INDEX_LINE, SETTLED, entriesOf, questionStates } from '../check-open-question-claims.mjs';
import { INLINE_LINK, LINK_DEFINITION, anchorsOf, codeFiles, isRelative, recordFiles, withoutCode } from '../check-record-links.mjs';
import { CONTINUED, archiveOrder, archivePathOf, partsOf } from '../record-parts.mjs';

/** The record this script archives, relative to the repository root. */
export const OPEN_QUESTIONS = 'docs/architecture/open-questions.md';

// ---------------------------------------------------------------- the files

/**
 * The tree as this run sees it: the disk, under the writes the run has made so far. Nothing reaches the disk until
 * the run is over (`commit`).
 */
function overlay() {
  /** @type {Map<string, string>} */
  const mem = new Map();
  const key = (/** @type {string} */ p) => resolve(p);
  return {
    mem,
    read: (/** @type {string} */ p) => mem.get(key(p)) ?? readFileSync(p, 'utf8'),
    exists: (/** @type {string} */ p) => mem.has(key(p)) || existsSync(p),
    write: (/** @type {string} */ p, /** @type {string} */ text) => void mem.set(key(p), text),
    /** The `.md` files of a directory, on disk and written by this run. */
    list(/** @type {string} */ dir) {
      const names = new Set(existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')) : []);
      for (const p of mem.keys()) if (dirname(p) === resolve(dir) && p.endsWith('.md')) names.add(basename(p));
      return [...names];
    },
  };
}

/** @typedef {ReturnType<typeof overlay>} Tree */

/** A path from one file to another, as a Markdown link writes it: forward slashes, `''` for the file itself. */
export function relativeLink(/** @type {string} */ from, /** @type {string} */ to) {
  if (resolve(from) === resolve(to)) return '';
  return relative(dirname(from), to).split(sep).join('/');
}

/** A target split into its path and its fragment (with its `#`). */
function splitTarget(/** @type {string} */ target) {
  const hash = target.indexOf('#');
  return hash === -1 ? { path: target, fragment: '' } : { path: target.slice(0, hash), fragment: target.slice(hash) };
}

function decoded(/** @type {string} */ path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Rewrites the target of every Markdown link in a text (`INLINE_LINK`, `LINK_DEFINITION`, both the link gate's own)
 * through `rewrite`, leaving everything else as it is. Links in code and comments are not links (`withoutCode`).
 * @param {string} text
 * @param {(target: string) => string} rewrite given a target without its angle brackets
 */
export function rewriteLinkTargets(text, rewrite) {
  const blanked = withoutCode(text);
  /** @type {[number, number, string][]} */
  const edits = [];
  const seen = new Set();
  for (const re of [INLINE_LINK, LINK_DEFINITION]) {
    for (const m of blanked.matchAll(re)) {
      const [start, end] = /** @type {[number, number]} */ (m.indices?.[2]);
      if (seen.has(start)) continue;
      seen.add(start);
      const raw = text.slice(start, end);
      const angled = raw.startsWith('<') && raw.endsWith('>');
      const target = angled ? raw.slice(1, -1) : raw;
      const next = rewrite(target);
      if (next !== target) edits.push([start, end, angled ? `<${next}>` : next]);
    }
  }
  edits.sort((a, b) => b[0] - a[0]);
  let out = text;
  for (const [start, end, value] of edits) out = out.slice(0, start) + value + out.slice(end);
  return out;
}

/** An inline code span, closed by an equal run of backticks within its paragraph (the link gate's reading). */
const SPAN = /(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?[^`])\1(?!`)/g;
/** A path relative to its file, written in inline code: one or more `../` and what follows. */
const RELATIVE_IN_CODE = /(?<![A-Za-z0-9_./-])(?:\.\.\/)+[A-Za-z0-9_.\/-]*[A-Za-z0-9_\/-](?:#[A-Za-z0-9_-]+)?/g;

/**
 * An entry's text as it reads from its new file: each relative link target, and each `../` path in inline code that
 * names a file or folder that exists, rewritten to reach from `to` what it reached from `from`. Nothing else changes.
 * @param {string} text
 * @param {string} from absolute path of the file the text stood in
 * @param {string} to absolute path of the file it moves to
 * @param {Tree} tree
 */
export function rebase(text, from, to, tree) {
  const reach = (/** @type {string} */ target) => {
    const { path, fragment } = splitTarget(target);
    const file = path === '' ? from : resolve(dirname(from), decoded(path));
    const rel = relativeLink(to, file);
    return (rel === '' ? '' : rel + (path.endsWith('/') ? '/' : '')) + fragment;
  };
  const linked = rewriteLinkTargets(text, (target) => (isRelative(target) ? reach(target) : target));
  return linked.replace(SPAN, (span, ticks, body) => {
    const next = body.replace(RELATIVE_IN_CODE, (/** @type {string} */ p) => {
      const { path } = splitTarget(p);
      return tree.exists(resolve(dirname(from), path)) ? reach(p) : p;
    });
    return `${ticks}${next}${ticks}`;
  });
}

// ---------------------------------------------------------------- the entries

/**
 * The title an index line gives an entry: its opening bold after `OQ-<n> — `, markup dropped, at most about 140
 * characters.
 * @param {string} body the entry's text
 * @param {number} n
 */
export function titleOf(body, n) {
  const flat = body.replace(/\s+/g, ' ');
  const head = `**OQ-${n} — `;
  const rest = flat.startsWith(head) ? flat.slice(head.length) : flat;
  const close = rest.indexOf('**');
  let title = close >= 0 && close < 600 ? rest.slice(0, close) : rest.slice(0, 200);
  title = title
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/~~|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s.:;,—-]+$/, '');
  if (title.length > 140) {
    const cut = title.slice(0, 140);
    title = `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 60))} …`;
  }
  if (((title.match(/`/g) ?? []).length % 2) === 1) title = title.replace(/`/g, '');
  return title === '' ? `OQ-${n}` : title;
}

/**
 * How an index line says an entry was settled, read from the text that settled it: `ruled`, `closed`, `resolved` or
 * `withdrawn`, and the first date within 200 characters of the words that say so.
 * @param {string} body the text that carries the settling words (`SETTLED`)
 * @returns {string} `ruled 2026-10-06`, `resolved`, …
 */
export function settledAs(body) {
  const m = SETTLED.exec(body);
  if (!m) return 'settled';
  const at = m.index ?? 0;
  const near = body.slice(at, at + 200);
  const word = /ruled/i.test(m[0])
    ? 'ruled'
    : /withdrawn/i.test(m[0])
      ? 'withdrawn'
      : /resolved/i.test(m[0])
        ? 'resolved'
        : /closed/i.test(m[0])
          ? 'closed'
          : (/\b(ruled|withdrawn|resolved|closed)\b/i.exec(near)?.[1]?.toLowerCase() ?? 'closed');
  const date = /20\d\d-\d\d-\d\d/.exec(near)?.[0];
  return date === undefined ? word : `${word} ${date}`;
}

/** The index line an entry leaves in its live part. */
export function indexLine(/** @type {number} */ n, /** @type {string} */ title, /** @type {string} */ state, /** @type {string} */ link) {
  return `- OQ-${n} — ${title}; ${state}; [archived](${link})`;
}

/**
 * Question numbers in their order, consecutive runs of three or more written as a range: `OQ-2 – OQ-4, OQ-6, OQ-8`.
 * @param {number[]} numbers
 */
export function compress(numbers) {
  /** @type {string[]} */
  const out = [];
  const unique = numbers.filter((n, i) => numbers.indexOf(n) === i);
  for (let i = 0; i < unique.length; ) {
    let j = i;
    while (j + 1 < unique.length && unique[j + 1] === unique[j] + 1) j++;
    if (j - i >= 2) out.push(`OQ-${unique[i]} – OQ-${unique[j]}`);
    else for (let k = i; k <= j; k++) out.push(`OQ-${unique[k]}`);
    i = j + 1;
  }
  return out.join(', ');
}

// ---------------------------------------------------------------- the archive files

/** The archive's files for a live part, in order: the part's own name, then its continuations. */
function chainOf(/** @type {string} */ livePart, /** @type {Tree} */ tree) {
  const mirror = /** @type {string} */ (archivePathOf(livePart));
  const dir = dirname(mirror);
  const base = basename(mirror);
  return tree
    .list(dir)
    .filter((name) => name === base || CONTINUED.exec(name)?.[1] + '.md' === base)
    .sort(archiveOrder)
    .map((name) => join(dir, name));
}

/** The opening of an archive file: its heading and the sentence that says what it holds and who writes it. */
export function archiveHeader(/** @type {string} */ livePart, /** @type {string} */ liveText, /** @type {string} */ file, /** @type {string} */ index, /** @type {number} */ k) {
  const h1 = /^# (.*)$/m.exec(liveText)?.[1] ?? basename(livePart, '.md');
  const title = h1.startsWith('Open questions — ') ? `Archived open questions — ${h1.slice('Open questions — '.length)}` : `Archived — ${h1}`;
  const number = /^(\d+)-/.exec(basename(livePart))?.[1] ?? basename(livePart, '.md');
  const readme = join(dirname(index).replace(/[\\/]architecture$/, ''), 'README.md');
  const first = join(dirname(file), basename(/** @type {string} */ (archivePathOf(livePart))));
  return [
    `# ${title}${k > 1 ? `, continued (${k})` : ''}`,
    '',
    `The ruled, closed, resolved and withdrawn entries of [part ${number}](${relativeLink(file, livePart)}) of the ` +
      `[open-questions record](${relativeLink(file, index)}), each moved here whole, under its own anchor, by ` +
      '`pnpm archive:migrate` (`tools/archive/migrate.mjs`); the part keeps one index line for each. Only the script ' +
      `writes here ([the archive](${relativeLink(file, readme)}#the-archive)).` +
      (k > 1 ? ` Continues [the first file](${relativeLink(file, first)}).` : ''),
    '',
  ].join('\n');
}

/** Whether a text is within the document budget. */
const within = (/** @type {string} */ text, /** @type {{ lines: number, bytes: number }} */ budget) => {
  const s = sizeOf(text);
  return s.lines <= budget.lines && s.bytes <= budget.bytes;
};

/** Whether a text carries an anchor `id`. */
const hasId = (/** @type {string} */ text, /** @type {string} */ id) => new RegExp(`\\s(?:id|name)="${id}"`).test(text);

// ---------------------------------------------------------------- the run

/**
 * The entries of the live record whose question is settled, with the part each stands in.
 * @param {string} root
 * @returns {{ n: number, part: string }[]}
 */
export function qualifying(root) {
  const index = join(root, ...OPEN_QUESTIONS.split('/'));
  const parts = partsOf(index);
  const all = [index, ...parts, ...archiveFilesOf(index)].map((f) => readFileSync(f, 'utf8')).join('\n');
  const states = questionStates(all);
  return parts.flatMap((part) =>
    entriesOf(readFileSync(part, 'utf8'))
      .filter((e) => states.get(e.n) === 'settled')
      .map((e) => ({ n: e.n, part: relative(root, part).split(sep).join('/') })),
  );
}

/** Every file of a record's archive, on disk. */
function archiveFilesOf(/** @type {string} */ index) {
  const mirror = archivePathOf(index);
  if (mirror === undefined) return [];
  const dir = mirror.replace(/\.md$/, '');
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')).sort(archiveOrder).map((n) => join(dir, n)) : [];
}

/**
 * The migration over a repository root: what moves, and the text of every file that changes. Writes nothing.
 * @param {string} root
 * @param {{ budget?: { lines: number, bytes: number } }} [options]
 * @returns {{ moves: { n: number, from: string, to: string }[], changed: Map<string, string> }} `changed` maps each
 *   absolute path whose text differs from the disk (or that is new) to its new text
 */
export function plan(root, options = {}) {
  const budget = options.budget ?? { lines: MAX_LINES, bytes: MAX_BYTES };
  const tree = overlay();
  const index = join(root, ...OPEN_QUESTIONS.split('/'));
  const parts = partsOf(index);
  const recordText = [index, ...parts, ...archiveFilesOf(index)].map((f) => readFileSync(f, 'utf8')).join('\n');
  const states = questionStates(recordText);
  /** The text that settled each question, for an entry of it that carries no settling words of its own. */
  /** @type {Map<number, string>} */
  const settledBy = new Map();
  for (const e of entriesOf(recordText)) if (!settledBy.has(e.n) && SETTLED.test(e.body)) settledBy.set(e.n, e.body);
  /** @type {{ n: number, from: string, to: string }[]} */
  const moves = [];

  for (const part of parts) {
    const text = tree.read(part);
    const lines = text.split('\n');
    const moving = entriesOf(text).filter((e) => states.get(e.n) === 'settled');
    /** @type {Map<number, { end: number, line: string }>} */
    const replaced = new Map();
    for (const e of moving) {
      const chain = chainOf(part, tree);
      const first = /** @type {string} */ (archivePathOf(part));
      let file = chain.at(-1) ?? first;
      let current = tree.exists(file) ? tree.read(file) : archiveHeader(part, text, file, index, 1);
      /** The entry as it reads from `into`, under its own anchor: written above it unless the entry or the file has one. */
      const block = (/** @type {string} */ into, /** @type {string} */ intoText) => {
        const moved = rebase(lines.slice(e.anchor, e.end).join('\n'), part, into, tree);
        return hasId(moved, `oq-${e.n}`) || hasId(intoText, `oq-${e.n}`) ? moved : `<a id="oq-${e.n}"></a>\n\n${moved}`;
      };
      const append = (/** @type {string} */ into, /** @type {string} */ b) => `${into.replace(/\s*$/, '')}\n\n${b}\n`;
      let next = append(current, block(file, current));
      const holdsEntry = entriesOf(current).length > 0;
      if (!within(next, budget) && holdsEntry) {
        const k = chain.length + 1;
        file = join(dirname(first), basename(first, '.md') + `-continued-${k}.md`);
        current = archiveHeader(part, text, file, index, k);
        next = append(current, block(file, current));
      }
      if (!within(next, budget)) {
        throw new Error(`${relative(root, part)}: OQ-${e.n} alone passes the document budget in ${relative(root, file)}; ` +
          'the entry is not cut in two, so split it by hand and record the debt (docs/README.md, "The document budget")');
      }
      tree.write(file, next);
      moves.push({ n: e.n, from: relative(root, part).split(sep).join('/'), to: relative(root, file).split(sep).join('/') });
      const state = settledAs(SETTLED.test(e.body) ? e.body : (settledBy.get(e.n) ?? e.body));
      replaced.set(e.anchor, { end: e.end, line: indexLine(e.n, titleOf(e.body, e.n), state, `${relativeLink(part, file)}#oq-${e.n}`) });
    }
    /** @type {string[]} */
    let out = [];
    for (let i = 0; i < lines.length; i++) {
      const r = replaced.get(i);
      if (r) {
        out.push(r.line);
        i = r.end - 1;
      } else out.push(lines[i]);
    }
    out = tightenIndexLines(out);
    out = withHolds(out, part);
    tree.write(part, out.join('\n'));
    holdsRow(index, part, out, tree);
  }

  repoint(root, tree);

  /** @type {Map<string, string>} */
  const changed = new Map();
  for (const [file, next] of tree.mem) {
    const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    if (before !== next) changed.set(file, next);
  }
  return { moves, changed };
}

/** Index lines that follow one another stand as one list: the blank lines between two of them go. */
export function tightenIndexLines(/** @type {string[]} */ lines) {
  /** @type {string[]} */
  const out = [];
  for (const line of lines) {
    if (INDEX_LINE.test(line)) {
      let k = out.length;
      while (k > 0 && out[k - 1].trim() === '') k--;
      if (k > 0 && k < out.length && INDEX_LINE.test(out[k - 1])) out.length = k;
    }
    out.push(line);
  }
  return out;
}

/** What a live part holds, from its own text: the entries still in it, and those its index lines name. */
function holdsOf(/** @type {string[]} */ lines) {
  const text = lines.join('\n');
  const live = entriesOf(text).map((e) => e.n);
  const archived = lines.flatMap((l) => {
    const m = INDEX_LINE.exec(l);
    return m ? [Number(m[1])] : [];
  });
  return { live, archived };
}

/** The part's opening sentence, "… which indexes every part. Holds …", rewritten to say what stays and what is archived. */
function withHolds(/** @type {string[]} */ lines, /** @type {string} */ part) {
  const { live, archived } = holdsOf(lines);
  if (archived.length === 0) return lines;
  const marker = 'which indexes every part.';
  const at = lines.findIndex((l, i) => i < 10 && l.includes(marker));
  if (at < 0) return lines;
  const link = relativeLink(part, /** @type {string} */ (archivePathOf(part)));
  const head = lines[at].slice(0, lines[at].indexOf(marker) + marker.length);
  const next = [...lines];
  next[at] = `${head} Holds ${compress(live) || 'no live entry'}; ${compress(archived)} archived in [the archive](${link}).`;
  return next;
}

/** The part's row in the index's table, its "Holds" cell rewritten the same way. */
function holdsRow(/** @type {string} */ index, /** @type {string} */ part, /** @type {string[]} */ lines, /** @type {Tree} */ tree) {
  const { live, archived } = holdsOf(lines);
  if (archived.length === 0) return;
  const target = relativeLink(index, part);
  const text = tree.read(index);
  const rows = text.split('\n');
  const at = rows.findIndex((r) => r.startsWith('| ') && r.includes(`](${target})`));
  if (at < 0) return;
  const cells = rows[at].split(' | ');
  if (cells.length < 3) return;
  const link = relativeLink(index, /** @type {string} */ (archivePathOf(part)));
  cells[cells.length - 1] = `${compress(live) || '—'}; ${compress(archived)} [archived](${link}) |`;
  rows[at] = cells.join(' | ');
  tree.write(index, rows.join('\n'));
}

/**
 * Where an anchor that left a live file now stands: the first file of that file's archive that carries it, or
 * `undefined` where the live file still carries it, the file is not a live record file, or no archive file does.
 * @param {string} file absolute path the link reaches
 * @param {string} anchor
 * @param {Tree} tree
 * @param {Map<string, Set<string>>} cache
 */
function movedTo(file, anchor, tree, cache) {
  if (!file.endsWith('.md') || archivePathOf(file) === undefined || !tree.exists(file)) return undefined;
  const anchorsIn = (/** @type {string} */ f) => {
    let found = cache.get(f);
    if (found === undefined) {
      found = anchorsOf(tree.read(f));
      cache.set(f, found);
    }
    return found;
  };
  const has = (/** @type {string} */ f) => anchorsIn(f).has(anchor) || anchorsIn(f).has(anchor.toLowerCase());
  if (has(file)) return undefined;
  return chainOf(file, tree).find(has);
}

/** A root-relative path to a record file's anchor, written in the code: `docs/….md#anchor`. */
const ROOT_PATH = /(?<![A-Za-z0-9_.-])docs\/([A-Za-z0-9_.\/-]+?\.md)#([A-Za-z0-9_-]+)/g;

/**
 * Repoints every link to an anchor that left its live file, across the record and the code (step 5 above).
 * @param {string} root
 * @param {Tree} tree
 */
function repoint(root, tree) {
  /** @type {Map<string, Set<string>>} */
  const cache = new Map();
  const docs = join(root, 'docs');
  const fromRoot = (/** @type {string} */ text) =>
    text.replace(ROOT_PATH, (whole, path, anchor) => {
      const moved = movedTo(join(docs, ...path.split('/')), anchor, tree, cache);
      return moved === undefined ? whole : `docs/${relative(docs, moved).split(sep).join('/')}#${anchor}`;
    });
  const written = [...tree.mem.keys()].filter((f) => f.endsWith('.md') && f.startsWith(resolve(docs) + sep));
  const record = [...new Set([...recordFiles(root).map((f) => resolve(f)), ...written])].sort();
  for (const file of record) {
    const text = tree.read(file);
    const next = fromRoot(
      rewriteLinkTargets(text, (target) => {
        if (!isRelative(target)) return target;
        const { path, fragment } = splitTarget(target);
        if (fragment.length < 2) return target;
        const reached = path === '' ? file : resolve(dirname(file), decoded(path));
        const moved = movedTo(reached, decoded(fragment.slice(1)), tree, cache);
        return moved === undefined ? target : `${relativeLink(file, moved)}${fragment}`;
      }),
    );
    if (next !== text) tree.write(file, next);
  }
  for (const file of codeFiles(root)) {
    const text = tree.read(file);
    if (!text.includes('docs/')) continue;
    const next = fromRoot(text);
    if (next !== text) tree.write(file, next);
  }
}

/**
 * Write a plan's changes to the disk.
 * @param {Map<string, string>} changed
 */
export function commit(changed) {
  for (const [file, text] of changed) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const args = new Set(process.argv.slice(2));
  const show = (/** @type {string} */ f) => relative(root, f).split(sep).join('/');
  if (args.has('--check')) {
    const left = qualifying(root);
    if (left.length > 0) {
      console.error(`archive --check: ${left.length} settled open question(s) still live; run \`pnpm archive:migrate\` and commit what it writes:`);
      for (const q of left) console.error(`  - OQ-${q.n} in ${q.part}`);
      console.error('A ruled, closed, resolved or withdrawn question moves to docs/archive/ (docs/README.md, "The archive").');
      process.exit(1);
    }
    console.log('archive --check: no settled open question is live; the archive is current');
  } else {
    const { moves, changed } = plan(root);
    for (const m of moves) console.log(`OQ-${m.n}: ${m.from} → ${m.to}`);
    if (args.has('--dry-run')) {
      for (const f of [...changed.keys()].sort()) console.log(`would write ${show(f)}`);
      console.log(`archive:migrate --dry-run: ${moves.length} entr${moves.length === 1 ? 'y' : 'ies'} would move; ${changed.size} file(s) would change`);
    } else {
      commit(changed);
      console.log(`archive:migrate: ${moves.length} entr${moves.length === 1 ? 'y' : 'ies'} moved; ${changed.size} file(s) written`);
    }
  }
}

