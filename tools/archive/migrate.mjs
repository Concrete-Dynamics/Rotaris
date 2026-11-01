#!/usr/bin/env node
// The record's archive (`docs/README.md`, "The archive"; R-092, `docs/architecture/hardening.md` §6). What is history —
// a settled open question, a ruled escalation the specification carries, an ADR's corrections and struck text, a
// repaired defect note — stood beside what is live, and every agent that opened the file to read the live part loaded
// it. This script moves it into `docs/archive/`, which mirrors the record's paths, and leaves one line in its place.
// Each kind is a module beside this file, with its rule written as code and its own test:
//
//   open questions      (this file) a ruled, closed, resolved or withdrawn entry of
//                       `docs/architecture/open-questions/`, to `docs/archive/architecture/open-questions/<part>.md`
//   owner decisions     (`owner-decisions.mjs`) a ruled ESC, SR or GD entry whose ruling the specification carries,
//                       to `docs/archive/architecture/owner-decisions/<part>.md`
//   ADR history         (`adr-history.mjs`) a revision's explanation, a correction that holds only the falsified
//                       reason, a struck sentence beside its dated replacement, to
//                       `docs/archive/architecture/adr/<nnnn>-history.md`
//
// What it does for the open questions, in order, all of it a function of the tree as it stands:
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
//
// The owner decisions move the same way (steps 2 and 3, the part's opening sentence and index row naming what is
// archived); an ADR's passages each leave a `*History: […](…)*` line. Then, for every kind:
//
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
//   pnpm archive:migrate --dry-run --verbose
//                                     the same, with each passage an ADR would lose and the evidence each ruling landed
//   node tools/archive/migrate.mjs --check
//                                     fail when anything that qualifies, of any kind, is still live (in `pnpm lint`)
//
// Nothing in the archive is edited by hand after it moves; only this script writes there. Reads and writes the tree;
// costs no subprocess. The pure parts are exported for the tests beside this file.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MAX_BYTES, MAX_LINES } from '../check-doc-budget.mjs';
import { INDEX_LINE, SETTLED, entriesOf, questionStates } from '../check-open-question-claims.mjs';
import { anchorsOf, codeFiles, isRelative, recordFiles } from '../check-record-links.mjs';
import { CONTINUED, archiveOrder, archivePathOf, partsOf } from '../record-parts.mjs';
import { planAdrHistory, qualifying as adrQualifying } from './adr-history.mjs';
import { planOwnerDecisions, qualifying as ownerQualifying } from './owner-decisions.mjs';
import { decoded, hasId, overlay, rebase, relativeLink, rewriteLinkTargets, splitTarget, within } from './text.mjs';

export { rebase, relativeLink, rewriteLinkTargets };

/** The record this script archives, relative to the repository root. */
export const OPEN_QUESTIONS = 'docs/architecture/open-questions.md';

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

// ---------------------------------------------------------------- the run

/**
 * The entries of the live record whose question is settled, with the part each stands in.
 * @param {string} root
 * @returns {{ n: number, part: string }[]}
 */
export function qualifying(root) {
  const index = join(root, ...OPEN_QUESTIONS.split('/'));
  if (!existsSync(index)) return [];
  const parts = partsOf(index);
  const all =[index, ...parts, ...archiveFilesOf(index)].map((f) => readFileSync(f, 'utf8')).join('\n');
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
 * @returns {{ moves: ({ n: number, from: string, to: string } | { kind: string, id: string, from: string, to: string })[],
 *   changed: Map<string, string | null> }} `moves`: an open question by its number, every other kind by its identifier;
 *   `changed` maps each absolute path whose text differs from the disk (or that is new) to its new text, and each path
 *   the run removes to `null`
 */
export function plan(root, options = {}) {
  const budget = options.budget ?? { lines: MAX_LINES, bytes: MAX_BYTES };
  const tree = overlay();
  /** @type {ReturnType<typeof plan>['moves']} */
  const moves = [];
  moves.push(...planOpenQuestions(root, tree, budget));
  moves.push(...planOwnerDecisions(root, tree, budget));
  moves.push(...planAdrHistory(root, tree, budget));

  repoint(root, tree);

  /** @type {Map<string, string | null>} */
  const changed = new Map();
  for (const [file, next] of tree.mem) {
    const before = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    if (before !== next) changed.set(file, next);
  }
  for (const file of tree.removed) if (existsSync(file)) changed.set(file, null);
  return { moves, changed };
}

/**
 * The open questions' pass (steps 1 to 4 above): moves every settled entry into the tree; returns what moved.
 * @param {string} root
 * @param {import('./text.mjs').Tree} tree
 * @param {{ lines: number, bytes: number }} budget
 * @returns {{ n: number, from: string, to: string }[]}
 */
function planOpenQuestions(root, tree, budget) {
  const index = join(root, ...OPEN_QUESTIONS.split('/'));
  if (!existsSync(index)) return [];
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
  return moves;
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
 * Write a plan's changes to the disk: each new text written, each `null` removed (and its folder, once empty).
 * @param {Map<string, string | null>} changed
 */
export function commit(changed) {
  for (const [file, text] of changed) {
    if (text === null) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  for (const [file, text] of changed) {
    if (text !== null) continue;
    rmSync(file, { force: true });
    const dir = dirname(file);
    if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
  }
}

/**
 * Everything that qualifies and is still live, of every kind, one line each: what `--check` fails on.
 * @param {string} root
 * @returns {string[]}
 */
export function stillLive(root) {
  return [
    ...qualifying(root).map((q) => `OQ-${q.n} in ${q.part} (a settled open question)`),
    ...ownerQualifying(root).map((q) => `${q.ids.join(', ')} in ${q.part} (a ruled escalation the specification carries)`),
    ...adrQualifying(root, { read: (/** @type {string} */ p) => readFileSync(p, 'utf8') }).map(
      (q) => `${q.file}:${q.line} (an ADR's ${q.kind === 'struck' ? 'struck text' : q.kind} of ${q.date ?? 'an undated day'})`,
    ),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const args = new Set(process.argv.slice(2));
  const show = (/** @type {string} */ f) => relative(root, f).split(sep).join('/');
  if (args.has('--check')) {
    const left = stillLive(root);
    if (left.length > 0) {
      console.error(`archive --check: ${left.length} piece(s) of history still live; run \`pnpm archive:migrate\` and commit what it writes:`);
      for (const q of left) console.error(`  - ${q}`);
      console.error('History moves to docs/archive/ in the same commit that makes it history (docs/README.md, "The archive").');
      process.exit(1);
    }
    console.log('archive --check: nothing that qualifies is live; the archive is current');
  } else {
    const verbose = args.has('--verbose');
    if (verbose) {
      for (const q of ownerQualifying(root)) {
        console.log(`${q.ids.join(', ')} (${q.part}) landed:`);
        for (const e of q.evidence) console.log(`    ${e}`);
      }
    }
    const { moves, changed } = plan(root);
    for (const m of moves) {
      console.log(`${'n' in m ? `OQ-${m.n}` : m.id}: ${m.from} → ${m.to}`);
      if (verbose && 'passage' in m) console.log(`    ${String(m.passage).replace(/\n/g, '\n    ')}`);
    }
    if (args.has('--dry-run')) {
      for (const f of [...changed.keys()].sort()) console.log(`would ${changed.get(f) === null ? 'remove' : 'write'} ${show(f)}`);
      console.log(`archive:migrate --dry-run: ${moves.length} entr${moves.length === 1 ? 'y' : 'ies'} would move; ${changed.size} file(s) would change`);
    } else {
      commit(changed);
      console.log(`archive:migrate: ${moves.length} entr${moves.length === 1 ? 'y' : 'ies'} moved; ${changed.size} file(s) written or removed`);
    }
  }
}
