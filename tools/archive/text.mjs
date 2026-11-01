// The pieces every kind of `tools/archive/migrate.mjs` shares (R-092; `docs/README.md`, "The archive"): the tree a run
// writes into without touching the disk, the rewriting of a moved text's relative paths so that they reach from the
// archive what they reached from the live record, and the measures of a file. Pure but for `overlay`'s reads of the
// disk; exported for the kinds beside this file and for their tests.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { sizeOf } from '../check-doc-budget.mjs';
import { INLINE_LINK, LINK_DEFINITION, isRelative, withoutCode } from '../check-record-links.mjs';

// ---------------------------------------------------------------- the tree

/**
 * The tree as a run sees it: the disk, under the writes the run has made so far. Nothing reaches the disk until
 * the run is over (`commit` in `migrate.mjs`). A path the run removes (`remove`) reads as absent.
 */
export function overlay() {
  /** @type {Map<string, string>} */
  const mem = new Map();
  /** @type {Set<string>} */
  const removed = new Set();
  const key = (/** @type {string} */ p) => resolve(p);
  return {
    mem,
    removed,
    read: (/** @type {string} */ p) => mem.get(key(p)) ?? readFileSync(p, 'utf8'),
    exists: (/** @type {string} */ p) => mem.has(key(p)) || (!removed.has(key(p)) && existsSync(p)),
    write: (/** @type {string} */ p, /** @type {string} */ text) => {
      removed.delete(key(p));
      mem.set(key(p), text);
    },
    remove: (/** @type {string} */ p) => {
      mem.delete(key(p));
      removed.add(key(p));
    },
    /** The `.md` files of a directory, on disk and written by this run, less those it removed. */
    list(/** @type {string} */ dir) {
      const names = new Set(existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.md')) : []);
      for (const p of removed) if (dirname(p) === resolve(dir)) names.delete(basename(p));
      for (const p of mem.keys()) if (dirname(p) === resolve(dir) && p.endsWith('.md')) names.add(basename(p));
      return [...names];
    },
  };
}

/** @typedef {ReturnType<typeof overlay>} Tree */

// ---------------------------------------------------------------- paths and links

/** A path from one file to another, as a Markdown link writes it: forward slashes, `''` for the file itself. */
export function relativeLink(/** @type {string} */ from, /** @type {string} */ to) {
  if (resolve(from) === resolve(to)) return '';
  return relative(dirname(from), to).split(sep).join('/');
}

/** A path relative to a root, with forward slashes. */
export const slashed = (/** @type {string} */ root, /** @type {string} */ file) => relative(root, file).split(sep).join('/');

/** A target split into its path and its fragment (with its `#`). */
export function splitTarget(/** @type {string} */ target) {
  const hash = target.indexOf('#');
  return hash === -1 ? { path: target, fragment: '' } : { path: target.slice(0, hash), fragment: target.slice(hash) };
}

export function decoded(/** @type {string} */ path) {
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
export const SPAN = /(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?[^`])\1(?!`)/g;
/** A path relative to its file, written in inline code: one or more `../` and what follows. */
const RELATIVE_IN_CODE = /(?<![A-Za-z0-9_./-])(?:\.\.\/)+[A-Za-z0-9_.\/-]*[A-Za-z0-9_\/-](?:#[A-Za-z0-9_-]+)?/g;

/**
 * A text's relative paths as they read from a new file: each relative link target, and each `../` path in inline code
 * that names a file or folder that exists, rewritten to reach from `to` what it reached from `from`. Nothing else
 * changes. `moved` maps a file that moves in the same run (absolute old path to absolute new path), so a path that
 * reached it reaches it where it goes.
 * @param {string} text
 * @param {string} from absolute path of the file the text stood in
 * @param {string} to absolute path of the file it moves to
 * @param {{ exists: (p: string) => boolean }} tree
 * @param {Map<string, string>} [moved]
 */
export function rebase(text, from, to, tree, moved = new Map()) {
  const reach = (/** @type {string} */ target) => {
    const { path, fragment } = splitTarget(target);
    const reached = path === '' ? from : resolve(dirname(from), decoded(path));
    const file = moved.get(reached) ?? reached;
    const rel = relativeLink(to, file);
    return (rel === '' ? '' : rel + (path.endsWith('/') ? '/' : '')) + fragment;
  };
  const linked = rewriteLinkTargets(text, (target) => (isRelative(target) ? reach(target) : target));
  return linked.replace(SPAN, (span, ticks, body) => {
    const next = body.replace(RELATIVE_IN_CODE, (/** @type {string} */ p) => {
      const { path } = splitTarget(p);
      const reached = resolve(dirname(from), path);
      return tree.exists(reached) || moved.has(reached) ? reach(p) : p;
    });
    return `${ticks}${next}${ticks}`;
  });
}

// ---------------------------------------------------------------- measures

/** Whether a text is within the document budget. */
export const within = (/** @type {string} */ text, /** @type {{ lines: number, bytes: number }} */ budget) => {
  const s = sizeOf(text);
  return s.lines <= budget.lines && s.bytes <= budget.bytes;
};

/** Whether a text carries an anchor `id`. */
export const hasId = (/** @type {string} */ text, /** @type {string} */ id) => new RegExp(`\\s(?:id|name)="${id}"`).test(text);

/** The first ISO date in a text, or `undefined`. */
export const dateIn = (/** @type {string} */ text) => /20\d\d-\d\d-\d\d/.exec(text)?.[0];

// ---------------------------------------------------------------- sentences

/** Abbreviations whose period ends no sentence. */
const ABBREVIATIONS = /(?:^|[\s(])(?:e\.g|i\.e|cf|vs|etc|No|Nos|approx|incl|resp)$/;

/**
 * Where a Markdown text's first sentence ends: the index just past its closing punctuation and any emphasis, quote or
 * bracket that closes with it, or `-1` when the text is one sentence. A sentence ends at `.`, `!` or `?` followed by
 * whitespace and a capital, a digit or the opening of markup, outside inline code, outside every bracket and with
 * every emphasis it opened closed; a period after an abbreviation, an initial or inside a number ends none.
 * @param {string} text
 */
export function firstSentenceEnd(text) {
  let bold = false;
  let italic = false;
  let code = '';
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (code !== '') {
      if (text.startsWith(code, i) && text[i + code.length] !== '`') {
        i += code.length - 1;
        code = '';
      }
      continue;
    }
    if (c === '`') {
      const run = /^`+/.exec(text.slice(i))?.[0] ?? '`';
      code = run;
      i += run.length - 1;
      continue;
    }
    if (c === '*') {
      if (text[i + 1] === '*') {
        bold = !bold;
        i++;
      } else italic = !italic;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    if ((c === '.' || c === '!' || c === '?') && depth === 0) {
      if (c === '.' && ABBREVIATIONS.test(text.slice(Math.max(0, i - 8), i))) continue;
      if (c === '.' && /[A-Z]$/.test(text.slice(i - 1, i)) && /(?:^|\s)[A-Z]$/.test(text.slice(Math.max(0, i - 2), i))) continue;
      let j = i + 1;
      let b = bold;
      let it = italic;
      for (;;) {
        if (text.startsWith('**', j) && b) {
          b = false;
          j += 2;
        } else if (text[j] === '*' && it) {
          it = false;
          j += 1;
        } else if (text[j] !== undefined && /["”’)\]]/.test(text[j])) j += 1;
        else break;
      }
      if (b || it) continue;
      const rest = text.slice(j);
      if (/^\s+(?:[A-Z0-9*`(\[_~"“<]|\p{Lu})/u.test(rest)) return j;
    }
  }
  return -1;
}
